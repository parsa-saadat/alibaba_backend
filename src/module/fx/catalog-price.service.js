import { convert, getRates, supportedCurrencies } from './fx.service.js';
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
