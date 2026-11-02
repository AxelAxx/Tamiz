import { ActivePolicySchema, ReplacePolicyRequestSchema } from "@tamiz/contracts";
import { read, write } from "@/lib/server/bff";
import { serverContext } from "@/lib/server/context";
import { callGateway } from "@/lib/server/gateway";
import { readJson } from "@/lib/server/handler";

/**
 * `GET /api/policy` → `GET /v1/admin/policy` (spec 008 R-01): the active policy with where
 * it came from, for the editor and the audit log's rule picker.
 */
export const GET = read(async () => {
  const { gateway, log } = serverContext();
  return callGateway({
    endpoint: "/v1/admin/policy",
    schema: ActivePolicySchema,
    call: () => gateway.v1.admin.policy.$get(),
    log,
  });
});

/**
 * `PUT /api/policy` → `PUT /v1/admin/policy` (spec 008 US5-3 … US5-5, R-12): a write, so
 * the origin is checked before the session. The gateway's `issues` and `conflict` (409)
 * come back in `gatewayError`. The policy is never logged (FR-014).
 */
export const PUT = write(async (request) => {
  const body = await readJson(request, ReplacePolicyRequestSchema);
  if (!body.ok) return body.response;
  const { gateway, log } = serverContext();
  return callGateway({
    endpoint: "/v1/admin/policy",
    schema: ActivePolicySchema,
    call: () => gateway.v1.admin.policy.$put({ json: body.value }),
    log,
  });
});
