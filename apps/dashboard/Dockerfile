# Tamiz dashboard (spec 008 tasks.md T054). Multi-stage: the builder installs the locked
# workspace and builds the dashboard with its workspace dependencies (Turborepo); the
# runtime image holds only Next.js's standalone server, its static files and the evals
# snapshot, and runs as the unprivileged `node` user. The root filesystem can be read-only
# (compose mounts a tmpfs on /tmp). Build from the repository root:
#
#   docker build -f apps/dashboard/Dockerfile -t tamiz-dashboard .

FROM node:22-alpine AS builder
ENV HUSKY=0 \
    NEXT_TELEMETRY_DISABLED=1 \
    TURBO_TELEMETRY_DISABLED=1 \
    DO_NOT_TRACK=1
RUN npm install --global --no-fund --no-audit pnpm@10.34.7
WORKDIR /repo
# Manifests first, so a source change does not invalidate the install layer.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/dashboard/package.json apps/dashboard/
COPY apps/gateway/package.json apps/gateway/
COPY apps/mcp-server/package.json apps/mcp-server/
COPY packages/contracts/package.json packages/contracts/
COPY packages/evals/package.json packages/evals/
COPY packages/test-utils/package.json packages/test-utils/
COPY packages/tsconfig/package.json packages/tsconfig/
COPY examples/citara-client/package.json examples/citara-client/
RUN pnpm install --frozen-lockfile --filter "@tamiz/dashboard..." --filter tamiz
COPY . .
RUN pnpm exec turbo run build --filter "@tamiz/dashboard..."

FROM node:22-alpine AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3100 \
    HOSTNAME=0.0.0.0 \
    TAMIZ_DASHBOARD_EVALS_DIR=/app/apps/dashboard/data/evals
WORKDIR /app
COPY --from=builder --chown=node:node /repo/apps/dashboard/.next/standalone ./
COPY --from=builder --chown=node:node /repo/apps/dashboard/.next/static ./apps/dashboard/.next/static
COPY --from=builder --chown=node:node /repo/apps/dashboard/data ./apps/dashboard/data
USER node
EXPOSE 3100
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=3 \
    CMD ["node", "-e", "fetch('http://127.0.0.1:3100/api/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "apps/dashboard/server.js"]
