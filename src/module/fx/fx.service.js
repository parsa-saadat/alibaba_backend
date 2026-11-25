const symbols = { USD: 'usd_sell', EUR: 'eur', TRY: 'try', AED: 'aed_sell' };
export const supportedCurrencies = ['USD', 'IRT', 'IRR', 'EUR', 'TRY', 'AED'];
const error = () => new Error('Exchange rates temporarily unavailable', { cause: { code: 503 } });
export function parseRates(data, { unit = 'IRT', now = Date.now(), maxAge = 345600000 } = {}) {
  if (!['IRT', 'IRR'].includes(unit)) throw error();
  const rates = { IRR: 1, IRT: 10 },
    timestamps = {};
  for (const [code, symbol] of Object.entries(symbols)) {
    const entry = data?.[symbol] ?? (code === 'AED' ? data?.aed : undefined);
    const value = Number(String(entry?.value ?? '').replaceAll(',', ''));
    const timestamp = Number(entry?.timestamp) * 1000;
    if (
      !Number.isFinite(value) ||
      value <= 0 ||
      !Number.isFinite(timestamp) ||
      timestamp > now + 300000 ||
      now - timestamp > maxAge
    )
      continue;
    rates[code] = value * (unit === 'IRT' ? 10 : 1);
    timestamps[code] = timestamp;
  }
  if (!rates.USD) throw error();
  return { rates, timestamps, fetched_at: now, provider: 'navasan', unit: 'IRR' };
}
export function convert(amount, from, to, quote) {
  if (
    !supportedCurrencies.includes(from) ||
    !supportedCurrencies.includes(to) ||
    !Number.isFinite(amount) ||
    amount < 0
  )
    throw error();
  if (from === to) return amount;
  if (['IRT', 'IRR'].includes(from) && ['IRT', 'IRR'].includes(to))
    quote = { rates: { IRR: 1, IRT: 10 } };
  if (!quote?.rates[from] || !quote?.rates[to]) throw error();
  const result = (amount * quote.rates[from]) / quote.rates[to];
  const scale = ['IRR', 'IRT'].includes(to) ? 1 : 100;
  if (!Number.isSafeInteger(Math.round(result * scale))) throw error();
  return Math.round((result + Number.EPSILON) * scale) / scale;
}
export function createRateService({ fetcher = fetch, now = Date.now, env = process.env } = {}) {
  let cache,
    pending,
    failedUntil = 0;
  return async function getRates() {
    const ttl = Math.max(30000, Number(env.FX_CACHE_TTL_MS) || 300000);
    if (
      cache &&
      now() - cache.fetched_at < ttl &&
      now() - cache.timestamps.USD < (Number(env.FX_MAX_QUOTE_AGE_MS) || 345600000)
    )
      return cache;
    if (pending) return pending;
    if (now() < failedUntil) throw error();
    pending = (async () => {
      try {
        const mode = env.FX_PROVIDER || 'auto';
        if (!['auto', 'tgju', 'navasan'].includes(mode)) throw error();
        const providers =
          mode === 'auto' ? (env.NAVASAN_API_KEY ? ['navasan', 'tgju'] : ['tgju']) : [mode];
        let quote;
        for (const provider of providers) {
          try {
            const url = new URL(
              provider === 'tgju'
                ? 'https://call1.tgju.org/ajax.json'
                : 'https://api.navasan.tech/latest/',
            );
            if (provider === 'navasan') {
              if (!env.NAVASAN_API_KEY) throw error();
              url.searchParams.set('api_key', env.NAVASAN_API_KEY);
            }
            const response = await fetcher(url, {
              signal: AbortSignal.timeout(8000),
              headers: { Accept: 'application/json' },
            });
            if (!response.ok) throw error();
            const data = await response.json();
            quote =
              provider === 'tgju'
                ? parseTgju(data, {
                    now: now(),
                    maxAge: Number(env.FX_MAX_QUOTE_AGE_MS) || 345600000,
                  })
                : parseRates(data, {
                    now: now(),
                    unit: env.NAVASAN_RATE_UNIT || 'IRT',
                    maxAge: Number(env.FX_MAX_QUOTE_AGE_MS) || 345600000,
                  });
            break;
          } catch {
            /* Try the next real provider; never manufacture a rate. */
          }
        }
        if (!quote) throw error();
        cache = quote;
        return cache;
      } catch {
        failedUntil = now() + 30000;
        throw error();
      } finally {
        pending = null;
      }
    })();
    return pending;
  };
}
export const getRates = createRateService();
export async function rialSnapshot(price) {
  if (!price || !Number.isFinite(price.amount) || price.amount <= 0)
    throw new Error('Invalid payment price', { cause: { code: 400 } });
  price = {
    ...price,
    currency: String(price.currency || '')
      .trim()
      .toUpperCase(),
  };
  if (!supportedCurrencies.includes(price.currency))
    throw new Error('Unsupported payment currency', { cause: { code: 400 } });
  if (!Number.isSafeInteger(Math.round(price.amount * (price.currency === 'IRT' ? 10 : 1))))
    throw new Error('Payment amount exceeds supported range', { cause: { code: 400 } });
  if (price.currency === 'IRR') return { amount: Math.round(price.amount), quote: null };
  if (price.currency === 'IRT') return { amount: Math.round(price.amount * 10), quote: null };
  const quote = await getRates();
  return { amount: convert(price.amount, price.currency, 'IRR', quote), quote };
}
export function displayCurrency(locale) {
  return { fa: 'IRT', en: 'USD', ar: 'AED', tr: 'TRY' }[locale] || 'USD';
}
export async function displayPrices(body, target, rateProvider = getRates) {
  let quote;
  async function walk(value) {
    if (Array.isArray(value)) return Promise.all(value.map(walk));
    if (!value || typeof value !== 'object') return value;
    // Financial order snapshots must never be revalued on reads.
    if (
      'parent_order_id' in value ||
      'final_amount' in value ||
      value.fx_snapshot ||
      value.source_price
    )
      return value;
    const result = {};
    for (const [k, v] of Object.entries(value))
      result[k] = ['translations', 'base_price'].includes(k) ? v : await walk(v);
    if (
      value.price &&
      typeof value.price.amount === 'number' &&
      supportedCurrencies.includes(value.price.currency)
    ) {
      const from = value.price.currency;
      if (from !== target && !(['IRR', 'IRT'].includes(from) && ['IRR', 'IRT'].includes(target)))
        quote ||= await rateProvider();
      result.base_price = value.price;
      result.price = { amount: convert(value.price.amount, from, target, quote), currency: target };
      result.price_quote = quote
        ? { provider: quote.provider, fetched_at: quote.fetched_at, timestamps: quote.timestamps }
        : null;
    }
    if (Array.isArray(value.matched_products) && value.matched_products.length) {
      const from = value.matched_products[0].price?.currency || 'USD';
      for (const field of ['min_price', 'max_price'])
        if (typeof value[field] === 'number') {
          if (
            from !== target &&
            !(['IRR', 'IRT'].includes(from) && ['IRR', 'IRT'].includes(target))
          )
            quote ||= await rateProvider();
          result[field] = convert(value[field], from, target, quote);
        }
      result.display_currency = target;
    }
    return result;
  }
  return walk(body);
}

