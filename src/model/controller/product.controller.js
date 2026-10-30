import db from '../../config/mongodb.config.js';

import { ObjectId } from 'mongodb';

// insert

export const insertProduct = async (data) => {
  const insert = await db.collection('products').insertOne({
    ...data,
    create_at: new Date(),
    update_at: new Date(),
  });

  const insertedDucument = await db.collection('products').findOne({ _id: insert.insertedId });

  return insertedDucument;
};

// update

export const updateProducts = async (field, data) => {
  if (field?._id && typeof field?._id === 'string') {
    field._id = new ObjectId(field._id);
  }
  if (data.images) {
    for (let i = 0; i < data.images.length; i++) {
      if (data.images[i] && typeof data.images[i] === 'string') {
        data.images[i] = new ObjectId(data.images[i]);
      }
    }
  }

  const update = await db.collection('products').updateOne(field, {
    $set: {
      ...data,
      update_at: new Date(),
    },
  });
  return update;
};

export const updateOneProduct = async (field, data) => {
  if (field?._id && typeof field?._id === 'string') {
    field._id = new ObjectId(field._id);
  }
  if (data.images) {
    for (let i = 0; i < data.images.length; i++) {
      if (data.images[i] && typeof data.images[i] === 'string') {
        data.images[i] = new ObjectId(data.images[i]);
      }
    }
  }

  const update = await db.collection('products').updateOne(field, {
    $set: {
      ...data,
      update_at: new Date(),
    },
  });

  const updatedProduct = await db.collection('products').findOne({ _id: update.upsertedId });

  return updatedProduct;
};

// find

export const findProducts = async (field, desc = false) => {
  if (field?._id && typeof field?._id === 'string') {
    field._id = new ObjectId(field._id);
  }
  let find;
  if (desc) find = await db.collection('products').find(field).sort({ _id: -1 }).toArray();
  else find = await db.collection('products').find(field).toArray();
  return find;
};

export const findOneProduct = async (field) => {
  if (field?._id && typeof field?._id === 'string') {
    field._id = new ObjectId(field._id);
  }
  const find = await db.collection('products').findOne(field);
  return find;
};

// delete

export const deleteOneProduct = async (field) => {
  if (field?._id && typeof field?._id === 'string') {
    field._id = new ObjectId(field._id);
  }
  const deleteOne = await db.collection('products').deleteOne(field);
  return deleteOne;
};
