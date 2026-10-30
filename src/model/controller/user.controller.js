import db from '../../config/mongodb.config.js';

import { ObjectId } from 'mongodb';

// insert

export const insertUser = async (data) => {
  const insert = await db.collection('users').insertOne({
    ...data,
    create_at: new Date(),
    update_at: new Date(),
  });
  return insert;
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
