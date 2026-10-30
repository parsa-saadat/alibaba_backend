export const HexColorValidator = (color) => {
  const hexColorRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
  return hexColorRegex.test(color);
};

export const RGBColorValidator = (color) => {
  const rgbColorRegex = /^rgb\((\d{1,3}),\s*(\d{1,3}),\s*(\d{1,3})\)$/;
  return rgbColorRegex.test(color);
};
