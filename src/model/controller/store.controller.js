import { mongoTranslationUpdate } from '../../utils/helpers/localization.helper.js';
import { ObjectId } from 'mongodb';

import database from '../../config/mongodb.config.js';
import contentModel from '../content.model.js';
const db = contentModel(database);

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

export const findStores = async (field, desc) => {
  if (field?._id && typeof field._id === 'string') field._id = new ObjectId(field._id);
  if (field?.user && typeof field.user === 'string') field.user = new ObjectId(field.user);

  let cursor = db.collection('stores').find(field);
  if (desc) cursor = cursor.sort({ _id: -1 });
  return await cursor.toArray();
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

  const update = await db.collection('stores').updateOne(field, mongoTranslationUpdate(data));

  const updateDocument = await db.collection('stores').findOne(field);

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
// Stats is scoped before aggregation; no pagination is applied to totals.
export const storeStats = async (ownerId) => {
  const match = ownerId ? { user: new ObjectId(String(ownerId)) } : {};
  const [counts, byStore] = await Promise.all([
    database
      .collection('stores')
      .aggregate([
        { $match: match },
        {
          $group: {
            _id: null,
            all: { $sum: 1 },
            ENABLE: { $sum: { $cond: [{ $eq: ['$status', 'ENABLE'] }, 1, 0] } },
            DISABLE: { $sum: { $cond: [{ $eq: ['$status', 'DISABLE'] }, 1, 0] } },
            ROOT_DISABLE: { $sum: { $cond: [{ $eq: ['$status', 'ROOT_DISABLE'] }, 1, 0] } },
          },
        },
      ])
      .toArray(),
    database
      .collection('stores')
      .aggregate([
        { $match: match },
        {
          $lookup: {
            from: 'products',
            let: { store: '$_id' },
            pipeline: [
              { $match: { $expr: { $eq: ['$store_id', '$$store'] } } },
              {
                $group: {
                  _id: { $ifNull: ['$price.currency', 'IRR'] },
                  count: { $sum: 1 },
                  stock: { $sum: { $ifNull: ['$stock', 0] } },
                  value: {
                    $sum: {
                      $multiply: [{ $ifNull: ['$stock', 0] }, { $ifNull: ['$price.amount', 0] }],
                    },
                  },
                },
              },
            ],
            as: 'products',
          },
        },
        { $project: { _id: 1, products: 1 } },
      ])
      .toArray(),
  ]);
  const perStore = Object.fromEntries(
    byStore.map((row) => [
      String(row._id),
      {
        count: (row.products || []).reduce((sum, item) => sum + item.count, 0),
        stock: (row.products || []).reduce((sum, item) => sum + item.stock, 0),
        money: (row.products || []).map((item) => ({ currency: item._id, amount: item.value })),
      },
    ]),
  );
  return {
    counts: { all: 0, ENABLE: 0, DISABLE: 0, ROOT_DISABLE: 0, ...counts[0] },
    byStore: perStore,
    products: Object.values(perStore).reduce((sum, row) => sum + row.count, 0),
  };
};
