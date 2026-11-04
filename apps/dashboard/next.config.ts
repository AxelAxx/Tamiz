import { resolve } from "node:path";
import type { NextConfig } from "next";

/** The workspace root: the standalone output traces workspace packages from there. */
const workspaceRoot = resolve(import.meta.dirname, "../..");

const config: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: workspaceRoot,
  // The eval reports are read with fs at request time, which tracing cannot see. Without
  // this, a serverless deployment (Vercel, T-OPS-02) ships the evals route without them.
  outputFileTracingIncludes: { "/api/evals": ["./data/evals/*.json"] },
  turbopack: { root: workspaceRoot },
  poweredByHeader: false,
  reactStrictMode: true,
  // Code audit 2026-11-03, L12. No script or style policy: Next.js inlines its bootstrap
  // scripts, and a nonce-based CSP is a larger change than these headers.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
          },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
        ],
      },
    ];
  },
};

export default config;
