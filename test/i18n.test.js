import test from 'node:test';
import assert from 'node:assert/strict';
import {
  translationPatch,
  translationCreate,
  localize,
  searchableName,
} from '../src/module/i18n/content.service.js';
import middleware, { resolveLanguage } from '../src/middleware/i18n/i18n.middleware.js';

test('English default, regional tags, query and custom header priority', () => {
  assert.equal(resolveLanguage(), 'en');
  assert.equal(resolveLanguage('fa', 'tr', 'ar'), 'fa');
  assert.equal(resolveLanguage(undefined, 'tr-TR', 'ar'), 'tr');
  assert.equal(resolveLanguage(undefined, undefined, 'de,ar;q=0.5,en;q=0.8'), 'en');
  assert.equal(resolveLanguage(undefined, undefined, 'fa;q=0,ar;q=.4'), 'ar');
  assert.equal(resolveLanguage(['fa'], undefined, ''), 'en');
});
test('translation create and atomic patch', () => {
  const translations = { fa: { name: 'کالا' }, tr: { name: 'Ürün' } };
  assert.deepEqual(translationCreate(translations, 'product'), { translations });
  assert.deepEqual(translationPatch({ fa: { name: 'جدید' } }, 'product'), {
    'translations.fa.name': 'جدید',
  });
  assert.deepEqual(translationPatch(undefined, 'store'), {});
});
test('reject unsupported locales, fields, injection, types and lengths', () => {
  for (const v of [
    null,
    [],
    { de: { name: 'x' } },
    { fa: { price: '1' } },
    { en: { constructor: 'x' } },
    { en: { toString: 'x' } },
    { 'fa.name': 'x' },
    { fa: { name: '' } },
    { fa: { name: 123 } },
    { fa: { name: 'x'.repeat(201) } },
    JSON.parse('{"__proto__":{"name":"x"}}'),
  ]) {
    assert.throws(() => translationPatch(v, 'product'), /Invalid translations/);
  }
});
test('nested arrays, requested > English > legacy fallback, no mutation', () => {
  const doc = {
    name: 'قدیمی',
    description: 'legacy',
    translations: { en: { name: 'Product' }, fa: { name: 'کالا' } },
    children: [{ name: 'Child', translations: { ar: { name: 'طفل' } } }],
  };
  assert.equal(localize([doc], 'fa')[0].name, 'کالا');
  assert.equal(localize(doc, 'tr').name, 'Product');
  assert.equal(localize(doc, 'ar').children[0].name, 'طفل');
  assert.equal(localize(doc, 'tr').description, 'legacy');
  assert.equal(doc.name, 'قدیمی');
  assert.ok(searchableName(doc).includes('کالا'));
});
test('embedded store name translations', () => {
  assert.equal(
    localize({ store_name: 'Shop', store_translations: { fa: { name: 'فروشگاه' } } }, 'fa')
      .store_name,
    'فروشگاه',
  );
});
async function response(lang, status, payload) {
  const req = { query: { lang }, get: () => undefined };
  const headers = {};
  const res = {
    statusCode: status,
    setHeader(k, v) {
      headers[k] = v;
    },
    vary() {},
    json(v) {
      return v;
    },
  };
  let nextCalled = false;
  middleware(req, res, () => {
    nextCalled = true;
  });
  assert.ok(nextCalled);
  return { output: await res.json(payload), headers };
}
test('middleware translates messages and BSON-compatible serialized bodies', async () => {
  const { output, headers } = await response('fa', 200, {
    success: true,
    message: 'Product fetched successfully',
    body: {
      name: 'Product',
      translations: { fa: { name: 'کالا' } },
      _id: { toJSON: () => 'abc123' },
    },
  });
  assert.equal(output.locale, 'fa');
  assert.equal(output.direction, 'rtl');
  assert.equal(headers['Content-Language'], 'fa');
  assert.equal(output.body.name, 'کالا');
  assert.equal(output.body._id, 'abc123');
  assert.equal(output.message_original, 'Product fetched successfully');
  assert.notEqual(output.message, output.message_original);
});
test('all four languages, stable message codes and internal error masking', async () => {
  let code;
  for (const lang of ['en', 'fa', 'ar', 'tr']) {
    const { output } = await response(lang, 400, {
      message: 'Name is required',
      success: false,
      body: null,
    });
    assert.ok(output.message);
    code ??= output.message_code;
    assert.equal(output.message_code, code);
    const failure = (
      await response(lang, 500, { message: 'secret database connection string', success: false })
    ).output;
    assert.ok(!JSON.stringify(failure).includes('secret database'));
  }
});
