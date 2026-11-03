# T-OPS-06 — Free demo in GitHub Codespaces

| Field | Value |
|---|---|
| Task | `T-OPS-06` (see `docs/tasks/BACKLOG.md`) |
| Feature | — |
| Spec | — (operations; `docs/deploy.md`) |
| Branch / PR | `T-OPS-06-codespaces-demo` / PR linked from the merge commit |
| Date | 2026-11-03 |
| Session | Claude Code (Opus 5.5) |
| Status | done |

## What was done

On 2026-11-03 Alex decided to pay for no hosting and to give no card to any provider, so
the hosted demo of `T-OPS-02` is not deployed. The live demo is now a GitHub Codespace on
each visitor's own free quota:

- the README's quick start has an "Open in GitHub Codespaces" button;
- `.devcontainer/` runs the full compose stack with a small local model, generated secrets
  and a welcome message with the dashboard's address and the credentials;
- `docs/deploy.md` documents it first and keeps the hosted guide for anyone who pays.

## Files touched

- `.devcontainer/devcontainer.json`: Ubuntu 24.04 base, Docker-in-Docker, Node 22, SSH server; a 4-core, 16 GB machine; ports 3100, 3000 and 16686.
- `.devcontainer/setup.sh`: pnpm, `pnpm compose:env` with a generated passphrase, the policy, then `docker compose up`; writes `.env` last.
- `.devcontainer/start.sh`: compose up on later starts, only once `.env` exists.
- `.devcontainer/welcome.sh`: address and credentials on attach.
- `docker-compose.codespaces.yml`: the dashboard's public URL (forwarded port), and `qwen2.5:1.5b` for `ollama-pull`.
- `apps/gateway/policies/codespaces.yaml` (new) and `apps/gateway/test/policy/policy-files.test.ts`.
- `.gitignore`: `.devcontainer/credentials.txt`, `.devcontainer/compose.env`.
- `README.md`, `docs/deploy.md`, `CLAUDE.md` (§12, §13), `docs/tasks/BACKLOG.md`.

## Decisions

- **Codespaces, not a free host.** Every free host was ruled out:
  - Hugging Face Docker Spaces need PRO since 2026; `create_repo` answered `402`;
  - Render and Koyeb give about 512 MB, and the privacy service alone needs more than
    1.5 GB for `es_core_news_lg`;
  - Oracle, Google Cloud and Fly.io ask for a card.

  A codespace runs the real stack, costs the owner nothing, and does not depend on Alex's
  computer.
- **No fake detector on Vercel.** A serverless demo would need a stand-in for Presidio,
  which would show something other than the product.
- **`qwen2.5:1.5b` and its own policy.** It answers in about 10 s on 4 cores, against 10 to
  30 s for `llama3.1:8b`, and it downloads 1 GB instead of 5 GB. The policy anonymizes high
  and keeps critical local, as `demo-eu.yaml` does.
- **`setup.sh` starts the stack itself.** Codespaces ran `postStartCommand` while
  `postCreateCommand` was still installing, so the stack came up without its secrets.
  `start.sh` therefore waits for `.env`, which `setup.sh` writes last.
- **Ports stay private.** Only the codespace's owner, signed in to GitHub, reaches the
  dashboard, so the generated passphrase protects nothing more than a GitHub session
  already does.

## How it was verified

```bash
pnpm exec vitest run apps/gateway/test/policy/policy-files.test.ts   # 8 passed
pnpm exec biome check .devcontainer docker-compose.codespaces.yml apps/gateway   # no errors
```

These checks ran in a real codespace (`standardLinux32gb`) on the branch, created with
`gh codespace create`:

- `setup.sh` finished;
- `docker compose ps` showed every service healthy and `ollama-pull` exited after
  `success`;
- a chat request with a DNI answered `200` in 10 s, with headers:
  - `x-tamiz-sensitivity: critical`
  - `x-tamiz-privacy: restrict_to_local`
  - `x-tamiz-route: ollama-qwen`
- signing in to the dashboard with the passphrase, from the forwarded origin
  (`https://<codespace>-3100.app.github.dev`), answered `200`;
- the audit list through the BFF returned the request's entry.

The test codespaces were deleted afterwards.

**Not verified:** opening the forwarded dashboard in a browser. It needs a browser signed
in to GitHub as the codespace's owner. The origin check passed with the address that
`setup.sh` computed.

## Pending / follow-ups

- The README GIFs (next step of Alex's plan) can be recorded from a codespace or locally.
- `T-OPS-02`'s hosted guide stays as documentation only.

## Pitfalls for the next session

- **`postStartCommand` does not wait for `postCreateCommand`** on the first start of a
  codespace. Do not move the compose start back into `postStartCommand` alone.
- **`gh codespace ssh` and `gh codespace logs` need the `sshd` feature**, and the `gh`
  token needs the `codespace` scope (`gh auth refresh -h github.com -s codespace`).
- **An SSH session lacks `CODESPACE_NAME`** and the forwarding domain. Read the address
  from `.env`, as `welcome.sh` does.
- **The creation log** is at `/workspaces/.codespaces/.persistedshare/creation.log`.
- **Hugging Face Docker Spaces are no longer free.** Static Spaces still are.

## Links

- `docs/deploy.md`, section "Free demo: GitHub Codespaces"
- Related task records: `docs/tasks/done/T-OPS-01-full-compose.md`,
  `docs/tasks/done/T-OPS-02-public-demo.md`
