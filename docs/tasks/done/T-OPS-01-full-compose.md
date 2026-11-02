# T-OPS-01 — Full Docker Compose stack

| Field | Value |
|---|---|
| Task | `T-OPS-01` (see `docs/tasks/BACKLOG.md`) |
| Feature | — (delivery) |
| Spec | none (area X); backlog definition of done |
| Branch / PR | `T-OPS-01-full-compose` / PR linked from the merge commit |
| Date | 2026-11-02 |
| Session | Claude Code (Opus 5.5) |
| Status | done |

## What was done

`docker compose up` now runs the whole stack:
- gateway, privacy service and dashboard;
- Postgres, Valkey, Ollama and Jaeger.

The gateway and the dashboard wait for the services they depend on to be healthy.

- **Gateway image** (`apps/gateway/Dockerfile`, with `Dockerfile.dockerignore` next to it):
  - multi-stage on `node:22-alpine`;
  - the builder installs the locked workspace filtered to `@tamiz/gateway...`, builds it
    with Turborepo, and runs `pnpm deploy --prod --legacy` to collect the production
    dependencies;
  - the runtime holds those dependencies, `dist`, `drizzle` (migrations run at boot),
    `prompts` and `policies`;
  - it runs as `node`, healthcheck `GET /health`; 331 MB on disk.
- **`docker-compose.yml`**:
  - `gateway` on :3000. Its secrets and policy come from `apps/gateway/.env.docker`
    (`format: raw`). The addresses of its dependencies are in `environment`: privacy,
    Ollama, Valkey, Postgres, Jaeger OTLP.
  - `depends_on` with `service_healthy` on privacy, Postgres, Valkey and Ollama;
    `service_started` on Jaeger.
  - `ollama` (`ollama/ollama:0.40.5`, the CI image): models in the `ollama-models` volume,
    healthcheck `ollama list`.
  - `ollama-pull`: a one-shot service that pulls `llama3.1:8b`, the local target of both
    policies, and exits. It is a no-op once the model is in the volume.
  - `dashboard` now depends on a healthy `gateway`, and compose sets `TAMIZ_GATEWAY_URL`
    to `http://gateway:3000`. The `host.docker.internal` mapping from `T-008-09` is gone.
  - The gateway and the dashboard run `read_only` with a tmpfs on `/tmp`.
- **`pnpm compose:env`** (`apps/dashboard/scripts/compose-env.ts`, pure part in
  `compose-env-files.ts`, tested in `test/compose-env.test.ts`). It reads the dashboard
  passphrase on standard input and writes both `.env.docker` files (git-ignored, mode 600):
  - the gateway gets the client key `demo`, the admin keys `ops` and `dashboard` (hashes
    only), a random audit hash key, `TAMIZ_POLICY_FILE=policies/local-only.yaml` and
    empty cloud keys;
  - the dashboard gets its admin key, the passphrase hash and a session secret.

  It prints the `demo` and `ops` keys once. Existing files are kept unless `--force`.
- **Bug found and fixed**: piped from Windows PowerShell, the passphrase arrives with a
  byte order mark in front. `hash-passphrase` (from `T-008-02`) and `compose-env` hashed
  it, so the typed passphrase was then refused at sign-in. Both scripts now strip it.
- **CI** (`ci` job): `docker build` of the gateway and `docker compose config --quiet`. The
  commented-out "OPS: whole stack" placeholder is gone. A full `docker compose up` in CI
  was not added: the `evals` job already runs the services against a real model.
- **Docs**:
  - README "Quick start" (secrets step, `up`, the model download, the DNI request with
    `curl`, where to look);
  - `CLAUDE.md` §12;
  - `.env.example` header;
  - `specs/008-dashboard/quickstart.md` §4.

## Files touched

- `apps/gateway/{Dockerfile,Dockerfile.dockerignore}` (new).
- `docker-compose.yml`, `.github/workflows/ci.yml`, `package.json` (`compose:env`).
- `apps/dashboard/scripts/{compose-env,compose-env-files}.ts` (new),
  `apps/dashboard/scripts/hash-passphrase.ts`, `apps/dashboard/package.json`,
  `apps/dashboard/test/compose-env.test.ts` (new).
