import test from 'node:test';
import assert from 'node:assert/strict';
import {
  markdownSpans,
  translateContent,
  translateStrings,
} from '../src/module/translation/translation.service.js';
const markdown =
  '## Title\n\nText **bold** and [guide](https://example.com/manual?q=a).\n\n- First\n- Second\n\n> Quote\n\n| Name | Value |\n| --- | --- |\n| Camera | 12 |\n\n![alt](https://example.com/a.png)\n\n```js\nconst privateCode = 12;\n```\n\n`inline code`';
test('Markdown extracts prose, never URLs, code, syntax or image paths', () => {
  const texts = markdownSpans(markdown).map((s) => s.text);
  assert.ok(texts.includes('Title'));
  assert.ok(texts.includes('bold'));
  assert.ok(texts.includes('Quote'));
  assert.ok(texts.includes('Camera'));
  assert.ok(
    !texts.some(
      (t) => t.includes('https://') || t.includes('privateCode') || t.includes('inline code'),
    ),
  );
});
test('generates requested languages and preserves Markdown, links, fenced code', async () => {
  const result = await translateContent(
    {
      entity: 'product',
      source: 'en',
      targets: ['fa', 'ar', 'tr'],
      contents: { name: 'Camera', description: markdown, tags: ['Lens'] },
    },
    { translator: async (texts, from, to) => texts.map((t) => `${to} ${t}`) },
  );
  assert.equal(result.translations.fa.name, 'fa Camera');
  const text = result.translations.tr.description;
  assert.ok(text.startsWith('## tr Title'));
  assert.ok(text.includes('**tr bold**'));
  assert.ok(text.includes('](https://example.com/manual?q=a)'));
  assert.ok(text.includes('```js\nconst privateCode = 12;\n```'));
  assert.ok(text.includes('| --- | --- |'));
  assert.deepEqual(result.translations.ar.tags, ['ar Lens']);
});
test('invalid, empty, over-limit inputs and provider failures reject without partial data', async () => {
  for (const input of [
    {},
    { entity: 'category', source: 'en', targets: ['en'], contents: { name: 'x' } },
    { entity: 'category', source: 'en', targets: ['fa'], contents: {} },
    { entity: 'category', source: 'en', targets: ['fa'], contents: { price: 'x' } },
    { entity: 'category', source: 'en', targets: ['fa'], contents: { name: 'x'.repeat(101) } },
  ])
    await assert.rejects(translateContent(input));
  await assert.rejects(
    translateContent(
      { entity: 'category', source: 'en', targets: ['fa'], contents: { name: 'Camera' } },
      {
        translator: async () => {
          throw Error('offline');
        },
      },
    ),
  );
});
test('public provider batching and chunk whitespace are preserved', async () => {
  const long = 'one '.repeat(400);
  const result = await translateStrings([long, 'Camera'], 'en', 'fa', {
    env: {},
    fetcher: async (url) => ({
      ok: true,
      json: async () => url.searchParams.getAll('q').map((t) => t.trim()),
    }),
  });
  assert.equal(result[0], long);
  assert.equal(result[1], 'Camera');
  await assert.rejects(
    translateStrings(['Camera'], 'en', 'fa', {
      env: {},
      fetcher: async () => ({ ok: true, json: async () => [] }),
    }),
  );
});
