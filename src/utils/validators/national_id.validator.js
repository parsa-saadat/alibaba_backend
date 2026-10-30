export const nationalIDValidator = (nationalID) => {
  const nationalIDRegex = /^\d{10}$/;
  return nationalIDRegex.test(String(nationalID));
};