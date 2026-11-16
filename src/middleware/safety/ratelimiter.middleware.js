import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

function createLimiter(optionsOrWindowMs, maxArg) {
  const isObject =
    typeof optionsOrWindowMs === 'object' && optionsOrWindowMs !== null;

  const windowMs = isObject ? optionsOrWindowMs.windowMs : optionsOrWindowMs;
  const max = isObject ? optionsOrWindowMs.max : maxArg;

  if (
    typeof windowMs !== 'number' ||
    !Number.isFinite(windowMs) ||
    windowMs < 1
  ) {
    throw new TypeError('windowMs must be a positive number in milliseconds');
  }

  if (typeof max !== 'number' || !Number.isFinite(max) || max < 1) {
    throw new TypeError('max must be a positive number');
  }

  return rateLimit({
    windowMs,
    limit: max, 
    standardHeaders: true,
    legacyHeaders: false,

    keyGenerator: (req) => {
      const ip = req.ip ? ipKeyGenerator(req.ip) : 'unknown';
      return `${ip}-${req.originalUrl}`;
    },

    handler: (req, res) => {
      res.status(429).json({
        body: null,
        status: 429,
        message: 'Too many requests from this IP, please try again later.',
        success: false,
      });
    },
  });
}

export default createLimiter;