export const validateIRPostalCode = (postalCode) => {
  return /^[1-9]\d{9}$/.test(postalCode);
};
