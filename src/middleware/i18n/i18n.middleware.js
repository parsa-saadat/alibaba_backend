import { fieldDocument } from '../../utils/helpers/content-fields.helper.js';
import { displayPrices, displayCurrency, supportedCurrencies } from '../../module/fx/fx.service.js';
import { createHash } from 'node:crypto';
import { languages, localize, defaultLanguage } from '../../utils/helpers/localization.helper.js';
import { translateMessage } from '../../utils/helpers/localization.message.js';

export function normalizeLanguage(value) {
  if (typeof value !== 'string') return null;
  const lang = value.trim().toLowerCase().split(/[-_]/)[0];
  return languages.includes(lang) ? lang : null;
}
export function resolveLanguage(query, header, accept) {
  const explicit = normalizeLanguage(query) || normalizeLanguage(header);
  if (explicit) return explicit;
  const choices = String(accept || '')
    .split(',')
    .map((part, order) => {
      const [tag, ...params] = part.trim().split(';');
      const qParam = params.find((p) => p.trim().startsWith('q='));
      const q = qParam ? Number(qParam.trim().slice(2)) : 1;
      return { lang: normalizeLanguage(tag), q, order };
    })
    .filter((v) => v.lang && Number.isFinite(v.q) && v.q > 0 && v.q <= 1)
    .sort((a, b) => b.q - a.q || a.order - b.order);
  return choices[0]?.lang || defaultLanguage;
}
export default function i18nMiddleware(req, res, next) {
  req.rawLocale = req.query.lang === 'all';
  req.locale = resolveLanguage(req.query.lang, req.get('X-Language'), req.get('Accept-Language'));
  res.setHeader('Content-Language', req.locale);
  res.vary('Accept-Language');
  res.vary('X-Language');
  const json = res.json.bind(res);
  res.json = (payload) => {
    const send = async () => {
      // Operate on JSON-compatible data, not MongoDB ObjectIds, Dates or Buffers.
      let result =
        payload && typeof payload === 'object' ? JSON.parse(JSON.stringify(payload)) : payload;
      if (result && typeof result === 'object' && !Array.isArray(result)) {
        if ('body' in result) result.body = fieldDocument(result.body);
        if ('body' in result && !req.rawLocale) {
          result.body = localize(result.body, req.locale);
          const target = req.displayCurrency || req.query.currency || displayCurrency(req.locale);
          if (!supportedCurrencies.includes(target)) {
            res.status(400);
            return json({
              body: null,
              success: false,
              status: 400,
              message: 'Unsupported currency',
            });
          }
          result.body = await displayPrices(result.body, target);
        }
        if (typeof result.message === 'string') {
          const original = result.message;
          result.message_code = `msg_${createHash('sha256').update(original).digest('hex').slice(0, 16)}`;
          result.message = translateMessage(
            original,
            req.locale,
            res.statusCode,
            result.success === true,
          );
          // Preserve validation details for clients; hide internal failures in every language.
          if (res.statusCode === 503) {
            result.message = translateMessage(
              'Exchange rates temporarily unavailable',
              req.locale,
              503,
              false,
            );
            result.error_code = 'FX_UNAVAILABLE';
          } else if (res.statusCode >= 500) {
            result.message = translateMessage(
              'Internal server error',
              req.locale === 'en' ? 'en' : req.locale,
              500,
              false,
            );
          } else if (req.locale !== 'en') result.message_original = original;
        }
        result.locale = req.locale;
        result.direction = ['fa', 'ar'].includes(req.locale) ? 'rtl' : 'ltr';
      }
      return json(result);
    };
    return send().catch(() => {
      res.status(503);
      return json({
        body: null,
        success: false,
        status: 503,
        error_code: 'FX_UNAVAILABLE',
        message: translateMessage('Exchange rates temporarily unavailable', req.locale, 503, false),
        locale: req.locale,
      });
    });
  };
  next();
}
