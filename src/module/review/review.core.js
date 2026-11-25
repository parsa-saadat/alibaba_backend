export const reviewError = (message, code = 400) => new Error(message, { cause: { code } });
export function reviewInput(data = {}) {
  if (!Number.isInteger(data.rating) || data.rating < 1 || data.rating > 5)
    throw reviewError('Rating must be an integer from 1 to 5');
  if (
    typeof data.text !== 'string' ||
    data.text.trim().length < 3 ||
    data.text.trim().length > 3000
  )
    throw reviewError('Review must contain 3 to 3000 characters');
  return { rating: data.rating, text: data.text.trim() };
}
export function reviewQuery(q = {}) {
  const page = Math.max(1, Math.min(10000, Number(q.page) || 1));
  const limit = Math.max(1, Math.min(30, Number(q.limit) || 5));
  const rating = q.rating ? Number(q.rating) : null;
  if (
    !Number.isInteger(page) ||
    !Number.isInteger(limit) ||
    (rating !== null && (!Number.isInteger(rating) || rating < 1 || rating > 5))
  )
    throw reviewError('Invalid review filter');
  return {
    page,
    limit,
    rating,
    sort: {
      newest: { created_at: -1, _id: -1 },
      highest: { rating: -1, created_at: -1, _id: -1 },
      lowest: { rating: 1, created_at: -1, _id: -1 },
    }[q.sort] || { created_at: -1, _id: -1 },
  };
}
