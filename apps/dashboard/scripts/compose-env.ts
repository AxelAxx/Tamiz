/**
 * Writes the secrets of the Docker Compose stack (T-OPS-01) and prints the two API keys
 * the operator uses, once. The dashboard passphrase is read from standard input, never
 * from an argument. Existing files are kept unless `--force` is given.
 *
 *   pnpm compose:env            (from the repository root)
 */
import { existsSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { composeEnvFiles } from "./compose-env-files";

const GATEWAY_FILE = new URL("../../gateway/.env.docker", import.meta.url);
const DASHBOARD_FILE = new URL("../.env.docker", import.meta.url);

const force = process.argv.includes("--force");
if (!force && (existsSync(GATEWAY_FILE) || existsSync(DASHBOARD_FILE))) {
  process.stderr.write(
    "refused: apps/gateway/.env.docker or apps/dashboard/.env.docker exists (--force replaces both)\n",
  );
  process.exit(1);
}

const input = createInterface({ input: process.stdin, output: process.stderr, terminal: false });
if (process.stdin.isTTY) process.stderr.write("Dashboard passphrase (12+ characters): ");
// Windows PowerShell pipes a byte order mark ahead of the text, and a CRLF after it.
const passphrase = ((await input.question("")) ?? "").replace(/^﻿/, "").replace(/\r$/, "");
input.close();

if (passphrase.length < 12) {
  process.stderr.write("refused: use a passphrase of at least 12 characters\n");
  process.exit(1);
}

const files = composeEnvFiles(passphrase);
writeFileSync(GATEWAY_FILE, files.gateway, { mode: 0o600 });
writeFileSync(DASHBOARD_FILE, files.dashboard, { mode: 0o600 });
process.stdout.write(
  [
    "Wrote apps/gateway/.env.docker and apps/dashboard/.env.docker.",
    "Keep these keys; they are not stored anywhere (only their hashes are):",
    `  client key (demo): ${files.keys.demo}`,
    `  admin key  (ops):  ${files.keys.ops}`,
    "",
  ].join("\n"),
);
