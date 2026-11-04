/**
 * Revokes an API key stored in the database (spec 006 FR-006, code audit 2026-11-03 L10).
 * The row stays, with `revoked_at` set; authentication refuses the key from then on.
 * Give the key itself (it is hashed here, never stored or printed) or its SHA-256 hash.
 *
 *   DATABASE_URL=postgres://… pnpm --filter @tamiz/gateway api-key:revoke <key | --hash <hex>>
 */
import { hashApiKey } from "../src/infrastructure/auth/api-keys.js";
import { createPostgresApiKeyRepository } from "../src/infrastructure/persistence/api-key-repository.js";
import { connectDatabase } from "../src/infrastructure/persistence/db.js";

const args = process.argv.slice(2);
const hashIndex = args.indexOf("--hash");
const keyHash =
  hashIndex >= 0
    ? (args[hashIndex + 1] ?? "")
    : hashApiKey(args.find((a) => !a.startsWith("--")) ?? "");
const url = process.env["DATABASE_URL"];

if (!/^[0-9a-f]{64}$/.test(keyHash) || (hashIndex < 0 && args.length === 0) || !url) {
  process.stderr.write("usage: DATABASE_URL=… api-key:revoke <key | --hash <sha256 hex>>\n");
  process.exit(1);
}
const database = connectDatabase(url, { max: 1 });
try {
  const repository = createPostgresApiKeyRepository(database.db);
  const found = await repository.findByHash(keyHash);
  if (found === undefined) {
    process.stderr.write("no stored key has that hash\n");
    process.exitCode = 1;
  } else {
    await repository.revoke(keyHash, new Date());
    process.stdout.write(`revoked: a ${found.role} key of ${found.clientId}\n`);
  }
} finally {
  await database.close();
}
