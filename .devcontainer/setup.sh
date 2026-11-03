#!/usr/bin/env bash
# Runs once, when the codespace is created (T-OPS-06). Writes the compose secrets with a
# generated passphrase, points the gateway at the small-model policy, and tells compose to
# use the Codespaces overlay with the dashboard's forwarded address.
set -euo pipefail

npm install --global --no-fund --no-audit pnpm@10.34.7
pnpm install --frozen-lockfile --filter "@tamiz/dashboard..." --filter tamiz

if [ ! -f apps/gateway/.env.docker ]; then
  passphrase="$(openssl rand -base64 18)"
  keys="$(printf '%s\n' "$passphrase" | pnpm --silent compose:env)"
  sed -i 's|^TAMIZ_POLICY_FILE=.*|TAMIZ_POLICY_FILE=policies/codespaces.yaml|' apps/gateway/.env.docker
  {
    echo "Dashboard passphrase: $passphrase"
    echo "$keys" | grep -E '(client|admin) key'
  } > .devcontainer/credentials.txt
  chmod 600 .devcontainer/credentials.txt
fi

cat > .env <<ENV
COMPOSE_FILE=docker-compose.yml:docker-compose.codespaces.yml
TAMIZ_DASHBOARD_PUBLIC_URL=https://${CODESPACE_NAME}-3100.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}
ENV
