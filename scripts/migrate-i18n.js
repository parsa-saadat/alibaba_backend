import 'dotenv/config';
import { MongoClient } from 'mongodb';
import { languages, schemas } from '../src/module/i18n/content.service.js';

// No guesses about the source language; require an explicit operator decision.
const source = process.argv.find((v) => v.startsWith('--source='))?.split('=')[1];
const apply = process.argv.includes('--apply');
if (!languages.includes(source))
  throw new Error('Use --source=fa|en|ar|tr. Dry-run by default; --apply writes data.');
if (!process.env.MONGO_URI || !process.env.MONGO_DATABASE_NAME)
  throw new Error('MongoDB configuration required');
const client = new MongoClient(process.env.MONGO_URI);
try {
  await client.connect();
  const db = client.db(process.env.MONGO_DATABASE_NAME);
  for (const [type, fields] of Object.entries(schemas)) {
    let documents = 0,
      changes = 0;
    for await (const doc of db
      .collection(`${type === 'category' ? 'categorie' : type}s`)
      .find({})) {
      documents++;
      for (const field of Object.keys(fields)) {
        if (
          typeof doc[field] !== 'string' ||
          !doc[field].trim() ||
          doc.translations?.[source]?.[field] !== undefined
        )
          continue;
        changes++;
        const path = `translations.${source}.${field}`;
        // Conditional updates also protect concurrent edits made after this document was read.
        if (apply)
          await db
            .collection(`${type === 'category' ? 'categorie' : type}s`)
            .updateOne(
              { _id: doc._id, [path]: { $exists: false }, [field]: doc[field] },
              { $set: { [path]: doc[field] } },
            );
      }
    }
    console.log(
      JSON.stringify({
        type,
        documents,
        candidateFields: changes,
        mode: apply ? 'apply' : 'dry-run',
      }),
    );
  }
} finally {
  await client.close();
}
