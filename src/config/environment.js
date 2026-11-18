import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
export const envPath = fileURLToPath(new URL('../../.env', import.meta.url));
config({ path: envPath, quiet: true });
export function validateEnvironment(env = process.env) {
  const errors = [];
  if (!env.MONGO_URI?.trim())
    errors.push(
      'MONGO_URI is missing. Run npm run setup, then set your MongoDB connection string in backend/.env.',
    );
  else if (!/^mongodb(?:\+srv)?:\/\//.test(env.MONGO_URI.trim()))
    errors.push('MONGO_URI must start with mongodb:// or mongodb+srv://.');
  if (!env.MONGO_DATABASE_NAME?.trim())
    errors.push('MONGO_DATABASE_NAME is missing in backend/.env.');
  const port = Number(env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    errors.push('PORT must be an integer between 1 and 65535.');
  if (env.STATUS === 'PROD') {
    for (const key of ['JWT_SECRET', 'OTP_SECRET'])
      if (!env[key] || env[key].length < 32 || env[key] === 'CHANGE_ME')
        errors.push(`${key} must be a strong random secret (32+ characters) in PROD.`);
  }
  return errors;
}
