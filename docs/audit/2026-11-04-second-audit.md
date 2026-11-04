# Second audit — 2026-11-04

This audit checks the fixes of the first one (`docs/audit/2026-11-03-code-audit.md`) and
looks again with fresh eyes before the project is shown publicly. It is task `T-AUD-11`.
It reviewed the state after every first-audit task, `T-AUD-02` to `T-AUD-10`. The fixes
are the backlog tasks `T-AUD-12` to `T-AUD-17`.

## Method

Five read-only reviews ran in parallel:

1. **Gateway**, with fresh eyes: the reviewer was not given the first audit.
2. **Dashboard**, with fresh eyes.
3. **Privacy service, contracts and test-utils**, with fresh eyes. This reviewer ran the
   real Presidio recognizers against hand-written Spanish layouts.
4. **An outside engineer's first look.** It checked every README claim against the code,
   the configs and CI, followed the quick start and Codespaces on paper, read the files a
   reviewer opens first, and checked repository hygiene.
5. **Verification of the first audit.** It checked every one of the 46 findings against the
   code and named the test that covers each.

The one high finding of the privacy review was reproduced by hand and fixed at once in
`#93` (P1). Every other finding rests on its reviewer's reading of the code, and each fix
task starts with a failing test.

## Verdict

**The first audit's fixes are real.**

- 38 of the 46 findings are fixed, most with a named test.
- 6 are partly fixed.
- 2 were deferred on purpose: branded DTO types (M21) and a tolerant placeholder restore
  (L20).
- The partly fixed ones that matter are the README evals table, which was never
  regenerated (H2, M3), and the live-traffic backoff, which still starts at 4 s instead
  of 2 s (L11).
- Two task records claim otherwise: `T-AUD-03` for the README and `T-AUD-07` for the
  backoff. Both are corrected by the fix tasks.

**All four fresh reviews give the same verdict.** A demanding senior engineer would pass
the code, with change requests:

- **They praise:** the hand-built resilience layer, the pure routing domain with property
  tests, privacy that fails closed, content-free logs and errors, the BFF and session
  design, and pinned CI.
- **They criticise first:**
  - a client that disconnects is treated as a provider failure;
  - recognizers miss Spanish layouts as people paste them, and the corpus is built from
    the same assumptions;
  - two README claims and the host-run developer path are not true as written.

**One regression of the first audit's fixes was found and fixed.** The NIE guard added in
`T-AUD-02` dropped every DNI that comes right after the Spanish word *y* (P1, `#93`).

## High

| # | Where | Finding | Fix task |
|---|---|---|---|
| P1 | `services/privacy/.../recognizers/identity.py:20` | **A DNI right after "y" was not found.** The NIE guard `(?<![XYZ] )` is case-insensitive under Presidio, so it blocked `Juan y 12345678Z`. This was a regression of `T-AUD-02`. | fixed in `#93` |
| G1 | `apps/gateway/src/application/resilience/circuit-breaker.ts:65-66` | **A client that disconnects during a half-open trial reopens the circuit.** `aborted` is counted as a failed trial, but at that point only the client's signal produces it: the deadline shows up as `timeout`. A healthy provider stays out of rotation for another cool-down. | T-AUD-12 |
| F1 | `README.md:145-177, 207-210`, `docs/marketing/case-study.md:145-147` | **The evals table and the Limitations figures come from older datasets.** They name leak v2, detection v1 and agent v1, while the repository holds leak v3, detection v2 and agent v2. The agent's 62.5 % is the figure H2 was about. | T-AUD-17 |
| F2 | `README.md:264-268`, `docker-compose.yml:11-13, 70-91` | **The "run the gateway on the host" path cannot work.** The privacy service and Ollama publish no host port. The spec quick starts (006, 007, 008) use the same step. | T-AUD-15 |

## Medium

