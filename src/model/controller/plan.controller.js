import { ObjectId } from 'mongodb';

import db from '../../config/mongodb.config.js';

export const insertPlan = async (data) => {
  if (data?._id) data._id = new ObjectId(data._id);

  if (data?.user) data.user = new ObjectId(data.user);

  const insert = await db.collection('plans').insertOne({
    ...data,
    create_at: new Date(),
    update_at: new Date(),
  });

  const insertDocument = await db.collection('plans').findOne({ _id: insert.insertedId });

  return insertDocument;
};

export const findPlans = async (field) => {
  if (field?._id) field._id = new ObjectId(field._id);

  if (field?.user) field.user = new ObjectId(field.user);

  const plans = await db.collection('plans').find(field).toArray();

  return plans;
};

export const findOnePlan = async (field) => {
  if (field?._id) field._id = new ObjectId(field._id);

  if (field?.user) field.user = new ObjectId(field.user);

  const cart = await db.collection('plans').findOne(field);

  return cart;
};

export const updateOnePlan = async (field, data) => {
  if (field?._id) field._id = new ObjectId(field._id);

  if (field?.user) field.user = new ObjectId(field.user);

  const update = await db.collection('plans').updateOne(field, {
    $set: {
      ...data, update_at: new Date(),
    },
  });

  const updateDocument = await db.collection('plans').findOne({ _id: update.upsertedId });

  return updateDocument;
};

export const deletePlans = async (field) => {
  if (field?._id) field._id = new ObjectId(field._id);

  if (field?.user) field.user = new ObjectId(field.user);

  const deletePlans = await db.collection('plans').deleteMany(field);

  return deletePlans;
};

export const deleteOnePlan = async (field) => {
  if (field?._id) field._id = new ObjectId(field._id);

  if (field?.user) field.user = new ObjectId(field.user);

  const deletePlan = await db.collection('plans').deleteOne(field);

  return deletePlan;
};