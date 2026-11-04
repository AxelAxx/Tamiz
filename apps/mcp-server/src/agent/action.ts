/**
 * The model's answer in the agent's text tool protocol (spec 009 FR-015, research R-10,
 * data-model section 4.1, contracts/agent-protocol.md): exactly one JSON object, a tool call
 * or a final answer, optionally in a code fence or after some prose.
 */
import { z } from "zod";
import { err, ok, type Result } from "../result.js";
import { firstJsonObject } from "./json-object.js";

export const AgentActionSchema = z.union([
  z.strictObject({
    tool: z.string().min(1),
    arguments: z.record(z.string(), z.unknown()).default({}),
  }),
  z.strictObject({ answer: z.string().min(1) }),
]);

export type AgentAction = z.infer<typeof AgentActionSchema>;

/**
 * The first balanced JSON object in the text, parsed with {@link AgentActionSchema}. A text
 * that is a JSON array, holds no object, or whose first object is not an action is a format
 * error; the agent sends it back to the model as an observation.
 */
export function extractAction(text: string): Result<AgentAction, "format"> {
  const unfenced = text.replace(/```(?:json)?/g, "").trim();
  if (unfenced.startsWith("[")) return err("format");
  const candidate = firstJsonObject(unfenced);
  if (candidate === undefined) return err("format");
  let value: unknown;
  try {
    value = JSON.parse(candidate);
  } catch {
    return err("format");
  }
  const parsed = AgentActionSchema.safeParse(value);
  return parsed.success ? ok(parsed.data) : err("format");
}
