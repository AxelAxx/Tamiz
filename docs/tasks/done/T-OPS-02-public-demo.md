# T-OPS-02 — Public demo deployment

| Field | Value |
|---|---|
| Task | `T-OPS-02` (see `docs/tasks/BACKLOG.md`) |
| Feature | — (delivery) |
| Spec | — (backlog definition of done) |
| Branch / PR | `T-OPS-02-public-demo` / PR linked from the merge commit |
| Date | 2026-11-02 |
| Session | Claude Code (Opus 5.5) |
| Status | partially done: everything in the repository is ready and verified locally; the Hetzner server, the DNS name and the Vercel project are Alex's to create (`docs/deploy.md` steps 1–5) |

## What was done

Alex chose **Hetzner, Germany** for the server (2026-11-02). The demo is:
- the dashboard on Vercel, region `fra1`;
- the gateway stack on a Hetzner Cloud server, behind Caddy with a Let's Encrypt
  certificate.

- **`docker-compose.demo.yml`**, an overlay on `docker-compose.yml`:
  - adds `caddy` (ports 80 and 443, `deploy/Caddyfile`);
  - resets the published ports of the gateway, Postgres and Valkey (`!reset []`);
  - binds Jaeger's UI to the loopback only (`!override`);
  - takes the Postgres password from the server's `.env`
    (`TAMIZ_POSTGRES_PASSWORD`, required);
  - moves Ollama and `ollama-pull` to the `local-model` profile, with the gateway's
    `depends_on` on Ollama `required: false`;
  - moves the dashboard to an unused profile (it is on Vercel).
- **`apps/gateway/policies/demo-eu.yaml`**:
  - Mistral (EU) and `ollama-llama` (local), no US target;
  - the same privacy section as `default.yaml`;
  - the default chain is restricted to `eu` and `local`;
  - it needs only `MISTRAL_API_KEY`.

  Two tests cover it: it loads at version 3, and it names no US target.
- **Dashboard for Vercel**:
  - `apps/dashboard/vercel.json`: Next.js, pnpm install, a Turborepo build from the
    repository root so `@tamiz/contracts` is built first, region `fra1`;
  - `next.config.ts` gains `outputFileTracingIncludes` for `/api/evals`. Without it the
    eval reports, which are read with `fs` at request time, would not ship with the
    serverless function (see "How it was verified");
  - the latest `main` evals report (2026-11-02, `10d17b3`) is added to the bundled
    snapshot.
- **`docs/deploy.md`**:
  - choosing the server: 8 GB for the EU route only, 16 GB with the local model; CX/CPX
    lines; `fsn1` or `nbg1`;
  - the Hetzner firewall, and why Docker bypasses `ufw`;
  - DNS, or `sslip.io` without a domain;
  - secrets: generated locally with `pnpm compose:env`, then copied to the server;
  - the server commands, the Vercel variables, who gets in, operations, and the demo's
    limitations.
- **`CLAUDE.md` §13**: the hosting decision is recorded, and the open question becomes
  public access. **`CLAUDE.md` §12, the README limitations and the policies README** are
  updated.

## Files touched

- `docker-compose.demo.yml`, `deploy/{Caddyfile,README.md}` (new).
- `apps/gateway/policies/demo-eu.yaml` (new), `apps/gateway/policies/README.md`,
  `apps/gateway/test/policy/{policy-files,shipped-policies}.test.ts`.
- `apps/dashboard/vercel.json` (new), `apps/dashboard/next.config.ts`,
  `apps/dashboard/data/evals/evals-report-2026-11-02.json` (new).
- `docs/deploy.md` (new), `README.md`, `CLAUDE.md`, `docs/tasks/BACKLOG.md`
  (T-OPS-02 status, new T-OPS-03).

## Decisions

- **Not done by the agent:**
  - creating the server, the DNS record and the Vercel project needs Alex's accounts and
    a payment method;
  - the Mistral key is his.

  The definition of done ("demo URL reachable") is met when he follows `docs/deploy.md`.
  Everything up to that point was run locally.
