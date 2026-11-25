import assert from 'node:assert/strict';
import express from 'express';
import jwt from 'jsonwebtoken';
import { tables } from './review-db.mjs';
import { reviewInput } from '../src/module/review/review.core.js';
import {
  listReviews,
  saveReview,
  deleteReview,
  manageReviews,
  uploadReviewImages,
} from '../src/module/review/review.service.js';
import { validateAttributes } from '../src/module/product/attributes.core.js';
import router from '../src/routes/review/review.route.js';
const pid = '507f1f77bcf86cd799439015',
  sid = '507f1f77bcf86cd799439013',
  uid = '507f1f77bcf86cd799439011',
  other = '507f1f77bcf86cd799439012',
  seller = '507f1f77bcf86cd799439010',
  admin = '507f1f77bcf86cd799439020',
  foreign = '507f1f77bcf86cd799439021',
  foreignStore = '507f1f77bcf86cd799439022';
tables.products = [
  { _id: pid, store_id: sid, seller_id: seller, status: 'ACTIVE', visibility: 'PUBLIC' },
];
tables.stores = [
  { _id: sid, user: seller, status: 'ENABLE' },
  { _id: foreignStore, user: foreign, status: 'ENABLE' },
];
tables.users = [
  {
    _id: uid,
    firstname: 'Parsa',
    address: { province: 'Tehran', city: 'Tehran', full_address: 'Seller office' },
    username: 'SECRET',
    email: 'SECRET',
  },
  { _id: other, firstname: 'Mina' },
  { _id: seller, role: 'seller' },
  { _id: admin, role: 'admin' },
  { _id: foreign, role: 'seller' },
];
const actor = { _id: uid };
for (const rating of [0, 6, 1.5, '5']) assert.throws(() => reviewInput({ rating, text: 'abc' }));
assert.throws(() => validateAttributes([{ name: '', value: 'x' }]));
assert.throws(() =>
  validateAttributes(Array.from({ length: 9 }, () => ({ name: 'x', value: 'y' }))),
);
assert.equal(
  validateAttributes(Array.from({ length: 8 }, () => ({ name: 'Name', value: 'Value' }))).length,
  8,
);
assert.deepEqual(validateAttributes([{ name: ' IP Rating ', value: ' Ip67 ' }]), [
  { name: 'IP Rating', value: 'Ip67' },
]);
await assert.rejects(
  () => saveReview('product', pid, { rating: 5, text: 'Good product' }, null),
  (e) => e.cause.code === 401,
);
await assert.rejects(
  () => saveReview('product', pid, { rating: 5, text: 'Good product' }, { _id: seller }),
  (e) => e.cause.code === 403,
);
const r1 = await saveReview('product', pid, { rating: 5, text: 'First review' }, actor);
const r2 = await saveReview('product', pid, { rating: 4, text: 'Second review same user' }, actor);
assert.notEqual(String(r1._id), String(r2._id));
let result = await listReviews('product', pid, {}, actor);
assert.equal(result.summary.average, 4.5);
assert.equal(result.summary.count, 2);
assert.ok(!JSON.stringify(result).includes('SECRET'));
const reply = await saveReview(
  'product',
  pid,
  { text: 'Thank you for your feedback' },
  { _id: seller },
  null,
  r1._id,
);
assert.equal(reply.author_role, 'seller');
result = await listReviews('product', pid, {}, actor);
assert.equal(result.summary.average, 4.5);
assert.equal(result.data.find((r) => String(r._id) === String(r1._id)).replies.length, 1);
await assert.rejects(
  () => saveReview('product', pid, { text: 'Nested reply' }, actor, null, reply._id),
  (e) => e.cause.code === 404,
);
await assert.rejects(
  () => saveReview('product', pid, { rating: 1, text: 'Hacked edit' }, { _id: other }, r1._id),
  (e) => e.cause.code === 403,
);
await assert.rejects(
  () => deleteReview('product', pid, { _id: seller }, r1._id),
  (e) => e.cause.code === 403,
);
const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
const uploaded = await uploadReviewImages(
  [{ buffer: png, mimetype: 'image/png', size: png.length }],
  actor,
);
const imageId = String(uploaded[0]._id);
const { getFileService } = await import('../src/module/storage/storage.service.js');
assert.equal((await getFileService(imageId)).review_owner, undefined);

