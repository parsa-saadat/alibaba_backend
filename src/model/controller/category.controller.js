import db from '../../config/mongodb.config.js';

import { ObjectId } from 'mongodb';

// insert

export const insertCategory = async (data) => {
  const insert = await db.collection('categories').insertOne({
    ...data,
    create_at: new Date(),
    update_at: new Date(),
  });

  const insertDocument = await db.collection('categories').findOne({ _id: insert.insertedId });

  return insertDocument;
};

// update

export const updateOneCategory = async (field, data) => {
  if (field?._id && typeof field?._id === 'string') {
    field._id = new ObjectId(field._id);
  }
  if (field?.customer_id && typeof field?.customer_id === 'string') {
    field.customer_id = new ObjectId(field.customer_id);
  }
  const update = await db.collection('categories').updateOne(field, {
    $set: {
      ...data,
      update_at: new Date(),
    },
  });

  const updateDocument = await db.collection('categories').findOne(field);

  return updateDocument ?? update;
};

// find

export const findCategories = async (field, desc) => {
  if (field?._id && typeof field?._id === 'string') {
    field._id = new ObjectId(field._id);
  }
  if (field?.customer_id && typeof field?.customer_id === 'string') {
    field.customer_id = new ObjectId(field.customer_id);
  }
  if (desc) {
    const findMany = await db.collection('categories').find(field).sort({ _id: -1 }).toArray();
    return findMany;
  }
  const findMany = await db.collection('categories').find(field).toArray();
  return findMany;
};

export const findOneCategory = async (field) => {
  if (field?._id && typeof field?._id === 'string') {
    field._id = new ObjectId(field._id);
  }
  if (field?.customer_id && typeof field?.customer_id === 'string') {
    field.customer_id = new ObjectId(field.customer_id);
  }
  const findOne = await db.collection('categories').findOne(field);
  return findOne;
};

export const deleteCategories = async (field) => {
  if (field?._id) field._id = new ObjectId(field._id);

  if (field?.user_id) field.user_id = new ObjectId(field.user_id);

  if (field?.product_id) field.product_id = new ObjectId(field.product_id);

  const deleteCategory = await db.collection('categories').deleteMany(field);

  return deleteCategory;
};

export const deleteOneCategory = async (field) => {
  if (field?._id) field._id = new ObjectId(field._id);

  if (field?.user_id) field.user_id = new ObjectId(field.user_id);

  if (field?.product_id) field.product_id = new ObjectId(field.product_id);

  const deleteCategory = await db.collection('categories').deleteOne(field);

  return deleteCategory;
};
