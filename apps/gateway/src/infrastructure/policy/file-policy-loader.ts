/**
 * Loads the routing policy file at boot (spec 002 FR-019, FR-020, research R-09).
 *
 * read → YAML parse (JSON is valid YAML, so `.json` files load too) →
 * `RoutingPolicySchema` → `validatePolicy`. Every failure becomes one
 * `ConfigurationError` listing each problem by path; nothing throws. A stored policy
 * version (spec 008) goes through the same `validatePolicyDocument`.
 *
 * The domain never echoes a value. Here the file is the operator's own, so an issue on a
 * chain entry also quotes the target id it names (US2-1: "names the unknown target").
 */
import { readFile } from "node:fs/promises";
import { RoutingPolicySchema } from "@tamiz/contracts";
import { parse, YAMLParseError } from "yaml";
import { quoteChainEntry } from "../../application/policy/policy-document.js";
import {
  type ConfigurationError,
  configurationError,
  type ErrorIssue,
} from "../../domain/errors.js";
import {
  type RoutingPolicy,
  type RoutingPolicyInput,
  validatePolicy,
} from "../../domain/model/routing-policy.js";
import { err, ok, type Result } from "../../domain/result.js";
import { toDomainPolicyInput } from "./policy-mapper.js";

export async function loadPolicyFile(
  path: string,
): Promise<Result<RoutingPolicy, ConfigurationError>> {
  const loaded = await loadPolicyDocument(path);
  return loaded.ok ? ok(loaded.value.policy) : loaded;
}

/** As `loadPolicyFile`, keeping the document the policy came from (spec 008 R-10). */
export async function loadPolicyDocument(
  path: string,
): Promise<Result<LoadedPolicy, ConfigurationError>> {
  const failure = (message: string, issues: ConfigurationError["issues"]) =>
    err(configurationError(`${message} ${path}`, issues));

  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch {
    return failure("Cannot read policy file", [
      { path, message: "expected a readable policy file" },
    ]);
  }

  let document: unknown;
  try {
    document = parse(text);
  } catch (error) {
    const where =
      error instanceof YAMLParseError && error.linePos !== undefined
        ? ` (line ${error.linePos[0].line})`
        : "";
    return failure("Cannot parse policy file", [
      { path, message: `expected valid YAML or JSON${where}` },
    ]);
  }

  const loaded = validatePolicyDocument(document);
  if (!loaded.ok) return failure("Invalid routing policy in", loaded.error);
  return loaded;
}

/** A validated policy with the document it came from (spec 008 data-model 2.1). */
export interface LoadedPolicy {
  readonly policy: RoutingPolicy;
  readonly document: RoutingPolicyInput;
}

/**
 * `RoutingPolicySchema` → `validatePolicy` over a parsed document: the file at boot and a
 * stored version (spec 008 R-10) go through the same checks.
 */
export function validatePolicyDocument(
  document: unknown,
): Result<LoadedPolicy, ReadonlyArray<ErrorIssue>> {
  const parsed = RoutingPolicySchema.safeParse(document);
  if (!parsed.success) {
    return err(
      parsed.error.issues.map((issue) => ({
        path: issue.path.map(String).join("."),
        message: issue.message,
      })),
    );
  }
  const input = toDomainPolicyInput(parsed.data);
  const policy = validatePolicy(input);
  if (!policy.ok) return err(policy.error.issues.map((issue) => quoteChainEntry(issue, input)));
  return ok({ policy: policy.value, document: input });
}
