import { personName, legacyPersonSpelling } from './person-name.helper.js';

export const contentLanguages = ['en', 'fa', 'ar', 'tr'];
export const contentFields = {
  products: ['name', 'brand', 'short_description', 'description', 'tags'],
  categories: ['name'],
  stores: ['name', 'description', 'address'],
  plans: ['name', 'description'],
  users: ['firstname', 'lastname'],
};
export const languageMap = (value) =>
  value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value).length > 0 &&
  Object.keys(value).every((code) => contentLanguages.includes(code));
export const contentValue = (value, language = 'en') =>
  languageMap(value)
    ? (value[language] ??
      value.en ??
      Object.values(value).find((text) => text !== null && text !== undefined) ??
      '')
    : value;
const object = (value) => value && Object.getPrototypeOf(value) === Object.prototype;

// Convert legacy language-first payloads to field-first documents. No business fields are dropped.
export function fieldDocument(document, collection, source = 'en', preserveBase = false) {
  if (Array.isArray(document))
    return document.map((item) => fieldDocument(item, null, source, preserveBase));
  if (!object(document)) return document;
  const result = Object.fromEntries(
    Object.entries(document)
      .filter(
        ([key]) => !['translations', 'translation_status', 'store_translations'].includes(key),
      )
      .map(([key, value]) => [
        key,
        Array.isArray(value) && key === 'items'
          ? value.map((item) => fieldDocument(item, 'products', source, preserveBase))
          : fieldDocument(value, null, source, preserveBase),
      ]),
  );
  const fields = new Set([
    ...(contentFields[collection] || []),
    ...Object.values(document.translations || {}).flatMap((value) =>
      value ? Object.keys(value) : [],
    ),
  ]);
  for (const field of fields) {
    const existing = document[field];
    let map = languageMap(existing) ? { ...existing } : {};
    for (const code of contentLanguages) {
      const value = document.translations?.[code]?.[field];
      if (value !== undefined && value !== null && map[code] === undefined) map[code] = value;
    }
    if (
      preserveBase &&
      (typeof existing === 'string' || Array.isArray(existing)) &&
      existing != null &&
      map[source] === undefined &&
      !Object.values(map).some((value) => JSON.stringify(value) === JSON.stringify(existing))
    )
      map[source] = existing;
    if (
      !Object.keys(map).length &&
      existing !== undefined &&
      existing !== null &&
      (typeof existing === 'string' || Array.isArray(existing))
    )
      map[source] = existing;
    if (field === 'firstname' || field === 'lastname') {
      if (existing !== undefined)
        map = personName(
          typeof existing === 'string' && !document.translations
            ? existing
            : Object.keys(map).length
              ? map
              : existing,
        );
    }
    if (Object.keys(map).length) result[field] = map;
    else if (existing !== undefined) result[field] = {};
  }
  if (document.store_translations) {
    const map = languageMap(document.store_name) ? { ...document.store_name } : {};
    for (const code of contentLanguages)
      if (map[code] === undefined && document.store_translations[code]?.name != null)
        map[code] = document.store_translations[code].name;
    if (
      preserveBase &&
      typeof document.store_name === 'string' &&
      map[source] === undefined &&
      !Object.values(map).includes(document.store_name)
    )
      map[source] = document.store_name;
    result.store_name = Object.keys(map).length ? map : document.store_name;
  }

  return result;
}

// Existing domain validation works on plain values; this compatibility view exists only in memory.
export function domainDocument(document) {
  if (Array.isArray(document)) return document.map(domainDocument);
  if (!object(document)) return document;
  const result = {};
  const translations = { ...document.translations };
  for (const [field, value] of Object.entries(document)) {
    if (
      (languageMap(value) || (object(value) && Object.keys(value).length === 0)) &&
      [
        'name',
        'brand',
        'short_description',
        'description',
        'tags',
        'firstname',
        'lastname',
        'store_name',
      ].includes(field)
    ) {
      if (Object.values(value).some((text) => text !== null && text !== undefined))
        result[field] = contentValue(value);
      if (field === 'store_name') {
        result.store_translations = Object.fromEntries(
          Object.entries(value).map(([code, name]) => [code, { name }]),
        );
        continue;
      }
      for (const [code, text] of Object.entries(value))
        translations[code] = { ...translations[code], [field]: text };
    } else result[field] = domainDocument(value);
  }
  if (Object.keys(translations).length) result.translations = translations;
  return result;
}

export function contentUpdate(update, collection, previous) {
  const output = { ...update };
  const set = {};
  const unset = { ...update.$unset };
  const touched = new Set();
  for (const key of Object.keys(update.$set || {}))
    if (key.startsWith('translations.')) {
      const [, code, field] = key.split('.');
      if (field) {
        set[`${field}.${code}`] = update.$set[key];
        touched.add(field);
      } else if (update.$set[key] && typeof update.$set[key] === 'object')
        for (const [f, text] of Object.entries(update.$set[key])) {
          set[`${f}.${code}`] = text;
          touched.add(f);
        }
    }
  for (const key of Object.keys(unset))
    if (key.startsWith('translations.')) {
      const [, code, field] = key.split('.');
      delete unset[key];
      if (field) {
        unset[`${field}.${code}`] = '';
        touched.add(field);
      } else
        for (const f of contentFields[collection] || []) {
          unset[`${f}.${code}`] = '';
          touched.add(f);
        }
    }
  for (const [field, value] of Object.entries(update.$set || {})) {
    if (
      ['translations', 'translation_status', 'store_translations'].includes(field) ||
      field.startsWith('translations.')
    )
      continue;
    if ((contentFields[collection] || []).includes(field)) {
      if (touched.has(field)) continue;
      const map =
        collection === 'users'
          ? personName(value, languageMap(previous?.[field]) ? previous[field] : {})
          : languageMap(value)
            ? value
            : { en: value };
      for (const [code, text] of Object.entries(map)) {
        if (text === null) unset[`${field}.${code}`] = '';
        else set[`${field}.${code}`] = text;
      }
    } else set[field] = fieldDocument(value);
  }
  // MongoDB cannot set name.en below an existing string. Convert only legacy
  // scalar fields; already migrated maps keep their atomic dotted updates.
  for (const field of contentFields[collection] || []) {
    if (previous?.[field] == null || languageMap(previous[field]) || object(previous[field])) continue;
    const dotted = Object.keys(set).filter(key => key.startsWith(field + '.'));
    const deletions = Object.keys(unset).filter(key => key.startsWith(field + '.'));
    if (!dotted.length && !deletions.length) continue;
    const map = { en: previous[field] };
    for (const key of dotted) { map[key.slice(field.length + 1)] = set[key]; delete set[key]; }
    for (const key of deletions) { delete map[key.slice(field.length + 1)]; delete unset[key]; }
    set[field] = map;
  }
  // Delete only known obsolete translation metadata, never arbitrary application fields.
  unset.translations = '';
  unset.translation_status = '';
  unset.store_translations = '';
  output.$set = set;
  output.$unset = unset;
  return output;
}
