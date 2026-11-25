import fs from 'node:fs';
import { validateEnvironment } from '../src/config/environment.js';

const file = process.argv[2];
const raw = fs.readFileSync(file, 'utf8');
const env = {};
for (const line of raw.split(/\r?\n/)) {
  const m = /^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/.exec(line);
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, '').trim();
}
const errors = validateEnvironment(env);
console.log('keys:', Object.keys(env).length);
console.log('STATUS:', env.STATUS || '(unset)');
console.log('validation errors:', errors.length ? errors : 'none');
console.log('JWT_SECRET length:', (env.JWT_SECRET || '').length);
console.log('OTP_SECRET length:', (env.OTP_SECRET || '').length);
console.log('MONGO_URI has valid scheme:', /^(mongodb(\+srv)?:\/\/).+/.test(env.MONGO_URI || ''));
console.log('MONGO_DATABASE_NAME set:', Boolean(env.MONGO_DATABASE_NAME));
console.log('CORS_ORIGIN:', env.CORS_ORIGIN || '(unset -> WS allows any origin)');
console.log('PORT:', env.PORT, '| HOST:', env.HOST);
