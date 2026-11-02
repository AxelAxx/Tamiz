# T-010-03 — Citara example run on the full stack

| Field | Value |
|---|---|
| Task | `T-010-03` (see `docs/tasks/BACKLOG.md`) |
| Feature | `010-citara-integration` |
| Spec | `specs/010-citara-integration/spec.md` (US5; `tasks.md` T021) |
| Branch / PR | `T-010-03-citara-compose-run` / PR linked from the merge commit |
| Date | 2026-11-02 |
| Session | Claude Code (Opus 5.5) |
| Status | done |

## What was done

`quickstart.md` section 3 was run against `docker compose up` (`T-OPS-01`):
- a `citara` client key, stored hashed in the database with `api-key:add`;
- the `ops` admin key from `pnpm compose:env`;
- the example client, `examples/citara-client`.

The DNI prompt was answered by `ollama-llama` (the real `llama3.1:8b`). The example's
audit check found the entry with `clientId: "citara"`. Every item of `tasks.md` for
feature 010 is now ticked.

**The run found a bug in the example.** The audit check's deadline
(`TAMIZ_AUDIT_WAIT_MS`, 5 s by default) was counted from just before the request, not
from the start of the check. Against the E2E harness, answers take milliseconds, so it
never showed. With a real local model the answer took about 11 s, so the deadline had
passed before the first poll. The example read the audit window once, right after the
answer, before the gateway's asynchronous batched writer had stored the entry. It
reported `audit_error: not_found` and exited 1, although the entry existed (confirmed
with `GET /v1/admin/audit`).

The deadline now starts with the check (`examples/citara-client/src/audit-check.ts`). A
new unit test covers a 12 s answer: the entry appears on the second poll and is found. It
fails before the fix and passes after it.

## The recorded run

Keys redacted. `pnpm compose:env` had already run, and the stack was up and healthy on
`policies/local-only.yaml`.

```bash
DATABASE_URL=postgres://tamiz:tamiz@localhost:5432/tamiz \
pnpm --filter @tamiz/gateway api-key:add citara
# key: tmz_<citara key>
# role: client
pnpm --filter @tamiz/example-citara-client build
TAMIZ_BASE_URL=http://localhost:3000/v1 TAMIZ_API_KEY=tmz_<citara key> TAMIZ_ADMIN_KEY=tmz_<ops key> \
pnpm --filter @tamiz/example-citara-client start -- "Summarise the case of the customer with DNI 12345678Z"
```

Exit code 0, 12.0 s:

```text
status: 200
request_id: e15ff3a1-747a-49a3-8f22-d601c3909005
route: ollama-llama
rule: default
sensitivity: critical
privacy: restrict_to_local
attempts: 1
model: llama3.1:8b
finish_reason: stop
usage: {"prompt_tokens":26,"completion_tokens":114,"total_tokens":140,"cost_usd":0,"estimated":false}
audit: {"id":"6f5c2085-53a0-43aa-8fa4-f59d960a2ecc","requestId":"e15ff3a1-747a-49a3-8f22-d601c3909005","clientId":"citara","startedAt":"2026-11-02T14:15:29.200Z","endedAt":"2026-11-02T14:15:40.209Z","latencyMs":11009,"requestHash":"294cae7ea88571c8b973f46a65c81c8f5504941560e87f1ebc3955e90c7c60a7","policyId":"local-only","policyVersion":3,"ruleId":"default","taskType":"summarize","size":"short","sensitivity":"critical","entities":{"DNI":1},"privacyAction":"restrict_to_local","outcome":"answered","streamed":false,"target":{"id":"ollama-llama","provider":"ollama","model":"llama3.1:8b","residency":"local"},"abandoned":[],"usage":{"inputTokens":26,"outputTokens":114,"estimated":false},"costUsd":0}

I'm a large language model, I don't have any prior information about a specific customer
with the DNI (Documentos Nacionales de Identidad, the official ID card in Argentina)
number 12345678Z. […]
```

(The model's answer is shortened here. Like `llama3.1:8b` itself, it is wrong about
which country the DNI belongs to; what matters is that the answer came from the local
model.)

The audit entry holds kinds, counts, route and cost, but no text: the prompt's DNI
appears only as `"entities":{"DNI":1}`.

## Files touched

- `examples/citara-client/src/audit-check.ts` (deadline from the start of the check).
- `examples/citara-client/test/unit/audit-check.test.ts` (slow-answer case).
- `specs/010-citara-integration/quickstart.md` section 3 (matches the compose stack),
  `specs/010-citara-integration/tasks.md` (T021 ticked), `docs/tasks/BACKLOG.md`.

## Decisions

- **The `ops` admin key from `pnpm compose:env` was used** instead of a second `ops` key
  from `api-key:add ops --admin`, which the old quickstart asked for. The compose stack
  already has one, and two keys for the same client id would only confuse the audit. The
  quickstart now says so.
- **The fix belongs in this task.** US5's purpose is to show the example works against
  the real stack, and it did not. The change is two lines plus a test, inside the
  example. Nothing in the gateway changed: an audit entry written shortly after the
  answer is its documented behaviour (spec 006, asynchronous batched writer).
- **The default wait stays at 5 s.** Counted from the end of the answer, it covers the
  writer's batching with room to spare. The entry was found on the first polls.

## How it was verified

- Before the fix: `audit_error: not_found`, exit 1, twice (requests `12b096fe…` and
  `c48b6923…`). `GET /v1/admin/audit` listed both entries with `clientId: citara`.
- The new unit test fails without the fix and passes with it. The example's unit tests:
  51 passed.
- After the fix and `build`: the run above, exit 0, audit found.
- `pnpm lint`, `typecheck`, `test`: see the PR checks.

## Pending / follow-ups

- None.

## Pitfalls for the next session

- **`pnpm --filter @tamiz/example-citara-client start` runs `dist/`.** Rebuild after
  changing `src/`, or you test the old code. The first rerun after the fix did exactly
  that.
- **E2E harnesses with instant providers hide timing bugs.** Anything measured from
  "before the request" behaves differently against a real model that takes seconds.

## Links

- Spec / plan / tasks: `specs/010-citara-integration/`
- Related task records: `docs/tasks/done/T-010-02-citara-guide-and-client.md`,
  `docs/tasks/done/T-OPS-01-full-compose.md`
