/**
 * Entry point: `pnpm --filter @tamiz/example-citara-client start -- "<prompt>"`.
 * Reads the environment (see `config.ts` and `docs/integrations/citara.md`), runs one
 * request and sets the exit code: 0 answered (and audited when checked), 1 failed,
 * 2 invalid configuration.
 */
import { setTimeout as sleep } from "node:timers/promises";
import { loadConfig } from "./config.js";
import { runExample } from "./run-example.js";

const loaded = loadConfig(process.env, process.argv.slice(2));
if (!loaded.ok) {
  process.stderr.write(`${loaded.message}\n`);
  process.exitCode = 2;
} else {
  process.exitCode = await runExample(loaded.config, {
    fetch: globalThis.fetch,
    sleep: async (ms) => {
      await sleep(ms);
    },
    now: Date.now,
    write: (text) => process.stdout.write(text),
  });
}
