import { createWriteStream, mkdirSync } from 'fs';
import { dirname } from 'path';

import morgan from 'morgan';
import { config } from 'dotenv';
import { defaultLogFormat, devLogFormat, prodLogFormat } from '../../config/morgan.config.js';

config();

const { STATUS, LOG_FILE_PATH } = process.env;

const logPath = LOG_FILE_PATH || './log/http.log';
mkdirSync(dirname(logPath), { recursive: true });
const write = createWriteStream(logPath, { flags: 'a' });

let morganMiddleware;

if (STATUS == 'PROD') {
  morganMiddleware = morgan(JSON.stringify(prodLogFormat), {
    stream: write,
  });
} else if (STATUS == 'DEV') {
  morganMiddleware = morgan(JSON.stringify(devLogFormat));
} else {
  morganMiddleware = morgan(JSON.stringify(defaultLogFormat));
}

export default morganMiddleware;
