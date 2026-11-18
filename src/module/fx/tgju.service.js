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
