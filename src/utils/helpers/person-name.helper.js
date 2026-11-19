// Offline name transliteration, not semantic translation. Manual spellings always win.
const common = {
  سرشت: ['Seresht', 'سرشت', 'Sereşt'],
  نژاد: ['Nejad', 'نجاد', 'Nejad'],
  پور: ['Pour', 'بور', 'Pur'],
  زاده: ['Zadeh', 'زاده', 'Zade'],
  امیر: ['Amir', 'أمير', 'Emir'],
  سعید: ['Saeed', 'سعيد', 'Said'],
  امید: ['Omid', 'أميد', 'Omid'],
  رضایی: ['Rezaei', 'رضائي', 'Rızai'],
  احمدی: ['Ahmadi', 'أحمدي', 'Ahmedi'],
  محمدی: ['Mohammadi', 'محمدي', 'Muhammedi'],
  حسینی: ['Hosseini', 'حسيني', 'Hüseyni'],
  سعادت: ['Saadat', 'سعادت', 'Saadat'],
  علی: ['Ali', 'علي', 'Ali'],
  محمد: ['Mohammad', 'محمد', 'Muhammed'],
  رضا: ['Reza', 'رضا', 'Rıza'],
  حسین: ['Hossein', 'حسين', 'Hüseyin'],
  حسن: ['Hasan', 'حسن', 'Hasan'],
  احمد: ['Ahmad', 'أحمد', 'Ahmet'],
  مهدی: ['Mehdi', 'مهدي', 'Mehdi'],
  فاطمه: ['Fatemeh', 'فاطمة', 'Fatıma'],
  زهرا: ['Zahra', 'زهراء', 'Zehra'],
  مریم: ['Maryam', 'مريم', 'Meryem'],
  سارا: ['Sara', 'سارة', 'Sara'],
  پارسا: ['Parsa', 'بارسا', 'Parsa'],
};
const letters = {
  ا: 'a',
  آ: 'a',
  ب: 'b',
  پ: 'p',
  ت: 't',
  ث: 's',
  ج: 'j',
  چ: 'ch',
  ح: 'h',
  خ: 'kh',
  د: 'd',
  ذ: 'z',
  ر: 'r',
  ز: 'z',
  ژ: 'zh',
  س: 's',
  ش: 'sh',
  ص: 's',
  ض: 'z',
  ط: 't',
  ظ: 'z',
  ع: '',
  غ: 'gh',
  ف: 'f',
  ق: 'gh',
  ک: 'k',
  ك: 'k',
  گ: 'g',
  ل: 'l',
  م: 'm',
  ن: 'n',
  و: 'v',
  ه: 'h',
  ی: 'y',
  ي: 'y',
  ئ: 'y',
  ؤ: 'v',
  أ: 'a',
  إ: 'e',
  ة: 'h',
  ء: '',
};
const latin = (text) =>
  text
    .normalize('NFKC')
    .replace(/[\u064B-\u065F\u0670ـ]/g, '')
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .split(/([\s\-‌]+)/)
    .map((word) => {
      const known =
        common[word] ||
        Object.values(common).find((forms) =>
          forms.some((form) => form.toLowerCase() === word.toLowerCase()),
        );
      if (known) return known[0];
      const result = [...word].map((char) => letters[char] ?? char).join('');
      return result ? result[0].toUpperCase() + result.slice(1) : '';
    })
    .join('')
    .replace(/‌/g, ' ');
