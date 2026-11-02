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
};

export default config;
