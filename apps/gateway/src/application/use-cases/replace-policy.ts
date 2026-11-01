/**
 * `ReplacePolicy` (spec 008 US5-3 … US5-5, US5-8, FR-016, FR-017, research R-10).
 *
 * The body's shape has been checked at the edge. Then the first failing step answers:
 * 1. the id must be the active one (the editor changes the policy, it does not switch it);
 * 2. the version becomes `baseVersion + 1` (the body's own version is ignored);
 * 3. `validatePolicy`, the boot's cross-field rules;
 * 4. every provider the policy uses must be configured (the boot check, injected);
 * 5. the repository refuses unless the active version is still `baseVersion`;
 * 6. one `policy.replaced` log line with id, version, admin and content hash, never the
 *    document.
 * Issue paths are relative to the policy document.
 */
import {
  type ConflictError,
  type ErrorIssue,
  type ValidationError,
  validationError,
} from "../../domain/errors.js";
import {
  type RoutingPolicy,
  type RoutingPolicyInput,
  validatePolicy,
} from "../../domain/model/routing-policy.js";
import { err, type Result } from "../../domain/result.js";
import { canonicalJson, quoteChainEntry } from "../policy/policy-document.js";
import type { ClockPort } from "../ports/clock.port.js";
import type { LoggerPort } from "../ports/logger.port.js";
import type { PolicyRepositoryPort, PolicyVersion } from "../ports/policy-repository.port.js";

export interface ReplacePolicyCommand {
  readonly input: RoutingPolicyInput;
  readonly baseVersion: number;
  readonly adminClientId: string;
}

export interface ReplacePolicyDeps {
  readonly policies: PolicyRepositoryPort;
  /** One issue per target whose provider is not configured (`targets.N.provider`). */
  readonly checkProviders: (policy: RoutingPolicy) => ReadonlyArray<ErrorIssue>;
  readonly clock: ClockPort;
  /** SHA-256 hex of a text. */
  readonly hash: (text: string) => string;
  readonly logger: LoggerPort;
}

export type ReplacePolicy = (
  command: ReplacePolicyCommand,
) => Promise<Result<PolicyVersion, ValidationError | ConflictError>>;

function refused(issues: ReadonlyArray<ErrorIssue>): Result<never, ValidationError> {
  const count = issues.length === 1 ? "1 issue" : `${issues.length} issues`;
  return err(validationError(`policy: ${count}`, issues));
}

export function replacePolicy(deps: ReplacePolicyDeps): ReplacePolicy {
  return async ({ input, baseVersion, adminClientId }) => {
    const active = await deps.policies.getActiveVersion();
    if (input.id !== active.policy.id) {
      return refused([
        { path: "id", message: `expected the active policy id ${active.policy.id}` },
      ]);
    }

    const document: RoutingPolicyInput = { ...input, version: baseVersion + 1 };
    const validated = validatePolicy(document);
    if (!validated.ok) {
      return refused(validated.error.issues.map((issue) => quoteChainEntry(issue, document)));
    }
    const providerIssues = deps.checkProviders(validated.value);
    if (providerIssues.length > 0) return refused(providerIssues);

    const contentHash = deps.hash(canonicalJson(document));
    const saved = await deps.policies.replace(
      {
        policy: validated.value,
        document,
        source: "store",
        savedAt: deps.clock.now().toISOString(),
        savedBy: adminClientId,
        contentHash,
      },
      baseVersion,
    );
    if (!saved.ok) return saved;

    deps.logger.info(
      {
        policyId: saved.value.policy.id,
        version: saved.value.policy.version,
        clientId: adminClientId,
        contentHash,
      },
      "policy.replaced",
    );
    return saved;
  };
}