export function personName(value, previous = {}) {
  if (value === null) return {};
  const map =
    typeof value === 'string'
      ? { [/[\p{Script=Arabic}]/u.test(value) ? 'fa' : 'en']: value.trim() }
      : { ...value };
  if (!map || Array.isArray(map) || typeof map !== 'object')
    throw new Error('Invalid person name', { cause: { code: 400 } });
  for (const [code, text] of Object.entries(map))
    if (!['en', 'fa', 'ar', 'tr'].includes(code) || typeof text !== 'string' || text.length > 150)
      throw new Error('Invalid person name', { cause: { code: 400 } });
  for (const code of Object.keys(map)) {
    map[code] = map[code].trim();
    if (!map[code]) delete map[code];
  }
  for (const code of ['en', 'tr']) {
    if (map[code] && /[\p{Script=Arabic}]/u.test(map[code])) {
      map.fa = map[code];
      delete map[code];
    }
  }
  const changedSource = map.fa || map.ar || map.en || map.tr;
  const result = { ...previous, ...map };
  if (changedSource && Object.keys(previous).length) {
    const oldSource = previous.fa || previous.ar || previous.en || previous.tr;
    const generated = personName({ [previous.fa ? 'fa' : previous.ar ? 'ar' : 'en']: oldSource });
    for (const code of ['en', 'fa', 'ar', 'tr'])
      if (!Object.hasOwn(map, code) && previous[code] === generated[code]) delete result[code];
  }
  // A manual Latin spelling with no known reverse mapping must not overwrite an existing Persian/Arabic spelling.
  const latinOnly = !map.fa && !map.ar && (map.en || map.tr);
  const knownLatin =
    latinOnly &&
    String(latinOnly)
      .split(/[\s‌-]+/)
      .filter(Boolean)
      .every((word) =>
        Object.values(common).some((forms) =>
          forms.some((form) => form.toLowerCase() === word.toLowerCase()),
        ),
      );
  if (latinOnly && !knownLatin) {
    for (const code of ['fa', 'ar'])
      if (!map[code] && previous[code]) result[code] = previous[code];
  }
  const source = changedSource || previous.fa || previous.ar || previous.en || previous.tr;
  if (!source) return result;
  const original = source.replace(/ي/g, 'ی').replace(/ك/g, 'ک');
  const knownEntry = Object.entries(common).find(
    ([key, values]) =>
      key === original ||
      values.some((text) => text.toLocaleLowerCase() === source.toLocaleLowerCase()),
  );
  const known = knownEntry?.[1];
  const en = known?.[0] || latin(source);
  const arabic =
    known?.[1] ||
    source
      .replace(/ی/g, 'ي')
      .replace(/ک/g, 'ك')
      .replace(/پ/g, 'ب')
      .replace(/چ/g, 'تش')
      .replace(/ژ/g, 'ج')
      .replace(/گ/g, 'ك');
  // Latin-to-Persian is ambiguous. Keep the supplied Latin spelling rather than invent vowels.
  const words = source.split(/[\s‌-]+/).filter(Boolean);
  const reverse = (word, index) => {
    const entry = Object.entries(common).find(
      ([key, forms]) =>
        key === word || forms.some((form) => form.toLowerCase() === word.toLowerCase()),
    );
    return entry ? (index === 'fa' ? entry[0] : entry[1][index]) : word;
  };
  const fallback = {
    en,
    fa:
      knownEntry?.[0] ||
      words
        .map((word) => reverse(word, 'fa'))
        .join(' ')
        .replace(/ي/g, 'ی')
        .replace(/ك/g, 'ک'),
    ar:
      known?.[1] ||
      (/[\p{Script=Arabic}]/u.test(source)
        ? arabic
        : words.map((word) => reverse(word, 1)).join(' ')),
    tr:
      known?.[2] ||
      (/[\p{Script=Arabic}]/u.test(source) ? en : words.map((word) => reverse(word, 2)).join(' ')),
  };
  for (const code of ['en', 'fa', 'ar', 'tr']) if (!result[code]) result[code] = fallback[code];
  // Repair only mechanically broken legacy Latin forms; an explicit new spelling always wins.
  if (
    (!map.en || (typeof value === 'string' && value === previous.en)) &&
    legacyPersonSpelling(source, result.en)
  )
    result.en = en;
  if (!map.tr && legacyPersonSpelling(source, result.tr)) result.tr = known?.[2] || en;

  return result;
}

export function legacyPersonSpelling(source, spelling) {
  if (
    typeof source !== 'string' ||
    typeof spelling !== 'string' ||
    !/[\p{Script=Arabic}]/u.test(source)
  )
    return false;
  const words = source
    .normalize('NFKC')
    .replace(/[\u064B-\u065F\u0670ـ]/g, '')
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .split(/[\s‌-]+/)
    .filter(Boolean);
  const latinWords = spelling.trim().split(/[\s-]+/);
  if (words.length !== latinWords.length) return false;
  let broken = false;
  for (let index = 0; index < words.length; index++) {
    const word = words[index],
      supplied = latinWords[index].toLowerCase();
    const expected = common[word]?.[0]?.toLowerCase();
    if (!expected) {
      if (supplied !== latin(word).toLowerCase()) return false;
      continue;
    }
    if (supplied === expected) continue;
    const raw = [...word]
      .map((char) => letters[char] ?? char)
      .join('')
      .toLowerCase();
    const consonants = expected.replace(/[aeiou]/g, '');
    const recognized = { سعادت: ['sat', 'saadt', 'sadt'], سرشت: ['srsht', 'srshth'] }[word] || [];
    if (supplied !== raw && supplied !== consonants && !recognized.includes(supplied)) return false;
    broken = true;
  }
  return broken;
}
