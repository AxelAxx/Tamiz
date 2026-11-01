/**
 * Starts the gateway's E2E harness once for the whole suite (spec 010 research R-05):
 * the real gateway app, the default policy, a scripted detector and, with
 * `TAMIZ_E2E_PROVIDERS=scripted`, providers that echo what they received. Free ports are
 * picked here and handed to the tests with `provide`; the keys are the harness's fixtures.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { createServer } from "node:net";
import { resolve } from "node:path";
import type { TestProject } from "vitest/node";

export const HARNESS_KEYS = {
  admin: "tmz_e2e-citara-suite-admin-key-not-a-secret",
  demo: "tmz_e2e-citara-suite-demo-key-not-a-secret",
  citara: "tmz_e2e-citara-suite-citara-key-not-a-secret",
} as const;

declare module "vitest" {
  export interface ProvidedContext {
    harness: { baseUrl: string; controlUrl: string };
  }
}

function freePort(): Promise<number> {
  return new Promise((done, fail) => {
    const server = createServer();
    server.once("error", fail);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address !== null ? address.port : 0;
      server.close(() => done(port));
    });
  });
}

function waitForReady(child: ChildProcess): Promise<void> {
  return new Promise((done, fail) => {
    let output = "";
    const timer = setTimeout(() => fail(new Error(`harness did not start:\n${output}`)), 45_000);
    const onData = (data: Buffer) => {
      output += data.toString();
      if (output.includes("e2e gateway on")) {
        clearTimeout(timer);
        done();
      }
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", (data: Buffer) => {
      output += data.toString();
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      fail(new Error(`harness exited with ${code}:\n${output}`));
    });
  });
}

export default async function setup(project: TestProject): Promise<() => void> {
  const [gatewayPort, controlPort] = [await freePort(), await freePort()];
  const gatewayDir = resolve(import.meta.dirname, "../../../apps/gateway");
  const child = spawn(process.execPath, ["--import", "tsx", "scripts/e2e-gateway.ts"], {
    cwd: gatewayDir,
    env: {
      ...process.env,
      TAMIZ_E2E_PROVIDERS: "scripted",
      TAMIZ_E2E_GATEWAY_PORT: String(gatewayPort),
      TAMIZ_E2E_CONTROL_PORT: String(controlPort),
      TAMIZ_E2E_ADMIN_KEY: HARNESS_KEYS.admin,
      TAMIZ_E2E_CLIENT_KEY: HARNESS_KEYS.demo,
      TAMIZ_E2E_CITARA_KEY: HARNESS_KEYS.citara,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await waitForReady(child);
  child.removeAllListeners("exit");
  project.provide("harness", {
    baseUrl: `http://127.0.0.1:${gatewayPort}/v1`,
    controlUrl: `http://127.0.0.1:${controlPort}`,
  });
  return () => {
    child.kill();
  };
}
