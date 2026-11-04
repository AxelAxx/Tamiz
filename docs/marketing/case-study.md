# Case study — draft

Status: **draft, waiting for Alex's review** (`T-DOC-03`). Written for Alex's website.
The structure is problem → decisions → trade-offs → metrics (`docs/tamiz-project.md`
section 10). Each figure cites its source in the repository; recheck them before
publishing.

Before publishing:

- [ ] Fill the `[ALEX: …]` placeholder in "The problem" with your own experience.
- [ ] Add the demo link once `T-OPS-02` is deployed.
- [ ] Use `docs/images/demo.gif` as the hero image and the C4 container diagram from
      `docs/architecture.md` in "The shape of the system".

---

## Tamiz: a privacy-aware LLM gateway

**Use the best model for every request without sensitive data leaving where it belongs.**

Self-hosted gateway · TypeScript and Python · two weeks, spec-first ·
[github.com/AxelAxx/tamiz](https://github.com/AxelAxx/tamiz) · Apache-2.0

### The problem

Small European teams in health, legal, fintech and HR want LLMs in their products, and
their data is full of personal identifiers. A frontier model in the US is often the best
answer to the question and the wrong place for the patient's ID number. Without a
platform team, most of them pick one of two bad options: keep AI away from that data, or
use it and hope.

[ALEX: one paragraph from your work with real clinical data: the moment this stopped
being theoretical.]

The goal was not another proxy that forwards requests. It was a component that decides,
on every request, where that request may go, and can prove its decisions afterwards.

### What Tamiz does

An application points its OpenAI client at Tamiz instead of at a provider. That is the
whole integration (`docs/integrations/citara.md`). On every request, Tamiz:

1. **Inspects** every text the provider would read for personal data: messages,
   tool-call arguments, tool results and tool definitions. Spanish recognizers check the
   control characters of DNI, NIE, CIF, IBAN and NSS; spaCy finds names and places.
2. **Decides** by a declarative YAML policy. The highest sensitivity found picks an
   action:
   - critical data (identity and bank numbers) never leaves the machine and goes to a
     local Ollama model;
   - names, emails and phones leave only anonymized, and only to EU-resident providers;
   - everything else goes to the cheapest target that fits the task.
3. **Executes** with timeouts, retries, per-target circuit breakers and fallback chains.
4. **Restores** anonymized placeholders in the answer, in memory, also mid-stream.
5. **Audits** the decision, entities, target, tokens, cost and latency. It traces the
   request with OpenTelemetry, and stores no prompt text anywhere.

Around it sit an operator dashboard, an MCP server that exposes the audit and cost data
to Claude, and an eval suite that gates every merge.

### The shape of the system

*(C4 container diagram: `docs/architecture.md`.)*

There are two services and their support:
- **The gateway** (Node.js 22, Hono) holds all the decisions.
- **The privacy service** (Python, FastAPI, Presidio, spaCy) finds personal data. It
  returns kinds and positions, never the values.
- **Around them**: PostgreSQL holds the audit log and policy versions, Valkey shares
  circuit state, Jaeger receives the traces, and Ollama runs the local model.

The whole stack starts with one `docker compose up`.

### Decisions that shaped it

**Fail closed, and block rather than degrade.** If the privacy service cannot answer, the
gateway does not guess. The policy says what happens, and `allow` is refused at boot as
an answer. If the only healthy fallback would send a request outside its allowed
residency, the gateway returns `451` instead of quietly sending it. Resilience usually
means "always answer". Here, a wrong answer is worse than no answer.

**The routing decision is a pure function.** `RoutingPolicy.decide()` takes the policy
and an inspected request and returns an ordered chain and a privacy action. It has no
I/O and no clock. That made it possible to test with property-based tests, to expose it
as a dry run (`POST /v1/simulate`, which powers the dashboard simulator and an MCP tool),
and to reason about it in review. Clean Architecture layers are enforced in CI by
dependency-cruiser.

**Resilience written, not imported.** Timeouts, jittered retries, circuit breakers and
the fallback chain are about 550 lines of the project's own code. A library would have
been faster. But the interesting rules are project-specific: a fallback must respect the
residency of the original decision, and a stream may only fall back before its first
token.

**Anonymization is reversible but never persisted.** Placeholders such as `<PERSON_1>`
replace the values before the request leaves. The mapping lives in a closure for the
duration of that request. Restoring the answer while it streams meant handling a
placeholder split across two chunks: a buffer holds back only what could still be the
start of one.

**Prompt content never reaches logs, traces or the database.** Messages are identified
by an HMAC, so the same request can be correlated without storing it. A capture test
sends known texts through the gateway, then searches every log line, span, event and
audit row for them, and fails if it finds one.

**Evals are the specification.** Every promise about privacy and routing is a versioned
synthetic dataset with a threshold. The CI job starts the real privacy service, two
gateways and local models (`qwen2.5:1.5b` answers, `qwen2.5:3b` judges), and fails the
pull request below threshold. "Zero critical leaks" is a number checked on every merge,
not a sentence in a README.

**Its own tools go through it.** The MCP agent answers questions such as "why did spend
rise yesterday?". It sends its own model calls through Tamiz on a local-only rule, so the
operator tooling is inspected, routed and audited like any client.

**Spec before code.** Each of the ten features started as a spec with Given/When/Then
criteria (GitHub Spec Kit), then a plan and a task list, and the criteria became tests one
to one. Every backlog task ends with a short record of what was decided and what went
wrong, which the next session reads first.

### Trade-offs, honestly

- **Detection is statistical.** Identifiers with check digits are matched almost
  perfectly; names are not. About 1 in 12 names is missed on the held-out set. Tamiz is a
  measured defence layer, not a guarantee. For data that must never leave,
  `restrict_to_local` is the right action, not `anonymize`.
- **Two languages, two runtimes.** The Python service adds a container to run and a
  toolchain to maintain. In exchange, Presidio and spaCy are the best open tools for the
  job.
- **Latency.** Inspection adds a call to every request. It is cached by a hash of the
  messages, and it runs in parallel with loading the policy.
- **Anonymization costs context.** A model that sees `<PERSON_1>` answers with less
  detail.
- **Local models need hardware.** The local route needs a machine that can run an
  8-billion-parameter model. The public demo has to compromise on it.
- **Ceremony.** Spec-first work is slower to start. It paid back in fewer reworked
  features and in a record of why each thing is the way it is.

### Results

Eval results from the CI run on `main` of 2026-11-04, commit `99a9706` (README "Evals"):

| What | Result | Gate |
|---|---|---|
| Critical identifiers (DNI, NIE, IBAN, NSS, card) reaching a non-local provider | 0 % | 0 % |
| Names reaching a non-local provider | 0.83 % | < 2 % |
| Recall on structured identifiers | 100 % | ≥ 95 % |
| Recall on names | 92 % | ≥ 80 % |
| Requests sent to the expected route | 100 % (44 cases) | ≥ 95 % |
| Answer quality on the local route vs accepted baseline | 100 % | ≥ 95 % |
| Estimated cost vs sending everything to the frontier model | −87 % | reported |
| Spend questions the MCP agent answers right on a 3B local model | 80 % (15 cases) | ≥ 60 % |

The work, from the repository (2026-10-18 → 2026-11-02):
- 10 features;
- 71 pull requests, each merged only on a green CI. By the end, CI ran lint, types, the
  architecture check, about 1,500 TypeScript tests, about 250 Python tests, 107 browser
  tests and the eval gate;
- 69 task records.

The datasets are synthetic, so these figures guard against regressions; they are not
field accuracy.

### What I would do next

- Deploy the public demo (EU VPS, `T-OPS-02`).
- Train a task classifier to replace the keyword rules.
- Add recognizers for more countries' identifiers.
- Give the dashboard users and roles instead of one passphrase.

---

## Sources

| Figure or claim | Source |
|---|---|
| Eval figures | README evals table, generated from the `evals-report` artifact of `main` run 41441278726 (`10d17b3`) |
| Fail closed, `allow` refused | Spec 005, `privacy.onDetectorError` |
| `451` residency guard | Spec 003, `application/resilience/` |
| About 550 lines of resilience code | `apps/gateway/src/application/resilience/*.ts`: 551 lines, 470 without comments and blank lines (2026-11-02) |
| Placeholder-safe stream buffer | `T-005-05`, `domain/model/restore-stream.ts` |
| Capture test | Spec 006, `T-006-05` |
| CI models | `.github/workflows/ci.yml`, job `evals` |
| Test counts | `T-OPS-01` record (Vitest 1,484), privacy service record (pytest 254), `T-008-09` record (Playwright 107) |
| 71 pull requests, 69 records, dates | GitHub PR list, `docs/tasks/done/`, `git log` |
