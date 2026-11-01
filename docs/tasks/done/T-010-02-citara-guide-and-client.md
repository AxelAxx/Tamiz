# T-010-02 — Integration guide and example client

| Field | Value |
|---|---|
| Task | `T-010-02` (see `docs/tasks/BACKLOG.md`) |
| Feature | `010-citara-integration` (optional) |
| Spec | `specs/010-citara-integration/spec.md` (US1-US4, FR-001 … FR-015); `tasks.md` T001-T020; `research.md` R-02 … R-09 |
| Branch / PR | `T-010-02-citara-guide-and-client` / PR opened after this commit |
| Date | 2026-11-01 |
| Session | Claude Code (Claude Opus 5.5), side session (merge authority delegated by the parent session) |
| Status | done (US5, the recorded compose run, is `T-010-03` and waits for `T-OPS-01`) |

## What was done

Citara (or any OpenAI-compatible application) now has a guide and a tested example.

- **Guide** `docs/integrations/citara.md`: quick start, keys, base URL for same-network and
  remote/TLS, model aliases, response headers, errors with retry guidance, timeouts and
  retries, streaming, tool calling, what Tamiz stores, limitations, the example's
  configuration, and a `curl` example. Four tables carry `<!-- table:* -->` markers and are
  checked by tests (FR-002 … FR-007, FR-014).
- **Example** `examples/citara-client/` (`@tamiz/example-citara-client`, private): the official
  `openai` 7.47.0 library with only `baseURL` and `apiKey` pointed at Tamiz, `maxRetries: 0`,
  a 70 s timeout, one retry for "later" errors after `retry-after` (≤ 30 s), every Tamiz
  header reported verbatim, and an optional audit check that finds its entry by request id
  through the admin audit API (FR-008 … FR-012).
- **E2E harness** `apps/gateway/scripts/e2e-gateway.ts`: `TAMIZ_E2E_PROVIDERS=scripted` makes
  every target echo the last user message as received (two deltas when streamed);
  `GET /__e2e/provider-calls` and `POST /__e2e/provider-script` record calls and make one
  target fail; client `citara` is always registered. The default (`none`) keeps the throwing
  providers the dashboard tests expect (FR-013).
- **Tests**: one per scenario of US1-US4 over real HTTP against the harness (16 end to end + 4
  documentation tests, 69 tests in the package) and unit tests with a fake `fetch` (config, classification, report,
  retry rule, audit check).

## Files touched

- `docs/integrations/{citara,README}.md` — the guide (new folder).
- `examples/README.md`, `examples/citara-client/**` — the example package, its tests and README.
- `apps/gateway/scripts/e2e-gateway.ts` — scripted providers, provider calls and script, `citara` key.
- `pnpm-workspace.yaml`, `vitest.config.ts` — `examples/*` as workspace packages; Vitest projects `examples/*/vitest.config.ts` (a bare `examples/*` glob also matches `examples/README.md` and Vitest refuses to start); coverage includes `examples/*/src`.
- `pnpm-lock.yaml` — `openai` 7.47.0.
- `CLAUDE.md` §6 and §12 — layout and commands.
- `specs/010-citara-integration/tasks.md` — T001-T020 ticked.
- `docs/tasks/BACKLOG.md` — `T-010-02` row set to `done`.

## Decisions

- **One harness for the whole suite**, started in a Vitest `globalSetup` on free ports with
  `node --import tsx` (cwd `apps/gateway`), not `pnpm`, so it can be killed cleanly on Windows.
  Files run one after another (`fileParallelism: false`) because each test resets the harness.
- **US2-5 is deterministic** by injecting a `sleep` that returns at once: the second attempt
  meets the still-open circuit, so the final report shows the 503 with `retry_after: 1`.
- **US3-4 uses a request refused at authentication**: it returns a request id but is never
  audited, so the check polls the whole wait and reports `not_found`, with no timing race.
- **`not_found` (404) is classed `fix_request`**; the data model did not list it (the chat
  endpoint never answers it), but `ERROR_CLASSES` covers every contract type so a new type
  fails typecheck.
- **The error table is derived, not hard-coded, in the test**: types whose status is a
  documented response of `POST /v1/chat/completions` in `/openapi.json`, plus `internal` (500).
  `rate_limited` (429) is therefore not in the guide's table, though the example still treats it
  as "later".
