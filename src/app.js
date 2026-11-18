import fxRoutes from './routes/fx/fx.route.js';
import translationRoutes from './routes/translation/translation.route.js';
import './config/environment.js';
import currencyFilter from './middleware/fx/currency.middleware.js';
import i18nMiddleware from './middleware/i18n/i18n.middleware.js';
import { languages, defaultLanguage } from './module/i18n/content.service.js';
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

app.use(i18nMiddleware);

app.use(express.json({ limit: '1mb' }));

app.use(express.urlencoded({ extended: false }));

app.use(helmet());

app.use(cors(corsOptions));

app.use(morganMiddleware);

app.get('/health', (req, res) =>
  res.json({ body: { database: 'connected' }, success: true, status: 200 }),
);

app.get('/i18n/languages', (req, res) =>
  res.json({
    body: {
      default: defaultLanguage,
      languages: languages.map((code) => ({
        code,
        direction: ['fa', 'ar'].includes(code) ? 'rtl' : 'ltr',
      })),
    },
    status: 200,
    success: true,
    message: 'Languages fetched successfully',
  }),
);

app.use('/fx', rateLimiter, fxRoutes);
app.use('/i18n', translationRoutes);
app.use(rateLimiter, currencyFilter, routes);
app.use((req, res) =>
  res.status(404).json({ body: null, status: 404, success: false, message: 'Not found' }),
);
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const status = err.status >= 400 && err.status < 600 ? err.status : 500;
  res.status(status).json({
    body: null,
    status,
    success: false,
    message: status >= 500 ? 'Internal server error' : err.message,
  });
});

const port = process.env.PORT || 3000;
const host = process.env.HOST || 'localhost';

app.listen(port, host, () => {
  console.log(`Server is running on ${host} port ${port}`);
});
