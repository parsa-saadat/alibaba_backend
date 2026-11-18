import { validateEnvironment } from './environment.js';
import { MongoClient } from 'mongodb';
const errors = validateEnvironment();
if (errors.length) throw new Error(errors.join('\n'));
const client = new MongoClient(process.env.MONGO_URI.trim(), {
  serverSelectionTimeoutMS: 7000,
  connectTimeoutMS: 7000,
});
try {
  await client.connect();
} catch {
  await client.close().catch(() => {});
  throw Object.assign(new Error('MongoDB connection unavailable'), { code: 'MONGODB_UNAVAILABLE' });
}
export const closeDatabase = () => client.close();
export default client.db(process.env.MONGO_DATABASE_NAME.trim());
