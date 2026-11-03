#!/usr/bin/env bash
# Runs on each start of the codespace (T-OPS-06). On the first start Codespaces may run it
# before setup.sh has finished, so it starts the stack only once setup.sh has written
# `.env`; setup.sh starts it itself on creation.
set -euo pipefail

if [ -f .env ]; then
  docker compose up -d --build
else
  echo "setup.sh has not finished yet; it starts the stack when it does"
fi
