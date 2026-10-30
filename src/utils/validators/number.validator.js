export const validateNumber = (number, options) => {
  number = Number(number);
  if (isNaN(number)) return false;
  if (options.min && number < options.min) return false;
  if (options.max && number > options.max) return false;
  return true;
};
