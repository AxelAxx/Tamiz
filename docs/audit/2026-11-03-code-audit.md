# Code audit — 2026-11-03

A read-only review of the whole repository at `f4b8acd` (after `T-OPS-06`), done before the
project is shown publicly. Task `T-AUD-01`. The fixes are the backlog tasks `T-AUD-02` to
`T-AUD-10`.

## Method

- **Five parallel reviews, one per area**, each told to judge as a demanding senior
  reviewer and to verify every finding by reading the code:
  1. gateway domain and application;
  2. gateway infrastructure, presentation and `main.ts`;
  3. dashboard;
  4. privacy service, `packages/contracts`, `packages/test-utils`;
  5. MCP server, `packages/evals`, `examples/citara-client`.
- **A mechanical sweep** over every `src/` folder (about 27,000 lines of TypeScript and
  Python): `any`, `@ts-ignore`, `as unknown as`, `biome-ignore`, `type: ignore`, `TODO`.
- **Re-checks.** Three findings were re-checked by hand, because they change what the
  project claims publicly:
  - the IBAN regex, run against a sample;
  - the agent eval's dataset;
  - the circuit breaker's `onResult`.

  The other findings rest on each review's own reading of the code. Every fix task
  starts by reproducing its finding in a failing test.

Severity:

- **high**: a bug in a core guarantee (privacy, resilience) or a published metric that
  overstates.
- **medium**: wrong behaviour in a real but less central path, or a clear maintainability
  problem.
- **low**: polish.

## Verdict

The code is well above typical portfolio quality.

- **Rules are kept.** The project's own rules hold almost everywhere:
  - no `any` and no `@ts-ignore` anywhere;
  - three `as unknown as` casts in total;
  - every `biome-ignore` has its reason;
  - the gateway domain is pure (no `Date.now()`, injected jitter, property tests);
  - layering is enforced in TypeScript (dependency-cruiser) and Python (import-linter).
- **The privacy edges are strong:**
  - provider errors are reduced to fixed, content-free messages;
  - keys are hashed and compared in constant time;
  - env and boot errors name variables, never values;
  - every gateway answer is validated against `@tamiz/contracts`;
  - the privacy service's logs are allow-listed, and tests assert that secrets are absent
    from responses and logs.
- **The dashboard's security core is strong:**
  - the admin key never reaches the browser, and a Playwright spec checks it;
  - sessions are HMAC-signed cookies and the passphrase uses scrypt;
  - writes are refused by origin, then session, then role, before any body is read.

The audit found no privacy leak through logs, traces or the database. Its real findings:

1. **Two published claims are weaker than they look.**
   - *Agent eval:* an agent that always names the frontier model scores the published
     62.5 %.
   - *PII detection:* the recall gate is measured on a corpus written in exactly the formats
     the recognizers match. Three common real-world formats are missed, one of them an
     IBAN (critical).
2. **The circuit breaker, the part the project calls its core, has two correctness bugs.**
   Both come from streams and from concurrent requests. The tests miss them because they
   drive one request and one failure at a time.
3. **Operational gaps:**
   - shutdown can lose audit entries;
   - `/health` never reports degradation;
   - a second gateway never sees a policy saved on the first.

Readability problems are minor: some duplication, a long `main.ts`, a 647-line editor
component.

## High

| # | Where | Finding | Fix task |
|---|---|---|---|
| H1 | `services/privacy/src/privacy/infrastructure/recognizers/banking.py:15` | **The IBAN regex swallows a number that follows the IBAN.** `ES91 2100 0418 4502 0005 1332 300 euros` yields the candidate `ES91 … 1332 300`, which fails the checksum. Presidio does not retry a shorter match, so the IBAN goes undetected and reaches a non-EU provider. Re-checked by hand. | T-AUD-02 |
| H2 | `packages/evals/src/evals/agent.ts:25,109-117`, `apps/mcp-server/src/agent/observation.ts:30-34`, `packages/evals/datasets/agent-spend.v1.jsonl` | **The agent eval can be passed without finding the cause.** The fixture's baseline target is `anthropic-sonnet`, and every observation names it. `firstRouteIn` takes the first route the answer mentions. 5 of the 8 cases expect `anthropic-sonnet`. An agent that always names sonnet and copies the two totals scores 5/8 = 62.5 %, above the 60 % gate and equal to the published figure. Re-checked by hand. | T-AUD-03 |
| H3 | `apps/gateway/src/application/resilience/execute-chain.ts:231`, `use-cases/stream-inference.ts:191-197` | **A provider that always fails mid-stream never opens its circuit.** The first token records a success, which resets the consecutive-failure count. The mid-stream failure then brings it back to 1 only. This contradicts FR-024. | T-AUD-04 |
| H4 | `apps/gateway/src/application/resilience/circuit-breaker.ts:104-121` | **`onResult` applies a late outcome without re-reading the state.** A request admitted while the circuit was closed can close it after another request opened it, with no `circuit.changed` event. Late failures extend the cool-down and emit spurious transitions. Retries in `execute-chain.ts:183-234` keep calling a target whose circuit the same request just opened. Re-checked by hand. | T-AUD-04 |

