import { envPath, validateEnvironment } from './config/environment.js';
const errors = validateEnvironment();
if (errors.length) {
  console.error(`Startup configuration error. Config file: ${envPath}`);
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  try {
    await import('./app.js');
  } catch (error) {
    console.error('Backend could not start. Run npm run doctor for diagnostics.');
    console.error(
      error.code === 'MONGODB_UNAVAILABLE'
        ? 'MongoDB is unreachable or authentication failed. Check MONGO_URI, server availability and network access.'
        : 'Application initialization failed. Check npm run check:imports and environment configuration.',
    );
    process.exitCode = 1;
  }
}
