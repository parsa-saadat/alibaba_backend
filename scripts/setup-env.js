import { readFile, writeFile, access } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { envPath } from '../src/config/environment.js';
try {
  await access(envPath);
  console.log('.env already exists; not overwritten.');
} catch {
  const template = await readFile(new URL('../.env.example', import.meta.url), 'utf8');
  await writeFile(
    envPath,
    template
      .replace('JWT_SECRET=CHANGE_ME', `JWT_SECRET=${randomBytes(48).toString('hex')}`)
      .replace('OTP_SECRET=CHANGE_ME', `OTP_SECRET=${randomBytes(48).toString('hex')}`),
    { flag: 'wx' },
  );
  console.log(
    '.env created with a LOCAL MongoDB URL and random secrets. Start your local MongoDB or change MONGO_URI for your real database. Navasan/SMS/payment credentials still need configuration.',
  );
}
