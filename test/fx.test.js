import { ObjectId } from 'mongodb';
import { orderItemSnapshot } from '../src/module/fx/order-snapshot.service.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseRates,
  convert,
  createRateService,
  displayPrices,
} from '../src/module/fx/fx.service.js';
import {
  translationPatch,
  mongoTranslationUpdate,
  localize,
} from '../src/module/i18n/content.service.js';
const now = 1800000000000;
const payload = {
  usd_sell: { value: '100,000', timestamp: now / 1000 },
  try: { value: '2,500', timestamp: now / 1000 },
  eur: { value: '110000', timestamp: now / 1000 },
  aed: { value: '27000', timestamp: now / 1000 },
};
test('Toman provider rates are converted once to Rial; cross-currency math', () => {
  const q = parseRates(payload, { now });
  assert.equal(q.rates.USD, 1000000);
  assert.equal(convert(2, 'USD', 'IRR', q), 2000000);
  assert.equal(convert(2, 'USD', 'TRY', q), 80);
  assert.equal(convert(1000000, 'IRR', 'USD', q), 1);
  assert.equal(parseRates(payload, { now, unit: 'IRR' }).rates.USD, 100000);
});
test('invalid, stale and future quotes are rejected; missing cross-rate is not fabricated', () => {
  assert.throws(() => parseRates({}, { now }));
  assert.throws(() => parseRates(payload, { now: now + 400000000 }));
  assert.throws(() => parseRates(payload, { now: now - 600000 }));
  const q = parseRates({ usd_sell: payload.usd_sell }, { now });
  assert.throws(() => convert(1, 'USD', 'TRY', q));
  assert.throws(() => convert(NaN, 'USD', 'IRR', q));
});
test('cache and concurrent requests share a single provider call', async () => {
  let calls = 0;
  const service = createRateService({
    now: () => now,
    env: { NAVASAN_API_KEY: 'test' },
    fetcher: async () => {
      calls++;
      return { ok: true, json: async () => payload };
    },
  });
  await Promise.all([service(), service(), service()]);
  await service();
  assert.equal(calls, 1);
});
test('no configured key fails closed; failures do not expose keys', async () => {
  const service = createRateService({ env: { FX_PROVIDER: 'navasan' } });
  await assert.rejects(service(), /temporarily unavailable/);
});
test('frozen orders keep price and translated product name without touching live products', async () => {
  const saved = {
    final_amount: 2000000,
    items: [
      {
        name: 'قدیمی',
        source_price: { amount: 2, currency: 'USD' },
        price: { amount: 2000000, currency: 'IRR' },
        translations: { en: { name: 'Original' }, tr: { name: 'Eski' } },
      },
    ],
  };
  const translated = localize(saved, 'tr');
  assert.equal(translated.items[0].name, 'Eski');
  assert.deepEqual(await displayPrices(translated, 'USD'), translated);
});
test('null removes translations with $unset; tags and Markdown validate', () => {
  const patch = translationPatch(
    { fa: { name: null }, tr: null, en: { tags: ['station'], description: '## Details' } },
    'product',
  );
  const mongo = mongoTranslationUpdate(patch);
  assert.equal(mongo.$unset['translations.fa.name'], '');
  assert.equal(mongo.$unset['translations.tr'], '');
  assert.deepEqual(mongo.$set['translations.en.tags'], ['station']);
  assert.throws(() => translationPatch({ en: { description: 'plain text' } }, 'product'));
  assert.throws(() => translationPatch({ en: { tags: ['x'.repeat(51)] } }, 'product'));
});

test('order creation snapshot is independent of subsequent catalog and rate mutations', () => {
  const product = {
    _id: 'id',
    name: 'Base',
    translations: { en: { name: 'Original' }, tr: { name: 'Eski' } },
    images_id: [],
  };
  const quote = parseRates(payload, { now });
  const item = orderItemSnapshot(product, {
    sourcePrice: { amount: 2, currency: 'USD' },
    lockedPrice: { amount: 2000000, quote },
    discountPercentage: 0,
    discountAmount: 0,
    quantity: 1,
  });
  product.translations.tr.name = 'Changed';
  quote.rates.USD = 1;
  assert.equal(localize(item, 'tr').name, 'Eski');
  assert.equal(item.fx_snapshot.rates.USD, 1000000);
  assert.deepEqual(item.price, { currency: 'IRR', amount: 2000000 });
});

test('catalog display uses injected server rates and preserves base price, BSON image IDs in snapshots', async () => {
  const quote = parseRates(payload, { now });
  const doc = { name: 'Product', price: { amount: 2, currency: 'USD' } };
  const displayed = await displayPrices(doc, 'TRY', async () => quote);
  assert.deepEqual(displayed.price, { amount: 80, currency: 'TRY' });
  assert.deepEqual(displayed.base_price, doc.price);
  assert.deepEqual(doc.price, { amount: 2, currency: 'USD' });
  const image = new ObjectId();
  const item = orderItemSnapshot(
    { name: 'Product', images_id: [image] },
    {
      sourcePrice: doc.price,
      lockedPrice: { amount: 2000000, quote },
      discountPercentage: 0,
      discountAmount: 0,
      quantity: 1,
    },
  );
  assert.ok(item.images_id[0] instanceof ObjectId);
  assert.equal(item.images_id[0].toHexString(), image.toHexString());
});
