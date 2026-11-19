import database from '../../config/mongodb.config.js';
import contentModel from '../content.model.js';
const db = contentModel(database);

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

export const orderStats = async (sellerId) => {
  const collection = database.collection(sellerId ? 'sub-orders' : 'orders');
  const scope = sellerId ? { seller_id: new ObjectId(String(sellerId)) } : {};
  const money = sellerId
    ? {
        $max: [
          0,
          {
            $subtract: [
              { $ifNull: ['$amount', { $ifNull: ['$subtotal', 0] }] },
              { $ifNull: ['$discount_applied', 0] },
            ],
          },
        ],
      }
    : { $ifNull: ['$final_amount', { $ifNull: ['$total_amount', 0] }] };
  const paid = sellerId
    ? { status: { $in: ['delivered', 'finalized'] } }
    : { $or: [{ 'payment.status': 'paid' }, { payment_status: 'paid' }] };
  const paidMatch = { $and: [scope, paid] };
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - 6);
  const [total, paidCount, pending, waiting, inProgress, done, items, revenue, daily, statuses] =
    await Promise.all([
      collection.countDocuments(scope),
      collection.countDocuments(paidMatch),
      collection.countDocuments({
        $and: [
          scope,
          sellerId
            ? { status: 'awaiting_approval' }
            : { 'payment.status': { $in: ['pending', 'unpaid'] } },
        ],
      }),
      collection.countDocuments({ ...scope, status: 'awaiting_approval' }),
      collection.countDocuments({ ...scope, status: { $in: ['preparing', 'ready_to_ship'] } }),
      collection.countDocuments({ ...scope, status: { $in: ['delivered', 'finalized'] } }),
      collection
        .aggregate([
          { $match: paidMatch },
          { $unwind: '$items' },
          { $group: { _id: null, total: { $sum: { $ifNull: ['$items.quantity', 1] } } } },
        ])
        .toArray(),
      collection
        .aggregate([
          { $match: paidMatch },
          { $group: { _id: { $ifNull: ['$currency', 'IRR'] }, amount: { $sum: money } } },
        ])
        .toArray(),
      collection
        .aggregate([
          { $match: paidMatch },
          { $set: { stats_date: { $ifNull: ['$create_at', '$created_at'] } } },
          { $match: { stats_date: { $gte: start, $lte: new Date() } } },
          {
            $group: {
              _id: {
                day: {
                  $dateToString: { format: '%Y-%m-%d', date: '$stats_date', timezone: 'UTC' },
                },
                currency: { $ifNull: ['$currency', 'IRR'] },
              },
              amount: { $sum: money },
            },
          },
        ])
        .toArray(),
      collection
        .aggregate([{ $match: scope }, { $group: { _id: '$status', count: { $sum: 1 } } }])
        .toArray(),
    ]);
  return {
    counts: {
      all: total,
      total,
      paid: paidCount,
      pending,
      waiting,
      inProgress,
      done,
      delivered: done,
      items: items[0]?.total || 0,
    },
    revenue: revenue.map((row) => ({ currency: row._id, amount: row.amount })),
    daily: daily.map((row) => ({ ...row._id, amount: row.amount })),
    statuses: Object.fromEntries(statuses.map((row) => [row._id, row.count])),
  };
};
