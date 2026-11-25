import { ObjectId } from 'mongodb';
import db from '../../config/mongodb.config.js';
import { contentValue, domainDocument } from '../../utils/helpers/content-fields.helper.js';
import { languages } from '../../utils/helpers/localization.helper.js';
import { broadcast, isOnline } from './chat.gateway.js';
import {
  assertChatImage,
  CONVERSATION_STATUSES,
  MAX_IMAGES_PER_MESSAGE,
  chatEditedBody,
  chatError,
  chatListQuery,
  chatMessageInput,
  chatMessageQuery,
  chatOid,
  chatPinInput,
  isReachableSeller,
  optionalOid,
} from './chat.core.js';

/*
 * گفتگوها و پیام‌ها روی درایور خامٔ MongoDB می‌نویسند (مثل ماژول نظرات) تا
 * بستهٔ i18n هیچ فیلدی را نپوشاند. هویت بازیگر همیشه از دیتابیس بازخوانی
 * می‌شود؛ ادعای `role` داخل توکن معتبر شمرده نمی‌شود.
 */

let indexes = undefined;
const ensureIndexes = () =>
  (indexes ||= (async () => {
    const conversations = db.collection('chat_conversations');
    const messages = db.collection('chat_messages');
    await conversations.createIndex({ buyer_id: 1, seller_id: 1 }, { unique: true });
    await conversations.createIndex({ updated_at: -1 });
    await messages.createIndex({ conversation_id: 1, created_at: -1 });
    await messages.createIndex({ 'images': 1 });
  })().catch((e) => {
    indexes = undefined;
    throw e;
  }));

async function actorUser(actor) {
  if (!actor?._id) throw chatError('Login required', 401);
  const user = await db.collection('users').findOne({ _id: chatOid(String(actor._id), 'user id') });
  if (!user) throw chatError('Access denied', 403);
  return user;
}

/* نقش بازیگر در این گفتگو: buyer | seller | admin */
function roleIn(conversation, user) {
  if (user.role === 'admin' || user.role === 'root') return 'admin';
  if (String(conversation.buyer_id) === String(user._id)) return 'buyer';
  if (String(conversation.seller_id) === String(user._id)) return 'seller';
  return null;
}

async function loadConversation(id) {
  await ensureIndexes();
  const row = await db.collection('chat_conversations').findOne({ _id: chatOid(id, 'conversation id') });
  if (!row) throw chatError('Conversation not found', 404);
  return row;
}

/**
 * دسترسی گفتگو:
 *  - عضو معمولی فقط گفتگوی خودش؛
 *  - فروشنده فقط وقتی تأیید و فعال است (در غیر این صورت گفتگوهایش قفل است)؛
 *  - ادمین (نقش واقعی دیتابیس) برای نظارت اجازه دارد.
 */
async function accessConversation(id, user, { manage = false } = {}) {
  const row = await loadConversation(id);
  const role = roleIn(row, user);

  if (role === 'admin') return { row, role: 'admin' };
  if (!role) throw chatError('Access denied', 403);

  if (role === 'seller' && !isReachableSeller(user))
    throw chatError('Only approved and active sellers can use chat', 403);

  if (manage && row.status === 'BLOCKED') throw chatError('Conversation is blocked', 403);

  return { row, role };
}

/*
 * firstname/lastname در دیتابیس ممکن است نقشهٔ چندزبانه باشد (contracts.users در
 * contentFields). چسباندن مستقیم آن‌ها "[object Object]" می‌سازد، پس نام کامل
 * برای هر زبان جدا ساخته می‌شود:
 *  - اگر همهٔ زبان‌ها یک مقدار بودند، رشتهٔ ساده برگردانده می‌شود؛
 *  - در غیر این صورت نقشهٔ زبان → رشته، تا `localize()` مسیرهای REST و
 *    `localizedField()` در فرانت (برای رویدادهای WebSocket) درست کار کنند.
 */
const namePart = (value, language) => {
  const raw = contentValue(value, language);
  return typeof raw === 'string' ? raw.trim() : '';
};