// Public website JSON feed, not a contracted API. All provider prices are IRR.
const keys = { USD: 'price_dollar_rl', EUR: 'price_eur', TRY: 'price_try', AED: 'price_aed' };
const unavailable = () =>
  new Error('Exchange rates temporarily unavailable', { cause: { code: 503 } });
export function parseTgju(data, { now = Date.now(), maxAge = 345600000 } = {}) {
  const rates = { IRR: 1, IRT: 10 },
    timestamps = {};
  for (const [code, key] of Object.entries(keys)) {
    const row = data?.current?.[key];
    const amount = Number(String(row?.p ?? '').replaceAll(',', ''));
    // TGJU publishes Gregorian timestamps in Tehran local time (UTC+03:30).
    const raw = row?.ts;
    const timestamp =
      typeof raw === 'number'
        ? raw * 1000
        : typeof raw === 'string' && /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(raw)
          ? Date.parse(raw.replace(' ', 'T') + '+03:30')
          : NaN;
    if (
      !Number.isFinite(amount) ||
      amount <= 0 ||
      !Number.isFinite(timestamp) ||
      timestamp > now + 300000 ||
      now - timestamp > maxAge
    )
      continue;
    rates[code] = amount;
    timestamps[code] = timestamp;
  }
  if (Object.keys(keys).some((code) => !rates[code])) throw unavailable();
  return {
    rates,
    timestamps,
    fetched_at: now,
    provider: 'tgju',
    unit: 'IRR',
    source_url: 'https://call1.tgju.org/ajax.json',
  };
}

const invalid = (message) => new Error(message, { cause: { code: 400 } });
export async function normalizeCatalogPrice(price, rates = getRates) {
  if (!price || typeof price !== 'object' || Array.isArray(price)) throw invalid('Invalid price');
  const { amount, currency } = price;
  if (!supportedCurrencies.includes(currency)) throw invalid('Unsupported input currency');
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100000000000000)
    throw invalid('Invalid price amount');
  const scale = ['IRT', 'IRR'].includes(currency) ? 1 : 100;
  if (Math.abs(amount * scale - Math.round(amount * scale)) > 0.00001)
    throw invalid('Too many decimal places for input currency');
  const usd = currency === 'USD' ? amount : convert(amount, currency, 'USD', await rates());
  if (usd < 0.01 || usd > 1000000000) throw invalid('USD price is outside supported range');
  return { currency: 'USD', amount: usd };
}
