import { languageMap, domainDocument, contentValue } from './content-fields.helper.js';
import 'dotenv/config';
import { MarkdownValidator } from '../validators/markdown.validator.js';
export const languages = (process.env.SUPPORTED_LANGS || 'en,fa,ar,tr')
  .split(',')
  .map((l) => l.trim())
  .filter((l) => ['en', 'fa', 'ar', 'tr'].includes(l));
export const defaultLanguage = languages.includes(process.env.DEFAULT_LANG)
  ? process.env.DEFAULT_LANG
  : languages.includes('en')
    ? 'en'
    : languages[0] || 'en';
export const schemas = {
  product: { brand: 100, name: 200, short_description: 500, description: 50000, tags: 20 },
  category: { name: 100 },
  store: { name: 50, description: 255, address: 2000 },
  plan: { name: 50, description: 5000 },
};
const plain = (v) =>
  v !== null &&
  typeof v === 'object' &&
  !Array.isArray(v) &&
  Object.getPrototypeOf(v) === Object.prototype;
export function translationPatch(value, type) {
  if (value === undefined) return {};
  const fail = () => {
    throw new Error('Invalid translations', { cause: { code: 400 } });
  };
  if (!plain(value)) fail();
  const result = {};
  for (const [lang, fields] of Object.entries(value)) {
    if (!languages.includes(lang)) fail();
    if (fields === null) {
      result[`translations.${lang}`] = null;
      continue;
    }
    if (!plain(fields)) fail();
    for (const [field, text] of Object.entries(fields)) {
      const max = Object.hasOwn(schemas[type] || {}, field) ? schemas[type][field] : undefined;
      if (!max) fail();
      if (text === null) {
        result[`translations.${lang}.${field}`] = null;
        continue;
      }
      if (field === 'tags') {
        if (
          !Array.isArray(text) ||
          text.length > 20 ||
          text.some((t) => typeof t !== 'string' || !t.trim() || t.length > 50)
        )
          fail();
        result[`translations.${lang}.tags`] = text.map((t) => t.trim());
        continue;
      }
      if (
        field === 'description' &&
        type === 'product' &&
        (typeof text !== 'string' || !MarkdownValidator(text))
      )
        fail();
      if (typeof text !== 'string' || !text.trim() || text.length > max) fail();
      // Dot paths merge partial edits atomically without overwriting other languages.
      result[`translations.${lang}.${field}`] = text.trim();
    }
  }
  return result;
}
export function translationCreate(value, type) {
  translationPatch(value, type);
  if (value === undefined) return {};
  const translations = {};
  for (const [lang, fields] of Object.entries(value)) {
    if (fields === null) continue;
    translations[lang] = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== null));
  }
  return { translations };
}
export function localize(value, lang) {
  if (Array.isArray(value)) return value.map((v) => localize(v, lang));
  if (!plain(value)) return value;
  if (languageMap(value)) return contentValue(value, lang);
  const result = Object.fromEntries(
    Object.entries(value).map(([k, v]) => [k, k === 'translations' ? v : localize(v, lang)]),
  );
  for (const field of [
    'name',
    'brand',
    'description',
    'short_description',
    'tags',
    'address',
    'firstname',
    'lastname',
    'store_name',
  ])
    if (plain(value[field]) && !Object.keys(value[field]).length)
      result[field] = field === 'tags' ? [] : '';
  if (plain(value.translations)) {
    for (const field of ['name', 'brand', 'short_description', 'description', 'tags', 'address']) {
      if (Object.hasOwn(value, field))
        result[field] =
          value.translations[lang]?.[field] ?? value.translations.en?.[field] ?? value[field];
    }
  }
  if (value.store_translations && Object.hasOwn(value, 'store_name')) {
    result.store_name =
      value.store_translations[lang]?.name ?? value.store_translations.en?.name ?? value.store_name;
  }
  return result;
}
export function searchableName(value) {
  return [value.name, ...Object.values(value.translations || {}).map((v) => v?.name)]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

export function mongoTranslationUpdate(data) {
  const set = {},
    unset = {};
  for (const [key, value] of Object.entries(data)) {
    if (key.startsWith('translations.') && value === null) unset[key] = '';
    else set[key] = value;
  }
  return {
    $set: { ...set, update_at: new Date() },
    ...(Object.keys(unset).length ? { $unset: unset } : {}),
  };
}
export function searchableTags(value) {
  return [
    ...(value.tags || []),
    ...Object.values(value.translations || {}).flatMap((v) => v?.tags || []),
  ];
}

export function deriveContent(data, type) {
  if (!plain(data)) return data;
  data = domainDocument(data);
  if (!Object.hasOwn(data, 'translations')) return data;
  translationPatch(data.translations, type);
  const result = { ...data };
  for (const field of Object.keys(schemas[type] || {})) {
    const candidates = languages.map((lang) => data.translations?.[lang]?.[field]);
    const value = candidates.find((v) =>
      Array.isArray(v) ? v.length : typeof v === 'string' && v.trim(),
    );
    if (value !== undefined && !Object.hasOwn(data, field))
      result[field] = typeof value === 'string' ? value.trim() : value;
  }
  return result;
}

export function searchableBrand(product) {
  return [
    product.brand,
    ...Object.values(product.translations || {}).map((translation) => translation?.brand),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}
