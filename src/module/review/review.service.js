import { ObjectId } from 'mongodb';
import db from '../../config/mongodb.config.js';
import { reviewInput, reviewQuery, reviewError } from './review.core.js';
const reviews = db.collection('reviews');
const oid = (id) => {
  if (!/^[a-f\d]{24}$/i.test(String(id))) throw reviewError('Invalid ID');
  return new ObjectId(String(id));
};
let indexes;
const ready = () =>
  (indexes ||= (async () => {
    // V27 allowed one review per account. V28 deliberately permits multiple reviews.
    try {
      await reviews.dropIndex('target_type_1_target_id_1_user_id_1');
    } catch (e) {
      if (
        ![26, 27].includes(e.code) &&
        !['IndexNotFound', 'NamespaceNotFound'].includes(e.codeName)
      )
        throw e;
    }
    await reviews.createIndex({ target_type: 1, target_id: 1, parent_id: 1, created_at: -1 });
    await reviews.createIndex({ user_id: 1, created_at: -1 });
  })().catch((e) => {
    indexes = undefined;
    throw e;
  }));
async function actorUser(actor) {
  if (!actor) throw reviewError('Login required', 401);
  const user = await db.collection('users').findOne({ _id: oid(actor._id) });
  if (!user) throw reviewError('Access denied', 403);
  return user;
}
async function target(type, id, publicOnly = true) {
  if (!['product', 'store'].includes(type)) throw reviewError('Invalid review target');
  const document = await db
    .collection(type === 'product' ? 'products' : 'stores')
    .findOne({ _id: oid(id) });
  if (
    !document ||
    document.deleted_at ||
    document.is_deleted ||
    (publicOnly &&
      ((type === 'product' && (document.status !== 'ACTIVE' || document.visibility !== 'PUBLIC')) ||
        (type === 'store' && document.status !== 'ENABLE')))
  )
    throw reviewError('Review target not found', 404);
  let owner = document.user || document.seller_id || document.user_id;
  if (type === 'product' && document.store_id) {
    const store = await db.collection('stores').findOne({ _id: oid(document.store_id) });
    owner = store?.user || owner;
  }
  return { filter: { target_type: type, target_id: document._id }, document, owner };
}
function safe(row, actor, managed = false) {
  return {
    _id: row._id,
    deleted: !!row.deleted,
    rating: row.rating ?? null,
    text: row.text,
    images: row.images || [],
    parent_id: row.parent_id || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    author: row.author || 'Member',
    author_role: row.author_role || 'member',
    is_mine: !!actor && String(row.user_id) === String(actor._id),
    ...(managed
      ? {
          ...(actor?.role === 'admin' ? { user_id: row.user_id } : {}),
          target_type: row.target_type,
          target_id: row.target_id,
        }
      : {}),
  };
}
async function imagesFor(data, user) {
  const ids = data.images ?? [];
  if (!Array.isArray(ids) || ids.length > 5 || new Set(ids.map(String)).size !== ids.length)
    throw reviewError('At most 5 different images allowed');
  for (const id of ids) {
    const file = await db.collection('storage').findOne({ _id: oid(id) });
    if (
      !file ||
      String(file.review_owner) !== String(user._id) ||
      !['image/jpeg', 'image/png', 'image/webp'].includes(file.contentType)
    )
      throw reviewError('Invalid review image');
  }
  return ids.map(oid);
}
const authorOf = (user, language = 'en') => {
  const text = value => typeof value === 'string' ? value.trim() :
    value && typeof value === 'object' ? String([value[language], value.en, ...Object.values(value)].find(v => typeof v === 'string' && v.trim()) ?? '').trim() : '';
  return [text(user?.firstname), text(user?.lastname)].filter(Boolean).join(' ') || text(user?.username) || 'GeoCala user';
};
async function attachReplies(rows, actor, managed = false, language = 'en') {
  if (!rows.length) return [];
  const children = await reviews.find({ parent_id: { $in: rows.map(r => r._id) } }).sort({ created_at: 1, _id: 1 }).toArray();
  const ids = [...new Map([...rows, ...children].filter(r => r.user_id && !r.deleted).map(r => [String(r.user_id), r.user_id])).values()];
  const users = ids.length ? await db.collection('users').find({ _id: { $in: ids } }, { projection: { firstname: 1, lastname: 1, username: 1 } }).toArray() : [];
  const people = new Map(users.map(u => [String(u._id), u]));
  const present = row => ({ ...safe(row, actor, managed), author: row.deleted ? 'GeoCala user' : authorOf(people.get(String(row.user_id)), language) });
  return rows.map(row => ({ ...present(row), replies: children.filter(r => String(r.parent_id) === String(row._id)).map(present) }));
}
export async function listReviews(type, id, query = {}, actor) {
  await ready();
  const { filter } = await target(type, id);
  const { page, limit, rating, sort } = reviewQuery(query);
  const root = { ...filter, parent_id: null };
  const selected = { ...root, ...(rating ? { rating } : {}) };
  const [rows, total, buckets] = await Promise.all([
    reviews
      .find(selected)
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(limit)
      .toArray(),
    reviews.countDocuments(selected),
    reviews
      .aggregate([{ $match: root }, { $group: { _id: '$rating', count: { $sum: 1 } } }])
      .toArray(),
  ]);
  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const b of buckets) if (b._id >= 1 && b._id <= 5) distribution[b._id] = b.count;
  const count = Object.values(distribution).reduce((a, b) => a + b, 0),
    sum = Object.entries(distribution).reduce((a, [n, c]) => a + Number(n) * c, 0);
  return {
    data: await attachReplies(rows, actor, false, query.lang),
    total,
    page,
    limit,
    summary: { count, average: count ? Math.round((sum / count) * 10) / 10 : 0, distribution },
  };
}
export async function saveReview(type, id, data, actor, reviewId = null, parentId = null) {
  const user = await actorUser(actor);
  const { filter, owner } = await target(type, id, false);
  await ready();
  const role =
    user.role === 'admin' ? 'admin' : String(owner) === String(user._id) ? 'seller' : 'member';
  let existing;
  if (reviewId) {
    existing = await reviews.findOne({ ...filter, _id: oid(reviewId) });
    if (!existing || existing.deleted) throw reviewError('Review not found', 404);
    if (String(existing.user_id) !== String(user._id)) throw reviewError('Access denied', 403);
    parentId = existing.parent_id;
  } else if (parentId) {
    const parent = await reviews.findOne({ ...filter, _id: oid(parentId), parent_id: null });
    if (!parent || parent.deleted) throw reviewError('Review not found', 404);
    if ((await reviews.countDocuments({ parent_id: parent._id })) >= 200)
      throw reviewError('Reply limit reached');
    parentId = parent._id;
  }
  const { document } = await target(type, id, role !== 'admin' && role !== 'seller');
  if (!parentId && String(owner) === String(user._id))
    throw reviewError('You cannot review your own product or store', 403);
  const input = parentId
    ? { text: typeof data.text === 'string' ? data.text.trim() : '' }
    : reviewInput(data);
  if (parentId && (input.text.length < 3 || input.text.length > 3000))
    throw reviewError('Reply must contain 3 to 3000 characters');
  const images = await imagesFor(data, user);
  const now = new Date();
  const row = {
    ...filter,
    ...input,
    images,
    parent_id: parentId ? oid(parentId) : null,
    author: authorOf(user),
    author_role: role,
    updated_at: now,
  };
  if (existing) {
    const saved = await reviews.updateOne(
      { _id: existing._id, user_id: user._id, deleted: { $ne: true } },
      { $set: row },
    );
    if (saved.matchedCount !== 1) throw reviewError('Review changed; refresh and try again', 409);
    return safe({ ...existing, ...row }, actor);
  }
  const insert = await reviews.insertOne({ ...row, user_id: user._id, created_at: now });
  return safe({ ...row, _id: insert.insertedId, user_id: user._id, created_at: now }, actor);
}
export async function deleteReview(type, id, actor, reviewId) {
  const user = await actorUser(actor);
  const { filter } = await target(type, id, false);
  const row = await reviews.findOne({ ...filter, _id: oid(reviewId) });
  if (!row) throw reviewError('Review not found', 404);
  if (user.role !== 'admin' && String(row.user_id) !== String(user._id))
    throw reviewError('Access denied', 403);
  // Soft-delete roots with replies so concurrently posted replies are never orphaned.
  if (!row.parent_id) {
    await reviews.updateOne(
      { _id: row._id },
      {
        $set: {
          text: '',
          rating: null,
          images: [],
          deleted: true,
          author: 'Member',
          updated_at: new Date(),
        },
      },
    );
  } else await reviews.deleteOne({ _id: row._id });
  return { deleted: true };
}
export async function manageReviews(query, actor) {
  const user = await actorUser(actor);
  if (user.role !== 'admin' && user.role !== 'seller' && !user.is_seller)
    throw reviewError('Access denied', 403);
  await ready();
  const { page, limit, rating, sort } = reviewQuery(query);
  if (Object.hasOwn(query, 'user_id') && user.role !== 'admin')
    throw reviewError('Author filtering is restricted to administrators', 403);
  const parts = [{ parent_id: null }];
  if (user.role !== 'admin') {
    const stores = await db.collection('stores').find({ user: user._id }).toArray();
    const sids = stores.map((s) => s._id);
    const products = await db
      .collection('products')
      .find({ $or: [{ seller_id: user._id }, { store_id: { $in: sids } }] })
      .toArray();
    parts.push({
      $or: [
        { target_type: 'store', target_id: { $in: sids } },
        { target_type: 'product', target_id: { $in: products.map((p) => p._id) } },
      ],
    });
  }
  if (query.product_id) parts.push({ target_type: 'product', target_id: oid(query.product_id) });
  if (query.store_id) {
    const sid = oid(query.store_id);
    const products = await db.collection('products').find({ store_id: sid }).toArray();
    parts.push({
      $or: [
        { target_type: 'store', target_id: sid },
        { target_type: 'product', target_id: { $in: products.map((p) => p._id) } },
      ],
    });
  }
  if (query.user_id && user.role !== 'admin')
    throw reviewError('Author filtering is restricted to administrators', 403);
  if (query.user_id) {
    const uid = oid(query.user_id);
    const authored = await reviews.find({ user_id: uid }).toArray();
    parts.push({
      $or: [
        { user_id: uid },
        { _id: { $in: authored.filter((r) => r.parent_id).map((r) => r.parent_id) } },
      ],
    });
  }
  if (query.type) {
    if (!['product', 'store'].includes(query.type)) throw reviewError('Invalid review target');
    parts.push({ target_type: query.type });
  }
  if (rating) parts.push({ rating });
  const filter = { $and: parts };
  const [rows, total] = await Promise.all([
    reviews
      .find(filter)
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(limit)
      .toArray(),
    reviews.countDocuments(filter),
  ]);
  const [products, stores] = await Promise.all([
    db
      .collection('products')
      .find(
        { _id: { $in: rows.filter((r) => r.target_type === 'product').map((r) => r.target_id) } },
        { projection: { name: 1, store_id: 1, images_id: 1, images: 1, price: 1 } },
      )
      .toArray(),
    db
      .collection('stores')
      .find(
        { _id: { $in: rows.filter((r) => r.target_type === 'store').map((r) => r.target_id) } },
        { projection: { name: 1, profile_image_id: 1 } },
      )
      .toArray(),
  ]);
  const targets = new Map([...products, ...stores].map((row) => [String(row._id), row]));
  const data = (await attachReplies(rows, user, true, query.lang)).map((row) => ({
    ...row,
    target_name: targets.get(String(row.target_id))?.name || null,
    target_image: (() => { const item = targets.get(String(row.target_id)); return row.target_type === 'store' ? item?.profile_image_id || null : item?.images_id?.[0] || item?.images?.[0] || null; })(),
    target_price: row.target_type === 'product' ? targets.get(String(row.target_id))?.price || null : null,
  }));
  return { data, total, page, limit };
}
export async function uploadReviewImages(files, actor) {
  const user = await actorUser(actor);
  if (!files?.length || files.length > 5) throw reviewError('Choose 1 to 5 images');
  for (const f of files) {
    const b = f.buffer;
    const png =
      b.length > 8 && b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const jpg = b.length > 3 && b[0] === 255 && b[1] === 216 && b[2] === 255;
    const webp =
      b.length > 12 &&
      b.toString('ascii', 0, 4) === 'RIFF' &&
      b.toString('ascii', 8, 12) === 'WEBP';
    if (
      f.size > 5 * 1024 * 1024 ||
      !(
        (f.mimetype === 'image/png' && png) ||
        (f.mimetype === 'image/jpeg' && jpg) ||
        (f.mimetype === 'image/webp' && webp)
      )
    )
      throw reviewError('Only valid JPEG, PNG and WebP images up to 5 MB are allowed');
  }
  const ids = [];
  for (const f of files) {
    const r = await db.collection('storage').insertOne({
      name: 'review-image',
      contentType: f.mimetype,
      size: f.size,
      data: f.buffer,
      review_owner: user._id,
      create_at: new Date(),
    });
    ids.push({ _id: r.insertedId });
  }
  return ids;
}
