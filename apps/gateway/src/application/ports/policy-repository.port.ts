/**
 * Where the active routing policy comes from (spec 002 FR-010, data-model section 4.1;
 * spec 008 FR-015 … FR-017, data-model section 2.2, research R-10).
 *
 * The policy is validated before it reaches this port: at boot from the file, at runtime
 * by `ReplacePolicy`. Every use case reads `getActive()` per request, so a replacement
 * applies to the next request and simulation. Use cases that only read depend on
 * `PolicyReader`; tests use `createInMemoryPolicyRepository` from `@tamiz/test-utils`,
 * which satisfies it structurally.
 */
import type { ConflictError } from "../../domain/errors.js";
import type { RoutingPolicy, RoutingPolicyInput } from "../../domain/model/routing-policy.js";
import type { Result } from "../../domain/result.js";

/** The active policy with where it came from (spec 008 US5-1). */
export interface PolicyVersion {
  /** Validated. */
  readonly policy: RoutingPolicy;
  /** The document as the operator wrote it (no defaults filled): what `GET` answers. */
  readonly document: RoutingPolicyInput;
  readonly source: "file" | "store";
  /** ISO time of the save; `null` for the file. */
  readonly savedAt: string | null;
  /** Admin client id that saved it; `null` for the file. */
  readonly savedBy: string | null;
  /** SHA-256 hex of `canonicalJson(document)`. */
  readonly contentHash: string;
  /** `false`: replacements are lost on restart. */
  readonly persistent: boolean;
}

/** A version before the repository says whether it persists. */
export type PolicyVersionDraft = Omit<PolicyVersion, "persistent">;

export interface PolicyReader {
  getActive(): Promise<RoutingPolicy>;
}

export interface PolicyRepositoryPort extends PolicyReader {
  getActiveVersion(): Promise<PolicyVersion>;
  /** Refuses with `conflict` unless the active version is `baseVersion` (US5-5). */
  replace(
    next: PolicyVersionDraft,
    baseVersion: number,
  ): Promise<Result<PolicyVersion, ConflictError>>;
}
