# Custom components

Components that are not stock shadcn/ui. Each section lists anatomy, variants, states, sizes,
classes and tokens, motion, and accessibility. Class strings are the ones in `screens/*.html`
(search for `data-component="<name>"`). Shared badge base used by several components:

```
BADGE = inline-flex w-fit shrink-0 items-center gap-1 whitespace-nowrap rounded-md border px-1.5 py-0.5 text-xs font-medium
```

Suggested home: `apps/dashboard/src/components/tamiz/*`, built on shadcn `Badge`, `Tooltip`,
`Sheet`, `Card`, `Skeleton`, `ToggleGroup`, `Select`, `Popover`, `Calendar` with `cva` variants.

---

## Residency badge · `residency-badge`

- **Anatomy**: lucide icon (14 px) + word. Optional target label to its right (separate component).
- **Variants** (`residency`): `local` → House, "Local"; `eu` → ShieldCheck, "EU"; `us` → Globe, "US";
  `global` → Globe, "Global".
- **Classes**: `BADGE` + tone
  - local: `border-local/25 bg-local-soft text-local`
  - eu: `border-eu/25 bg-eu-soft text-eu`
  - us, global: `border-external/25 bg-external-soft text-external`
- **Sizes**: default (icon `size-3.5`); `sm` (`px-1 py-0`, icon `size-3`) for dense lists such as
  "Allowed residencies" and the policy outline.
- **States**: static. In rows it is replaced by the outcome badge when the request was blocked or failed.
- **Motion**: none.
- **A11y**: the word is the accessible name; icon `aria-hidden`. Never colour without the word.
  local and eu are the reassuring pair (green, blue); us and global share amber and differ by word.

## Target label · `target-label`

`font-mono text-xs truncate`, `title` = "provider · model" (shadcn `Tooltip` in code). Shown next to
the residency badge; truncates with an ellipsis in narrow columns.

## Outcome badge · `outcome-badge` and privacy action badge · `privacy-action-badge`

- Outcome (filled, `BADGE` + tone): `answered` CircleCheck success · `failed` CircleX danger ·
  `blocked` Ban danger · `cancelled` CircleMinus neutral (`border-border bg-muted text-muted-foreground`).
- Action (outline, `BADGE` + `bg-transparent`): `allow` ArrowUpRight `border-border text-muted-foreground` ·
  `anonymize` VenetianMask `border-info/40 text-info` · `restrict_to_local` LockKeyhole, label
  **"local only"**, `border-local/40 text-local` · `block` Ban `border-danger/40 text-danger`.
- Outline vs filled keeps "what we did" visually secondary to "where it went".

## Sensitivity indicator · `sensitivity-indicator`

- **Anatomy**: four ascending bars (`h-1.5`, `h-2`, `h-2.5`, `h-3`, each `w-1 rounded-xs`, `gap-0.5`,
  `items-end`) + word. Optional suffix ("sensitivity") in the simulator.
- **Variants** (`level`, ordered): `none` 0 filled, word `text-muted-foreground` · `low` 1 filled
  `bg-muted-foreground` · `high` 3 filled `bg-warning` · `critical` 4 filled `bg-danger`, word
  `font-semibold` · `unknown` (inspection failed): all bars `border border-dashed border-muted-foreground`,
  CircleHelp icon, word muted. Empty bars use `bg-border`.
- **Sizes**: one size; it sits on a 20 px line (`h-5`) in tables.
- **Motion**: none.
- **A11y**: bars `aria-hidden`; the word carries the meaning. Critical is prominent by fill and weight,
  not by a red row.

## Entity chip · `entity-chip`

