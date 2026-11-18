import '../src/config/environment.js';
import { getRates, convert } from '../src/module/fx/fx.service.js';
try {
  const q = await getRates();
  console.log(
    JSON.stringify(
      {
        ok: true,
        provider: q.provider,
        fetched_at: new Date(q.fetched_at).toISOString(),
        source_times: Object.fromEntries(
          Object.entries(q.timestamps).map(([k, v]) => [k, new Date(v).toISOString()]),
        ),
        one_USD: {
          IRT: convert(1, 'USD', 'IRT', q),
          TRY: convert(1, 'USD', 'TRY', q),
          AED: convert(1, 'USD', 'AED', q),
        },
      },
      null,
      2,
    ),
  );
} catch {
  console.error(
    'FX_UNAVAILABLE: Check server internet/DNS/TLS and access to https://call1.tgju.org/ajax.json. FX_PROVIDER=auto works without a key. Do not disable TLS verification.',
  );
  process.exitCode = 1;
}