| # | Where | Finding | Fix task |
|---|---|---|---|
| G2 | `apps/gateway/src/domain/model/placeholders.ts:72`, `infrastructure/privacy/http-pii-detector.ts:87-106` | Overlapping findings are skipped without marking `unsafe`, and the detector does not refuse them. Part of an overlapping value would reach the provider in clear. Today only the privacy service's own overlap step prevents it. | T-AUD-12 |
| G3 | `apps/gateway/src/infrastructure/llm/ai-sdk-provider.ts:232-234, 302-304` | An undeclared tool call ends the stream without cancelling the upstream call, which keeps generating billed tokens. | T-AUD-12 |
| G4 | `apps/gateway/src/application/resilience/execute-chain.ts:250-251`, `audit/with-audit.ts:82-88`, `aggregates.ts:118-121`, `http-pii-detector.ts:166` | A non-streamed client disconnect is audited as `failed`/`provider_timeout`, counted as a provider error in health, and emitted as `privacy.detector_failed`. | T-AUD-12 |
| P2 | `services/privacy/.../recognizers/banking.py:20-26` | An IBAN in the old CCC grouping (`ES91 2100 0418 45 0200051332`), with dashes, or with double spaces is missed. | T-AUD-13 |
| P3 | `services/privacy/.../recognizers/{identity,phone,banking}.py` | Separators are ASCII-only. No-break spaces, Unicode hyphens and dashes, and `nº12345678Z` miss DNI, IBAN and phone, which is how text pasted from Word or PDFs arrives. | T-AUD-13 |
| P4 | `services/privacy/.../recognizers/phone.py:20, 24` | Two numbers joined by `/` or `-` (`612345678/612345679`) are both lost. | T-AUD-13 |
| P5 | `services/privacy/.../presidio_analyzer.py:57, 102-103` | Presidio's email validator fetches the public suffix list over the network on first use, with no timeout, inside the analyzer lock. The service meant to keep data local makes an outbound call. | T-AUD-13 |
| P6 | `services/privacy/scripts/generate_corpus.py` | The corpus copies the validators' algorithms and layouts, and its negatives avoid the known false-positive class: `Pedido 912345678` is reported as PHONE. The recall gate cannot fail on P2-P4. | T-AUD-13 |
| D1 | `apps/dashboard/src/app/api/session/route.ts:26-34`, `lib/server/passphrase.ts:25` | Concurrent sign-in attempts all pass the limiter: the failure is recorded after an `await` and a synchronous scrypt. That scrypt also blocks the event loop. | T-AUD-14 |
| D2 | `apps/dashboard/src/lib/server/session.ts:161-162` | Without `TAMIZ_DASHBOARD_TRUST_PROXY`, every client shares one bucket: five wrong passphrases from anyone lock the operator out. | T-AUD-14 |
| D4 | `apps/dashboard/src/features/policy-editor/editor/yaml-editor.tsx:136, 158, 173` | `readOnly` is read once. A visitor who signs in as operator from the expired dialog keeps a read-only editor. | T-AUD-14 |
| D5 | `apps/dashboard/src/features/policy-editor/editor/policy-editor.tsx` | The editor stays editable while a save is in flight; keystrokes typed then are lost, and issues are mapped against the newer text. | T-AUD-14 |
| F3 | `README.md:265`, `apps/gateway/package.json:14` | "Copy `.env.example`" does nothing: `dev` loads no env file. | T-AUD-15 |
| F4 | `README.md:31-32, 131`, `CLAUDE.md` §13 | "Evals block the merge" is true since 2026-11-04 (`evals` is a required check), but CLAUDE.md and the `T-007-06` record still say otherwise. | T-AUD-15 |
| F5 | `README.md:47` | The stated Compose version is too low for `env_file.format`. | T-AUD-15 |
| F6 | `docker-compose.yml:115-138` | Postgres (with a known password) and Valkey are published on every interface. | T-AUD-15 |
| F7 | `apps/mcp-server/src/config.ts:50` | The MCP server's HTTP port, 3100, is the dashboard's. | T-AUD-15 |
| F8 | `README.md:47` | "About 8 GB of disk" is understated: about 15 GB. | T-AUD-15 |

