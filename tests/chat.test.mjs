import assert from 'node:assert/strict';
import { ObjectId } from 'mongodb';
import { tables } from './review-db.mjs';
import {
  chatStatsService,
  chatUnreadService,
  deleteMessageService,
  editMessageService,
  listConversationsService,
  listMessagesService,
  markReadService,
  openConversationService,
  sendMessageService,
  setConversationStatusService,
} from '../src/module/chat/chat.service.js';

const buyer = new ObjectId().toString();
const seller = new ObjectId().toString();
const inactiveSeller = new ObjectId().toString();
const other = new ObjectId().toString();
const admin = new ObjectId().toString();
const store = new ObjectId().toString();
const product = new ObjectId().toString();

tables.users = [
  { _id: buyer, role: 'customer', username: 'buyer_one', firstname: 'Nila', lastname: 'Rahimi' },
  {
    _id: seller,
    role: 'seller',
    username: 'seller_one',
    firstname: 'Parsa',
    lastname: 'Saadat',
    is_seller: true,
    seller_approved_status: true,
    seller_active_status: 'ACTIVE',
    seller_trust: true,
  },
  {
    _id: inactiveSeller,
    role: 'seller',
    username: 'seller_two',
    is_seller: true,
    seller_approved_status: false,
    seller_active_status: 'INACTIVE',
  },
  { _id: other, role: 'customer', username: 'buyer_two' },
  { _id: admin, role: 'admin', username: 'root_admin' },
];
tables.stores = [{ _id: store, user: seller, name: 'GeoCala Tools', status: 'ENABLE' }];
tables.products = [
  {
    _id: product,
    store_id: store,
    seller_id: seller,
    name: 'Total Station X',
    status: 'ACTIVE',
    visibility: 'PUBLIC',
    images_id: [],
    price: { amount: 1200, currency: 'USD' },
  },
];

const as = (id) => ({ _id: id });

/* 1) باز کردن گفتگو: فقط فروشندهٔ تأیید و فعال‌شده */
await assert.rejects(
  () => openConversationService({ seller_id: inactiveSeller }, as(buyer)),
  (e) => e.cause?.code === 409,
);
await assert.rejects(
  () => openConversationService({ seller_id: seller }, as(seller)),
  (e) => e.cause?.code === 400,
);

const conversation = await openConversationService(
  { seller_id: seller, product_id: product },
  as(buyer),
);
const cid = String(conversation._id);
assert.equal(String(conversation.product_id), product);
assert.equal(conversation.reused, false);
const again = await openConversationService({ seller_id: seller, product_id: product }, as(buyer));
assert.equal(String(again._id), cid, 'same pair must reuse one conversation');

/* 2) ارسال پیام و شمار خوانده‌نشده */
const sent = await sendMessageService(cid, { body: 'Is the 5km range real?', pin: {kind:'product',product_id:product} }, as(buyer));
assert.equal(sent.sender_role, 'buyer');
assert.equal(tables.chat_conversations[0].unread.seller, 1);
assert.equal(tables.chat_conversations[0].unread.buyer, 0);

await assert.rejects(() => sendMessageService(cid, { body: '   ' }, as(buyer)), (e) => e.cause?.code === 400);

/* پین پیام باید همان محصول گفتگو بماند حتی اگر محصول دیگری فرستاده شود */
const foreignProduct = new ObjectId().toString();
const pinned = await sendMessageService(
  cid,
  { body: 'And this one?', pin: { kind: 'product', product_id: foreignProduct } },
  as(buyer),
);
assert.equal(String(pinned.pin.product_id), product, 'pin cannot point at another product');

/* 3) فروشندهٔ غیرفعال/تأییدنشده نمی‌تواند گفتگوهایش را ببیند */
await assert.rejects(
  () => listConversationsService({ as: 'seller' }, as(inactiveSeller)),
  (e) => e.cause?.code === 403,
);
const sellerList = await listConversationsService({ as: 'seller' }, as(seller));
assert.equal(sellerList.total, 1);
assert.equal(sellerList.data[0].unread, 2, 'both buyer messages are unread for the seller');
assert.equal(sellerList.data[0].role, 'seller');
assert.equal(sellerList.data[0].buyer.display_name, 'Nila Rahimi');

