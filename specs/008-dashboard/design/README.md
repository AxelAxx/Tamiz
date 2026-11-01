# Tamiz dashboard: design hand-off (gate G1)

Feature `008-dashboard` · source brief: [`../design-brief.md`](../design-brief.md) · exported 2026-11-01

Claude Design project (canvas with the interactive prototype, key frames and the token sheet):
https://claude.ai/code/artifact/c48188f5-8273-4499-af32-d6e076586b0d

## tokens.css: what changed

`tokens.css` changed since the **first** version handed over (the one committed to
`specs/008-dashboard/design/tokens.css` on the first review). Compared with that version:

| Change | Why |
|---|---|
| Dark palette deeper and bluer: `--background` 0.145, `--surface` 0.18, `--muted` 0.22, `--accent` 0.24, `--border` 0.27, `--input` 0.52 (all hue 262); `--sidebar` 0.13, `--sidebar-accent` 0.22 | Review feedback: dark is the primary theme and must feel premium. Contrast re-checked, all pairs still pass (text ≥ 5.9:1, input/ring ≥ 3.4:1). |
| New `--edge` (dark: `oklch(1 0 0 / 0.05)`, light: transparent) included as an inset top highlight in every `--shadow-*` | Gives raised surfaces a hairline bevel in dark mode without heavier shadows. |
| New `--glow` and `@utility bg-app` (radial light top-right over `--background`; invisible in light) | Ambient depth behind the app canvas. Use `bg-app` on the shell root and the sign-in page. |
| Dark `--shadow-color` 0.35 / `--shadow-color-strong` 0.55 | Shadows read on the deeper background. |
| Removed `@utility icon` | It only styled the prototype's inline SVG sprite; lucide-react does this in the app. |

The **second** version (sent after the dark-theme review) is identical except that it still had
`@utility icon`. If that is what the code has, the only change is deleting that block.

## Contents

```
design/
  README.md        this file
  tokens.css       Tailwind v4 @theme + :root/.dark (drop into globals.css after @import "tailwindcss")
  components.md    custom components: anatomy, variants, states, sizes, classes, motion, a11y
  icons.md         lucide icon per status and navigation item
  screens/         one self-contained HTML file per screen (no build step)
  screenshots/     <screen>-<state>-<theme>-<width>.png (188 files)
```

## Screens

Open any file in `screens/` directly in a browser. Each has a **Prototype** button (bottom left)
with the state switcher, light/dark and full/reduced motion; the app's own theme toggle and
sidebar navigation also work. Resize the window for 1440 / 1280 / 768 / 390: the files use the
real Tailwind breakpoints (`md` = 768, `xl` = 1280), exactly as the app will.
URL parameters: `?state=<id>&theme=light|dark`, `&chrome=0` hides the prototype button,
`&static=1` disables timers and plays the final frame of every animation (used for screenshots).

| File | States in the switcher | Review status |
|---|---|---|
| `signin.html` | idle, submitting, wrong passphrase, rate limited (live countdown), session ended notice | reviewed |
| `shell.html` | connected, gateway retrying, credentials rejected, phone navigation sheet, operator menu, tablet sidebar expanded, session-expired dialog, toast; content shows the four region states | reviewed |
| `live.html` | live (new row every 5 s, highlighted 2 s), paused with "N new", retrying with rows kept, connecting, loading, empty, error, entry detail (answered and blocked) | reviewed |
| `simulator.html` | before first run, validation errors, running, local only, anonymize (+ provider receives), no personal data, code to frontier, blocked: no allowed target, blocked: inspection failed, error | reviewed |
| `audit.html` | all entries, filtered, date range popover, invalid range, loading, empty with filters, error, loading older, no older entries, error loading older, entry detail, detail loading (from a link), detail not found, phone filters sheet | **new, not yet reviewed** |
| `cost.html` | by route / day / model, loading, empty range, baseline unavailable, invalid custom range | **new, not yet reviewed** |
| `providers.html` | healthy and failing targets (open circuit with live countdown), idle target, loading, error | **new, not yet reviewed** |
| `evals.html` | latest run passes, failing run from history (failing cases), eval error + skipped, single run, loading, no reports, error reading folder | **new, not yet reviewed** |
| `policy.html` | clean, unsaved changes, issues found in browser (save disabled), saving (read-only), saved as version 4 (toast), refused by gateway, conflict dialog, not-persistent warning, unsaved-changes guard, outline tab, loading | **new, not yet reviewed** |

Audit, Cost, Providers, Evals and Policy were designed during this export (the reviewed
prototype covered sign-in, shell, Live traffic and Simulator). They follow the same system and the
brief, but have not had a review round: treat them as a first proposal.

Screenshots: every main state in light and dark at 1440 and 390 (390 rendered at 2×), plus
768 for the shell (default, sidebar expanded), Live traffic and the filtered Audit log. Overlay
states (detail drawer, dialogs, sheets, toast) are viewport-sized; the rest are full page.

### How the HTML maps to React

- `data-slot="…"` marks a stock shadcn/ui part (`button`, `badge`, `card`, `table`, `sheet-content`,
  `dialog-content`, `popover-content`, `dropdown-menu-content`, `toggle-group`, `select-trigger`,
  `sidebar`, `sonner-toast`, `chart`…). Class strings follow shadcn v4 defaults with our tokens.
