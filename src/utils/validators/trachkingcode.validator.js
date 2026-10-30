export function trackingCodeValidator(code) {
  const c = code?.trim()?.toUpperCase();

  const postRegex   = /^[A-Z]{2}\d{9}IR$/;

  const tipaxRegex = /^MTPX\d{11,21}$/;

  return postRegex.test(c) || tipaxRegex.test(c);
}