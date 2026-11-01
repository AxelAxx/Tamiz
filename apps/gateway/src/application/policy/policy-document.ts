/**
 * Helpers shared by the policy loaders and `ReplacePolicy` (spec 008 data-model 1.2, 2.2).
 *
 * `canonicalJson` is the text the content hash covers: object keys sorted at every level,
 * so the same policy hashes the same however its file was ordered. `quoteChainEntry`
 * appends the target id an issue on a chain entry names (spec 002 US2-1): the document is
 * the operator's own, so quoting its ids is safe, while the domain never echoes a value.
 */
import type { ErrorIssue } from "../../domain/errors.js";
import type { RoutingPolicy, RoutingPolicyInput } from "../../domain/model/routing-policy.js";
import type { PolicyVersionDraft } from "../ports/policy-repository.port.js";

export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, field]) => field !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, field]) => [key, sortKeys(field)]),
  );
}

const CHAIN_ENTRY_PATH = /^(?:rules\.(\d+)\.route|default\.route)\.(\d+)$/;

export function quoteChainEntry(issue: ErrorIssue, document: RoutingPolicyInput): ErrorIssue {
  const match = CHAIN_ENTRY_PATH.exec(issue.path);
  if (match === null) return issue;
  const [, ruleIndex, entryIndex] = match;
  const route =
    ruleIndex === undefined ? document.default.route : document.rules[Number(ruleIndex)]?.route;
  const id = route?.[Number(entryIndex)];
  return id === undefined ? issue : { ...issue, message: `${issue.message} (target "${id}")` };
}

/** The version a policy loaded from the file at boot starts as. */
export function fileVersion(
  loaded: { readonly policy: RoutingPolicy; readonly document: RoutingPolicyInput },
  hash: (text: string) => string,
): PolicyVersionDraft {
  return {
    policy: loaded.policy,
    document: loaded.document,
    source: "file",
    savedAt: null,
    savedBy: null,
    contentHash: hash(canonicalJson(loaded.document)),
  };
}
