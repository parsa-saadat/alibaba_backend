import database from '../../config/mongodb.config.js';
import contentModel from '../content.model.js';
const db = contentModel(database);

import { ObjectId } from 'mongodb';

// insert

export const insertUser = async (data) => {
  const insert = await db.collection('users').insertOne({
    ...data,
    create_at: new Date(),
    update_at: new Date(),
  });

  const insertDocument = await db.collection('users').findOne({
    _id: insert.insertedId,
  });

  return insertDocument;
};

// update

export const updateUsers = async (field, data) => {
  if (field?._id) {
    field._id = new ObjectId(field._id);
  }
  const update = await db.collection('users').updateOne(field, {
    $set: {
      ...data,
      update_at: new Date(),
    },
  });
  return update;
};

export const updateOneUser = async (field, data) => {
  if (field?._id) {
    field._id = new ObjectId(field._id);
  }

  await db.collection('users').updateOne(field, {
    $set: {
      ...data,
      update_at: new Date(),
    },
  });

  const updateDocument = await db.collection('users').findOne({
    _id: field._id,
  });

  return updateDocument;
};

// find

export const findUsers = async (field, desc) => {
  if (field?._id) {
    field._id = new ObjectId(field._id);
  }
  if (desc) return await db.collection('users').find(field).sort({ _id: -1 }).toArray();
  return await db.collection('users').find(field).toArray();
};

// یافتن چند کاربر با لیست id (برای لیست عمومی فروشگاه‌ها؛ فقط فیلدهای عمومی برگردانده می‌شود)
export const findUsersByIds = async (ids = [], projection = null) => {
  const list = [...new Set(ids.map(String))]
    .filter((id) => ObjectId.isValid(id))
    .map((id) => new ObjectId(id));
  if (list.length === 0) return [];
  const options = projection ? { projection } : {};
  return await db
    .collection('users')
    .find({ _id: { $in: list } }, options)
    .toArray();
};

export const findOneUser = async (field) => {
  if (field?._id) {
    field._id = new ObjectId(field._id);
  }
  const find = await db.collection('users').findOne(field);
  return find;
};

// delete

export const deleteOneUser = async (field) => {
  if (field?._id) {
    field._id = new ObjectId(field._id);
  }
  const deleteOne = await db.collection('users').deleteOne(field);
  return deleteOne;
};

export const findOneAndDeleteUser = async (field) => {
  if (field?._id) {
    field._id = new ObjectId(field._id);
  }
  const findOneAndDelete = await db.collection('users').findOneAndDelete(field);
  return findOneAndDelete;
};

export const userStats = async (scope = {}) => {
  const collection = database.collection('users');
  const keys = ['all', 'admins', 'sellers', 'trusted'];
  const filters = [
    {},
    { role: { $in: ['admin', 'root'] } },
    { $or: [{ is_seller: true }, { role: 'seller' }] },
    { seller_trust: true },
  ];
  const values = await Promise.all(
    filters.map((filter) => collection.countDocuments({ $and: [scope, filter] })),
  );
  return { counts: Object.fromEntries(keys.map((key, index) => [key, values[index]])) };
};

export const sellerStats = async (scope = {}) => {
  const collection = database.collection('users');
  const keys = ['all', 'pending', 'approved', 'active', 'trusted'];
  const filters = [
    {},
    { seller_approved_status: { $ne: true } },
    { seller_approved_status: true },
    { seller_approved_status: true, seller_active_status: { $in: ['ACTIVE', 'active'] } },
    { seller_trust: true },
  ];
  const values = await Promise.all(
    filters.map((filter) => collection.countDocuments({ $and: [scope, filter] })),
  );
  return { counts: Object.fromEntries(keys.map((key, index) => [key, values[index]])) };
};