- **The passphrase is not published.** The dashboard is an operator console: the same
  passphrase opens the policy editor, which changes what the gateway does. A public
  read-only mode needs its own design, so it is a new backlog row (`T-OPS-03`), not a
  quick change here. The `demo` client key is not published either, because every request
  with it spends Mistral credit.
- **One policy for both server sizes.** Without Ollama, `demo-eu.yaml` still boots, since
  a missing local provider is not a configuration error. Local-only requests then fail and
  are audited, and the simulator shows every decision. With `--profile local-model` the
  same file serves both routes.
- **Only Caddy is published.** Docker's iptables rules bypass `ufw`, so the overlay must
  not publish anything else. The Hetzner firewall is the second layer.
- **Secrets are generated off the server.** `pnpm compose:env` needs Node and pnpm, which
  the server does not, and the keys should be in Alex's password manager anyway.
- **`fra1` for the Vercel functions**, so the dashboard's server side, which holds the
  admin key and sees audit metadata, also runs in Germany.

## How it was verified

```bash
pnpm --filter @tamiz/gateway exec vitest run test/policy   # 34 passed (demo-eu loads, v3, no US target)
pnpm --filter @tamiz/dashboard build
# before: .next/server/app/api/evals/route.js.nft.json listed no data/evals file
# after:  it lists data/evals/evals-report-2026-10-31.json (the new report too after this commit)
COMPOSE_FILE="docker-compose.yml;docker-compose.demo.yml" docker compose config   # Windows separator
# services: privacy valkey jaeger postgres gateway caddy (no ollama, no dashboard)
# published: caddy :80 :443; jaeger 127.0.0.1:16686; nothing else
docker compose -p tamiz-demo up -d --build --wait   # TAMIZ_DEMO_DOMAIN=localhost, all healthy in 42 s
```

The checks went through Caddy over HTTPS (Caddy's local CA for `localhost`), with a dummy
Mistral key:
- `GET /health` → `{"status":"ok"}`, with `Strict-Transport-Security` set;
- `GET /v1/admin/audit` without a key → `401`;
- `POST /v1/simulate` with the `ops` key:
  - DNI → `critical`, `restrict_to_local`;
  - email → `high`, `anonymize`;
  - plain text → `none`, `allow`.

Afterwards the stack was taken down with its volumes (`docker compose -p tamiz-demo down -v`).

Not verified here, because it needs the real accounts: the Let's Encrypt certificate on
the public name, the Vercel build and its working directory for `./data/evals`, and
answers from Mistral. `docs/deploy.md` step 5 says what to check after the first deploy.

## Pending / follow-ups

- **Alex:** create the Hetzner server and the DNS record, and follow `docs/deploy.md`
  steps 3–5. Then add the demo URL to the README, `docs/marketing/*` and this record.
- **`T-OPS-03`**: public read-only access to the dashboard.

## Pitfalls for the next session

- **`COMPOSE_FILE` uses `:` on Linux and `;` on Windows.** The docs show the Linux form
  (the server).
- **The Postgres password is fixed on the volume's first start.** Changing
  `TAMIZ_POSTGRES_PASSWORD` later does nothing to an existing volume. Change it inside
  Postgres, or recreate the volume, which loses demo data only.
- **A separate compose project (`-p tamiz-demo`)** keeps a local demo test away from the
  development stack's volumes. The development Postgres was initialized with the password
  `tamiz`.
- **Next only ships files it can trace.** Anything read with `fs` from a computed path
  needs `outputFileTracingIncludes` on serverless hosts. The Docker image did not show
  the problem because it copies `data/` explicitly.

## Links

- Related task records: `docs/tasks/done/T-OPS-01-full-compose.md`,
  `docs/tasks/done/T-008-09-dashboard-delivery.md`
