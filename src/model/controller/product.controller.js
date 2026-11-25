import { mongoTranslationUpdate } from '../../utils/helpers/localization.helper.js';
import database from '../../config/mongodb.config.js';
import contentModel from '../content.model.js';
const db = contentModel(database);

import { ObjectId } from 'mongodb';

// Ratings are derived from reviews on read, never accepted from a catalog editor.
async function withReviewRatings(products) {
  if (!products.length) return products;
  const groups = await database
    .collection('reviews')
    .aggregate([
      {
        $match: {
          target_type: 'product',
          parent_id: null,
          rating: { $gte: 1, $lte: 5 },
          target_id: { $in: products.map((p) => p._id) },
        },
      },
      { $group: { _id: '$target_id', average: { $avg: '$rating' }, count: { $sum: 1 } } },
    ])
    .toArray();
  const ratings = new Map(groups.map((g) => [String(g._id), g]));
  return products.map((p) => ({
    ...p,
    rating: Math.round((ratings.get(String(p._id))?.average || 0) * 10) / 10,
    review_count: ratings.get(String(p._id))?.count || 0,
  }));
}

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
  return await withReviewRatings(await cursor.toArray());
};

export const findOneProduct = async (field) => {
  if (field?._id && typeof field?._id === 'string') {
    field._id = new ObjectId(field._id);
  }
  const find = await db.collection('products').findOne(field);
  return find ? (await withReviewRatings([find]))[0] : null;
};

// delete

export const deleteOneProduct = async (field) => {
  if (field?._id && typeof field?._id === 'string') {
    field._id = new ObjectId(field._id);
  }
  const deleteOne = await db.collection('products').deleteOne(field);
  return deleteOne;
};

export const productStats = async (scope = {}) => {
  const collection = database.collection('products');
  const keys = ['all', 'active', 'inactive', 'lowStock', 'outOfStock'];
  const filters = [
    {},
    { status: { $in: ['ACTIVE', 'active'] } },
    { status: { $in: ['INACTIVE', 'inactive'] } },
    { stock: { $lte: 3 } },
    { $or: [{ stock: { $lte: 0 } }, { stock_status: 'OUT_OF_STOCK' }] },
  ];
  const values = await Promise.all(
    filters.map((filter) => collection.countDocuments({ $and: [scope, filter] })),
  );
  return { counts: Object.fromEntries(keys.map((key, index) => [key, values[index]])) };
};
