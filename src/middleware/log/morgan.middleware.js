import { createWriteStream } from 'fs';

import morgan from 'morgan';
import { config } from 'dotenv';
import { defaultLogFormat, devLogFormat, prodLogFormat } from '../../config/morgan.config.js';

config();

const { STATUS, LOG_FILE_PATH } = process.env;

const write = createWriteStream(LOG_FILE_PATH || './log/http.log', { flags: 'a' });

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
