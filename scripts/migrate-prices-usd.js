import 'dotenv/config';
import { MongoClient } from 'mongodb';
import { getRates, convert } from '../src/module/fx/fx.service.js';
const apply = process.argv.includes('--apply');
if (!process.env.MONGO_URI || !process.env.MONGO_DATABASE_NAME)
  throw new Error('MongoDB settings required');
const quote = await getRates();
const client = new MongoClient(process.env.MONGO_URI);
try {
  await client.connect();
  const db = client.db(process.env.MONGO_DATABASE_NAME);
  for (const collection of ['products', 'plans']) {
    let count = 0;
    for await (const doc of db.collection(collection).find({ 'price.currency': { $ne: 'USD' } })) {
      if (!doc.price || !Number.isFinite(doc.price.amount))
        throw new Error(`Invalid price: ${doc._id}`);
      const original = doc.price;
      const amount = convert(
        original.currency === 'IRT' ? original.amount * 10 : original.amount,
        original.currency === 'IRT' ? 'IRR' : original.currency,
        'USD',
        quote,
      );
      if (amount <= 0) throw new Error(`Converted amount below USD cent: ${doc._id}`);
      if (apply)
        await db
          .collection(collection)
          .updateOne(
            { _id: doc._id, price: original, price_migration: { $exists: false } },
            {
              $set: {
                price: { currency: 'USD', amount },
                price_migration: { original, quote, at: new Date() },
              },
            },
          );
      count++;
    }
    console.log({ collection, candidates: count, apply });
  }
} finally {
  await client.close();
}
// Intentionally excludes all orders, payment/refund records and historical snapshots.
