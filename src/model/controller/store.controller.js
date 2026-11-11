import { ObjectId } from 'mongodb';

import db from '../../config/mongodb.config.js';

export const insertStore = async (data) => {
  if (data?._id) data._id = new ObjectId(data._id);

  if (data?.user) data.user = new ObjectId(data.user);

  if (data?.profile_image_id) data.profile_image_id = new ObjectId(data.profile_image_id);

  if (data?.banner_image_id) data.banner_image_id = new ObjectId(data.banner_image_id);

  const insert = await db.collection('stores').insertOne({
    ...data,
    create_at: new Date(),
    update_at: new Date(),
  });

  const insertDocument = await db.collection('stores').findOne({ _id: insert.insertedId });

  return insertDocument;
};

export const findStores = async (field) => {
  if (field?._id) field._id = new ObjectId(field._id);

  if (field?.user) field.user = new ObjectId(field.user);

  const stores = await db.collection('stores').find(field).toArray();

  return stores;
};

export const findOneStore = async (field) => {
  if (field?._id) field._id = new ObjectId(field._id);

  if (field?.user) field.user = new ObjectId(field.user);

  const cart = await db.collection('stores').findOne(field);

  return cart;
};

export const updateOneStore = async (field, data) => {
  if (field?._id) field._id = new ObjectId(field._id);

  if (field?.user) field.user = new ObjectId(field.user);

  if (data?.profile_image_id) data.profile_image_id = new ObjectId(data.profile_image_id);

  if (data?.banner_image_id) data.banner_image_id = new ObjectId(data.banner_image_id);

  const update = await db.collection('stores').updateOne(field, {
    $set: {
      ...data,
      update_at: new Date(),
    },
  });

  const updateDocument = await db.collection('stores').findOne({ _id: update.upsertedId });

  return updateDocument;
};

export const deleteStores = async (field) => {
  if (field?._id) field._id = new ObjectId(field._id);

  if (field?.user) field.user = new ObjectId(field.user);

  const deleteStores = await db.collection('stores').deleteMany(field);

  return deleteStores;
};

export const deleteOneStore = async (field) => {
  if (field?._id) field._id = new ObjectId(field._id);

  if (field?.user) field.user = new ObjectId(field.user);

  const deleteStore = await db.collection('stores').deleteOne(field);

  return deleteStore;
};