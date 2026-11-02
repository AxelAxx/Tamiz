# T-DOC-02 — Demo GIF and C4 diagrams

| Field | Value |
|---|---|
| Task | `T-DOC-02` (see `docs/tasks/BACKLOG.md`) |
| Feature | — (documentation) |
| Spec | — |
| Branch / PR | `T-DOC-02-gif-and-c4` / PR linked from the merge commit |
| Date | 2026-11-02 |
| Session | Claude Code (Opus 5.5) |
| Status | done |

## What was done

- **`docs/images/demo.gif`** (1200×675, 17 s, 0.25 MB, 32 frames). It is recorded from
  the real compose stack on `policies/local-only.yaml` and replaces the static simulator
  screenshot at the top of the README. Four captioned steps:
  1. a request with a name, a DNI and an email is typed into the simulator;
  2. the decision: PERSON, DNI and EMAIL detected, rated critical, local only, routed to
     `ollama-llama`;
  3. the same text sent to `POST /v1/chat/completions` with the client key. It appears in
     live traffic, answered by the local model;
  4. its audit detail: route, entities and cost, with "Tamiz never stores what was said".
- **C4 diagrams in `docs/architecture.md`**:
  - **level 1, system context**: operator, client application, MCP host, Tamiz inside the
    deployment, Mistral and Anthropic/OpenAI, each edge labelled with what data may cross;
  - **level 2, containers**: dashboard, MCP server, gateway, privacy service, Ollama,
    PostgreSQL, Valkey and Jaeger, each edge labelled with its protocol and key.
- **A broken diagram fixed.** The request-flow sequence diagram in `docs/architecture.md`
  did not render: a `;` inside a message ends a Mermaid statement. Two messages now use a
  comma.
- `docs/images/simulator.png` (from `T-DOC-01`) is removed: the GIF opens with the same
  view.

## Files touched

- `docs/images/demo.gif` (new), `docs/images/simulator.png` (deleted).
- `docs/architecture.md`, `README.md`, `docs/tasks/BACKLOG.md`.

## Decisions

- **C4 drawn as Mermaid flowcharts, not `C4Context` / `C4Container`.** Mermaid's C4
  renderer laid the relation labels over each other and over the boxes, in both diagrams.
  Flowcharts with C4 colours, `[Person]` / `[Container: …]` stereotypes and a dashed
  boundary render cleanly on GitHub. The section says why.
- **The context diagram labels what may cross each boundary**, by the rules of
  `default.yaml`:
  - towards Mistral: no critical data, and names, emails and phones anonymized;
  - towards the US providers: at most locations, the only low-sensitivity kind.

  "No personal data" would have been wrong for the US providers.
- **Captions are injected into the page during the recording only.** Nothing in the
  dashboard changed. The recording script and the GIF assembly were one-off tools and are
  not committed (see "Pitfalls" for how to redo them).
- **A storyboard GIF, not a screen video.** Frames are taken at the moments that matter,
  each with its own duration, and identical frames are merged. That keeps it at 0.25 MB,
  far under the 5 MB limit, with sharp text from a shared 128-colour palette.

## How it was verified

- Every Mermaid block in `docs/architecture.md` (7) and `README.md` (1) renders with
  mermaid 11.4.1 in headless Chromium. Before the fix, the request-flow diagram failed with
  "Parse error on line 27". The two C4 diagrams were inspected as screenshots.
- The GIF plays in the image viewer: 32 frames, 17.3 s, 0.25 MB.
- `pnpm lint` passes.

## Pending / follow-ups

- None for this task. `T-DOC-03` (LinkedIn post and case study) can use the GIF and the
  C4 diagrams.

## Pitfalls for the next session

- **Redoing the GIF:**
  1. start the stack (`docker compose up -d`) and keep the `demo` client key;
  2. in `apps/dashboard`, a Playwright script signs in and drives the simulator, sends
     the request with `fetch`, opens the live-traffic row, and saves a PNG plus a duration
     for each frame;
  3. assemble with `uv run --with pillow python -I make_gif.py <frames> <out.gif> 1200`:
     one shared palette from the last frame, identical frames merged, `disposal=1`.
- **Live traffic shows only recent requests.** On a stack with only old entries it opens
  on its empty state, so wait for the row or the empty state.
- **Mermaid sequence diagrams:** `;` ends a statement even inside a message.
- **`C:\gifframes` cannot be deleted from this agent environment** (protected path). Use a
  folder you own (`C:\tf` was used).

## Links

- Related task records: `docs/tasks/done/T-DOC-01-final-readme.md`,
  `docs/tasks/done/T-OPS-01-full-compose.md`
