import { ObjectId } from 'mongodb';

import db from '../../config/mongodb.config.js';

export const insertCart = async (data) => {
  if (data?._id) data._id = new ObjectId(data._id);

  if (data?.user_id) data.user_id = new ObjectId(data.user_id);

  if (data?.product_id) data.product_id = new ObjectId(data.product_id);

  const insert = await db.collection('carts').insertOne({
    ...data,
    create_at: new Date(),
    update_at: new Date(),
  });

  const insertDocument = await db.collection('carts').findOne({ _id: insert.insertedId });

  return insertDocument;
};

export const findCarts = async (field) => {
  if (field?._id) field._id = new ObjectId(field._id);

  if (field?.user_id) field.user_id = new ObjectId(field.user_id);

  if (field?.product_id) field.product_id = new ObjectId(field.product_id);

  const carts = await db.collection('carts').find(field).toArray();

  return carts;
};

export const findOneCart = async (field) => {
  if (field?._id) field._id = new ObjectId(field._id);

  if (field?.user_id) field.user_id = new ObjectId(field.user_id);

  if (field?.product_id) field.product_id = new ObjectId(field.product_id);

  const cart = await db.collection('carts').findOne(field);

  return cart;
};

export const updateOneCart = async (field, data) => {
  if (field?._id) field._id = new ObjectId(field._id);

  if (field?.user_id) field.user_id = new ObjectId(field.user_id);

  if (field?.product_id) field.product_id = new ObjectId(field.product_id);

  const update = await db.collection('carts').updateOne(field, {
    ...data,
  });

  const updateDocument = await db.collection('carts').findOne({ _id: update.upsertedId });

  return updateDocument;
};

export const deleteCarts = async (field) => {
  if (field?._id) field._id = new ObjectId(field._id);

  if (field?.user_id) field.user_id = new ObjectId(field.user_id);

  if (field?.product_id) field.product_id = new ObjectId(field.product_id);

  const deleteCarts = await db.collection('carts').deleteMany(field);

  return deleteCarts;
};

export const deleteOneCart = async (field) => {
  if (field?._id) field._id = new ObjectId(field._id);

  if (field?.user_id) field.user_id = new ObjectId(field.user_id);

  if (field?.product_id) field.product_id = new ObjectId(field.product_id);

  const deleteCart = await db.collection('carts').deleteOne(field);

  return deleteCart;
};
