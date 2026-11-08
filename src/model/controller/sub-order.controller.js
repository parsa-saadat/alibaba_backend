import db from '../../config/mongodb.config.js';

import { ObjectId } from 'mongodb';

// insert

export const insertSubOrder = async (data) => {
  const insert = await db.collection('sub-orders').insertOne({
    ...data,
    create_at: new Date(),
    update_at: new Date(),
  });

  const insertDocument = await db.collection('sub-orders').findOne({ _id: insert.insertedId });

  return insertDocument;
};

// update

export const updateOneSubOrder = async (field, data) => {
  if (field?._id && typeof field?._id === 'string') {
    field._id = new ObjectId(field._id);
  }
  if (field?.parent_order_id && typeof field?.parent_order_id === 'string') {
    field.parent_order_id = new ObjectId(field.parent_order_id);
  }
  const update = await db.collection('sub-orders').updateOne(field, {
    $set: {
      ...data,
      update_at: new Date(),
    },
  });
  return update;
};

// find

export const findSubOrders = async (field, desc) => {
  if (field?._id && typeof field?._id === 'string') {
    field._id = new ObjectId(field._id);
  }
  if (field?.parent_order_id && typeof field?.parent_order_id === 'string') {
    field.parent_order_id = new ObjectId(field.parent_order_id);
  }
  if (desc) {
    const findMany = await db.collection('sub-orders').find(field).sort({ _id: -1 }).toArray();
    return findMany;
  }
  const findMany = await db.collection('sub-orders').find(field).toArray();
  return findMany;
};

export const findOneSubOrder = async (field) => {
  if (field?._id && typeof field?._id === 'string') {
    field._id = new ObjectId(field._id);
  }
  if (field?.parent_order_id && typeof field?.parent_order_id === 'string') {
    field.parent_order_id = new ObjectId(field.parent_order_id);
  }
  const findOne = await db.collection('sub-orders').findOne(field);
  return findOne;
};
