/** `GetActivePolicy` (spec 008 US5-1, FR-015): the active policy and where it came from. */
import type { PolicyRepositoryPort, PolicyVersion } from "../ports/policy-repository.port.js";

export type GetActivePolicy = () => Promise<PolicyVersion>;

export function getActivePolicy(policies: PolicyRepositoryPort): GetActivePolicy {
  return () => policies.getActiveVersion();
}
