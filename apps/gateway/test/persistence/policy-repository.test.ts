import { asc, sql } from "drizzle-orm";
import { GenericContainer, type StartedTestContainer, Wait } from "testcontainers";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { fileVersion } from "../../src/application/policy/policy-document.js";
import type {
  PolicyRepositoryPort,
  PolicyVersionDraft,
} from "../../src/application/ports/policy-repository.port.js";
import { validatePolicy } from "../../src/domain/model/routing-policy.js";
import { systemClock } from "../../src/infrastructure/clock/system-clock.js";
import {
  connectDatabase,
  type DatabaseHandle,
  runMigrations,
} from "../../src/infrastructure/persistence/db.js";
import { policyVersions } from "../../src/infrastructure/persistence/schema.js";
import { createPostgresPolicyRepository } from "../../src/infrastructure/policy/postgres-policy-repository.js";
import { defaultPolicyDocument, sha256 } from "../helpers/app.js";
import { dockerAvailable } from "../helpers/docker.js";

// Spec 008 US5-5, US5-7, FR-017, research R-10, data-model 2.4 (tasks.md T036). Needs
// Docker (Testcontainers, `postgres:17`): reported as skipped when it is unavailable; CI
// runs it.

const docker = await dockerAvailable();

it.skipIf(docker)("PostgreSQL policy suite is skipped: Docker is not available here", () => {});

/** The file policy at `version`, as boot would see it. */
async function filePolicy(version: number): Promise<PolicyVersionDraft> {
  const { policy, document } = await defaultPolicyDocument();
  return fileVersion(
    { policy: { ...policy, version }, document: { ...document, version } },
    sha256,
  );
}

/** A saved replacement of `base` at `base.version + 1`, its default chain reordered. */
function saved(base: PolicyVersionDraft, savedBy: string): PolicyVersionDraft {
  const version = base.policy.version + 1;
  const route = [...base.document.default.route].reverse();
  const document = { ...base.document, version, default: { ...base.document.default, route } };
  const policy = validatePolicy(document);
  if (!policy.ok) throw new Error("the reordered policy must validate");
  return {
    policy: policy.value,
    document,
    source: "store",
    savedAt: "2026-11-01T10:00:00.000Z",
    savedBy,
    contentHash: sha256(JSON.stringify(document)),
  };
}

