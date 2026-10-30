import { config } from 'dotenv';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';

import routes from './routes/index.js';
import morganMiddleware from './middleware/log/morgan.middleware.js';
import corsOptions from './config/cros.config.js';
import createLimiter from './middleware/safety/ratelimiter.middleware.js';

config();

const app = express();
const rateLimiter = createLimiter({ windowMs: 15 * 60 * 1000, max: 200 });

app.use(express.json());

app.use(express.urlencoded({ extended: false }));

app.use(helmet());

app.use(cors(corsOptions));

app.use(morganMiddleware);

app.use(rateLimiter, routes);

const port = process.env.PORT || 3000;
const host = process.env.HOST || 'localhost';

app.listen(port, host, () => {
  console.log(`Server is running on ${host} port ${port}`);
});
