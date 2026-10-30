import { ObjectId } from 'mongodb';

import db from '../../config/mongodb.config.js';

// insert

export const insertAddress = async (data) => {
  if (!data.user) {
    throw new Error('User field important', { cause: { code: 400 } });
  }

  const insert = await db.collection('address').insertOne({
    ...data,
    create_at: new Date(),
    update_at: new Date(),
  });

  const insertedDocument = await db.collection('address').findOne({ _id: insert.insertedId });

  return insertedDocument;
};

// update

export const updateAddress = async (field, data) => {
  if (field._id) {
    field._id = new ObjectId(field._id);
  }
  if (field.user) {
    field.user = new ObjectId(field.user);
  }
  const update = await db
    .collection('address')
    .updateMany(field, { $set: { ...data, update_at: new Date() } });

  return update;
};

export const updateOneAddress = async (field, data) => {
  if (field._id) {
    field._id = new ObjectId(field._id);
  }
  const update = await db
    .collection('address')
    .updateOne(field, { $set: { ...data, update_at: new Date() } });

  const updateDocument = await db.collection('address').findOne({ _id: field._id });

  return updateDocument;
};

// find

export const findAddress = async (field, desc) => {
  if (field._id) {
    field._id = new ObjectId(field._id);
  }
  if (field.user) {
    field.user = new ObjectId(field.user);
  }
  if (desc) return await db.collection('address').find(field).sort({ _id: -1 }).toArray();
   return await db.collection('address').find(field).toArray();
};

export const findOneAddress = async (field) => {
  if (field._id) {
    field._id = new ObjectId(field._id);
  }
  if (field.user) {
    field.user = new ObjectId(field.user);
  }
  const findOne = await db.collection('address').findOne(field);
  return findOne;
};

// delete

export const deleteAddress = async (field) => {
  if (field._id) {
    field._id = new ObjectId(field._id);
  }
  if (field.user) {
    field.user = new ObjectId(field.user);
  }
  const deleteMany = await db.collection('address').deleteMany(field);
  return deleteMany;
};

export const deleteOneAddress = async (field) => {
  if (field._id) {
    field._id = new ObjectId(field._id);
  }
  const deleteOne = await db.collection('address').deleteOne(field);
  return deleteOne;
};
