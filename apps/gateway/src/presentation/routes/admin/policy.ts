/**
 * `GET` and `PUT /v1/admin/policy` (spec 008 US5, FR-015, FR-016, contracts/gateway-policy.md).
 *
 * `GET` answers the active policy document and where it came from. `PUT` replaces it from
 * `baseVersion`; the checks run in the contract's order and the first failing one answers:
 * body shape (400, `issues` under `policy.`), then the use case's id, cross-field and
 * provider checks (400 with `issues`), then the stale base (409 `conflict`). Admin-only by
 * the `/v1/admin/*` middleware. The document is never logged.
 */
import { createRoute, type OpenAPIHono } from "@hono/zod-openapi";
import { ActivePolicySchema, type RoutingPolicyDto } from "@tamiz/contracts";
import type { Schema } from "hono";
import type { PolicyVersion } from "../../../application/ports/policy-repository.port.js";
import type { GetActivePolicy } from "../../../application/use-cases/get-active-policy.js";
import type { ReplacePolicy } from "../../../application/use-cases/replace-policy.js";
import type { ErrorIssue } from "../../../domain/errors.js";
import {
  domainErrorToEnvelope,
  httpStatusFor,
  toErrorEnvelope,
} from "../../mappers/error-envelope.js";
import {
  ActivePolicyBody,
  ErrorEnvelopeBody,
  ReplacePolicyRequestBody,
} from "../../openapi-schemas.js";
import type { ChatEnv } from "../chat-completions.js";

/**
 * `ReplacePolicy` taking the contract DTO: `main.ts` maps it to the domain input with the
 * policy mapper, as the file loader does.
 */
export type ReplacePolicyHandler = (command: {
  readonly policy: RoutingPolicyDto;
  readonly baseVersion: number;
  readonly adminClientId: string;
}) => ReturnType<ReplacePolicy>;

const errorResponse = (description: string) => ({
  description,
  content: { "application/json": { schema: ErrorEnvelopeBody } },
});

const activePolicyResponse = (description: string) => ({
  description,
  content: { "application/json": { schema: ActivePolicyBody } },
});

export const getPolicyRoute = createRoute({
  method: "get",
  path: "/v1/admin/policy",
  summary: "The active routing policy and where it came from (admin)",
  security: [{ bearerAuth: [] }],
  responses: {
    200: activePolicyResponse("The active policy, its version and its source"),
    401: errorResponse("Missing or invalid API key"),
    403: errorResponse("The key is not an admin key"),
  },
});

export const putPolicyRoute = createRoute({
  method: "put",
  path: "/v1/admin/policy",
  summary: "Replace the routing policy from the version it was edited from (admin)",
  security: [{ bearerAuth: [] }],
  request: {
    body: { required: true, content: { "application/json": { schema: ReplacePolicyRequestBody } } },
  },
  responses: {
    200: activePolicyResponse("Saved: version is baseVersion + 1 and applies at once"),
    400: errorResponse("Shape, id, cross-field or provider issues, each with its path"),
    401: errorResponse("Missing or invalid API key"),
    403: errorResponse("The key is not an admin key"),
    409: errorResponse("baseVersion is no longer the active version"),
  },
});

function toActivePolicy(version: PolicyVersion) {
  return ActivePolicySchema.parse({
    policy: version.document,
    meta: {
      source: version.source,
      savedAt: version.savedAt,
      savedBy: version.savedBy,
      contentHash: version.contentHash,
      persistent: version.persistent,
    },
  });
}

/** Issue paths of the use case are relative to the policy; the body nests it under `policy`. */
function underPolicy(issues: ReadonlyArray<ErrorIssue>): ReadonlyArray<ErrorIssue> {
  return issues.map((issue) => ({
    path: issue.path === "" ? "policy" : `policy.${issue.path}`,
    message: issue.message,
  }));
}

export function registerAdminPolicy<S extends Schema, B extends string>(
  app: OpenAPIHono<ChatEnv, S, B>,
  deps: { readonly getActivePolicy: GetActivePolicy; readonly replacePolicy: ReplacePolicyHandler },
) {
  return app
    .openapi(getPolicyRoute, async (c) => c.json(toActivePolicy(await deps.getActivePolicy()), 200))
    .openapi(
      putPolicyRoute,
      async (c) => {
        const body = c.req.valid("json");
        const result = await deps.replacePolicy({
          policy: body.policy,
          baseVersion: body.baseVersion,
          adminClientId: c.get("clientId"),
        });
        if (result.ok) return c.json(toActivePolicy(result.value), 200);
        const error = result.error;
        if (error.kind === "conflict") {
          return c.json(domainErrorToEnvelope(error, c.get("requestId")), 409);
        }
        return c.json(
          toErrorEnvelope(
            "invalid_request",
            error.message,
            c.get("requestId"),
            underPolicy(error.issues),
          ),
          400,
        );
      },
      (result, c) => {
        if (result.success) return;
        const issues = result.error.issues.map((issue) => ({
          path: issue.path.map(String).join("."),
          message: issue.message,
        }));
        const count = issues.length === 1 ? "1 issue" : `${issues.length} issues`;
        return c.json(
          toErrorEnvelope("invalid_request", `body: ${count}`, c.get("requestId"), issues),
          httpStatusFor("invalid_request") as 400,
        );
      },
    );
}