- **Anatomy**: [critical marker] + uppercase kind code + `×count` (count `font-normal text-muted-foreground`).
- **Variants**:
  - critical kinds (DNI, NIE, NSS, IBAN, CREDIT_CARD):
    `inline-flex items-center gap-1 whitespace-nowrap rounded-sm border border-foreground/25 bg-surface px-1.5 py-0.5 font-mono text-xs font-semibold`
    plus a `size-1.5 rounded-xs bg-danger` square and sr-only "critical".
  - other kinds: same shape, `border-transparent bg-muted`, normal weight.
  - overflow: `+N` chip, `rounded-sm border border-dashed px-1.5 py-0.5 font-mono text-xs text-muted-foreground`;
    its tooltip lists the hidden kinds with counts.
- **Rules**: critical kinds first; rows show at most 3 then `+N`; the detail drawer shows all. Chips wrap
  (`flex flex-wrap gap-1`). Empty: "none" in tables, "No personal data" on phone cards, "None found" in the drawer.
- **A11y**: tooltip (`title` in the HTML, shadcn `Tooltip` in code) names the kind: "Spanish national ID",
  "Foreigner ID", "Company tax ID", "Bank account", "Social security number", "Phone number",
  "Email address", "Credit card", "Person name", "Location".

## Fallback marker · `fallback-marker`

- **Anatomy**: CornerDownRight icon + count of abandoned targets, `text-warning text-xs font-medium`.
- **States**: none (not rendered), one or more. Hover or focus opens a tooltip: "Fell back from" +
  one line per target: `target-id · reason` (`timeout`, `rate_limited`, `http_error`, `network`,
  `malformed_response`, `authentication`, `circuit_open`).
- **Sizes**: trigger `h-5 rounded-sm px-1`, `hover:bg-warning-soft`.
- **Interactive vs static**: interactive (Button + Tooltip) in tables; static span on phone cards
  (cards are a single button, so no nested interactive element); the drawer lists the targets.
- **Motion**: tooltip fade (`transition-opacity`, `--duration-fast`).
- **A11y**: `aria-label` spells it out: "Fell back 1 time: openai-mini timeout".

## Circuit state badge · `circuit-badge`

- `closed` CircleCheck success · `open` CircleOff danger, with "· retry in N s" (`tabular font-normal`)
  counting down each second · `half_open` CircleDashed warning, label "half open".
- Provider card with an open circuit gets `border-danger/40 ring-1 ring-danger/20` and the note
  "requests skip this target; fallbacks take over".
- A11y: word always present; the countdown updates text only (no live region, to avoid noise).

## Pass/fail mark · `pass-fail-mark`

- `pass` CircleCheck `text-success` · `fail` CircleX `text-danger` · `error` TriangleAlert `text-warning` ·
  `skipped` SkipForward `text-muted-foreground`.
- **Sizes**: `sm` (icon `size-4`, `text-sm font-medium`, used per eval and per metric) and `lg`
  (icon `size-7`, `text-2xl font-semibold`, capitalised word, used for the run status).
- Failing eval cards get `border-danger/40 ring-1 ring-danger/20`, move to the top and span the row.

## Decision flow · `decision-flow` / `decision-step`

- **Anatomy**: ordered list of five steps: 1 Inspection (sensitivity, entity kinds, detector status
  `ok` / `unavailable` / `timeout` / `contract`), 2 Classification (task, size), 3 Rule (rule id chip +
  why), 4 Privacy action (action badge + why), 5 Route (numbered chain: residency badge, target id,
  provider · model; then "Allowed residencies"). Footer: policy id and version, "No model was called".
  Header shows a verdict badge once the last step resolves: Routed local · Anonymized, then routed ·
  Allowed · Blocked.
- **Step**: 32 px node (`size-8 rounded-full border`) with the step icon; a 1 px connector
  (`absolute left-4 top-9 bottom-0 w-px bg-border`); title `text-sm font-semibold` "N · Name";
  state word right-aligned `text-xs`.
