import { mongoTranslationUpdate } from '../../module/i18n/content.service.js';
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

  const update = await db.collection('products').updateOne(field, mongoTranslationUpdate(data));
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

  const update = await db.collection('products').updateOne(field, mongoTranslationUpdate(data));

  const updatedProduct = await db.collection('products').findOne(field);

  return updatedProduct;
};

// find

export const findProducts = async (field, desc = false, projection = null) => {
  if (field?._id && typeof field._id === 'string') field._id = new ObjectId(field._id);

  const options = projection ? { projection } : {};
  let cursor = db.collection('products').find(field, options);
  if (desc) cursor = cursor.sort({ _id: -1 });
  return await cursor.toArray();
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
