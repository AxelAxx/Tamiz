import { ActivePolicySchema } from "@tamiz/contracts";
import { read } from "@/lib/server/bff";
import { serverContext } from "@/lib/server/context";
import { callGateway } from "@/lib/server/gateway";

/**
 * `GET /api/policy` → `GET /v1/admin/policy` (spec 008 R-01, R-07): the audit log's rule
 * picker reads the active policy's rules. `PUT` arrives with the policy editor (`T-008-08`).
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
