import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import cors from 'cors';
import { ObjectId } from 'mongodb';
import middleware from '../src/middleware/i18n/i18n.middleware.js';
import corsOptions from '../src/config/cros.config.js';

test('HTTP integration: locale selection, CORS, nested JSON and BSON IDs', async () => {
  const app = express();
  app.use(middleware);
  app.use(cors(corsOptions));
  app.get('/product', (req, res) =>
    res.json({
      success: true,
      message: 'Product fetched successfully',
      body: {
        _id: new ObjectId('507f1f77bcf86cd799439011'),
        name: 'Phone',
        translations: { fa: { name: 'تلفن' }, tr: { name: 'Telefon' }, ar: { name: 'هاتف' } },
      },
    }),
  );
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.on('listening', resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    for (const [lang, name] of [
      ['en', 'Phone'],
      ['fa', 'تلفن'],
      ['ar', 'هاتف'],
      ['tr', 'Telefon'],
    ]) {
      const r = await fetch(`${base}/product?lang=${lang}`, {
        headers: { 'Accept-Language': 'de' },
      });
      assert.equal(r.headers.get('content-language'), lang);
      const json = await r.json();
      assert.equal(json.body.name, name);
      assert.equal(json.body._id, '507f1f77bcf86cd799439011');
    }
    const preflight = await fetch(`${base}/product`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://example.com',
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'X-Language',
      },
    });
    assert.equal(preflight.status, 200);
    assert.match(preflight.headers.get('access-control-allow-headers'), /X-Language/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