/* 3b) شخص ثالث و فروشندهٔ دیگر دسترسی ندارند */
await assert.rejects(() => listMessagesService(cid, {}, as(other)), (e) => e.cause?.code === 403);
await assert.rejects(() => sendMessageService(cid, { body: 'hi' }, as(inactiveSeller)), (e) => e.cause?.code === 403);
/* ادعای قدیمی توکن: role=admin در Payload ولی نقش دیتابیس customer؛
   دامنهٔ نظارتی داده نمی‌شود و فقط گفتگوهای خودش (هیچ) برگردانده می‌شود */
const staleAdmin = await listConversationsService({ scope: 'all' }, { _id: other, role: 'admin' });
assert.equal(staleAdmin.scope, 'own', 'token role alone never grants the admin scope');
assert.equal(staleAdmin.total, 0);
await assert.rejects(
  () => listConversationsService({ scope: 'all' }, { _id: new ObjectId().toString(), role: 'admin' }),
  (e) => e.cause?.code === 403,
);

/* 4) فهرست پیام‌ها و رسید خوانده‌شدن */
const thread = await listMessagesService(cid, {}, as(seller));
assert.equal(thread.data.length, 2);
assert.equal(thread.data[0].pin.title, 'Total Station X', 'pinned product title is hydrated');
await markReadService(cid, as(seller));
assert.equal(tables.chat_conversations[0].unread.seller, 0);
assert.equal((await chatUnreadService(as(buyer))).total, 0);
assert.equal((await chatUnreadService(as(seller))).total, 0);
const blockedUnread = await chatUnreadService(as(inactiveSeller));
assert.equal(blockedUnread.blocked, true, 'an unapproved seller is flagged as blocked from chat');
assert.equal(blockedUnread.total, 0);

/* 5) ویرایش و حذف فقط توسط فرستنده */
await assert.rejects(
  () => editMessageService(String(sent._id), { body: 'hijack' }, as(seller)),
  (e) => e.cause?.code === 403,
);
const edited = await editMessageService(String(sent._id), { body: 'Is the 5km range real?', pin: {kind:'product',product_id:product} }, as(buyer));
assert.ok(edited.edited_at);
await assert.rejects(() => deleteMessageService(String(sent._id), as(seller)), (e) => e.cause?.code === 403);
await deleteMessageService(String(pinned._id), as(buyer));
const afterDelete = await listMessagesService(cid, {}, as(buyer));
assert.equal(afterDelete.data[1].kind, 'deleted');
assert.equal(afterDelete.data[1].body, '');
assert.equal(afterDelete.data[1].pin, null);

/* 6) نظارت ادمین: خواندن همه، بستن گفتگو، نوشتن ممنوع */
const adminList = await listConversationsService({ scope: 'all' }, as(admin));
assert.equal(adminList.scope, 'all');
assert.equal(adminList.data[0].role, 'admin');
await assert.rejects(() => sendMessageService(cid, { body: 'admin note' }, as(admin)), (e) => e.cause?.code === 403);
const closed = await setConversationStatusService(cid, 'CLOSED', as(admin));
assert.equal(closed.status, 'CLOSED');
await assert.rejects(() => sendMessageService(cid, { body: 'after close' }, as(buyer)), (e) => e.cause?.code === 409);
await assert.rejects(
  () => setConversationStatusService(cid, 'CLOSED', as(buyer)),
  (e) => e.cause?.code === 403,
);
await assert.rejects(() => chatStatsService(as(buyer)), (e) => e.cause?.code === 403);
const stats = await chatStatsService(as(admin));
assert.equal(stats.counts.conversations, 1);
assert.equal(stats.counts.messages, 1, 'the deleted message is not counted');

/* 7) گفتگوی مسدودشده نوشتن را می‌بندد ولی خواندن برای اعضا می‌ماند */
await setConversationStatusService(cid, 'BLOCKED', as(admin));
await assert.rejects(() => sendMessageService(cid, { body: 'blocked' }, as(buyer)), (e) => e.cause?.code === 403);
assert.equal((await listMessagesService(cid, {}, as(buyer))).data.length, 2);

