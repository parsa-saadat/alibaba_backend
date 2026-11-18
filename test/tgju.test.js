import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTgju } from '../src/module/fx/tgju.service.js';
import { createRateService, convert } from '../src/module/fx/fx.service.js';
import { deriveContent } from '../src/module/i18n/content.service.js';
const now = Date.parse('2026-11-18T10:20:00Z');
const payload = {
  current: Object.fromEntries(
    Object.entries({
      price_dollar_rl: '2,669,000',
      price_eur: '2,937,600',
      price_try: '52,900',
      price_aed: '727,800',
    }).map(([key, p]) => [key, { p, ts: '2026-11-18 13:45:00' }]),
  ),
};
test('TGJU rial quotes and Tehran timestamp parse without a key', () => {
  const q = parseTgju(payload, { now });
  assert.equal(q.rates.USD, 2669000);
  assert.equal(q.timestamps.USD, Date.parse('2026-11-18T10:15:00Z'));
  assert.equal(convert(1, 'USD', 'IRT', q), 266900);
  assert.equal(q.provider, 'tgju');
});
test('missing, malformed, stale and future TGJU quotes fail closed', () => {
  assert.throws(() => parseTgju({}, { now }));
  assert.throws(() => parseTgju(payload, { now: now + 400000000 }));
  assert.throws(() => parseTgju(payload, { now: now - 900000 }));
  assert.throws(() =>
    parseTgju(
      { current: { ...payload.current, price_try: { p: 'bad', ts: '2026-11-18 13:45:00' } } },
      { now },
    ),
  );
});
test('auto provider needs no key; Navasan outage falls back to real TGJU response', async () => {
  let requests = [];
  const fetcher = async (url) => {
    requests.push(url.hostname);
    if (url.hostname === 'api.navasan.tech') throw Error('offline');
    return { ok: true, json: async () => payload };
  };
  assert.equal((await createRateService({ fetcher, now: () => now, env: {} })()).provider, 'tgju');
  assert.equal(
    (await createRateService({ fetcher, now: () => now, env: { NAVASAN_API_KEY: 'secret' } })())
      .provider,
    'tgju',
  );
  assert.deepEqual(requests, ['call1.tgju.org', 'api.navasan.tech', 'call1.tgju.org']);
});
test('translation-only content derives compatibility fields without duplicate input', () => {
  const input = {
    translations: {
      fa: { name: 'دوربین', short_description: 'کوتاه', description: '## توضیحات', tags: ['تست'] },
    },
  };
  const data = deriveContent(input, 'product');
  assert.equal(data.name, 'دوربین');
  assert.equal(data.description, '## توضیحات');
  assert.deepEqual(data.tags, ['تست']);
  assert.equal(input.name, undefined);
  assert.throws(() =>
    deriveContent({ translations: { fa: { description: 'not markdown' } } }, 'product'),
  );
});
