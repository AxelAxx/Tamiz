# T-DOC-01 — Final README

| Field | Value |
|---|---|
| Task | `T-DOC-01` (see `docs/tasks/BACKLOG.md`) |
| Feature | — (documentation) |
| Spec | — (`docs/tamiz-project.md` section 10) |
| Branch / PR | `T-DOC-01-final-readme` / PR linked from the merge commit |
| Date | 2026-11-02 |
| Session | Claude Code (Opus 5.5) |
| Status | done |

## What was done

`README.md` is rewritten for a visitor rather than a contributor. It follows the five
points of `docs/tamiz-project.md` section 10, in this order:

1. **Pitch and image.** The tagline, then a screenshot of the policy simulator
   (`docs/images/simulator.png`, 1440×610 CSS px at 2×, dark). It shows a name, a DNI and
   an email detected, the request rated critical, and the request kept local. The GIF is
   `T-DOC-02`.
2. **Why.** The problem, and the five things the gateway does (inspect, route, resist,
   audit, prove), plus the response headers.
3. **Quick start.**
   - The `T-OPS-01` steps, with the expected `x-tamiz-*` output of the `curl`.
   - A table of where to look: the dashboard, Jaeger and MCP.
   - How to switch to the full policy.
   - The first-build time, stated apart from the start time.
4. **How it works.** A compact Mermaid flow (inspect → decide → protect → execute → audit),
   then the design in one paragraph (pure decision, ports, layer check, Zod contracts).
   Links to `docs/architecture.md`, the three ADRs and the constitution.
5. **Evals.** The table is regenerated with `pnpm evals:readme` from the `evals-report`
   artifact of the last `main` run (commit `10d17b3`). That run adds the leak dataset v2
   (200 cases, 40 with tool calls) and the `values.tool_messages` check. The description
   is updated to match.

Then come:
- **Features**: one row per feature 001–010 with its walkthrough. It replaces the long
  status block.
- **Limitations**, written honestly:
  - statistical name detection, with the measured miss and leak rates;
  - synthetic Spanish data only;
  - quality measured with small local models;
  - anonymization costs context;
  - latency and hardware;
  - a rule-based classifier;
  - stream fallback only before the first token;
  - one passphrase, and an unauthenticated privacy service;
  - no public demo yet.
- **Project and Developing**: `pnpm arch` and `pnpm evals` are added, plus the host-run
  steps for the gateway.

## Files touched

- `README.md` (rewritten), `docs/images/simulator.png` (new).
- `docs/tasks/BACKLOG.md`.

## Decisions

- **The README states figures only where a run backs them.** The miss rate (1 − recall
  0.8909) and the leak rate (0.83 %) are the PERSON results of the generated table. Start
  times are the measured ones (see below).
- **The screenshot shows `local-only` v3**, the policy a fresh stack starts on. It is
  exactly what a visitor following the quick start will see.
- **The long per-feature status block was replaced** by a table with links. Each
  feature's detail lives in its quickstart and spec, and the README was repeating it.
- **`docs/tamiz-project.md` is linked as Spanish working notes.** It predates ADR-0002,
  and the README says so rather than hiding it.

## How it was verified

The quick start was run from scratch on `main` (`5ae9c73`), as a visitor would run it:

```bash
# codeload tarball of main → C:\tf\tamiz-main (no .git, no node_modules, no .env.docker)
pnpm install                                   # 13.8 s
"fresh-quickstart-passphrase" | pnpm compose:env    # exit 0, two keys printed
docker compose up -d                           # 40 s (BuildKit layer cache warm from T-OPS-01)
docker compose down && docker compose up -d --wait   # all services healthy in 17.8 s
docker wait tamiz-main-ollama-pull-1           # 0 (new project volume: the model downloaded again)
curl … (the README command, verbatim)          # the four x-tamiz-* lines shown in the README
Dashboard /audit after sign-in                  # 1 entry: ollama-llama, critical, local only, DNI ×1
```

- Every relative link in the README resolves (checked with a script over `](…)` targets).
- `pnpm evals:readme` still finds its markers.

A cold image build (no BuildKit cache) took about six minutes during `T-OPS-01`. The
README states that figure.

## Pending / follow-ups

- `T-DOC-02`: the simulator GIF (it can replace or sit next to the screenshot) and the C4
  diagrams.
- The Jaeger screenshot placeholder of the old status block is gone. If the README should
  show a trace, `T-DOC-02` is the place.

## Pitfalls for the next session

- **Windows path length.** `pnpm install` under a deep folder (over about 100 characters)
  leaves `esbuild.exe` unreachable, and `tsx` fails with `spawn … esbuild.exe ENOENT`.
  That is the 260-character limit, not the repository. Use a short path.
- **Windows PowerShell's `>` writes UTF-16.** Download binary files with
  `Invoke-WebRequest -OutFile`, not `gh api … > file`.
- **`pnpm install` on a fresh tree prints "Ignored build scripts"** (esbuild, msw,
  protobufjs, cpu-features). It is harmless for every command in the README.
- **Screenshots:** the browser pane scales an emulated viewport down to fit. Capture
  README images with a small Playwright script (`deviceScaleFactor: 2`,
  `reducedMotion: "reduce"`), then wait for the last step of the simulator's decision.

## Links

- Related task records: `docs/tasks/done/T-OPS-01-full-compose.md`,
  `docs/tasks/done/T-007-06-evals-ci-job.md` (the evals job and `evals:readme`)
