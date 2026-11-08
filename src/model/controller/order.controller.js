import db from '../../config/mongodb.config.js';

import { ObjectId } from 'mongodb';

// insert

export const insertOrder = async (data) => {
  const insert = await db.collection('orders').insertOne({
    ...data,
    create_at: new Date(),
    update_at: new Date(),
  });

  const insertDocument = await db.collection('orders').findOne({ _id: insert.insertedId });

  return insertDocument;
};

// update

export const updateOneOrder = async (field, data) => {
  if (field?._id && typeof field?._id === 'string') {
    field._id = new ObjectId(field._id);
  }
  if (field?.customer_id && typeof field?.customer_id === 'string') {
    field.customer_id = new ObjectId(field.customer_id);
  }
  const update = await db.collection('orders').updateOne(field, {
    $set: {
      ...data,
      update_at: new Date(),
    },
  });
  return update;
};

// find

export const findOrders = async (field, desc) => {
  if (field?._id && typeof field?._id === 'string') {
    field._id = new ObjectId(field._id);
  }
  if (field?.customer_id && typeof field?.customer_id === 'string') {
    field.customer_id = new ObjectId(field.customer_id);
  }
  if (desc) {
    const findMany = await db.collection('orders').find(field).sort({ _id: -1 }).toArray();
    return findMany;
  }
  const findMany = await db.collection('orders').find(field).toArray();
  return findMany;
};

export const findOneOrder = async (field) => {
  if (field?._id && typeof field?._id === 'string') {
    field._id = new ObjectId(field._id);
  }
  if (field?.customer_id && typeof field?.customer_id === 'string') {
    field.customer_id = new ObjectId(field.customer_id);
  }
  const findOne = await db.collection('orders').findOne(field);
  return findOne;
};
