import { config } from 'dotenv';

config();

const { CORS_ORIGIN, CORS_METHODS, CORS_ALLOWED_HEADERS } = process.env;

const corsOptions = {
  origin: CORS_ORIGIN || '*',
  methods: CORS_METHODS || 'GET,HEAD,PUT,PATCH,POST,DELETE',
  preflightContinue: false,
  optionsSuccessStatus: 200,
  allowedHeaders: CORS_ALLOWED_HEADERS || 'Content-Type,Authorization',
};

export default corsOptions;
