import { MongoMemoryServer } from 'mongodb-memory-server';
import { convert } from '../src/module/fx/fx.service.js';
import { MongoClient, ObjectId } from 'mongodb';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
const cwd = fileURLToPath(new URL('..', import.meta.url));
const server = createServer();
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const port = server.address().port;
await new Promise((r) => server.close(r));
const mongod = await MongoMemoryServer.create();
const client = new MongoClient(mongod.getUri());
await client.connect();
let child;
try {
  const secret = 'integration-secret-only-not-production-12345';
  child = spawn(
    process.execPath,
    [
      '--import',
      fileURLToPath(new URL('../test/fixtures/fx-preload.js', import.meta.url)),
      'src/bootstrap.js',
    ],
    {
      cwd,
      env: {
        ...process.env,
        INTEGRATION_FIXTURE: process.env.LIVE_FX === '1' ? '0' : '1',
        FX_PROVIDER: process.env.LIVE_FX === '1' ? 'tgju' : 'navasan',
        MONGO_URI: mongod.getUri(),
        MONGO_DATABASE_NAME: 'integration',
        HOST: '127.0.0.1',
        PORT: String(port),
        JWT_SECRET: secret,
        OTP_SECRET: secret,
        STATUS: 'DEV',
        NAVASAN_API_KEY: 'fixture-not-real',
        NAVASAN_RATE_UNIT: 'IRT',
        ALLOWED_CURRENCIES: 'IRR',
      },
    },
  );
  let logs = '';
  child.stdout.on('data', (d) => (logs += d));
  child.stderr.on('data', (d) => (logs += d));
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Startup timed out: ' + logs)), 20000);
    const listen = (d) => {
      if (String(d).includes('Server is running')) {
        clearTimeout(timeout);
        resolve();
      }
    };
    child.stdout.on('data', listen);
    child.on('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error('Startup exited ' + code + ': ' + logs));
    });
  });
  const token = jwt.sign({ _id: '507f1f77bcf86cd799439011', role: 'admin' }, secret);
  const api = async (path, method = 'GET', body) => {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: { Authorization: token, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await response.json();
    assert.ok(response.ok, JSON.stringify(json));
    assert.equal(json.success, true, JSON.stringify(json));
    return json.body;
  };
  assert.equal((await api('/health')).database, 'connected');
  const translated = await api('/i18n/translate', 'POST', {
    entity: 'product',
    source: 'en',
    targets: ['fa', 'tr', 'ar'],
    contents: { name: 'Survey camera', description: '## Details\n\n[Manual](https://example.com)' },
  });
  assert.ok(translated.translations.fa.name);
  assert.ok(translated.translations.tr.description.includes('](https://example.com)'));
  const unauth = await fetch(`http://127.0.0.1:${port}/i18n/translate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  assert.equal(unauth.status, 401);
  console.log(
    'PASS: authenticated translation HTTP with Markdown preservation; missing token rejected. Translation provider:',
    process.env.LIVE_TRANSLATION === '1' ? 'LIVE Google public' : 'fixture',
  );

  const quote = await api('/fx/rates');
  const p = await api('/plan?lang=all', 'POST', {
    name: 'Local price integration',
    duration_days: 30,
    price: { amount: convert(50, 'USD', 'IRT', quote), currency: 'IRT' },
    features: { max_products: 50, max_shops: 1, max_images_per_product: 5 },
    description: 'Plan',
    translations: { fa: { name: 'پلن آزمایشی' }, tr: { name: 'Deneme' } },
  });
  assert.equal(p.price.currency, 'USD');
  assert.equal(p.price.amount, 50);
  const stored = await client
    .db('integration')
    .collection('plans')
    .findOne({ name: 'Local price integration' });
  assert.deepEqual(stored.price, { currency: 'USD', amount: 50 });
  assert.deepEqual((await api('/plan/' + p._id + '?lang=fa')).price, {
    amount: convert(50, 'USD', 'IRT', quote),
    currency: 'IRT',
  });
  assert.deepEqual((await api('/plan/' + p._id + '?lang=tr')).price, {
    amount: convert(50, 'USD', 'TRY', quote),
    currency: 'TRY',
  });
  await api('/plan/' + p._id + '?lang=all', 'PUT', {
    price: { amount: convert(100, 'USD', 'TRY', quote), currency: 'TRY' },
  });
  assert.equal(
    (await client.db('integration').collection('plans').findOne({ _id: stored._id })).price.amount,
    100,
  );
  const converted = await api('/fx/convert', 'POST', { amount: 100, from: 'USD', to: 'IRT' });
  assert.equal(converted.amount, convert(100, 'USD', 'IRT', quote));
  const category = await api('/category?lang=all', 'POST', {
    slug: 'survey',
    translations: { fa: { name: 'نقشه‌برداری' } },
  });
  assert.equal((await api('/category/' + category._id + '?lang=fa')).name, 'نقشه‌برداری');
  await api('/category/' + category._id + '?lang=all', 'PUT', {
    translations: { en: { name: 'Survey gear' }, fa: { name: null } },
  });
  const doc = await api('/category/' + category._id + '?lang=all');
  assert.equal(doc.translations.en.name, 'Survey gear');
  assert.equal(doc.translations.fa?.name, undefined);
  await client
    .db('integration')
    .collection('users')
    .insertOne({ _id: new ObjectId('507f1f77bcf86cd799439011'), role: 'admin' });
  const createdStore = await api('/store?lang=all', 'POST', {
    translations: {
      en: { name: 'Translated shop', description: 'Shop description' },
      fa: { name: 'فروشگاه' },
    },
    contact_info: { email: 'test@example.com', phone: '09123456789' },
  });
  assert.equal(createdStore.name, 'Translated shop');
  assert.equal(createdStore.translations.fa.name, 'فروشگاه');
  const createdProduct = await api('/product?lang=all', 'POST', {
    translations: {
      en: { name: 'Translated camera', short_description: 'Short', description: '## Details' },
      fa: { name: 'دوربین' },
    },
    store_id: createdStore._id,
    category_id: category._id,
    brand: 'test',
    production: 2026,
    images_id: [],
    price: { amount: convert(50, 'USD', 'IRT', quote), currency: 'IRT' },
    stock: 1,
    visibility: 'public',
    warranty: false,
    dimensions: { width: { value: 1, unit: 'CM' }, height: { value: 1, unit: 'CM' } },
    weight: { value: 1, unit: 'KG' },
  });
  assert.equal(createdProduct.name, 'Translated camera');
  assert.deepEqual(createdProduct.price, { currency: 'USD', amount: 50 });
  const updatedProduct = await api('/product/' + createdProduct._id + '?lang=all', 'PUT', {
    price: { amount: 25, currency: 'USD' },
  });
  assert.deepEqual(updatedProduct.price, { currency: 'USD', amount: 25 });
  await api('/product/' + createdProduct._id + '?lang=all', 'PUT', {
    price: { amount: convert(50, 'USD', 'IRT', quote), currency: 'IRT' },
  });
  console.log('PASS: product create/update with legacy ALLOWED_CURRENCIES=IRR stores USD.');
  const storeSeed = await client
    .db('integration')
    .collection('stores')
    .insertOne({ name: 'Shop', translations: { fa: { name: 'فروشگاه' } }, status: 'ENABLE' });
  await client
    .db('integration')
    .collection('products')
    .insertOne({
      name: 'Camera',
      translations: { fa: { name: 'دوربین' } },
      price: { amount: 50, currency: 'USD' },
      status: 'ACTIVE',
      visibility: 'PUBLIC',
      store_id: storeSeed.insertedId,
    });
  const products = await api('/product?lang=fa&currency=IRT');
  assert.equal(products.data[0].price.currency, 'IRT');
  assert.equal(products.data[0].price.amount, convert(50, 'USD', 'IRT', quote));
  assert.ok((await api('/store?lang=fa&currency=IRT')).data.length);
  assert.ok((await api('/perm/products?lang=all&currency=USD')).data.length);
  await api('/plan/' + p._id + '?lang=all', 'DELETE');
  console.log(
    'PASS: public products/stores and authenticated product list; plan delete; translation-only category/store/product create. Provider mode:',
    process.env.LIVE_FX === '1' ? 'LIVE TGJU (no key)' : 'fixture',
  );
  console.log(
    'PASS: actual bootstrap + temporary MongoDB + HTTP health; local-currency create/update stored ONLY USD; IRT/TRY display; conversion endpoint; translation CRUD. Rate data:',
    process.env.LIVE_FX === '1' ? 'LIVE TGJU' : 'fixture',
    '; no live Navasan/payment tested.',
  );
} finally {
  if (child && child.exitCode === null) {
    child.kill();
    await once(child, 'exit');
  }
  await client.close();
  await mongod.stop();
}
