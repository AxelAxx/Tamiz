# T-AUD-15 — Run path and honest docs

| Field | Value |
|---|---|
| Task | `T-AUD-15` (see `docs/tasks/BACKLOG.md`) |
| Feature | — (repository, compose, docs) |
| Spec | — (`docs/audit/2026-11-04-second-audit.md`) |
| Branch / PR | `T-AUD-15-run-path-docs` / PR linked from the merge commit |
| Date | 2026-11-04 |
| Session | Claude Code (Opus 5.5) |
| Status | done (marketing drafts left for the LinkedIn step, see Decisions) |

## What was done

This task fixes the findings of the second audit's "first look by an outside engineer"
(`docs/audit/2026-11-04-second-audit.md`).

**Running the stack:**

- **F2, F6:**
  - Every port the compose file publishes is now bound to `127.0.0.1`.
  - A new overlay, `docker-compose.dev.yml`, publishes the privacy service (8001) and
    Ollama (11434) for a gateway run on the host.
  - The compose header and the README's host-run steps now match the files.
- **F3:** `pnpm --filter @tamiz/gateway dev` loads `apps/gateway/.env` with
  `--env-file-if-exists`.
- **F7:** the MCP server's default HTTP port is 3101. The dashboard keeps 3100.

**README figures and claims:**

- **F5, F8, F9, F10:** the README's figures and paths are corrected:
  - Compose v2.30 or later, for `env_file.format`;
  - about 15 GB of disk;
  - policy paths under `apps/gateway/`;
  - "healthy in about a minute".
- **F4, F11:**
  - The "Proves it" list names the agent eval and says cost is reported, not gated.
  - The detection eval is described by its gated recall.
  - `x-tamiz-rule` is listed among the response headers.
- **F13:** a `ci` badge was added.

**CLAUDE.md and records:**

- **F14:**
  - CLAUDE.md places `decide()` in `routing-decision.ts`.
  - §13 records the required checks (`ci` and `evals`) and the branch settings Alex chose
    on 2026-11-04.
  - The stack table no longer claims TanStack Table.
- **G10:** internal audit ids in source comments ("code audit 2026-11-03, L6",
  "second audit, D1") are removed, and the reason each comment states stays. Test names
  keep their ids, as traceability.
- **Records:** the `T-AUD-03` record (README table) and the `T-AUD-07` record (first
  backoff) are corrected.

## Files touched

- Compose and dev script: `docker-compose.yml`, `docker-compose.dev.yml` (new), `apps/gateway/package.json` (`dev`), `.github/workflows/ci.yml` (`config` check of the overlay).
- MCP server port:
  - `apps/mcp-server/src/config.ts`, `src/agent/demo.ts`, `README.md`;
  - tests: `test/{readme,transport-http,permissions}.test.ts`.
- Docs:
  - `README.md`, `CLAUDE.md` (§4, §5, §12, §13), `docs/deploy.md`;
  - `docs/tasks/done/T-AUD-03-agent-eval-baseline.md`, `docs/tasks/done/T-AUD-07-dashboard-state-session.md`.
- Source comments across `apps/*/src`, `packages/*/src`, `services/privacy/{src,scripts}` and `examples/*/src`: ids removed, reasons kept.

## Decisions

- **Bind to 127.0.0.1, not drop the ports.** A gateway on the host and the dashboard's
  dev server need Postgres and Valkey, so their ports stay published, on this machine
  only. Codespaces forwards localhost ports, so its path is unchanged.
- **An overlay, not more published ports in the base file.** The privacy service and
  Ollama hold the most sensitive traffic. In the default stack they stay on the compose
  network; the overlay exposes them only to someone who asks for host-run development.
- **The marketing drafts are not changed.** `docs/marketing/` is marked as drafts awaiting
  Alex, and finishing them is the LinkedIn step of his plan (`T-DOC-03`). Their figures
  are updated in `T-AUD-17`, from the final evals report.
- **The README evals table is not changed here.** It is generated from a `main` run after
  every fix (`T-AUD-17`).

## How it was verified

```bash
pnpm exec vitest run apps/mcp-server   # 80 passed (port moved in config, README and tests)
pnpm exec biome check . ; (cd services/privacy && uv run ruff check . && uv run ruff format --check .)   # clean
pnpm exec tsx --env-file-if-exists=.env.probe -e "…"   # loads a present file, tolerates a missing one
```

**Not run here: `docker compose config` and the host-run path end to end.** This machine
has no Docker. The overlay is two `ports` entries on existing services. CI now runs
`docker compose config` on it, as on the base and demo files.

## Pending / follow-ups

- The marketing drafts (`T-DOC-03`) and the README evals table (`T-AUD-17`).

## Pitfalls for the next session

- **`.env.example` lives at the repository root**, but `dev` reads `apps/gateway/.env`:
  the gateway's working directory.

## Links

- Audit: `docs/audit/2026-11-04-second-audit.md` (F2-F14, G10)
