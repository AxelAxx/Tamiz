/**
 * The `PolicyRepositoryPort` without a database (spec 002 FR-022; spec 008 US5-7, R-10):
 * the policy loaded at boot, held in memory, replaceable through the admin API. Saves are
 * lost on restart, so every version reports `persistent: false`.
 */
import type {
  PolicyRepositoryPort,
  PolicyVersion,
  PolicyVersionDraft,
} from "../../application/ports/policy-repository.port.js";
import { conflictError } from "../../domain/errors.js";
import { err, ok } from "../../domain/result.js";

export function createInMemoryPolicyRepository(initial: PolicyVersionDraft): PolicyRepositoryPort {
  let active: PolicyVersion = { ...initial, persistent: false };
  return {
    getActive: async () => active.policy,
    getActiveVersion: async () => active,
    replace: async (next, baseVersion) => {
      if (active.policy.version !== baseVersion) return err(conflictError(active.policy.version));
      active = { ...next, persistent: false };
      return ok(active);
    },
  };
}
