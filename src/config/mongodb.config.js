import { config } from 'dotenv';
import { MongoClient } from 'mongodb';

config();

const { MONGO_URI, MONGO_DATABASE_NAME } = process.env;

async function coonectMongoDB() {
  try {
    const client = await new MongoClient(MONGO_URI).connect();
    console.log('Connected to MongoDB.');
    return client.db(MONGO_DATABASE_NAME);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}

const db = await coonectMongoDB();

export default db;
