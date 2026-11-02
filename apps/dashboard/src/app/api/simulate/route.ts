import { ChatCompletionRequestSchema, SimulateResponseSchema } from "@tamiz/contracts";
import { simulateWrite } from "@/lib/server/bff";
import { serverContext } from "@/lib/server/context";
import { callGateway } from "@/lib/server/gateway";
import { readJson } from "@/lib/server/handler";

/**
 * `POST /api/simulate` → `POST /v1/simulate` (spec 008 R-01). `stream` is dropped: a
 * simulation never streams. The body is never logged (FR-014). Visitor sessions share a
 * per-address budget (US10-4).
 */
export const POST = simulateWrite(async (request) => {
  const body = await readJson(request, ChatCompletionRequestSchema);
  if (!body.ok) return body.response;
  const { stream: _stream, stream_options: _options, ...json } = body.value;
  const { gateway, log } = serverContext();
  return callGateway({
    endpoint: "/v1/simulate",
    schema: SimulateResponseSchema,
    call: () => gateway.v1.simulate.$post({ json }),
    log,
  });
});
