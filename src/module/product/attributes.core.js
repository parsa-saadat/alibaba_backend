export function validateAttributes(value = []) {
  if (!Array.isArray(value) || value.length > 8)
    throw new Error('Key attributes must contain at most 8 rows', { cause: { code: 400 } });
  return value.map((row) => {
    if (
      !row ||
      typeof row.name !== 'string' ||
      typeof row.value !== 'string' ||
      !row.name.trim() ||
      !row.value.trim() ||
      row.name.length > 80 ||
      row.value.length > 500
    )
      throw new Error('Each attribute needs a name (1–80) and value (1–500)', {
        cause: { code: 400 },
      });
    return { name: row.name.trim(), value: row.value.trim() };
  });
}
