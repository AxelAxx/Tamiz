import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { fileVersion } from "../../src/application/policy/policy-document.js";
import { loadPolicyDocument } from "../../src/infrastructure/policy/file-policy-loader.js";
import { createInMemoryPolicyRepository } from "../../src/infrastructure/policy/in-memory-policy-repository.js";
import { sha256 } from "../helpers/app.js";

// Spec 002 FR-022 (tasks.md T046): the production repository returns the policy it was
// seeded with at boot. Spec 008 US5-5, US5-7 (tasks.md T039): it is replaceable from the
// active version only, and never persistent.

async function seeded() {
  const loaded = await loadPolicyDocument(
    resolve(import.meta.dirname, "../../policies/local-only.yaml"),
  );
  if (!loaded.ok) throw new Error("the local-only policy must load");
  return {
    loaded: loaded.value,
    repository: createInMemoryPolicyRepository(fileVersion(loaded.value, sha256)),
  };
}

describe("createInMemoryPolicyRepository (FR-022)", () => {
  it("returns the seeded policy on every call", async () => {
    const { loaded, repository } = await seeded();

    expect(await repository.getActive()).toBe(loaded.policy);
    expect(await repository.getActive()).toBe(loaded.policy);
  });

  it("reports the file as the source, not persistent", async () => {
    const { repository } = await seeded();
    const active = await repository.getActiveVersion();

    expect(active).toMatchObject({
      source: "file",
      savedAt: null,
      savedBy: null,
      persistent: false,
    });
    expect(active.contentHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("replaces from the active version and refuses a stale base (spec 008 US5-5)", async () => {
    const { loaded, repository } = await seeded();
    const base = loaded.policy.version;
    const next = {
      policy: { ...loaded.policy, version: base + 1 },
      document: { ...loaded.document, version: base + 1 },
      source: "store" as const,
      savedAt: "2026-11-01T10:00:00.000Z",
      savedBy: "ops",
      contentHash: "b".repeat(64),
    };

    const first = await repository.replace(next, base);
    expect(first.ok && first.value.persistent).toBe(false);
    expect((await repository.getActive()).version).toBe(base + 1);

    const second = await repository.replace(next, base);
    expect(second).toEqual({
      ok: false,
      error: expect.objectContaining({ kind: "conflict", activeVersion: base + 1 }),
    });
  });
});
