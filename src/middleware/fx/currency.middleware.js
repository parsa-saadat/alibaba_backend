import {
  getRates,
  convert,
  displayCurrency,
  supportedCurrencies,
} from '../../module/fx/fx.service.js';
export default async function currencyFilter(req, res, next) {
  if (
    req.method !== 'GET' ||
    !/^\/(product|perm\/products)(\/|$)/.test(req.path) ||
    req.query.lang === 'all'
  )
    return next();
  const query = { ...req.query };
  const source = query.currency || displayCurrency(req.locale);
  if (!supportedCurrencies.includes(source))
    return res
      .status(400)
      .json({ body: null, status: 400, success: false, message: 'Unsupported currency' });
  try {
    for (const key of ['min_price', 'max_price']) {
      if (query[key] === undefined || query[key] === '') continue;
      const value = Number(query[key]);
      if (!Number.isFinite(value) || value < 0)
        return res
          .status(400)
          .json({ body: null, status: 400, success: false, message: 'Invalid price filter' });
      query[key] = convert(value, source, 'USD', source === 'USD' ? null : await getRates());
    }
    // `currency` selects display, not catalog storage filtering.
    delete query.currency;
    req.displayCurrency = source;
    Object.defineProperty(req, 'query', { value: query, configurable: true });
    next();
  } catch {
    res
      .status(503)
      .json({
        body: null,
        status: 503,
        success: false,
        message: 'Exchange rates temporarily unavailable',
      });
  }
}
