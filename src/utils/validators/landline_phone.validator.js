export const validateIRLandlineSyntax = (phone) => {
  const cleaned = phone.replace(/[\s\-()]/g, '');

  const regex = /^(\+98|0)?\d{10}$/;
  return regex.test(cleaned);
};