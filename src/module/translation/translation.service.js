import { Lexer } from 'marked';
import { schemas, languages } from '../i18n/content.service.js';
const fail = (message, code = 400) => new Error(message, { cause: { code } });
const hasText = (v) => typeof v === 'string' && v.trim();
// Translate prose spans only: Markdown punctuation, code, HTML and URLs never leave
// their source positions. Replacements run backwards so source offsets stay stable.
export function markdownSpans(markdown) {
  const spans = [];
  let offset = 0,
    fence = null;
  function inline(raw, base) {
    let cursor = 0;
    for (const token of Lexer.lexInline(raw)) {
      const at = raw.indexOf(token.raw, cursor);
      if (at < 0) throw fail('Unsupported Markdown structure');
      cursor = at + token.raw.length;
      if (token.type === 'link' && /^https?:\/\//.test(token.text)) continue;
      if (token.tokens) {
        const childAt = token.raw.indexOf(token.text);
        if (childAt >= 0) inline(token.text, base + at + childAt);
      } else if (token.type === 'text') {
        const re = /[^|]+/g;
        let part;
        while ((part = re.exec(token.raw))) {
          const text = part[0].trim();
          if (!text || !/[\p{L}]/u.test(text) || /^https?:\/\//.test(text)) continue;
          const leading = part[0].length - part[0].trimStart().length;
          spans.push({
            start: base + at + part.index + leading,
            end: base + at + part.index + leading + text.length,
            text,
          });
        }
      }
    }
  }
  for (const line of markdown.split(/(?<=\n)/)) {
    const clean = line.replace(/\r?\n$/, '');
    const marker = clean.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (marker) {
      if (!fence) fence = marker[1][0];
      else if (marker[1][0] === fence) fence = null;
      offset += line.length;
      continue;
    }
    if (
      !fence &&
      !/^ {4}|^\s*<|^\s*\[[^\]]+\]:|^\s*[-*_]{3,}\s*$|^\s*\|?[\s:|-]+\|?\s*$/.test(clean)
    ) {
      const prefix =
        clean.match(/^(?: {0,3}(?:#{1,6}\s+|>\s*|(?:[-+*]|\d+[.)])\s+(?:\[[ xX]\]\s*)?))*/)?.[0] ||
        '';
      inline(clean.slice(prefix.length), offset + prefix.length);
    }
    offset += line.length;
  }
  return spans;
}
function chunks(text, max = 1200) {
  const out = [];
  let remaining = text;
  while (remaining.length > max) {
    let at = remaining.lastIndexOf(' ', max);
    if (at < max / 2) at = max;
    out.push(remaining.slice(0, at));
    remaining = remaining.slice(at);
  }
  out.push(remaining);
  return out;
}
export async function translateStrings(
  texts,
  source,
  target,
  { fetcher = fetch, env = process.env, signal = AbortSignal.timeout(50000) } = {},
) {
  const pieces = texts.map((text) => chunks(text));
  const flat = pieces.flat();
  const output = [];
  for (let i = 0; i < flat.length; ) {
    const group = [];
    let size = 0;
    while (
      i < flat.length &&
      (group.length === 0 || size + encodeURIComponent(flat[i]).length < 5500)
    ) {
      group.push(flat[i]);
      size += encodeURIComponent(flat[i]).length;
      i++;
    }
    let translated;
    if (env.GOOGLE_TRANSLATE_API_KEY) {
      const response = await fetcher('https://translation.googleapis.com/language/translate/v2', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-goog-api-key': env.GOOGLE_TRANSLATE_API_KEY,
        },
        body: JSON.stringify({ q: group, source, target, format: 'text' }),
        signal,
      });
      if (!response.ok) throw fail('Translation service temporarily unavailable', 502);
      const data = await response.json();
      translated = data.data?.translations?.map((row) => row.translatedText);
      // Cloud API may HTML-escape text even with format=text.
      translated = translated?.map((text) =>
        text.replace(/&#(\d+);|&quot;|&#39;|&amp;|&lt;|&gt;/g, (match) =>
          match.startsWith('&#')
            ? String.fromCodePoint(Number(match.slice(2, -1)))
            : ({ '&quot;': '"', '&amp;': '&', '&lt;': '<', '&gt;': '>' }[match] ?? match),
        ),
      );
    } else {
      const url = new URL('https://clients5.google.com/translate_a/t');
      url.searchParams.set('client', 'dict-chrome-ex');
      url.searchParams.set('sl', source);
      url.searchParams.set('tl', target);
      for (const text of group) url.searchParams.append('q', text);
      const response = await fetcher(url, { signal });
      if (!response.ok) throw fail('Translation service temporarily unavailable', 502);
      translated = await response.json();
    }
    if (
      !Array.isArray(translated) ||
      translated.length !== group.length ||
      translated.some((text) => typeof text !== 'string' || !text.trim())
    )
      throw fail('Translation service returned an invalid response', 502);
    output.push(...translated);
  }
  let cursor = 0;
  return pieces.map((parts) =>
    parts
      .map((part) => {
        const value = output[cursor++];
        return (part.match(/^\s*/)?.[0] || '') + value.trim() + (part.match(/\s*$/)?.[0] || '');
      })
      .join(''),
  );
}
export async function translateContent(input, { translator = translateStrings, ...options } = {}) {
  const { entity, source, contents, targets } = input || {};
  if (
    !schemas[entity] ||
    !languages.includes(source) ||
    !Array.isArray(targets) ||
    targets.length < 1 ||
    targets.length > 3 ||
    new Set(targets).size !== targets.length ||
    targets.some((target) => !languages.includes(target) || target === source) ||
    !contents ||
    typeof contents !== 'object' ||
    Array.isArray(contents)
  )
    throw fail('Invalid translation request');
  const jobs = [];
  let total = 0;
  for (const [field, value] of Object.entries(contents)) {
    if (!Object.hasOwn(schemas[entity], field)) throw fail('Invalid translation field');
    if (field === 'tags') {
      if (
        !Array.isArray(value) ||
        value.length > 20 ||
        value.some((v) => !hasText(v) || v.length > 50)
      )
        throw fail('Invalid tags');
      if (value.length) {
        jobs.push({ field, original: value, texts: value });
        total += value.join('').length;
      }
    } else {
      if (typeof value !== 'string' || value.length > schemas[entity][field])
        throw fail('Invalid translation content');
      if (!value.trim()) continue;
      total += value.length;
      const spans = field === 'description' && entity === 'product' ? markdownSpans(value) : null;
      jobs.push({
        field,
        original: value,
        spans,
        texts: spans ? spans.map((span) => span.text) : [value],
      });
    }
  }
  if (!jobs.length || total > 20000 || jobs.reduce((n, j) => n + j.texts.length, 0) > 160)
    throw fail('Translation input is empty or too large');
  const unique = [...new Set(jobs.flatMap((job) => job.texts))];
  const translations = {};
  // Sequential languages bound anonymous-provider traffic. A request has one global deadline.
  const signal = options.signal || AbortSignal.timeout(55000);
  for (const target of targets) {
    const translated = unique.length
      ? await translator(unique, source, target, { ...options, signal })
      : [];
    const map = new Map(unique.map((text, i) => [text, translated[i]]));
    const fields = {};
    for (const job of jobs) {
      let value;
      if (job.field === 'tags') value = job.texts.map((text) => map.get(text));
      else if (job.spans) {
        value = job.original;
        for (const span of [...job.spans].reverse()) {
          const safe = map.get(span.text).replace(/[\\`*_[\]<>|]/g, '\\$&');
          value = value.slice(0, span.start) + safe + value.slice(span.end);
        }
      } else value = map.get(job.original);
      if (
        job.field === 'tags'
          ? value.some((v) => v.length > 50)
          : value.length > schemas[entity][job.field]
      )
        throw fail('Translated content exceeds field length', 422);
      fields[job.field] = value;
    }
    translations[target] = fields;
  }
  return {
    translations,
    provider:
      options.env?.GOOGLE_TRANSLATE_API_KEY || process.env.GOOGLE_TRANSLATE_API_KEY
        ? 'google-cloud'
        : 'google-public',
    machine_translated: true,
  };
}
