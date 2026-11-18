import { validateEnvironment, envPath } from '../src/config/environment.js';
import { MongoClient } from 'mongodb';
import { checkImports } from './check-imports.js';
console.log('Environment file:', envPath);
const errors = validateEnvironment();
for (const error of errors) console.error('ERROR:', error);
const imports = await checkImports();
console.log(`Relative imports: ${imports.checked}; missing: ${imports.missing.length}`);
if (imports.missing.length) console.error(imports.missing);
if (!process.env.NAVASAN_API_KEY)
  console.log(
    'No Navasan key: auto provider uses TGJU public feed. Run npm run doctor:fx to verify live connectivity.',
  );
if (!errors.length) {
  const client = new MongoClient(process.env.MONGO_URI.trim(), { serverSelectionTimeoutMS: 5000 });
  try {
    await client.connect();
    await client.db(process.env.MONGO_DATABASE_NAME).command({ ping: 1 });
    console.log('MongoDB ping: OK');
  } catch {
    errors.push('MongoDB unavailable');
    console.error(
      'ERROR: MongoDB ping failed. Check database service, URI credentials, Atlas IP allowlist and network access.',
    );
  } finally {
    await client.close();
  }
}
process.exitCode = errors.length || imports.missing.length ? 1 : 0;