## Medium

| # | Where | Finding | Fix task |
|---|---|---|---|
| M1 | `services/privacy/.../recognizers/phone.py:17-22` | Spanish landlines written 2-3-2-2 (`91 123 45 67`) are not found, and `Tel.612345678` is rejected by the lookbehind. | T-AUD-02 |
| M2 | `services/privacy/.../recognizers/identity.py:17` | A DNI without its leading zero (`1234567L`) or with spaces (`12 345 678 Z`) is not found. | T-AUD-02 |
| M3 | `services/privacy/scripts/generate_corpus.py:73-130` | The corpus only uses the formats the regexes support, so the recall ≥ 0.95 gate cannot reveal M1, M2 or H1. | T-AUD-02 |
| M4 | `apps/gateway/src/application/resilience/execute-chain.ts:246-261` | An exhausted chain reports the last target in the chain, which may have been skipped, with the error of an earlier target. | T-AUD-04 |
| M5 | `apps/gateway/src/application/audit/aggregates.ts:124-128` | Provider health counts `circuit_open` skips as requests and errors, so a skipped provider looks sick. | T-AUD-04 |
| M6 | `apps/gateway/src/infrastructure/llm/ai-sdk-provider.ts:431-437`, `presentation/routes/chat-completions.ts:168` | A tool call to an unknown tool (`invalid: true` in AI SDK 6) reaches presentation, whose contract parse throws. Non-streamed, the client gets a 500 after the request was audited as answered. Streamed, `streamSSE` has no `onError`: the stream ends truncated and the error goes to `console.error`. | T-AUD-05 |
| M7 | `apps/gateway/src/application/use-cases/stream-inference.ts:117-173` | A provider stream that ends without `finish` or `error` drops held text and sends the client no final part. | T-AUD-05 |
| M8 | `apps/gateway/src/application/use-cases/protect-request.ts:105-109` | The `unsafe` flag of `anonymizeTexts` is ignored in production. Safety relies on a separate pre-check that differs slightly (overlaps). It should fail closed. | T-AUD-05 |
| M9 | `apps/gateway/src/application/use-cases/route-inference.ts:107-109` | Non-streamed requests take no `AbortSignal`: a client that disconnects keeps retries and fallbacks running for up to the deadline. | T-AUD-05 |
| M10 | `apps/gateway/src/main.ts:272-279`, `infrastructure/persistence/async-writer.ts:95-106` | Shutdown does not wait for `server.close`. Entries appended after the final flush are lost with no `audit.dropped` event. | T-AUD-06 |
| M11 | `apps/gateway/src/infrastructure/policy/postgres-policy-repository.ts:139` | The active policy is cached and only refreshed on an admin GET. A second gateway on the same database keeps the old policy, though the header comment says otherwise. | T-AUD-06 |
| M12 | `apps/gateway/src/presentation/routes/health.ts:4-6,223-226` | `/health` always says `ok`. The `checks` and `degraded` fields of the contract are never used, so compose sees a healthy gateway while the privacy service is down. | T-AUD-06 |
| M13 | `apps/dashboard/src/features/live-traffic/use-live-traffic.ts:49-63` | Every 2 s poll reads the whole 5-minute window (up to 5 × 200 rows) to show 100. | T-AUD-07 |
| M14 | `apps/dashboard/src/features/live-traffic/model.ts:216-220` | While paused, old rows that fell out of the top 100 count as "new". | T-AUD-07 |
| M15 | `apps/dashboard/src/features/shell/app-shell.tsx:99-103` | A failed sign-out is swallowed, and the browser goes to `/sign-in` with a valid session cookie. | T-AUD-07 |
| M16 | `apps/dashboard/src/features/shell/session-expired-dialog.tsx:301-318` | An expired visitor session shows a dialog that only accepts the operator passphrase and cannot be dismissed. | T-AUD-07 |
| M17 | `apps/dashboard/src/features/policy-editor/editor/policy-editor.tsx:631` | "Reload" while the gateway is unreachable silently replaces the draft with the cached base version. | T-AUD-07 |
| M18 | `packages/evals/src/runner.ts:39-55` | After a case throws, the other pool workers keep calling the gateway and judge in the background. | T-AUD-08 |
| M19 | `packages/evals/src/clients/judge.ts:33-41` | The verdict regex stops at the first `}`. The prompt is filled with `String.replace`, so `$'` and similar sequences in an answer change it. | T-AUD-08 |
| M20 | `examples/citara-client/src/audit-check.ts:64` | A network error in the audit check crashes the example and loses the answer already received. | T-AUD-08 |
| M21 | `packages/contracts/src/audit.ts:195-229`, `admin.ts:278-299` | The audit and cost contracts use plain strings and numbers where the branded schemas exist (`RequestIdSchema`, `PolicyIdSchema`, `UsdSchema`…). `policyId: ""` validates. | T-AUD-09 |

## Low

