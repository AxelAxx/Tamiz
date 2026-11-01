# T-008-04 — Policy simulator screen

| Field | Value |
|---|---|
| Task | `T-008-04` (see `docs/tasks/BACKLOG.md`) |
| Feature | `008-dashboard` |
| Spec | `specs/008-dashboard/spec.md` (US3) |
| Branch / PR | `T-008-04-simulator` / PR linked from the merge commit |
| Date | 2026-11-01 |
| Session | Claude Code (Opus 5.5) |
| Status | done |

## What was done

The simulator shows what the gateway would do with a text without calling a model (spec
008 US3, `tasks.md` Phase 4, T026–T030, design `screens/simulator.html`). It is the
README GIF.

- **Form**: React Hook Form with a Zod schema that becomes a contract chat completion
  request. It has one-click samples, an optional system message, extra user messages, the
  requested model (default `tamiz-auto`) and the gateway's body limit. Errors show next to
  their field and nothing is sent (US3-4). Ctrl/Cmd+Enter submits.
- **Result**: the submitted text replaces the form, and each entity is highlighted at its
  exact UTF-16 offsets in the message it was found in, with accents and emoji intact.
  Overlapping spans become one mark with both labels (US3-1, US3-5).
- **Decision flow**: five steps (inspection → classification → rule → privacy action →
  route) revealed one by one. A block marks its deciding step and skips the rest (US3-3,
  US3-7). A verdict badge closes the flow, and a "Provider receives" panel shows the notice
  and the `<PERSON_1>`-style placeholders for anonymize (US3-2). The footer names the policy
  version that decided.
- **Privacy**: the text lives in React state only; a reload clears it (US3-6).

## Files touched

- `packages/contracts/src/chat-completion.ts`, `src/index.ts`: `MAX_BODY_BYTES` exported
  (T028); `apps/gateway/src/presentation/app.ts` imports it.
- `packages/contracts/src/simulate.ts` (+ test): optional `policy: { id, version }` in
  `SimulateResponse`; `apps/gateway/src/application/use-cases/simulate-policy.ts` and
  `presentation/routes/simulate.ts` fill it.
  `apps/gateway/test/admin/policy-route.test.ts` checks that a save changes it.
- `apps/dashboard/src/features/policy-editor/simulator/{schema,highlight}.ts`,
  `{simulator,decision-flow,highlighted-text}.tsx` (new);
  `src/app/(console)/simulator/page.tsx`.
- `apps/dashboard/src/components/ui/textarea.tsx` (shadcn); `react-hook-form` and
  `@hookform/resolvers` (exact versions).
- `apps/dashboard/test/highlight.test.ts` (new, T026); `e2e/simulator.spec.ts` (new, T027);
  `e2e/accessibility.spec.ts` (the simulator in both themes); `e2e/support/gateway.ts`
  (`detector`, `editPolicy` through `PUT /v1/admin/policy`).
- `specs/008-dashboard/tasks.md` (T026–T030 ticked), `docs/tasks/BACKLOG.md`.

## Decisions

- **`SimulateResponse` gains an optional `policy` (id and version).** The design's footer,
  the brief's "result meta" and US5-4 ("the next simulation uses it") need the version that
  decided, and the response did not carry it. `decideWithPrivacy` already returned the
  policy, so the change is a few lines. The field is optional, so older answers and the MCP
  fixtures still parse.
- **The "why" lines of the design are mostly left out.** The design explains each rule and
  action ("task summarize, size short", "critical data never leaves the machine"), but the
  response does not say why a rule matched, and guessing would mislead. Only `default`
  gets "no other rule matched". The block reasons are shown in words as specified.
- **The form validates on submit only**, as the design shows (errors after Simulate).
- **The highlight model is pure** (`highlightSegments`, `placeholderSegments`) and joins
  back to the original text, which the tests check.
- **The detector-outage block is tested with a policy change through the admin API.** The
  shipped policy fails closed with `restrict_to_local`, so the test sets
  `onDetectorError: block` with `PUT /v1/admin/policy` on the E2E gateway (T-008-12),
  then turns the scripted detector off.
- **No dashboard log check for US3-6.** The BFF logs no bodies (T-008-02); the test covers
  the URL, both storages and a reload.

## How it was verified

```bash
pnpm lint        # Found 2 warnings. Found 92 infos. (none new)
pnpm typecheck   # exit 0
pnpm arch        # ✔ no dependency violations found (154 modules, 565 dependencies cruised)
pnpm test        # Test Files 136 passed (136); Tests 1415 passed | 34 skipped (1449)
pnpm build       # exit 0
CI=1 pnpm --filter @tamiz/dashboard exec playwright test --retries=0 e2e/simulator.spec.ts e2e/accessibility.spec.ts
# 18 passed (US3-1 … US3-7, the 1280×800 README frame, Ctrl+Enter, axe in both themes)
```

Checked by hand at 1280×800 against `design/screenshots/simulator-local-dark-1440.png`.

## Pending / follow-ups

- The design's sample "Name and email" uses names the E2E gateway's scripted detector does
  not know; the E2E tests use its own markers (`Ana García`). With the real privacy
  service every sample detects as designed.
- No new backlog rows.

## Pitfalls for the next session

- **`shadcn add` again pulled in the npm package `cn`**; fix the import and remove the
  package after every `add`.
- **With the shipped policy, critical data on `tamiz-frontier` is routed locally, not
  blocked.** A `no_target` block needs high data (anonymize, Local or EU only) on that
  US-only rule.
- **Count UTF-16 units, not characters**, when writing offset expectations: an emoji with
  a skin tone is 4 units.

## Links

- Spec / plan / tasks: `specs/008-dashboard/` (research R-06)
- ADRs: none added
- Related task records: `docs/tasks/done/T-008-10-shell-and-shared.md`,
  `docs/tasks/done/T-008-12-policy-admin-api.md`
