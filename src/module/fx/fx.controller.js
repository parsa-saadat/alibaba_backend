import { getRates, convert, supportedCurrencies } from './fx.service.js';

export const getRatesController = async (req, res) => {
  try {
    res.json({ body: await getRates(), success: true, status: 200 });
  } catch {
    res.status(503).json({
      body: null,
      success: false,
      status: 503,
      message: 'Exchange rates temporarily unavailable',
    });
  }
};

export const convertCurrencyController = async (req, res) => {
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
  try {
    const quote = from === to ? null : await getRates();
    res.json({
      body: {
        amount: convert(amount, from, to, quote),
        currency: to,
        quote: quote
          ? { provider: quote.provider, fetched_at: quote.fetched_at, timestamps: quote.timestamps }
          : null,
      },
      success: true,
      status: 200,
    });
  } catch {
    res.status(503).json({
      body: null,
      success: false,
      status: 503,
      message: 'Exchange rates temporarily unavailable',
    });
  }
};