describe.skipIf(!docker)("PostgreSQL policy repository (Testcontainers)", () => {
  let container: StartedTestContainer;
  let database: DatabaseHandle;

  beforeAll(async () => {
    container = await new GenericContainer("postgres:17")
      .withEnvironment({ POSTGRES_USER: "t", POSTGRES_PASSWORD: "t", POSTGRES_DB: "t" })
      .withExposedPorts(5432)
      .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/, 2))
      .start();
    database = connectDatabase(
      `postgres://t:t@${container.getHost()}:${container.getMappedPort(5432)}/t`,
    );
    await runMigrations(database);
  }, 180_000);

  afterAll(async () => {
    await database?.close();
    await container?.stop();
  });

  beforeEach(async () => {
    await database.db.execute(sql`truncate ${policyVersions}`);
  });

  async function boot(file: PolicyVersionDraft): Promise<PolicyRepositoryPort> {
    const repository = await createPostgresPolicyRepository({
      db: database.db,
      clock: systemClock,
      file,
    });
    if (!repository.ok) throw new Error(repository.error.message);
    return repository.value;
  }

  const rows = () => database.db.select().from(policyVersions).orderBy(asc(policyVersions.version));

  it("an empty table records the file as its first version", async () => {
    const file = await filePolicy(3);
    const repository = await boot(file);

    expect(await repository.getActiveVersion()).toMatchObject({
      source: "file",
      savedAt: null,
      savedBy: null,
      contentHash: file.contentHash,
      persistent: true,
    });
    expect((await rows()).map((row) => [row.version, row.source, row.createdBy])).toEqual([
      [3, "file", null],
    ]);
  });

  it("US5-7: boot uses the newest stored version, then a higher file version wins and is recorded", async () => {
    const file = await filePolicy(3);
    const first = await boot(file);
    const next = saved(file, "ops");
    const replaced = await first.replace(next, 3);
    expect(replaced.ok).toBe(true);

    // Restart with the same file: the saved version 4 is used, documents equal.
    const restarted = await boot(file);
    const active = await restarted.getActiveVersion();
    expect(active).toMatchObject({
      source: "store",
      savedAt: "2026-11-01T10:00:00.000Z",
      savedBy: "ops",
      contentHash: next.contentHash,
      persistent: true,
    });
    expect(active.document).toEqual(next.document);
    expect((await restarted.getActive()).version).toBe(4);
    expect((await restarted.getActive()).default.route).toEqual(next.policy.default.route);

    // A hand-edited file at version 7 wins and is recorded as version 7.
    const edited = await boot(await filePolicy(7));
    expect((await edited.getActive()).version).toBe(7);
    expect((await edited.getActiveVersion()).source).toBe("file");
    expect((await rows()).map((row) => [row.version, row.source])).toEqual([
      [3, "file"],
      [4, "store"],
      [7, "file"],
    ]);
  });

  it("T-OPS-05: a file edited without a version bump is reported once and the stored version stays", async () => {
    const file = await filePolicy(3);
    await boot(file);
    const notices: unknown[] = [];
    const onFileIgnored = (notice: unknown) => notices.push(notice);

    // The same file again, and a dashboard save on top of it: nothing to report.
    const same = await createPostgresPolicyRepository({
      db: database.db,
      clock: systemClock,
      file,
      onFileIgnored,
    });
    if (!same.ok) throw new Error(same.error.message);
    expect(notices).toEqual([]);

    // The file edited (its default chain reordered) but still at version 3.
    const route = [...file.document.default.route].reverse();
    const document = { ...file.document, default: { ...file.document.default, route } };
    const policy = validatePolicy(document);
    if (!policy.ok) throw new Error("the edited policy must validate");
    const edited: PolicyVersionDraft = {
      ...file,
      policy: policy.value,
      document,
      contentHash: sha256(JSON.stringify(document)),
    };
    const repository = await createPostgresPolicyRepository({
      db: database.db,
      clock: systemClock,
      file: edited,
      onFileIgnored,
    });
    if (!repository.ok) throw new Error(repository.error.message);
    expect(notices).toEqual([
      {
        policyId: file.policy.id,
        fileVersion: 3,
        fileContentHash: edited.contentHash,
        storedContentHash: file.contentHash,
        activeVersion: 3,
      },
    ]);
    expect((await repository.value.getActiveVersion()).contentHash).toBe(file.contentHash);
    expect((await rows()).map((row) => [row.version, row.source])).toEqual([[3, "file"]]);
  });

  it("US5-5: two concurrent saves on the same base, from two gateways: exactly one wins", async () => {
    const file = await filePolicy(3);
    const gatewayA = await boot(file);
    const gatewayB = await boot(file);

    const results = await Promise.all([
      gatewayA.replace(saved(file, "alice"), 3),
      gatewayB.replace(saved(file, "bob"), 3),
    ]);

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    const lost = results.find((result) => !result.ok);
    expect(lost).toEqual({
      ok: false,
      error: expect.objectContaining({ kind: "conflict", activeVersion: 4 }),
    });
    expect((await rows()).map((row) => row.version)).toEqual([3, 4]);
  });

  it("a stale base is a conflict, and the loser picks up the winner's version", async () => {
    const file = await filePolicy(3);
    const gatewayA = await boot(file);
    const gatewayB = await boot(file);
    expect((await gatewayA.replace(saved(file, "alice"), 3)).ok).toBe(true);

    const stale = await gatewayB.replace(saved(file, "bob"), 3);

    expect(stale.ok).toBe(false);
    expect((await gatewayB.getActive()).version).toBe(4);
    expect((await gatewayB.getActiveVersion()).savedBy).toBe("alice");
  });

  it("rows are never updated: every save appends", async () => {
    const file = await filePolicy(3);
    const repository = await boot(file);
    const v4 = saved(file, "ops");
    expect((await repository.replace(v4, 3)).ok).toBe(true);
    const before = await rows();

    expect((await repository.replace(saved(v4, "ops"), 4)).ok).toBe(true);

    const after = await rows();
    expect(after.slice(0, before.length)).toEqual(before);
    expect(after.map((row) => row.version)).toEqual([3, 4, 5]);
  });

  it("refuses to boot from a stored version that no longer validates", async () => {
    const file = await filePolicy(3);
    await boot(file);
    await database.db.insert(policyVersions).values({
      id: "0d6a3c1e-8b2f-4e7a-9c5d-2f1e0a9b8c70",
      policyId: "default",
      version: 9,
      document: { ...file.document, version: 9, targets: [] },
      contentHash: "c".repeat(64),
      source: "store",
      createdBy: "ops",
      createdAt: "2026-11-01T11:00:00.000Z",
    });

    const repository = await createPostgresPolicyRepository({
      db: database.db,
      clock: systemClock,
      file,
    });

    expect(repository.ok).toBe(false);
    if (repository.ok) return;
    expect(repository.error.message).toBe("Stored routing policy default version 9 is invalid");
  });
});