| # | Area | Finding | Fix task |
|---|---|---|---|
| L1 | gateway | Three `as unknown as` and two other casts: `admin/audit.ts:44`, `log-routing-events.ts:56`, `chat-completions.ts:141,185`, `main.ts:216`. | T-AUD-10 |
| L2 | gateway | `main.ts` is 282 lines of top-level statements mixing six concerns. | T-AUD-10 |
| L3 | gateway | The route and stream use cases build provider input twice, and `with-tracing.ts` duplicates its failure span. | T-AUD-10 |
| L4 | gateway | The `Usd` brand is dropped at the audit boundary. Validated values are re-branded with bare casts in `routing-policy.ts`. "input + output price" is written four times. | T-AUD-10 |
| L5 | gateway | Dead or duplicate code: `anonymizeMessages`, a re-implemented `entityCounts`, and `verifyApiKey` (test-only, still in the infrastructure README). | T-AUD-10 |
| L6 | gateway | The audit baseline is read from the policy active at write time, not the policy that decided (`with-audit.ts:108-109`). | T-AUD-10 |
| L7 | gateway | The request log line of a stream is written when the headers go out, so `durationMs` is the time to first token (`app.ts:116-136`). | T-AUD-10 |
| L8 | gateway | `OTEL_*` variables are read from raw `process.env`, outside `EnvSchema` (`main.ts:94`). | T-AUD-10 |
| L9 | gateway | An already-aborted signal is not checked before the privacy call (`inspect-sensitivity.ts:57-58`). | T-AUD-05 |
| L10 | gateway | Operations gaps:<ul><li>a failed audit batch is retried once, then dropped (`async-writer.ts:62-73`);</li><li>the privacy client leaves non-OK bodies unread (`http-pii-detector.ts:63-64`);</li><li>unknown keys always hit Postgres, and a lookup error answers 500 (`api-keys.ts:178-185`);</li><li>there is no `api-key:revoke` script.</li></ul> | T-AUD-06 |
| L11 | dashboard | Live traffic's timers are fragile:<ul><li>the highlight timer is cleared on every merge, so ids stay highlighted;</li><li>the backoff starts at 4 s, not 2 s.</li></ul> | T-AUD-07 |
| L12 | dashboard | Gaps in the dashboard's security handling:<ul><li>`X-Forwarded-For` is read from the left (`session.ts:159-163`);</li><li>there are no security headers (CSP, `frame-ancestors`);</li><li>no test checks the cookie flags;</li><li>`GET /api/session` defaults to `operator`.</li></ul> | T-AUD-07 |
| L13 | dashboard | Smaller dashboard defects:<ul><li>a failed session query leaves the policy screen on a skeleton;</li><li>the cost empty-state text prints the exclusive end date;</li><li>the audit filter's sensitivity list is hand-written.</li></ul> | T-AUD-07 |
| L14 | dashboard | Duplicated helpers (`CARD` ×7, `useNow` ×3, two range popovers), and a 647-line `policy-editor.tsx`. | T-AUD-10 |
| L15 | evals / MCP | Cost and baseline handling:<ul><li>the cost eval hard-codes its policy (its comment says otherwise) and prices unknown targets at $0 silently;</li><li>the quality baseline JSON is cast, not validated.</li></ul> | T-AUD-08 |
| L16 | evals / MCP | Agent behaviour:<ul><li>every agent error that is not an API error is reported as `gateway_unreachable`;</li><li>an empty native reply counts as answered;</li><li>the text and native loops are duplicated, and `PROMPT_VERSION` is stale.</li></ul> | T-AUD-08 |
| L17 | evals | Dataset checks and tests:<ul><li>`checkOffsets` parses every case against unrelated schemas;</li><li>the leak eval's `detector_failed` path, the agent `observe` mapping and a mid-run pool throw have no tests.</li></ul> | T-AUD-08 |
| L18 | contracts | Schema gaps:<ul><li>the sensitivity enum is written three times, and the two `blockReason` lists already differ;</li><li>the chat request and MCP `messages` have no size bounds;</li><li>`from < to` is checked in a route, not in `CostQuerySchema`;</li><li>the audit `route` and `rule` filters are unbounded.</li></ul> | T-AUD-09 |
| L19 | privacy | An `extra_forbidden` 400 echoes the caller's key name (`api/errors.py:43-47`). | T-AUD-09 |
| L20 | gateway | Placeholders the model altered (`<dni_1>`, `DNI_1`) are shown as they are. This fails safe, but looks unfinished. | T-AUD-05 |
| L21 | example / test-utils | The Citara example copies `AUDIT_PAGE_MAX` as `200`. The test-utils request builder cannot omit `temperature` or `max_tokens`. | T-AUD-08, T-AUD-09 |

## Order of the fixes

1. **`T-AUD-02` (privacy recognizers) and `T-AUD-03` (agent eval) first.** They make the
   published numbers honest. Both may lower a metric. The README then shows the new
   figures, whatever they are.
2. **`T-AUD-04` (circuit breaker).** The core of the project.
3. **`T-AUD-05` and `T-AUD-06`.** Gateway robustness and operations.
4. **`T-AUD-07`, `T-AUD-08` and `T-AUD-09`.** Dashboard, evals and contracts.
5. **`T-AUD-10` last.** Readability refactors, once the behaviour is fixed and tested.
