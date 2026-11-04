/**
 * The `PolicyRepositoryPort` over PostgreSQL (spec 008 US5-5, US5-7, FR-017, research R-10,
 * data-model 2.3, 2.4).
 *
 * `policy_versions` is append-only. Boot loads the newest stored version of the file's
 * policy id and uses it when its version is at least the file's; otherwise the file wins
 * and is recorded as a version (an operator who edits the file and raises its version
 * means it). A stored version is validated like the file before it is used. When the
 * stored version with the file's number has other content, the file was edited without a
 * version bump: `onFileIgnored` reports it (backlog `T-OPS-05`), and the stored one still
 * wins.
 *
 * `replace` is one `INSERT … SELECT … WHERE max(version) = baseVersion ON CONFLICT DO
 * NOTHING`: of two saves on the same base, even from two gateways sharing the database,
 * exactly one inserts a row and the other gets `conflict`. The active policy is cached in
 * memory for `getActive()` (read per request). The cache is refreshed from the database at
 * most every `refreshEveryMs` (5 s) by `getActive()`, and at once by `getActiveVersion()`
 * and by a conflict, so a version saved through another gateway is in use within seconds
 * (code audit 2026-11-03, M11). A failed refresh keeps the cached policy.
 */
import { randomUUID } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import type { ClockPort } from "../../application/ports/clock.port.js";
import type {
  PolicyRepositoryPort,
  PolicyVersion,
  PolicyVersionDraft,
} from "../../application/ports/policy-repository.port.js";
import { type ConfigurationError, configurationError, conflictError } from "../../domain/errors.js";
import { err, ok, type Result } from "../../domain/result.js";
import type { Database } from "../persistence/db.js";
import { policyVersions } from "../persistence/schema.js";
import { validatePolicyDocument } from "./file-policy-loader.js";

type Row = typeof policyVersions.$inferSelect;

function fromRow(row: Row): Result<PolicyVersion, ConfigurationError> {
  const loaded = validatePolicyDocument(row.document);
  if (!loaded.ok) {
    return err(
      configurationError(
        `Stored routing policy ${row.policyId} version ${row.version} is invalid`,
        loaded.error,
      ),
    );
  }
  const stored = row.source === "store";
  return ok({
    ...loaded.value,
    source: row.source,
    savedAt: stored ? new Date(row.createdAt).toISOString() : null,
    savedBy: stored ? row.createdBy : null,
    contentHash: row.contentHash,
    persistent: true,
  });
}

/** The file differs from the stored version with its number, so the file is not used. */
export interface IgnoredPolicyFile {
  readonly policyId: string;
  readonly fileVersion: number;
  readonly fileContentHash: string;
  readonly storedContentHash: string;
  readonly activeVersion: number;
}

async function storedHashOf(
  db: Database,
  policyId: string,
  version: number,
): Promise<string | undefined> {
  const [row] = await db
    .select({ contentHash: policyVersions.contentHash })
    .from(policyVersions)
    .where(and(eq(policyVersions.policyId, policyId), eq(policyVersions.version, version)))
    .limit(1);
  return row?.contentHash;
}

async function newest(db: Database, policyId: string): Promise<Row | undefined> {
  const [row] = await db
    .select()
    .from(policyVersions)
    .where(eq(policyVersions.policyId, policyId))
    .orderBy(desc(policyVersions.version))
    .limit(1);
  return row;
}

export async function createPostgresPolicyRepository(deps: {
  readonly db: Database;
  readonly clock: ClockPort;
  /** The policy loaded from the file at boot. */
  readonly file: PolicyVersionDraft;
  readonly onFileIgnored?: (notice: IgnoredPolicyFile) => void;
  /** How stale `getActive()` may be against the database; 5 s by default. */
  readonly refreshEveryMs?: number;
}): Promise<Result<PolicyRepositoryPort, ConfigurationError>> {
  const { db, clock, file } = deps;
  const policyId = file.policy.id;
  const refreshEveryMs = deps.refreshEveryMs ?? 5_000;

  let active: PolicyVersion;
  const stored = await newest(db, policyId);
  if (stored !== undefined && stored.version >= file.policy.version) {
    const loaded = fromRow(stored);
    if (!loaded.ok) return loaded;
    active = loaded.value;
    const storedHash = await storedHashOf(db, policyId, file.policy.version);
    if (storedHash !== undefined && storedHash !== file.contentHash) {
      deps.onFileIgnored?.({
        policyId,
        fileVersion: file.policy.version,
        fileContentHash: file.contentHash,
        storedContentHash: storedHash,
        activeVersion: stored.version,
      });
    }
  } else {
    await db
      .insert(policyVersions)
      .values({
        id: randomUUID(),
        policyId,
        version: file.policy.version,
        document: file.document,
        contentHash: file.contentHash,
        source: "file",
        createdBy: null,
        createdAt: clock.now().toISOString(),
      })
      .onConflictDoNothing();
    active = { ...file, persistent: true };
  }

  /** Re-reads the newest version; keeps the cache when it is not newer or not valid. */
  async function refresh(): Promise<PolicyVersion> {
    const row = await newest(db, policyId);
    if (row === undefined || row.version <= active.policy.version) return active;
    const loaded = fromRow(row);
    if (loaded.ok) active = loaded.value;
    return active;
  }

  let checkedAt = clock.now().getTime();
  async function getActive() {
    const now = clock.now().getTime();
    if (now - checkedAt >= refreshEveryMs) {
      checkedAt = now;
      try {
        await refresh();
      } catch {
        // The cached policy keeps serving; the next check tries again.
      }
    }
    return active.policy;
  }

  return ok({
    getActive,
    getActiveVersion: refresh,
    async replace(next, baseVersion) {
      // Casts: parameters in a SELECT list would otherwise be typed `text`.
      const inserted = await db.execute(sql`
        insert into ${policyVersions}
          (id, policy_id, version, document, content_hash, source, created_by, created_at)
        select ${randomUUID()}::uuid, ${policyId}::text, ${next.policy.version}::integer,
          ${JSON.stringify(next.document)}::jsonb, ${next.contentHash}::char(64),
          ${next.source}::text, ${next.savedBy}::text,
          ${next.savedAt ?? clock.now().toISOString()}::timestamptz
        where (select coalesce(max(version), 0) from ${policyVersions}
               where policy_id = ${policyId}::text) = ${baseVersion}::integer
        on conflict do nothing
        returning id`);
      if (inserted.length === 0) {
        const current = await refresh();
        return err(conflictError(current.policy.version));
      }
      active = { ...next, persistent: true };
      return ok(active);
    },
  });
}
