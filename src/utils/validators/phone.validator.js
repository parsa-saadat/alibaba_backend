export const validateIRPhoneSyntax = (phone) => {
  const regex = /^(\+98|0)?9\d{9}$/;
  return regex.test(phone);
};
