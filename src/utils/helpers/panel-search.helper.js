export const panelSearch = (value, search) => {
  const normalize = (text) =>
    String(text || '')
      .normalize('NFKC')
      .replace(/ي/g, 'ی')
      .replace(/ك/g, 'ک')
      .toLowerCase();
  const words = normalize(search).trim().split(/\s+/).filter(Boolean);
  const texts = [];
  const visit = (item) => {
    if (item == null) return;
    if (typeof item === 'object') {
      if (item.toHexString) texts.push(item.toHexString());
      else Object.values(item).forEach(visit);
    } else texts.push(String(item));
  };
  visit(value);
  const haystack = normalize(texts.join(' '));
  return words.every((word) => haystack.includes(word));
};
