import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { hashPassphrase } from "../src/lib/server/passphrase";
import { ADMIN_KEY, GATEWAY_URL, PASSPHRASE, SESSION_SECRET } from "./support/fixtures";

// Spec 008 US1-6 (tasks.md T054): the built standalone server, the one the container runs,
// refuses to start on a bad configuration and names every problem, never a value.

const SERVER = resolve(import.meta.dirname, "../.next/standalone/apps/dashboard/server.js");

function start(env: Record<string, string>): Promise<{ code: number | null; output: string }> {
  return new Promise((done, fail) => {
    const { PATH, SystemRoot } = process.env;
    const child = spawn(process.execPath, [SERVER], {
      env: {
        PATH: PATH ?? "",
        ...(SystemRoot === undefined ? {} : { SystemRoot }),
        NODE_ENV: "production",
        PORT: "3197",
        ...env,
      },
      stdio: "pipe",
    });
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    const timer = setTimeout(() => {
      child.kill();
      fail(new Error(`the server did not exit:\n${output}`));
    }, 20_000);
    child.on("exit", (code) => {
      clearTimeout(timer);
      done({ code, output });
    });
  });
}

test("US1-6 a missing or malformed variable stops the built server, listing each one", async () => {
  const { code, output } = await start({
    TAMIZ_GATEWAY_URL: GATEWAY_URL,
    TAMIZ_DASHBOARD_ADMIN_KEY: ADMIN_KEY,
    TAMIZ_DASHBOARD_PASSPHRASE_HASH: hashPassphrase(PASSPHRASE),
    // TAMIZ_DASHBOARD_SESSION_SECRET is missing; the public URL is not a URL.
    TAMIZ_DASHBOARD_PUBLIC_URL: "not a url",
  });
  expect(code).toBe(1);
  expect(output).toContain("Invalid dashboard configuration:");
  expect(output).toContain("TAMIZ_DASHBOARD_SESSION_SECRET: required");
  expect(output).toContain("TAMIZ_DASHBOARD_PUBLIC_URL: expected the dashboard's public address");
  expect(output).not.toContain("not a url");
  expect(output).not.toContain(ADMIN_KEY);
  expect(output).not.toContain(SESSION_SECRET);
});
