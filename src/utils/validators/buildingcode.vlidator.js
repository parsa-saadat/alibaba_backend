export const validateIRBuildingCode = (code) => {
  if (!/^\d{10}$/.test(code)) {
    return false; // Must be exactly 10 digits
  }

  let digits = code.split('').map(Number);
  let sum = 0;
  let coefficient = 2;

  for (let i = 0; i < 9; i++) {
    sum += digits[i] * coefficient;
    coefficient++;
  }

  let remainder = sum % 11;
  let controlDigit = remainder < 2 ? remainder : 11 - remainder;

  return controlDigit === digits[9];
};
