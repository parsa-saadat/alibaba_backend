import test from 'node:test';
import assert from 'node:assert/strict';
import { validateEnvironment } from '../src/config/environment.js';
import { normalizeCatalogPrice } from '../src/module/fx/catalog-price.service.js';
const q = { rates: { USD: 1000000, IRR: 1, IRT: 10, TRY: 25000, AED: 270000, EUR: 1100000 } };
test('missing Mongo URI gives an actionable configuration error, not startsWith', () => {
  const errors = validateEnvironment({});
  assert.ok(errors.some((e) => e.includes('MONGO_URI')));
  assert.ok(errors.every((e) => !e.includes('startsWith')));
  assert.deepEqual(
    validateEnvironment({ MONGO_URI: 'mongodb://127.0.0.1:27017', MONGO_DATABASE_NAME: 'test' }),
    [],
  );
  assert.ok(validateEnvironment({ MONGO_URI: 'invalid', MONGO_DATABASE_NAME: 'test' }).length);
});
test('local currency input is normalized to a single USD price', async () => {
  assert.deepEqual(
    await normalizeCatalogPrice({ amount: 5000000, currency: 'IRT' }, async () => q),
    { currency: 'USD', amount: 50 },
  );
  assert.deepEqual(await normalizeCatalogPrice({ amount: 2000, currency: 'TRY' }, async () => q), {
    currency: 'USD',
    amount: 50,
  });
  assert.deepEqual(
    await normalizeCatalogPrice({ amount: 13.37, currency: 'USD' }, () => {
      throw Error('must not fetch');
    }),
    { currency: 'USD', amount: 13.37 },
  );
  for (const price of [
    null,
    { amount: 1, currency: 'FAKE' },
    { amount: -2, currency: 'USD' },
    { amount: 2.25, currency: 'IRT' },
    { amount: 0.001, currency: 'USD' },
  ])
    await assert.rejects(normalizeCatalogPrice(price, async () => q));
  await assert.rejects(
    normalizeCatalogPrice({ amount: 1000000, currency: 'IRT' }, async () => {
      throw Error('offline');
    }),
  );
});
