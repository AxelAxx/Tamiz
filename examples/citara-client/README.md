# examples/citara-client

A minimal client (`@tamiz/example-citara-client`, private) that calls Tamiz the way Citara
would: the official `openai` library, unmodified, with only the base URL and the key pointed
at Tamiz. It reports Tamiz's routing and privacy headers, follows the retry rule of the
guide (SDK retries off, one retry for "later" errors after `retry-after`) and, with an admin
key, finds its own audit entry by request id. Variables, output and exit codes are in
[`docs/integrations/citara.md`](../../docs/integrations/citara.md#example-client-configuration);
the specification is `specs/010-citara-integration/`.

```bash
pnpm --filter @tamiz/example-citara-client build
TAMIZ_BASE_URL=http://localhost:3000/v1 TAMIZ_API_KEY=<client key> \
pnpm --filter @tamiz/example-citara-client start -- "Hello"
```

Modules: `config.ts` (environment, validated), `classify.ts` (error type → what to do),
`run-example.ts` (the request and the retry rule), `audit-check.ts` (admin audit lookup),
`report.ts` (output, never a key), `main.ts` (wiring).

Tests (`pnpm --filter @tamiz/example-citara-client test`) start the gateway's E2E harness
(`apps/gateway/scripts/e2e-gateway.ts`) with `TAMIZ_E2E_PROVIDERS=scripted` on free ports:
unit tests use a fake `fetch`; `test/e2e/` covers spec 010 US1-US3 over real HTTP; and
`test/guide.test.ts` checks the guide's tables against the gateway (US4).