## Low

| # | Area | Finding | Fix task |
|---|---|---|---|
| G5 | gateway | A throw inside a use case leaves no audit entry. A throwing stream is recorded as `cancelled`. | T-AUD-12 |
| G6 | gateway | Leases of deferred streaming trials:<ul><li>a long stream outlives its trial lease, so a second trial is let in;</li><li>an abandoned stream settles its trial only when the lease expires.</li></ul> | T-AUD-12 |
| G-M10 | gateway | A closer that throws on shutdown skips the closers after it. | T-AUD-12 |
| G-M12 | gateway | The privacy probe ignores a path prefix in `TAMIZ_PRIVACY_URL`, and `/health` calls the privacy service and the database on every hit. | T-AUD-12 |
| P7 | privacy | NIFs starting with K, L or M are not found. | T-AUD-13 |
| P8 | privacy | Overlaps are resolved by score, not sensitivity: a spaCy location could win over a phone. This is structural and was not reproduced. | T-AUD-13 |
| D6 | dashboard | The global `expired` flag is not reset on sign-out or sign-in. | T-AUD-14 |
| D7 | dashboard | A cost preset's end is frozen at the time it was chosen. | T-AUD-14 |
| D8 | dashboard | `describeError` gives a generic message for `rate_limited` and the `forbidden_*` errors, and ignores `Retry-After`. | T-AUD-14 |
| D9 | dashboard | A malformed cookie value throws `URIError`, which answers 500. | T-AUD-14 |
| D10 | dashboard | Live traffic writes a ref during render. | T-AUD-14 |
| D11 | dashboard | Leftovers of the editor split: an unused `_CARD`, an orphan doc comment and a dangling comment. | T-AUD-14 |
| V-L11 | dashboard | The first backoff is still 4 s, as the second audit's verification found. | T-AUD-14 |
| F9-F14 | docs | Smaller documentation problems:<ul><li>policy paths in the README;</li><li>"healthy in 30 s" against "about a minute";</li><li>README lists that miss `x-tamiz-rule` and the agent eval;</li><li>`[ALEX: …]` placeholders in the marketing drafts;</li><li>no CI badge;</li><li>CLAUDE.md places `decide()` in the wrong file;</li><li>TanStack Table is listed but not used.</li></ul> | T-AUD-15 |
| G10 | all | About 20 comments cite internal audit ids ("audit H4") that an outside reader cannot resolve. They should state the reason instead. | T-AUD-15 |
| G7, G8, G9, P9-P12, M21, L20, L3, L10 | various | Remaining polish:<ul><li>typed status helpers in the chat route;</li><li>one provider-input helper;</li><li>`main.ts` nits;</li><li>looser contract fields;</li><li>the fake clock's real-timer `drive`;</li><li>branded DTOs;</li><li>the tolerant placeholder restore;</li><li>a negative key cache.</li></ul> | T-AUD-16 |
| — | tests | Fixes without a test:<ul><li>M6 (`streamSSE` `onError`), M8, M17, L6, L13 (session fallback), L15 (baseline schema), L16 (`agent_error`);</li><li>the `detector_failed` and `observe` tests that L17 deferred.</li></ul> | T-AUD-16 |

## Order of the fixes

1. **`T-AUD-12` (gateway cancellation and fail-closed edges) and `T-AUD-13` (recognizers on
   real layouts).** These are the remaining correctness and privacy points.
2. **`T-AUD-14` (dashboard) and `T-AUD-15` (the run path and honest docs).**
3. **`T-AUD-16`** (polish and the missing tests). It is optional before the public showing.
4. **`T-AUD-17` (the README evals table and the case study figures), last.** It is
   generated from a `main` run after every other fix, so the published numbers match the
   committed datasets and code.
