import 'dotenv/config';
import { MongoClient } from 'mongodb';
import {
  fieldDocument,
  contentLanguages,
  languageMap,
  contentFields,
} from '../src/utils/helpers/content-fields.helper.js';

const source = process.argv.find((value) => value.startsWith('--source='))?.split('=')[1];
const apply = process.argv.includes('--apply');
if (!contentLanguages.includes(source))
  throw new Error(
    'Use --source=fa|en|ar|tr. Dry-run is default; --apply writes. Back up MongoDB and stop application writes first.',
  );
if (!process.env.MONGO_URI || !process.env.MONGO_DATABASE_NAME)
  throw new Error('MongoDB configuration required');
if (apply && !process.argv.includes('--backup-confirmed'))
  throw new Error(
    'Back up MongoDB, stop application writes, then pass --backup-confirmed with --apply.',
  );
function hasConflict(value, fields = []) {
  if (Array.isArray(value)) return value.some((item) => hasConflict(item));
  if (!value || Object.getPrototypeOf(value) !== Object.prototype) return false;
  if (
    languageMap(value.store_name) &&
    value.store_translations &&
    contentLanguages.some(
      (code) =>
        value.store_name[code] != null &&
        value.store_translations[code]?.name != null &&
        value.store_name[code] !== value.store_translations[code].name,
    )
  )
    return true;
  for (const field of new Set([
    ...fields,
    ...Object.values(value.translations || {}).flatMap((v) => (v ? Object.keys(v) : [])),
  ])) {
    const existing = value[field];
    const legacy = Object.fromEntries(
      contentLanguages
        .filter((code) => value.translations?.[code]?.[field] != null)
        .map((code) => [code, value.translations[code][field]]),
    );
    if (
      languageMap(existing) &&
      Object.keys(legacy).some(
        (code) =>
          existing[code] != null && JSON.stringify(existing[code]) !== JSON.stringify(legacy[code]),
      )
    )
      return true;
    if (
      (typeof existing === 'string' || Array.isArray(existing)) &&
      legacy[source] != null &&
      JSON.stringify(existing) !== JSON.stringify(legacy[source]) &&
      !Object.values(legacy).some((text) => JSON.stringify(text) === JSON.stringify(existing))
    )
      return true;
  }
  return Object.values(value).some((child) => hasConflict(child));
}

const client = await new MongoClient(process.env.MONGO_URI).connect();
try {
  const db = client.db(process.env.MONGO_DATABASE_NAME);
  for (const collection of [
    'products',
    'categories',
    'stores',
    'plans',
    'users',
    'orders',
    'sub-orders',
  ]) {
    let scanned = 0,
      changed = 0,
      conflicts = 0;
    for await (const document of db.collection(collection).find({})) {
      scanned++;
      if (hasConflict(document, contentFields[collection] || [])) {
        conflicts++;
        console.error(
          JSON.stringify({
            collection,
            id: String(document._id),
            error: 'Conflicting localized fields; document was not modified',
          }),
        );
        continue;
      }
      const next = fieldDocument(document, collection, source, true);
      if (JSON.stringify(next) === JSON.stringify(document)) continue;
      changed++;
      if (apply) {
        const filter = {
          _id: document._id,
          ...(document.update_at
            ? { update_at: document.update_at }
            : { update_at: { $exists: false } }),
        };
        const result = await db.collection(collection).replaceOne(filter, next);
        if (!result.matchedCount) conflicts++;
      }
    }
    console.log(
      JSON.stringify({
        collection,
        scanned,
        changed,
        conflicts,
        mode: apply ? 'apply' : 'dry-run',
      }),
    );
    if (conflicts) process.exitCode = 2;
  }
} finally {
  await client.close();
}