const displayName = (user) => {
  const fallback = typeof user?.username === 'string' ? user.username.trim() : '';
  const byLanguage = {};
  for (const language of languages) {
    const full = [namePart(user?.firstname, language), namePart(user?.lastname, language)]
      .filter(Boolean)
      .join(' ')
      .trim();
    byLanguage[language] = full || fallback;
  }
  const distinct = new Set(Object.values(byLanguage));
  if (distinct.size === 1) return [...distinct][0] || '';
  return byLanguage;
};

function publicParticipant(user) {
  if (!user) return null;
  return {
    _id: user._id,
    display_name: displayName(user),
    username: user.username || '',
    is_seller: user.is_seller === true,
    seller_trust: user.seller_trust === true,
    online: isOnline(user._id),
  };
}

/* خلاصهٔ محصول/فروشگاه برای پین پیام */
async function hydratePin(pin) {
  if (!pin) return null;
  const out = { kind: pin.kind, product_id: null, store_id: null, title: '', image_id: '', price: null, currency: null, store_name: '', missing: false };

  if (pin.product_id) out.product_id = String(pin.product_id);
  if (pin.store_id) out.store_id = String(pin.store_id);

  if (pin.product_id) {
    const raw = await db.collection('products').findOne({ _id: pin.product_id });
    if (raw) {
      const product = domainDocument(raw) || raw;
      const images = Array.isArray(product.images_id) ? product.images_id : [];
      out.title = typeof product.name === 'string' ? product.name : product.name || '';
      out.image_id = images.length ? String(images[0]) : '';
      out.price = product.price?.amount ?? null;
      out.currency = product.price?.currency ?? null;
      out.store_id = out.store_id || (product.store_id ? String(product.store_id) : null);
    }
  }

  /* محصول گفتگو دیگر پیدا نمی‌شود: صریح علامت می‌خورد تا رابط «در دسترس نیست» بگوید */
  if (pin.product_id && !out.title) out.missing = true;

  if (!out.title && out.store_id) {
    const raw = await db.collection('stores').findOne({ _id: new ObjectId(out.store_id) });
    if (raw) {
      const store = domainDocument(raw) || raw;
      out.title = typeof store.name === 'string' ? store.name : store.name || '';
      out.store_name = out.title;
    }
  }

  return out;
}

async function publicMessage(row, role) {
  const images = (row.images || []).map((id) => String(id));
  return {
    _id: row._id,
    conversation_id: row.conversation_id,
    sender_id: row.sender_id,
    sender_role: row.sender_role,
    body: row.deleted_at ? '' : row.body || '',
    images: row.deleted_at ? [] : images,
    pin: row.deleted_at ? null : await hydratePin(row.pin || null),
    kind: row.deleted_at ? 'deleted' : images.length && !row.body ? 'image' : 'text',
    edited_at: row.edited_at || null,
    deleted_at: row.deleted_at || null,
    created_at: row.created_at,
    // رسید خوانده‌شدن فقط به اعضا نشان داده می‌شود، نه در نمای نظارت
    read_by: role === 'admin' ? [] : (row.read_by || []).map(String),
  };
}

