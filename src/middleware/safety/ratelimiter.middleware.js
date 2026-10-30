// limiter.js
import rateLimit from 'express-rate-limit';

function createLimiter(windowMs, max) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req, res) => {
      return `${req.ip}-${req.originalUrl}`;
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