- **States** (`data-state`):
  - `pending`: `border-dashed border-input bg-surface text-muted-foreground`, word "Pending", Skeleton line.
  - `resolved`: `border-foreground/20 bg-foreground text-background`, word "Done", value revealed.
  - `deciding` (blocked here): `border-danger bg-danger-soft text-danger`, Ban icon, word "Blocked"
    (`font-semibold text-danger`), reason box `rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger`
    with "Blocked here:" + reason in words (`action`: policy blocks this sensitivity · `no_target`:
    no allowed target · `detector_unavailable`: inspection failed, gateway fails closed).
  - `skipped`: `border-border bg-muted text-muted-foreground opacity-60`, title muted, "Not evaluated".
- **Running**: all steps pending; header shows a spinning LoaderCircle + "Simulating…" (~600 ms).
- **Motion** (Motion `staggerChildren: 0.38`): each step's value enters with `animate-step-in`
  (6 px rise + fade, `--duration-slow` 360 ms, `--ease-emphasized`). Entity highlights fade in when
  step 1 resolves. Re-running replays the sequence.
  **Reduced motion**: `animate-fade-in` only; the stagger stays so the order is still perceivable.
- **Layout**: vertical stepper on every size; at 1280×800 it sits in the right column next to the
  submitted text (the README GIF frame).
- **A11y**: `<ol aria-label="Decision steps">`; step titles are `h3`; the chain is an `<ol>` "Fallback
  chain, in order"; icons `aria-hidden`.

## Highlighted text · `highlighted-text` / `entity-highlight`

- **Anatomy**: one block per message (`rounded-md border bg-background px-3 py-2.5`) with a role label
  (`text-xs font-medium tracking-wide uppercase text-muted-foreground`) and the read-only text
  (`text-base leading-8 break-words`).
- **Entity span**: `<mark>` `rounded-sm px-1 py-0.5 text-foreground ring-1` + kind label
  `ml-1 rounded-xs px-1 py-px font-mono text-xs font-medium text-surface`.
  - critical kinds: `bg-danger-soft ring-danger/40`, label `bg-danger`.
  - other kinds: `bg-info-soft ring-info/40`, label `bg-info`.
- **States**: before step 1 (plain text); highlighted; none found ("No personal data detected",
  CircleCheck success); inspection failed ("Inspection failed: no highlights available", danger).
  Overlapping spans merge into one mark carrying both labels.
- **Placeholders** ("Provider receives", anonymize only): `<PERSON_1>` as
  `rounded-sm bg-info-soft px-1 py-0.5 font-mono text-sm font-medium text-info ring-1 ring-info/30`.
  The anonymization notice is a collapsed `Collapsible` labelled "System · Anonymization notice v1".
- **Motion**: marks `animate-fade-in` (`--duration-base`).
- **A11y**: tooltip and sr-only text give kind, "critical" and score ("score 1.00").

## Entry detail drawer · `sheet-content` (shadcn Sheet, side right)