- `data-component="…"` marks a custom Tamiz component documented in `components.md`.
- Native `<select>` stands in for shadcn `Select`; the date inputs stand in for `Calendar` in a
  `Popover`; the code view stands in for CodeMirror 6 (frame, gutter, markers and issue list are
  the design; editor internals are not).
- `icon` class + `<use href="#i-name">` stands in for `lucide-react` (`<House className="size-3.5" />`).
- The chart is drawn with divs to stay dependency-free; build it with shadcn Charts (Recharts
  `BarChart`, two `Bar`s, `ChartTooltip`, `ChartLegend`), keeping the hatched baseline (SVG pattern).
- Rendering is plain template strings over a state object; ignore that mechanism, keep the markup.

## Decisions and deviations from design-brief.md

**Layout and responsive**
1. One native page scrollbar: the page scrolls, the sidebar is sticky (`sticky top-0 h-svh`). No
   nested scroll areas except the drawer body, the policy editor and wide failing-case tables.
2. Sidebar is 208 px (`w-52`) expanded, 56 px collapsed on tablet (brief did not fix a width; 240
   felt heavy and forced horizontal scroll in tables).
3. **No horizontal scroll in traffic tables** (review request). Live traffic and Audit use five or six
   fixed-width columns with two lines per cell instead of ten one-line columns:
   Request (route; time · client), Rule (rule; task · size), Privacy (sensitivity; action),
   Entities, Cost (cost; latency). Tablet hides the second lines for task·size and latency, and
   Audit moves the rule into the request line below `xl`. Every brief field is still in the row or
   the detail drawer.
4. Live traffic adds the optional summary strip: counts for Local, EU, External, Blocked or failed,
   With critical entities, plus a share bar. It answers "where did the data go" at a glance.
5. Simulator at 1280×800: two columns (input/submitted text left, vertical five-step flow right).
   The submitted text replaces the textarea after a run (Edit brings it back and focuses it) so
   text, highlights and the full flow fit without scrolling.
6. Phone: traffic and cost tables become stacked cards; audit filters become a "Filters (N)"
   bottom sheet; the policy editor stays editable with a "wider screen is easier" note.

**Visual**
7. Dark is the default theme (review feedback: "premium"); light is fully supported.
8. Dense type scale: body 14 px, tables and controls 13 px (Tailwind `text-sm` is 13 here, so stock
   shadcn components come out one step denser than their defaults).
9. Colour carries the privacy story only: residency (local green, EU blue, external amber),
   outcome and status. Primary actions are ink (near-white in dark), not a brand hue.
10. Critical entities are marked by weight, an ink border and a small danger square, not by red
    fills, so a table full of DNIs does not look like an alarm (brief: "prominent but not red-alarm").
11. Cost chart separates series by fill pattern (actual solid, baseline hatched) as well as hue.

**Data and behaviour**
12. Fixtures: only brief §8 values, contract examples and the project's own synthetic corpus.
    Extra live/audit rows are composed from §8 targets and rules and the §4 enums; client is always
    `demo`; `req-7f3a` is the audit-entry contract example. Simulator "No personal data" and the
    blocked sample reuse corpus cases `c0002` and `c0001`; "Code request" text is new and holds no
    personal data. Cost breakdowns, provider health numbers, eval run metadata (dates, commits,
    durations, dataset sizes) and failing cases are synthetic and sum to / agree with §8 totals.
13. `mistral-small` model is `mistral-small-latest` (policy v3), not stated in the brief.
14. Simulator DNI case shows rule `cheap-short-tasks` (what policy v3 matches for a short summary);
    the §8 live row keeps `default`. **Needs a decision** on which is canonical.
15. "Blocked: inspection failed" assumes `onDetectorError: block`. Policy v3 uses
    `restrict_to_local`, which would route locally instead.
16. Anonymize only reaches Local or EU targets (policy v3), so no anonymized row goes to a US target.
17. Policy versions: the active policy is v3 (contracts), so the editor shows "Save as version 4",
    the toast "Saved as version 4" and the conflict "changed to version 4". The brief's 6 / 7 were
    example numbers.
18. Gateway version in the status tooltip ("0.1.0") is a placeholder; show the real one.
19. Evals answer/judge/frontier models are shown as target ids; replace with the report's values.
20. Brief §3.1 phone top bar shows a status dot; it is an icon button (44 px) that opens a popover
    with the text, so the status is never colour-only.
21. Live traffic re-renders every 5 s when a row arrives; the screen-reader announcement is a polite
    live region throttled to one message per 10 s ("3 new requests").

## Accessibility checklist (as designed)

- WCAG 2.2 AA contrast for every token pair in both themes (ratios in the canvas token sheet).
- Every status has a word and an icon; sensitivity has bars plus a word; charts have a table.
- Global `:focus-visible` outline in `--ring`; skip link; one `h1` per screen (top bar), `h2` per
  region (some visually hidden), `h3` inside cards. The canvas prototype has a "Heading levels"
  overlay that labels them.
- Touch targets 44 px on phone layouts (top bar, sheets, filter button), 32–36 px on desktop.
- Every animation has a fade-only alternative (`prefers-reduced-motion` and the prototype switch).
