import { ObjectId } from 'mongodb';

import db from '../../config/mongodb.config.js';

export const insertFile = async (data) => {
  const insert = await db.collection('storage').insertOne({
    ...data,
    create_at: new Date(),
    update_at: new Date(),
  });

  const insertDocument = await db.collection('storage').findOne({ _id: insert.insertedId });

  return insertDocument;
};

// find

export const findFiles = async (field, desc) => {
  if (field?._id) field._id = new ObjectId(field._id);

  if (desc) return await db.collection('storage').find(field).sort({ _id: -1 }).toArray();
  return await db.collection('storage').find(field).toArray();
};

export const findOneFile = async (field) => {
  if (field?._id) field._id = new ObjectId(field._id);

  const file = await db.collection('storage').findOne(field);

  return file;
};

// update

export const updateOneFile = async (field, data) => {
  if (field?._id) field._id = new ObjectId(field._id);

  const update = await db.collection('storage').updateOne(field, {
    $set: {
      ...data,
      update_at: new Date(),
    },
  });

  const updateDocument = await db.collection('storage').findOne({ _id: update.upsertedId });

  return updateDocument;
};

// delete

export const deleteOneFile = async (field) => {
  if (field?._id) field._id = new ObjectId(field._id);

  await db.collection('storage').deleteOne(field);

  return true;
};
