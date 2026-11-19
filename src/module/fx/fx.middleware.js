import { supportedCurrencies } from './fx.service.js';

export const validateConversionMiddleware = (req, res, next) => {
  const { amount, from, to } = req.body || {};
  if (
    !Number.isFinite(amount) ||
    amount < 0 ||
    amount > 100000000000000 ||
    !supportedCurrencies.includes(from) ||
    !supportedCurrencies.includes(to)
  )
    return res
      .status(400)
      .json({ body: null, status: 400, success: false, message: 'Invalid conversion request' });
  next();
};
