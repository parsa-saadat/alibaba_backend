import { getRates, convert, supportedCurrencies } from './fx.service.js';

export const getRatesController = async (req, res) => {
  try {
    const quote = await getRates();
    const target = req.query.currency || 'USD';
    if (!supportedCurrencies.includes(target))
      return res
        .status(400)
        .json({ body: null, success: false, status: 400, message: 'Unsupported currency' });
    const display_rates = supportedCurrencies.map((source) => ({
      source,
      currency: target,
      amount: convert(1, source, target, quote),
    }));
    res.json({
      body: { ...quote, display_rates, display_currency: target },
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

export const convertCurrencyController = async (req, res) => {
  const { amount, from, to } = req.body || {};
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
