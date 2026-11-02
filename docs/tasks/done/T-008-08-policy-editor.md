# T-008-08 — Policy editor (dashboard half)

| Field | Value |
|---|---|
| Task | `T-008-08` (see `docs/tasks/BACKLOG.md`); the gateway half was `T-008-12` |
| Feature | `008-dashboard` |
| Spec | `specs/008-dashboard/spec.md` (US5) |
| Branch / PR | `T-008-08-policy-editor` / PR linked from the merge commit |
| Date | 2026-11-02 |
| Session | Claude Code (Opus 5.5) |
| Status | done |

## What was done

The policy editor: open the active policy as YAML, see problems with their paths while
typing, and save it as the next version without overwriting anyone (spec 008 US5,
`tasks.md` T041–T043, design `screens/policy.html`, research R-12).

- **BFF `PUT /api/policy`** is a write: the origin is checked first, then the session. The
  body is validated with `ReplacePolicyRequestSchema` before the gateway is called.
  Gateway issues and `conflict` come back in `gatewayError`. The policy is never logged.
- **Header**:
  - id, version and an "Unsaved changes" badge;
  - the source: "the policy file at boot", or "Saved version · saved <UTC> by <admin>";
  - the persistence line, or the "Not persistent" warning (US5-1, US5-7);
  - "Try in simulator".
- **Editor**: CodeMirror 6 with YAML highlighting, line numbers, a lint gutter, history,
  `Tab` indent (`Esc` then `Tab` leaves), and `Mod-s` to save. Colours come from the
  design tokens, so both themes work.
- **Shape check while typing** (US5-2), 300 ms after the last edit:
  - `yaml.parseDocument` → `RoutingPolicySchema.safeParse`, the gateway's own schema;
  - each issue gets its dot path and line (through `LineCounter` and the node ranges);
  - an unknown key is placed on the key itself and named in the path
    (`resilience.retries`);
  - a missing section is placed on its parent;
  - YAML syntax errors appear as issues at their line, before any schema check.
- **Issues panel**:
  - says whether the issues were "Checked in the browser · fix before saving" or "Refused
    by the gateway on save";
  - each issue has its path, message and a "line N" button that jumps there;
  - a polite live region says the count;
  - the Outline tab lists sections, targets and rules with their lines.
- **Save** sends `{ baseVersion, policy }`. It is disabled while there are no changes,
  while a check is pending, or while the browser check fails.
  - **Saved** (US5-4): the editor takes the new version, shows "Saved as version N", and
    refreshes the shared `["policy"]` query (the audit log's rule picker).
  - **Refused with issues** (US5-3): they go to the same list and gutter, mapped to lines.
  - **Conflict** (US5-5): a dialog says the policy changed and nothing was saved. It offers
    "Copy my draft first" and "Reload (lose my changes)".
  - **Other errors**: shown inline as "Not saved: …".
- **Unsaved-changes guard**: `beforeunload`, plus a confirm before following a link inside
  the app. "Discard changes" restores the loaded text; "Reload from gateway" loads the
  latest version.
- **Session expiry** uses the shell's in-place dialog (`T-008-10`): the editor stays
  mounted, so the draft survives signing in again.

## Files touched

- `apps/dashboard/src/app/api/policy/route.ts` (`PUT`).
- `src/lib/api-client.ts` (`api.replacePolicy`).
- `apps/dashboard/src/features/policy-editor/editor/{policy-yaml.ts,yaml-editor.tsx,policy-editor.tsx}`
  (new); `src/app/(console)/policy/page.tsx`.
- `apps/dashboard/package.json`: these versions are pinned:
  - `@codemirror/{view 6.43.15, state 6.7.6, lang-yaml 6.1.3, lint 6.9.7, language 6.13.1, commands 6.11.1}`;
  - `@lezer/highlight 1.2.5`;
  - `yaml ^2.9.1`, the same range as the gateway and evals.
- `apps/dashboard/test/yaml-issues.test.ts` (new, T041).
- `e2e/policy-editor.spec.ts` (new, T042).
- `e2e/accessibility.spec.ts`: the editor with an issue, in both themes.
- `CLAUDE.md` §4: CodeMirror 6 and `yaml` in the dashboard row, as research R-12 noted.
- `specs/008-dashboard/tasks.md` (T041–T043 ticked), `docs/tasks/BACKLOG.md`.

## Decisions

- **The browser checks the shape only.** Cross-field rules (a route naming an undeclared
  target, duplicate ids, unconfigured providers) are the gateway domain's `validatePolicy`.
  The dashboard cannot import gateway code, and copying the rules would let the two drift.
  The design showed "Unknown target" as a browser issue; here it arrives on save as a
  gateway issue at the same path and line (US5-3, which the spec assigns to the gateway).
- **Gateway issue paths start at the request body** (`policy.rules.0.route.1`). The editor
  strips the leading `policy.`, because it holds the policy itself.
- **The YAML layout** follows `policies/default.yaml`:
  - a blank line between sections;
  - scalar lists and small maps (up to 3 keys of scalars or scalar lists) on one line,
    with no padding inside brackets;
  - comments are not kept (R-12): the gateway stores the parsed document.
- **The editor keeps the version it loaded.** Later refetches of `["policy"]` never replace
  a draft; only Save, Reload, Discard and the conflict's Reload do.
- **The CodeMirror content has an explicit `tabindex="0"`.** axe reported
  `scrollable-region-focusable` on `.cm-scroller`, because a `contenteditable` does not
  count as focusable content for that rule.
- **The unsaved-changes guard uses `window.confirm`** for in-app links. The App Router has
  no navigation-blocking API.
- **The file heading is `<id>.yaml`.** The gateway does not report the file path that the
  design's header names.

## How it was verified

```bash
pnpm lint        # Found 2 warnings. Found 92 infos. (none new)
pnpm typecheck   # exit 0
pnpm arch        # ✔ no dependency violations found (154 modules, 565 dependencies cruised)
pnpm test        # Test Files 141 passed (141); Tests 1480 passed | 6 skipped (1486)
pnpm build       # exit 0
CI=1 pnpm --filter @tamiz/dashboard exec playwright test --retries=0   # 78 passed
```

`policy-editor.spec.ts` covers:
- US5-1 / US5-7: header, source and the not-persistent warning;
- US5-2: a wrong enum and an unknown key listed within 1 s, save disabled, the line marked;
- US5-3: an undeclared target refused by the gateway with its path, version unchanged;
- US5-4: save → version 4, then the simulator shows "version 4";
- US5-5: a conflict after another save through the API, then Reload;
- the unsaved-changes guard and Discard;
- a cross-origin `PUT` refused with 403.

Checked by hand at 1440 and 390 px against `design/screenshots/policy-*-dark-*.png`.

## Pending / follow-ups

- No new backlog rows. US5-6 (client key 403) and US5-8 (different id) are gateway
  behaviours covered by `T-008-12`'s route tests.

## Pitfalls for the next session

- **CodeMirror renders only the visible lines.** A locator's text holds the first screenful,
  so assert on text near the top, or scroll first.
- **To replace the editor's text in Playwright**, click it, press `ControlOrMeta+a`, then
  `page.keyboard.insertText(text)`. Typing line by line would trigger auto-indent.

## Links

- Spec / plan / tasks: `specs/008-dashboard/` (research R-10 … R-12)
- ADRs: none added
- Related task records: `docs/tasks/done/T-008-12-policy-admin-api.md`, `docs/tasks/done/T-008-04-simulator.md`
