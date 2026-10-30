export const shebaNumberValidator = (shebaNumber) => {
  const shebaRegex = /^IR\d{24}$/i;
  return shebaRegex.test(String(shebaNumber));
};