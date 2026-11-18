export function orderItemSnapshot(
  product,
  { sourcePrice, lockedPrice, discountPercentage, discountAmount, quantity },
) {
  return {
    product_id: product._id,
    name: product.name,
    translations: structuredClone(product.translations || {}),
    source_price: structuredClone(sourcePrice),
    fx_snapshot: structuredClone(lockedPrice.quote),
    brand: product.brand,
    images_id: [...(product.images_id || [])],
    price: { currency: 'IRR', amount: lockedPrice.amount },
    discount: { percentage: discountPercentage, amount: discountAmount },
    quantity,
  };
}
