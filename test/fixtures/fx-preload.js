// Loaded only by integration-check.js in its child test process. Never imported by app code.
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, options) => {
  const url = new URL(String(input));
  if (url.hostname === 'api.navasan.tech' && process.env.INTEGRATION_FIXTURE === '1') {
    const timestamp = Math.floor(Date.now() / 1000);
    return new Response(
      JSON.stringify(
        Object.fromEntries(
          Object.entries({ usd_sell: 100000, try: 2500, eur: 110000, aed_sell: 27000 }).map(
            ([key, value]) => [key, { value: String(value), timestamp }],
          ),
        ),
      ),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }
  if (url.hostname === 'clients5.google.com' && process.env.LIVE_TRANSLATION !== '1')
    return new Response(
      JSON.stringify(
        url.searchParams.getAll('q').map((text) => `${url.searchParams.get('tl')} ${text}`),
      ),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  return originalFetch(input, options);
};