- `README.md`, `CLAUDE.md`, `.env.example`, `specs/008-dashboard/quickstart.md`,
  `docs/tasks/BACKLOG.md`.

## Decisions

- **The stack starts on `local-only.yaml`.** `default.yaml` names Mistral, OpenAI and
  Anthropic targets, and the gateway refuses to boot without their keys. A first
  `docker compose up` must work with no account anywhere. The generated file says how to
  switch, and so does the README.
- **Secrets in an env file, addresses in compose.** Compose's `environment` wins over
  `env_file`, so the network wiring cannot drift from the file, and the generated file
  holds only what is secret or a choice. Both env files are `required: false`. Without
  them, the gateway and the dashboard exit and name each missing variable, which is
  clearer than a compose error. It also keeps `docker compose up valkey` working for
  host development.
- **The gateway does not wait for the model.** Waiting would make the first start take as
  long as a 5 GB download, against the definition of done ("model pull excluded"). Until
  the pull ends, local requests fail. The circuit and the dashboard show that, as they
  would for any provider outage.
- **The generator lives in the dashboard package.** It reuses `hashPassphrase`, and
  `tsx` is already there. The root has no TypeScript runner. API key generation is three
  lines in the gateway's format (`tmz_` + 32 bytes base64url, SHA-256 hex). The test checks
  that format rather than importing across apps.
- **Postgres and Valkey keep their published ports** for a gateway run on the host
  (`pnpm --filter @tamiz/gateway dev`). Privacy and Ollama stay internal.
- **The MCP server is not in the stack.** `specs/009-mcp-agent` marks it optional. It runs
  from the host against `http://localhost:3000` with the `ops` key.

## How it was verified

```bash
pnpm lint / typecheck / arch / test / build      # see the PR checks; all green locally
docker build -f apps/gateway/Dockerfile -t tamiz-gateway .   # exit 0, 331 MB
docker run --rm tamiz-gateway                     # exit 1, names TAMIZ_API_KEYS and TAMIZ_PRIVACY_URL
pnpm compose:env                                  # writes both files, prints 2 keys
docker compose down && docker compose up -d --wait   # all 7 services healthy in 17.7 s (images built)
docker compose logs ollama-pull                   # llama3.1:8b, 4.9 GB, exit 0
curl POST /v1/chat/completions "Resume el expediente de 12345678Z…"   # 200 in 12 s
#   x-tamiz-sensitivity: critical, x-tamiz-privacy: restrict_to_local,
#   x-tamiz-route: ollama-llama, model llama3.1:8b
Jaeger /api/v3/traces?query.service_name=tamiz-gateway
#   tamiz.request (tamiz.entities.DNI=1, tamiz.route=ollama-llama, policy local-only v3)
#   + "chat llama3.1:8b" (gen_ai.provider.name=ollama), events privacy.inspected,
#   privacy.action, routing.decision
Dashboard http://localhost:3100/audit             # sign in, both requests listed: Local
#   ollama-llama, critical, local only, DNI ×1, $0.0000
```

"Clean machine" was approximated: images built, volumes kept, containers removed. The
first build takes about six minutes, mostly the privacy image with the spaCy model, and
is not part of the two minutes.

## Pending / follow-ups

- Jaeger and dashboard screenshots for the README: `T-DOC-01` / `T-DOC-02`.
- `T-010-03` (Citara example against this stack) is now unblocked.
- `T-OPS-02` (public demo) can reuse this compose file with a profile for the VPS.

## Pitfalls for the next session

- **Jaeger 2.x answers `/api/traces` with 404.** The query API is
  `/api/v3/traces?query.service_name=…&query.start_time_min=…&query.start_time_max=…`.
- **Piping into a Node script from Windows PowerShell 5.1 adds a BOM.** Strip `﻿`
  from anything read from standard input.
- **The worktree's compose project is named after the folder**
  (`t-008-06-cost-analytics-*`). Another checkout gets its own containers but the same
  host ports, so stop one stack before starting another.

## Links

- Related task records: `docs/tasks/done/T-008-09-dashboard-delivery.md`,
  `docs/tasks/done/T-006-03-postgres-persistence.md`,
  `docs/tasks/done/T-006-05-opentelemetry.md`, `docs/tasks/done/T-004-02-privacy-skeleton.md`