/* 8) نام‌های چندزبانه نباید "[object Object]" بسازند */
const multilang = new ObjectId().toString();
tables.users.push({
  _id: multilang,
  role: 'seller',
  username: 'ml_seller',
  firstname: { en: 'Min', fa: 'مین' },
  lastname: { en: 'Liu', fa: 'لیو' },
  is_seller: true,
  seller_approved_status: true,
  seller_active_status: 'ACTIVE',
});
const mlConversation = await openConversationService({ seller_id: multilang }, as(buyer));
const mlList = await listConversationsService({}, as(buyer));
const mlRow = mlList.data.find((row) => String(row.seller?._id) === multilang);
assert.ok(mlRow, 'multi-language seller appears in the buyer list');
assert.equal(typeof mlRow.seller.display_name, 'object', 'display_name stays a language map');
assert.equal(mlRow.seller.display_name.en, 'Min Liu');
assert.equal(mlRow.seller.display_name.fa, 'مین لیو');
assert.ok(!JSON.stringify(mlRow).includes('[object Object'), 'no [object Object] leaks into the payload');
const mlThread = await listMessagesService(String(mlConversation._id), {}, as(multilang));
assert.equal(mlThread.role, 'seller');
await deleteMessageService(
  String((await sendMessageService(String(mlConversation._id), { body: 'ok' }, as(multilang)))._id),
  as(multilang),
);

// Direct administrative participation is separate from read-only oversight.
const direct = await openConversationService({ seller_id: seller }, as(admin));
const directList = await listConversationsService({}, as(admin));
assert.equal(directList.data.find(row => String(row._id) === String(direct._id)).role, 'buyer');
await sendMessageService(String(direct._id), { body: 'Direct admin message' }, as(admin));
await sendMessageService(String(direct._id), { body: 'Seller response' }, as(seller));
assert.equal((await listMessagesService(String(direct._id), {}, as(admin))).data.length, 2);
await assert.rejects(() => openConversationService({ seller_id: other, product_id: product }, as(seller)), e => e.cause?.code === 400);
await assert.rejects(() => sendMessageService(String(direct._id), { body: 'intrusion' }, as(other)), e => e.cause?.code === 403);
const initiated = await openConversationService({ recipient_id: other }, as(seller));
await sendMessageService(String(initiated._id), { body: 'Seller initiated' }, as(seller));
await sendMessageService(String(initiated._id), { body: 'Customer response' }, as(other));
const ownSeller = await listConversationsService({ as: 'seller' }, as(seller));
assert.ok(ownSeller.data.some(row => String(row._id) === String(initiated._id)));
assert.equal(ownSeller.data.find(row => String(row._id) === String(initiated._id)).workspace,'seller');
const ownBuyer = await listConversationsService({as:'buyer'}, as(seller));
assert.ok(!ownBuyer.data.some(row => String(row._id) === String(initiated._id)));
const peerId = new ObjectId().toString();
tables.users.push({_id:peerId,role:'seller',is_seller:true,seller_approved_status:true,seller_active_status:'ACTIVE'});
const peerChat = await openConversationService({seller_id:peerId},as(seller));
const shopping = await listConversationsService({as:'buyer'},as(seller));
const selling = await listConversationsService({as:'seller'},as(seller));
assert.ok(shopping.data.some(row=>String(row._id)===String(peerChat._id)));
assert.ok(!selling.data.some(row=>String(row._id)===String(peerChat._id)));
const customerInbox = await listConversationsService({as:'buyer'},as(other));
assert.ok(customerInbox.data.some(row=>String(row._id)===String(initiated._id)));
assert.ok(!ownBuyer.data.some(row => String(row._id) === String(conversation._id)));
await setConversationStatusService(cid, 'OPEN', as(admin));
const plain = await sendMessageService(cid, {body:'No repeated product'}, as(buyer));
assert.equal(plain.pin, null);
const replyPlain = await sendMessageService(cid, {body:'No inherited product in reply'}, as(seller));
assert.equal(replyPlain.pin, null);
console.log('PASS V39: role-specific buyer/seller inboxes and explicit-only message pins');
console.log('PASS V36: admin direct messages, seller initiation and replies, participant roles and third-party denial');
console.log(
  'PASS actual chat services: approved+active seller gate, one conversation per pair, product pin cannot be swapped, buyer/seller unread counters, third party and stale admin token denied, seller panel locked for unapproved sellers, sender-only edit/delete, soft delete keeps the thread, admin read-only moderation with close/block, multi-language names never stringify to [object Object], WS-free service layer verified on the in-memory DB',
);
