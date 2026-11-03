#!/usr/bin/env bash
# Printed in the codespace's first terminal (T-OPS-06): where the dashboard is, how to sign
# in, and whether the stack is up yet.
# From `.env`, which setup.sh writes: an SSH session (`gh codespace ssh`) lacks the
# Codespaces variables.
url="$(sed -n 's/^TAMIZ_DASHBOARD_PUBLIC_URL=//p' .env 2>/dev/null)"
url="${url:-"(not ready yet: setup.sh is still running)"}"
cat <<TEXT

  Tamiz demo
  ----------
  Dashboard: $url   (also in the Ports tab)
  Sign in with the passphrase below. Demo data only: never paste real personal data.

$(sed 's/^/  /' .devcontainer/credentials.txt 2>/dev/null)

  The first start builds the images and pulls qwen2.5:1.5b: about 10 minutes.
  Progress: docker compose ps      Model download: docker compose logs -f ollama-pull
  Requests to try: docs/deploy.md, section "Free demo: GitHub Codespaces".

TEXT
