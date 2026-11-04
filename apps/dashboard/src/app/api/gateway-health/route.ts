import { HealthResponseSchema } from "@tamiz/contracts";
import { read } from "@/lib/server/bff";
import { serverContext } from "@/lib/server/context";
import { callGateway } from "@/lib/server/gateway";

/**
 * `GET /api/gateway-health` → `GET /health` (spec 008 R-01). A 503 carries the health body
 * naming the dependency that is down; it is passed on as data, not as an error.
 */
export const GET = read(async () => {
  const { gateway, log } = serverContext();
  return callGateway({
    endpoint: "/health",
    schema: HealthResponseSchema,
    call: () => gateway.health.$get(),
    log,
    bodyOnStatus: [503],
  });
});
