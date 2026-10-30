export const cardNumberValidator = (cardNumber) => {
  const cardNumberRegex = /^\d{16}$/;
  return cardNumberRegex.test(String(cardNumber));
};