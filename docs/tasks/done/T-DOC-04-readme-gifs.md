# T-DOC-04 — README GIFs from the final code

| Field | Value |
|---|---|
| Task | `T-DOC-04` (see `docs/tasks/BACKLOG.md`) |
| Feature | — (documentation) |
| Spec | — |
| Branch / PR | `T-DOC-04-readme-gifs` / PR linked from the merge commit |
| Date | 2026-11-04 |
| Session | Claude Code (Opus 5.5) |
| Status | done |

## What was done

Three storyboard GIFs at 1200×675, dark theme, each with numbered captions:

- **`docs/images/demo.gif`** (re-recorded: 16 s, 0.18 MB). The same story as `T-DOC-02`,
  recorded on the code after both audits:
  1. A name, a DNI and an email are typed into the simulator.
  2. They are detected and rated critical, and the request is routed only to
     `ollama-llama`.
  3. The same text is sent to `POST /v1/chat/completions`. It is answered locally
     (`x-tamiz-route: ollama-llama`) and shows in live traffic.
  4. Its audit detail is shown.
- **`docs/images/policy-editor.gif`** (new: 18.5 s, 0.17 MB):
  1. Under `default` v3, a name and an email are anonymized and may go to the EU.
  2. The operator changes `privacy.levels.high` to `restrict_to_local`. A typo
     (`restrict_to_locl`) is flagged inline with its path, and saving is disabled.
  3. The fix is saved as version 4.
  4. The same text is now routed local.
- **`docs/images/cost.gif`** (new: 11.4 s, 0.11 MB): the cost screen over a synthetic week,
  showing the KPIs, the day chart and the route chart with its breakdown.

The README embeds the first GIF at the top, as before. The other two sit in a new
subsection, "The operator console", at the end of "How it works". The cost GIF's caption
says its week is synthetic.

## Files touched

- `docs/images/demo.gif`, `docs/images/policy-editor.gif` (new), `docs/images/cost.gif` (new).
- `README.md`, `docs/tasks/BACKLOG.md`.

## Decisions

- **Hero and policy GIFs on the compose stack.** Detection is the real privacy service,
  and the policy store is PostgreSQL.
  - The hero ran on `local-only.yaml`, and its request was answered by `llama3.1:8b`.
  - The policy GIF needs the default policy, and that policy needs the three cloud
    providers configured. For the recording only, their keys were placeholders and their
    base URLs pointed at `127.0.0.1:9`. Only the simulator and the editor ran, so no
    model was called and nothing left the machine.
- **The cost GIF uses the E2E gateway and synthetic entries.** On the compose stack the
  cloud targets have no keys, so a week of real traffic is not possible there.
  - The recording seeded 268 synthetic audit entries through the E2E gateway's control
    port, which is how `cost.spec.ts` seeds its data.
  - They are spread over seven days, by the default policy's rules, and priced with its
    prices.
  - The dashboard and the cost report are the production code. The README says the
    data is synthetic, and the 84 % saving on screen is not quoted as a result anywhere.
    The figure the README stands behind is the cost eval's.
- **No MCP agent GIF.** The agent runs in a terminal on a local 3B model and takes tens of
  seconds per answer, so a GIF would be mostly waiting. `apps/mcp-server/README.md` says
  how to run it.
- **The recording tools are not committed**, as in `T-DOC-02`. The Playwright scripts and
  the assembler are one-off tools; "Pitfalls" says how to redo them.

## How it was verified

- Each GIF was assembled from frames that were inspected one by one: captions readable,
  nothing important hidden behind them.
- The hero's chat request answered `200` with `x-tamiz-route: ollama-llama`.
- `pnpm lint` passes.

## Pending / follow-ups

- None. The LinkedIn post (`T-DOC-03` drafts) can use the three GIFs.

## Pitfalls for the next session

- **Redoing the GIFs:**
  - Secrets: the recording used fresh secrets generated with `composeEnvFiles`, and
    Alex's `.env.docker` files were restored afterwards. `compose:env` refuses to
    overwrite them without `--force`.
  - Frames: a Playwright script per GIF signs in at `http://localhost:3100`. The origin
    must match `TAMIZ_DASHBOARD_PUBLIC_URL`, so `127.0.0.1` fails the sign-in. The script
    saves a PNG and a duration per frame.
  - Assembly: one palette from a mosaic of every frame, identical frames merged,
    `disposal=1`.
- **Saving in the policy editor writes to the local database.** The recording deleted
  its `default` v4 row afterwards, so the next run starts from v3 again.
- **CodeMirror moves by visual line.** A wrapped YAML line counts twice for ArrowDown.
  Scroll the editor and click the rendered line instead.
- **The E2E gateway's policy page says saves are not persisted.** That is why the policy
  GIF was recorded on the compose stack and not there.

## Links

- Related task records: `docs/tasks/done/T-DOC-02-gif-and-c4.md`, `docs/tasks/done/T-AUD-17-evals-table.md`