- **Anatomy**: header (h2 "Request `req-…`", residency badge + target, outcome badge, close button);
  privacy note "Tamiz never stores what was said. This entry holds kinds, counts, routes and costs
  only." (EyeOff, `rounded-md border bg-muted`); sections (h3, `text-xs font-semibold uppercase
  tracking-wide text-muted-foreground`) with `dl grid grid-cols-[8.5rem_minmax(0,1fr)] gap-x-3 gap-y-2`:
  Route (target, provider · model, residency, abandoned targets with reasons) · Privacy (sensitivity,
  all entity chips, action, notice version, block reason) · Request (id, hash first 12 + copy,
  client, started, ended, latency, streamed, policy + version, rule, task · size, outcome, error type) ·
  Usage and cost (tokens in · out with "estimated" badge, cost, baseline cost and target);
  footer link "See requests with this rule" (opens the audit log filtered by rule) and "Times in UTC".
- **Sizes**: `md:w-110` (440 px) on tablet and desktop; full screen on phone; close button 44 px on phone.
- **States**: loaded, loading when opened from a link (Skeleton blocks), not found (empty state:
  "No audit entry with id … It may be older than the retention window.").
- **Motion**: `animate-sheet-in` (16 px slide + fade, `--duration-base`); overlay `animate-fade-in`.
  Reduced motion: fade only.
- **A11y**: `role="dialog" aria-modal`, labelled by its title; Esc and overlay click close; focus trap
  and return focus are Radix defaults; copy confirms with a toast.

## Filter bar · `filter-bar`

- **Anatomy**: date range (Popover trigger with Calendar icon + label; content: presets Last hour /
  Last 24 hours / Last 7 days / Last 30 days and a custom From/To in UTC, built with `Calendar
  mode="range"`), then Selects with visible labels: Route (targets), Rule (active policy's rules),
  Sensitivity, Privacy action ("local only" for `restrict_to_local`), Entity kind, Outcome.
  Below: active filters as removable chips (`h-7 rounded-full border bg-surface`, "label = value",
  X button) and "Clear all" (ghost button).
- **Responsive**: desktop one row (`flex flex-wrap items-end gap-3`, selects `md:w-40`); tablet wraps;
  phone collapses to a "Filters (N)" button (44 px) that opens a bottom Sheet with the same controls
  stacked and "Clear all" / "Show results".
- **States**: options loading (Select disabled with Skeleton), invalid range (trigger and inputs
  `border-danger`, inline error '"To" must be after "From".'), empty result (region empty state
  "No entries match: route = mistral-small, entity kind = DNI." + "Clear filters").
- **Behaviour**: the URL holds the filters; no saved views.
- **A11y**: every control has a visible label; chip remove buttons are labelled "Remove filter Route".

## Region states · `region-loading` / `region-empty` / `region-error` / `region-stale`

Every data region uses these; no whole-page spinners.

- **Loading**: Skeleton rows shaped like the final layout (`animate-pulse rounded-md bg-muted`),
  `aria-busy="true"`. Reduced motion: no pulse.
- **Empty**: centred `px-6 py-16`: 40 px round icon well (`bg-muted text-muted-foreground`), one
  sentence (`text-sm text-muted-foreground max-w-md`), at most one action (outline button).
- **Error**: same frame, icon well `bg-danger-soft text-danger` with TriangleAlert, `h3` naming what
  failed, one sentence (gateway unreachable / credentials rejected / unexpected answer), "Gateway
  request id `req-…`" when there is one, primary "Retry" button. `role="alert"`.
- **Stale**: data stays; a quiet note `text-xs text-muted-foreground` with Clock icon "Last updated
  12:03:41 UTC" in the region header. Live traffic's retrying state adds a warning Alert above the rows.
- **Motion**: none beyond the Skeleton pulse.

## Gateway status pill · `gateway-status`

`h-8 rounded-full border px-3 text-xs font-medium` + tone: Connected (CircleCheck, success) ·
Disconnected, retrying (RefreshCw, warning) · Credentials rejected (KeyRound, danger), followed by the
last-update text. Tooltip: gateway version and last update time. Phone: 44 px icon button in the
status colour; tap opens a Popover with the same text.

## Stream status · `stream-status`

Live: pulsing dot (`animate-ping`, reduced motion: static) in a success badge · Paused (CirclePause,
neutral) with a "N new · resume" info button · Retrying since HH:MM:SS (RefreshCw, warning) ·
Connecting… (spinning LoaderCircle) · Disconnected (WifiOff, danger).

## Cost chart · `cost-chart` (shadcn Chart + Recharts BarChart)

Two bars per key: actual `--chart-1` solid; baseline `--chart-2` hatched (135° stripes, inset ring).
Dashed horizontal grid lines, USD ticks, key labels (every 5th when grouped by day), legend naming
"Actual (solid)" and "Baseline (hatched)". Tooltip: key, actual, baseline, requests, tokens in/out.
Baseline unavailable: actual only. The breakdown table below is the accessible alternative.
