export const generateCode = (length = 8) => {
  const chars = '0123456789abcdef';
  let code = '';

  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * chars.length);
    code += chars[randomIndex];
  }

  return code;
};
