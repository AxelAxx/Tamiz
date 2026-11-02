# Tamiz gateway (T-OPS-01). Multi-stage: the builder installs the locked workspace and
# builds the gateway with its workspace dependencies (Turborepo), then `pnpm deploy` copies
# its production dependencies into a self-contained folder. The runtime image holds that
# folder plus the compiled code, the migrations, the versioned prompts and the policies,
# and runs as the unprivileged `node` user. The root filesystem can be read-only (compose
# mounts a tmpfs on /tmp). Build from the repository root:
#
#   docker build -f apps/gateway/Dockerfile -t tamiz-gateway .

FROM node:22-alpine AS builder
ENV HUSKY=0 \
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
RUN pnpm install --frozen-lockfile --filter "@tamiz/gateway..." --filter tamiz
COPY . .
RUN pnpm exec turbo run build --filter "@tamiz/gateway..." \
    && pnpm deploy --filter @tamiz/gateway --prod --legacy /deploy

FROM node:22-alpine AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0
WORKDIR /app
COPY --from=builder --chown=node:node /deploy/package.json ./
COPY --from=builder --chown=node:node /deploy/node_modules ./node_modules
COPY --from=builder --chown=node:node /repo/apps/gateway/dist ./dist
COPY --from=builder --chown=node:node /repo/apps/gateway/drizzle ./drizzle
COPY --from=builder --chown=node:node /repo/apps/gateway/prompts ./prompts
COPY --from=builder --chown=node:node /repo/apps/gateway/policies ./policies
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=3 \
    CMD ["node", "-e", "fetch('http://127.0.0.1:3000/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "dist/main.js"]
