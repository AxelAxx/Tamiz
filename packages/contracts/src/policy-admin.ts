/**
 * Policy admin contracts (spec 008 FR-015, FR-016, data-model section 1.2).
 *
 * `GET /v1/admin/policy` answers the active policy with where it came from; `PUT` replaces
 * it from `baseVersion`, the version the editor started from. The `version` inside a
 * replacement is ignored: the gateway assigns `baseVersion + 1`.
 */
import { z } from "zod";
import { RoutingPolicySchema } from "./routing-policy.js";

/** `file`: loaded from the policy file at boot; `store`: saved through the admin API. */
export const PolicySourceSchema = z.enum(["file", "store"]);

export const PolicyVersionMetaSchema = z.strictObject({
  source: PolicySourceSchema,
  /** `null` for a policy loaded from the file. */
  savedAt: z.iso.datetime().nullable(),
  /** The admin client id that saved it; `null` for a policy loaded from the file. */
  savedBy: z.string().nullable(),
  /** SHA-256 of the canonical JSON of the policy document. */
  contentHash: z.string().regex(/^[0-9a-f]{64}$/),
  /** `false`: saves are held in memory and lost on restart. */
  persistent: z.boolean(),
});

export const ActivePolicySchema = z.strictObject({
  policy: RoutingPolicySchema,
  meta: PolicyVersionMetaSchema,
});

export const ReplacePolicyRequestSchema = z.strictObject({
  baseVersion: z.int().min(1),
  policy: RoutingPolicySchema,
});

export type PolicySourceDto = z.infer<typeof PolicySourceSchema>;
export type PolicyVersionMetaDto = z.infer<typeof PolicyVersionMetaSchema>;
export type ActivePolicyDto = z.infer<typeof ActivePolicySchema>;
export type ReplacePolicyRequestDto = z.infer<typeof ReplacePolicyRequestSchema>;
