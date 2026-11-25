export async function resolve(specifier, context, next) {
  const r = await next(specifier, context);
  if (r.url.endsWith('/src/config/mongodb.config.js'))
    return { url: new URL('./review-db.mjs', import.meta.url).href, shortCircuit: true };
  return r;
}