async function publicConversation(row, participants, role, lastMessage = null) {
  const buyer = participants.get(String(row.buyer_id));
  const seller = participants.get(String(row.seller_id));
  const unread = role === 'seller' ? row.unread?.seller || 0 : row.unread?.buyer || 0;
  /* پین گفتگو (محصول یا فروشگاه) تا کادر نوشتن بداند پیام دربارهٔ چیست */
  const pin = row.product_id
    ? await hydratePin({ kind: 'product', product_id: row.product_id, store_id: row.store_id })
    : row.store_id
      ? await hydratePin({ kind: 'store', product_id: null, store_id: row.store_id })
      : null;

  return {
    _id: row._id,
    status: row.status || 'OPEN',
    role: role === 'admin' ? 'admin' : role,
    buyer: publicParticipant(buyer),
    seller: publicParticipant(seller),
    store_id: row.store_id ? String(row.store_id) : null,
    product_id: row.product_id ? String(row.product_id) : null,
    pin,
    first_seen_from: row.first_message_body || '',
    unread,
    last_message: lastMessage
      ? { ...lastMessage, body: lastMessage.body?.slice(0, 180) || '', images: undefined }
      : null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function participantsFor(rows) {
  const ids = [...new Set(rows.flatMap((row) => [String(row.buyer_id), String(row.seller_id)]))];
  const users = await db
    .collection('users')
    .find({ _id: { $in: ids.filter((id) => /^[a-f\d]{24}$/i.test(id)).map((id) => new ObjectId(id)) } })
    .toArray();
  return new Map(users.map((user) => [String(user._id), user]));
}

/* ------------------------------------------------------------------ */
/* باز یا ساختن گفتگو                                                  */
/* ------------------------------------------------------------------ */

export async function openConversationService(data = {}, actor) {
  const user = await actorUser(actor);
  if (user.role === 'admin' || user.role === 'root')
    throw chatError('Admins do not buy; use a seller account to chat', 403);

  const sellerId = chatOid(data.seller_id, 'seller id');
  const productId = optionalOid(data.product_id, 'product id');
  const storeId = optionalOid(data.store_id, 'store id');

  const seller = await db.collection('users').findOne({ _id: sellerId });
  if (!seller || !seller.is_seller) throw chatError('Seller not found', 404);
  if (!isReachableSeller(seller))
    throw chatError('This seller is not available for chat yet', 409);
  if (String(seller._id) === String(user._id))
    throw chatError('You cannot chat with yourself', 400);

  let product = null;
  if (productId) {
    product = await db.collection('products').findOne({ _id: productId });
    if (!product || product.status !== 'ACTIVE' || product.visibility !== 'PUBLIC')
      throw chatError('Product not found', 404);
  }

  let resolvedStore = storeId ? new ObjectId(storeId) : null;
  if (product?.store_id) resolvedStore = new ObjectId(String(product.store_id));
  if (!resolvedStore) {
    // گفتگو بدون محصول: به فروشگاه فعال همین فروشنده برگرد
    const store = await db
      .collection('stores')
      .findOne({ user: sellerId, status: 'ENABLE' }, { sort: { _id: 1 } });
    resolvedStore = store?._id || null;
  }
  if (storeId) {
    const store = await db.collection('stores').findOne({ _id: new ObjectId(storeId) });
    if (!store || String(store.user) !== String(sellerId))
      throw chatError('Store does not belong to this seller', 400);
  }

  await ensureIndexes();
  const conversations = db.collection('chat_conversations');
  const existing = await conversations.findOne({ buyer_id: user._id, seller_id: sellerId });
  if (existing) {
    const patch = {};
    if (productId && String(existing.product_id || '') !== String(productId))
      patch.product_id = productId;
    if (resolvedStore && String(existing.store_id || '') !== String(resolvedStore))
      patch.store_id = resolvedStore;
    if (Object.keys(patch).length) {
      patch.updated_at = new Date();
      await conversations.updateOne({ _id: existing._id }, { $set: patch });
    }
    return { ...existing, ...patch, reused: true };
  }

  const doc = {
    buyer_id: user._id,
    seller_id: sellerId,
    product_id: productId || null,
    store_id: resolvedStore,
    status: 'OPEN',
    first_message_body: '',
    unread: { buyer: 0, seller: 0 },
    last_message_id: null,
    created_at: new Date(),
    updated_at: new Date(),
  };
  const inserted = await conversations.insertOne(doc);
  return { _id: inserted.insertedId, ...doc, reused: false };
}

/* ------------------------------------------------------------------ */
/* فهرست گفتگوها                                                       */
/* ------------------------------------------------------------------ */

export async function listConversationsService(query = {}, actor) {
  const user = await actorUser(actor);
  const { page, limit, search } = chatListQuery(query);
  await ensureIndexes();

  const isAdmin = user.role === 'admin' || user.role === 'root';
  const asSeller = String(query.as || '') === 'seller';

  let filter;
  if (isAdmin && query.scope === 'all') filter = {};
  else if (asSeller) {
    if (!isReachableSeller(user)) throw chatError('Only approved and active sellers can use chat', 403);
    filter = { seller_id: user._id };
  } else filter = { $or: [{ buyer_id: user._id }, { seller_id: user._id }] };

  const rows = await db
    .collection('chat_conversations')
    .find(filter)
    .sort({ updated_at: -1 })
    .toArray();

  const participants = await participantsFor(rows);

  let visible = rows.map((row) => ({ row, role: roleIn(row, user) })).filter((entry) => entry.role);

  if (search) {
    const needle = search.toLowerCase();
    visible = visible.filter(({ row }) => {
      const buyer = participants.get(String(row.buyer_id));
      const seller = participants.get(String(row.seller_id));
      return [displayName(buyer), displayName(seller), buyer?.username, seller?.username, row.first_message_body]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
    });
  }

  if (query.unread_only === 'true' || query.unread_only === true) {
    visible = visible.filter(({ row, role }) => (role === 'seller' ? row.unread?.seller : row.unread?.buyer) > 0);
  }

  const total = visible.length;
  const totalPages = Math.max(Math.ceil(total / limit), 1);
  const start = (page - 1) * limit;
  const slice = visible.slice(start, start + limit);

  const lastIds = slice.map(({ row }) => row.last_message_id).filter(Boolean);
  const lastRows = lastIds.length
    ? await db.collection('chat_messages').find({ _id: { $in: lastIds.map((id) => new ObjectId(String(id))) } }).toArray()
    : [];
  const lastById = new Map(lastRows.map((row) => [String(row._id), row]));

  const data = [];
  for (const entry of slice) {
    const last = lastById.get(String(entry.row.last_message_id || '')) || null;
    data.push(
      await publicConversation(
        entry.row,
        participants,
        entry.role,
        last ? { _id: last._id, body: last.body, sender_role: last.sender_role, kind: last.deleted_at ? 'deleted' : last.images?.length && !last.body ? 'image' : 'text', created_at: last.created_at } : null,
      ),
    );
  }

  return { data, total, page, limit, totalPages, scope: isAdmin && query.scope === 'all' ? 'all' : 'own' };
}

export async function getConversationService(id, actor) {
  const user = await actorUser(actor);
  const { row, role } = await accessConversation(id, user);
  const participants = await participantsFor([row]);
  return await publicConversation(row, participants, role);
}


/* ------------------------------------------------------------------ */
/* پیام‌ها                                                             */
/* ------------------------------------------------------------------ */

export async function listMessagesService(id, query = {}, actor) {
  const user = await actorUser(actor);
  const { row, role } = await accessConversation(id, user);
  const { limit, before, after } = chatMessageQuery(query);
  await ensureIndexes();

  const filter = { conversation_id: row._id };
  if (before) filter.created_at = { $lt: before };

  const rows = await db
    .collection('chat_messages')
    .find(filter)
    .sort({ created_at: -1 })
    .limit(limit)
    .toArray();

  rows.reverse();
  const data = [];
  for (const message of rows) data.push(await publicMessage(message, role));

  return { data, conversation_id: row._id, has_more: rows.length === limit, role };
}

export async function sendMessageService(id, data = {}, actor) {
  const user = await actorUser(actor);
  const { row, role } = await accessConversation(id, user, { manage: true });
  if (role === 'admin') throw chatError('Admins cannot write in buyer/seller conversations', 403);
  if (row.status === 'CLOSED') throw chatError('Conversation is closed', 409);

  const { body, imageIds } = chatMessageInput(data);
  const pin = chatPinInput(data.pin);

  if (imageIds.length) {
    const files = await db
      .collection('storage')
      .find({ _id: { $in: imageIds }, chat_owner: user._id })
      .toArray();
    if (files.length !== imageIds.length) throw chatError('One of the images is not yours or is missing', 400);
  }

  // پین باید به همان محصول/فروشگاه گفتگو مربوط باشد
  if (pin?.product_id && row.product_id && String(pin.product_id) !== String(row.product_id))
    pin.product_id = new ObjectId(String(row.product_id));
  const resolvedPin = pin
    ? { kind: pin.kind, product_id: row.product_id || pin.product_id, store_id: row.store_id || pin.store_id }
    : row.product_id || row.store_id
      ? { kind: row.product_id ? 'product' : 'store', product_id: row.product_id, store_id: row.store_id }
      : null;

  await ensureIndexes();
  const now = new Date();
  const doc = {
    conversation_id: row._id,
    sender_id: user._id,
    sender_role: role,
    body,
    images: imageIds,
    pin: resolvedPin,
    read_by: [user._id],
    edited_at: null,
    deleted_at: null,
    created_at: now,
  };
  const inserted = await db.collection('chat_messages').insertOne(doc);
  const message = { _id: inserted.insertedId, ...doc };

  const counterpartKey = role === 'seller' ? 'buyer' : 'seller';
  const patch = {
    last_message_id: message._id,
    updated_at: now,
    [`unread.${counterpartKey}`]: (row.unread?.[counterpartKey] || 0) + 1,
  };
  if (!row.first_message_body && body) patch.first_message_body = body.slice(0, 300);
  await db.collection('chat_conversations').updateOne({ _id: row._id }, { $set: patch });

  const payload = await publicMessage(message, role);
  /* نام فرستنده فقط برای اعلان کلاینت اضافه می‌شود؛ در دیتابیس ذخیره نمی‌شود */
  payload.sender_name = displayName(user);
  const audience = [row.buyer_id, row.seller_id];
  broadcast(audience, { type: 'message:new', conversation_id: String(row._id), message: payload });
  broadcast(audience, {
    type: 'conversation:updated',
    conversation: {
      _id: row._id,
      unread: { ...row.unread, [counterpartKey]: patch[`unread.${counterpartKey}`] },
      last_message: { _id: message._id, body, kind: imageIds.length && !body ? 'image' : 'text', sender_role: role, created_at: now },
      updated_at: now,
    },
  });

  return message;
}

export async function editMessageService(messageId, data = {}, actor) {
  const user = await actorUser(actor);
  await ensureIndexes();
  const message = await db
    .collection('chat_messages')
    .findOne({ _id: chatOid(messageId, 'message id') });
  if (!message) throw chatError('Message not found', 404);

  const conversation = await loadConversation(String(message.conversation_id));
  const role = roleIn(conversation, user);
  if (role === 'admin') throw chatError('Admins cannot rewrite messages', 403);
  if (String(message.sender_id) !== String(user._id)) throw chatError('Not your message', 403);
  if (role === 'seller' && !isReachableSeller(user))
    throw chatError('Only approved and active sellers can use chat', 403);
  if (message.deleted_at) throw chatError('Deleted messages cannot be edited', 409);

  const body = chatEditedBody(data);
  const edited_at = new Date();
  await db
    .collection('chat_messages')
    .updateOne({ _id: message._id }, { $set: { body, edited_at } });

  const updated = { ...message, body, edited_at };
  broadcast([conversation.buyer_id, conversation.seller_id], {
    type: 'message:updated',
    conversation_id: String(conversation._id),
    message: await publicMessage(updated, role),
  });
  return updated;
}

export async function deleteMessageService(messageId, actor) {
  const user = await actorUser(actor);
  await ensureIndexes();
  const message = await db
    .collection('chat_messages')
    .findOne({ _id: chatOid(messageId, 'message id') });
  if (!message) throw chatError('Message not found', 404);

  const conversation = await loadConversation(String(message.conversation_id));
  const role = roleIn(conversation, user);
  const isAdmin = user.role === 'admin' || user.role === 'root';

  if (!isAdmin && String(message.sender_id) !== String(user._id))
    throw chatError('Not your message', 403);
  if (!isAdmin && role === 'seller' && !isReachableSeller(user))
    throw chatError('Only approved and active sellers can use chat', 403);

  const deleted_at = new Date();
  await db.collection('chat_messages').updateOne({ _id: message._id }, { $set: { deleted_at } });

  broadcast([conversation.buyer_id, conversation.seller_id], {
    type: 'message:deleted',
    conversation_id: String(conversation._id),
    message_id: String(message._id),
    deleted_at,
  });
  return { _id: message._id, deleted_at };
}

export async function markReadService(id, actor) {
  const user = await actorUser(actor);
  const { row, role } = await accessConversation(id, user);
  if (role === 'admin') return { conversation_id: row._id, read: 0 };

  await ensureIndexes();
  const result = await db.collection('chat_messages').updateMany(
    { conversation_id: row._id, read_by: { $ne: user._id } },
    { $set: { read_by: [user._id], read_at: new Date() } },
  );

  const patch = { updated_at: row.updated_at };
  patch[`unread.${role}`] = 0;
  await db.collection('chat_conversations').updateOne({ _id: row._id }, { $set: patch });

  const counterpart = role === 'seller' ? row.buyer_id : row.seller_id;
  broadcast([counterpart], {
    type: 'read',
    conversation_id: String(row._id),
    reader_id: String(user._id),
    reader_role: role,
    at: new Date(),
  });

  return { conversation_id: row._id, read: result?.modifiedCount ?? result?.matchedCount ?? 0 };
}

export async function chatUnreadService(actor) {
  const user = await actorUser(actor);
  await ensureIndexes();
  const rows = await db
    .collection('chat_conversations')
    .find({ $or: [{ buyer_id: user._id }, { seller_id: user._id }] })
    .toArray();

  const sellerBlocked = user.is_seller === true && !isReachableSeller(user);
  let total = 0;
  let conversations = 0;
  for (const row of rows) {
    const role = roleIn(row, user);
    if (role === 'seller' && sellerBlocked) continue;
    const n = role === 'seller' ? row.unread?.seller || 0 : row.unread?.buyer || 0;
    if (n > 0) conversations += 1;
    total += n;
  }
  return { total, conversations, blocked: sellerBlocked };
}

/* ------------------------------------------------------------------ */
/* آپلود تصویر                                                         */
/* ------------------------------------------------------------------ */

export async function uploadChatImages(files, actor) {
  const user = await actorUser(actor);
  if (!files?.length || files.length > MAX_IMAGES_PER_MESSAGE)
    throw chatError(`Choose 1 to ${MAX_IMAGES_PER_MESSAGE} images`, 400);

  for (const file of files) assertChatImage(file);

  const ids = [];
  for (const file of files) {
    const inserted = await db.collection('storage').insertOne({
      name: 'chat-image',
      contentType: file.mimetype,
      size: file.size,
      data: file.buffer,
      chat_owner: user._id,
      create_at: new Date(),
    });
    ids.push({ _id: inserted.insertedId });
  }
  return ids;
}

/* ------------------------------------------------------------------ */
/* نظارت ادمین                                                         */
/* ------------------------------------------------------------------ */

export async function setConversationStatusService(id, status, actor) {
  const user = await actorUser(actor);
  if (user.role !== 'admin' && user.role !== 'root') throw chatError('Access denied', 403);
  if (!CONVERSATION_STATUSES.includes(status)) throw chatError('Invalid conversation status', 400);

  const row = await loadConversation(id);
  await db
    .collection('chat_conversations')
    .updateOne({ _id: row._id }, { $set: { status, updated_at: new Date() } });

  broadcast([row.buyer_id, row.seller_id], {
    type: 'conversation:updated',
    conversation: { _id: row._id, status },
  });
  return { _id: row._id, status };
}

export async function chatStatsService(actor) {
  const user = await actorUser(actor);
  if (user.role !== 'admin' && user.role !== 'root') throw chatError('Access denied', 403);
  await ensureIndexes();

  const [conversations, messages, open, blocked] = await Promise.all([
    db.collection('chat_conversations').countDocuments({}),
    db.collection('chat_messages').countDocuments({ deleted_at: null }),
    db.collection('chat_conversations').countDocuments({ status: 'OPEN' }),
    db.collection('chat_conversations').countDocuments({ status: 'BLOCKED' }),
  ]);
  return { counts: { conversations, messages, open, blocked } };
}