await saveReview(
  'product',
  pid,
  { rating: 4, text: 'Review with photo', images: [imageId] },
  actor,
  r2._id,
);
await assert.rejects(
  () =>
    saveReview(
      'product',
      pid,
      { rating: 3, text: 'Stolen photo', images: [imageId] },
      { _id: other },
    ),
  (e) => e.cause.code === 400,
);
await assert.rejects(
  () =>
    uploadReviewImages(
      [{ buffer: Buffer.from('fake svg'), mimetype: 'image/png', size: 8 }],
      actor,
    ),
  (e) => e.cause.code === 400,
);
await saveReview('store', sid, { rating: 3, text: 'Store review' }, actor);
await saveReview('store', foreignStore, { rating: 2, text: 'Another store review' }, actor);
assert.equal(
  (await manageReviews({ user_id: seller }, { _id: admin })).total,
  1,
  'user filter includes authored replies in their thread context',
);
// V30: seller cannot select arbitrary authors, even with a stale admin claim.
await assert.rejects(
  () => manageReviews({ user_id: uid }, { _id: seller, role: 'admin' }),
  (e) => e.cause?.code === 403,
);
const { getUsersService } = await import('../src/module/user/user.service.js');
await assert.rejects(
  () => getUsersService({}, { _id: seller, role: 'admin' }),
  (e) => e.cause?.code === 403,
);
await assert.rejects(
  () => getUsersService({}),
  (e) => e.cause?.code === 403,
);
assert.ok((await getUsersService({}, { _id: admin })).data.length > 0);
console.log(
  'PASS V30 user list DB-role verification and seller author-filter rejection, including stale admin token claims',
);
let managed = await manageReviews({}, { _id: seller });
assert.equal(managed.total, 3);
assert.ok(
  managed.data.every((r) => !('user_id' in r) && r.replies.every((reply) => !('user_id' in reply))),
);
assert.ok(managed.data.every((r) => String(r.target_id) !== foreignStore));
assert.equal((await manageReviews({ store_id: foreignStore }, { _id: seller })).total, 0);
assert.equal((await manageReviews({ user_id: uid, product_id: pid }, { _id: admin })).total, 2);
assert.equal((await manageReviews({}, { _id: admin })).total, 4);
await assert.rejects(
  () => manageReviews({}, actor),
  (e) => e.cause.code === 403,
);
await deleteReview('product', pid, { _id: admin }, r1._id);
result = await listReviews('product', pid, {}, actor);
assert.equal(result.summary.count, 1);
assert.equal(result.summary.average, 4);
assert.equal(result.data.find((r) => r.deleted).replies.length, 1);
const { findOneProduct } = await import('../src/model/controller/product.controller.js');
assert.equal((await findOneProduct({ _id: pid })).rating, 4);
assert.equal((await findOneProduct({ _id: pid })).review_count, 1);
// Reproduce the risky legacy user.address shape. Creation must return successfully after one insert.
const { createAddressService, deleteAddressService } =
  await import('../src/module/address/address.service.js');
const addr = {
  full_name: 'Test User',
  province: 'Tehran',
  city: 'Tehran',
  neighborhood: 'Center',
  full_address: 'Test Street',
  building_number: '12',
  unit: '1',
  postal_code: '1234567891',
};
const created = await createAddressService(uid, { address: addr, user: other }, actor);
assert.ok(created._id);
assert.equal(tables.address.length, 1);
assert.equal(String(tables.address[0].user), uid);
assert.deepEqual(tables.users[0].address, {
  province: 'Tehran',
  city: 'Tehran',
  full_address: 'Seller office',
});
await assert.rejects(
  () => deleteAddressService(created._id, uid, { _id: other }),
  (e) => e.cause.code === 403,
);
await deleteAddressService(created._id, uid, actor);
assert.equal(tables.address.length, 0);
process.env.JWT_SECRET = 'fixture-only';
const app = express();
app.use(express.json());
app.use(router);
const { default: userRouter } = await import('../src/routes/user/user.route.js');
app.use('/users', userRouter);
const server = app.listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));
const url = `http://127.0.0.1:${server.address().port}`;
try {
  for (const claims of [
    { _id: seller, role: 'seller' },
    { _id: seller, role: 'admin' },
  ]) {
    const auth = jwt.sign(claims, process.env.JWT_SECRET);
    assert.equal((await fetch(`${url}/users`, { headers: { Authorization: auth } })).status, 403);
    assert.equal(
      (await fetch(`${url}/manage/reviews?user_id=${uid}`, { headers: { Authorization: auth } }))
        .status,
      403,
    );
  }
  assert.equal(
    (
      await fetch(`${url}/users`, {
        headers: { Authorization: jwt.sign({ _id: admin, role: 'admin' }, process.env.JWT_SECRET) },
      })
    ).status,
    200,
  );
  console.log(
    'PASS V31 actual HTTP user-list and author-filter endpoints reject sellers and stale admin claims; real admin allowed; attributes max 8',
  );
  let r = await fetch(`${url}/reviews/product/${pid}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rating: 5, text: 'Review' }),
  });
  assert.equal(r.status, 401);
  const token = jwt.sign({ _id: uid, role: 'admin' }, process.env.JWT_SECRET);
  r = await fetch(`${url}/manage/reviews`, { headers: { Authorization: token } });
  assert.equal(r.status, 403, 'database role, not stale/spoofed token role');
  r = await fetch(`${url}/reviews/product/${pid}`, {
    method: 'POST',
    headers: { Authorization: token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ rating: 5, text: 'Valid public review' }),
  });
  assert.equal(r.status, 200);
} finally {
  await new Promise((r) => server.close(r));
}
console.log(
  'PASS V28 multi-review, independent star average excluding replies/deleted roots, reply ownership, photo type/ownership, scoped admin/seller filters, actual DB-role authorization, editable attributes, and address create/delete with seller-profile user.address object; real services with in-memory DB fixtures',
);