- **The report guard only checks keys**, not the prompt: a short prompt such as `hi` would match
  `sensitivity: high`. The prompt is never a report field; US3-3 checks a marker stays out.
- **A leading `--` CLI argument is skipped**, since `pnpm start -- "<prompt>"` may pass it on.
- **No gateway production code changed** (FR-015): `git diff origin/main -- apps/gateway/src
  apps/gateway/policies packages services` is empty.

## How it was verified

```bash
pnpm lint            # Checked 426 files. No fixes applied. (0 errors; 2 warnings, 90 infos pre-existing)
pnpm typecheck       # Tasks: 10 successful, 10 total
pnpm arch            # no dependency violations found (149 modules, 521 dependencies cruised)
pnpm test --coverage # Test Files 130 passed (130); Tests 1345 passed | 28 skipped; Type Errors no errors
pnpm build           # Tasks: 7 successful, 7 total
pnpm --filter @tamiz/dashboard e2e   # 6 passed: the default harness is unchanged for the dashboard
git diff --stat origin/main -- apps/gateway/src apps/gateway/policies packages services   # empty (FR-015)
```

The example package alone: 9 files, 69 tests (5 unit files, US1 6, US2 5, US3 5, guide 4).

`quickstart.md` section 2 by hand: harness with scripted providers on ports 3310/3311, the
built example (`node dist/main.js` through `pnpm start`), fixture keys (not shown):

```text
$ start -- "Summarise the case of the customer with DNI 12345678Z"   (with TAMIZ_ADMIN_KEY)
status: 200
request_id: f862744d-5f14-4ae2-89f2-95cc955ea3f3
route: ollama-llama
rule: cheap-short-tasks
sensitivity: critical
privacy: restrict_to_local
attempts: 1
model: llama3.1:8b
finish_reason: stop
usage: {"prompt_tokens":10,"completion_tokens":5,"total_tokens":15,"cost_usd":0,"estimated":false}
audit: {"id":"1c001015-…","requestId":"f862744d-5f14-4ae2-89f2-95cc955ea3f3","clientId":"citara",…,"ruleId":"cheap-short-tasks","taskType":"summarize","size":"short","sensitivity":"critical","entities":{"DNI":1},"privacyAction":"restrict_to_local","outcome":"answered",…,"target":{"id":"ollama-llama",…}}

echo: Summarise the case of the customer with DNI 12345678Z
exit 0

$ TAMIZ_MODEL=tamiz-frontier start -- "Call Ana García back"
status: 451 · rule: pinned-frontier · sensitivity: high · privacy: block
error_type: policy_blocked · retryable: false · attempts: 1

$ TAMIZ_STREAM=true start -- "Call Ana García back on 612345678"
status: 200 · route: mistral-small · rule: default · privacy: anonymize;notice=v1
echo: Call Ana García back on 612345678        (restored by the gateway)

$ wrong key → status: 401 · error_type: unauthorized · attempts: 1 · exit 1 (key not printed)
$ TAMIZ_TIMEOUT_MS=5 → "invalid configuration: TAMIZ_TIMEOUT_MS" · exit 2
```

Not verified here: a real model behind the gateway (that is `T-010-03`, on the compose stack).

## Pending / follow-ups

- `T-010-03`: the recorded run against `docker compose` (needs `T-OPS-01`).
- The chat route's OpenAPI description of `x-tamiz-privacy` omits `block` and
  `anonymize;notice=v2`; the guide lists them. A one-line description fix in the gateway is out
  of this task's scope (FR-015); not added as a row (cosmetic).

## Pitfalls for the next session

- `examples/*` is a workspace and Vitest root project now; a new example gets lint, typecheck,
  test and build for free, and its tests may use the harness the same way.
- The harness answers with **what the provider received**: after anonymization that is
  placeholders, and the gateway restores them in the echo, so the client sees the originals.
- `x-tamiz-sensitivity` is `unknown` when the detector is down; the default policy then routes to
  the local target with privacy `restrict_to_local`.
- The OpenAI SDK reads `x-request-id` into `request_id`, which is Tamiz's id; its `APIError.type`
  is Tamiz's error type.

## Links

- Spec / plan / tasks: `specs/010-citara-integration/`
- Guide: `docs/integrations/citara.md`
- ADRs: none added
- Related task records: `T-010-01-spec-plan-tasks-010.md`, `T-008-02-dashboard-skeleton.md`, `T-006-04-audit-query-api.md`, `T-002-06-chat-completions-endpoint.md`
