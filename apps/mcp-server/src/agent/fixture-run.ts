/**
 * The agent against fixed admin data (spec 009 agent-eval addendum, FR-027): the real tool
 * loop and the real MCP server, in process, whose gateway client answers the admin calls
 * from a fixture function instead of a gateway. Only the model calls leave the process,
 * to the Tamiz gateway, so an eval measures the model and the prompt, not a database.
 */
import { createMCPClient } from "@ai-sdk/mcp";
import { InMemoryTransport } from "@modelcontextprotocol/client";
import {
  type CostQueryDto,
  CostQuerySchema,
  type CostReportDto,
  MCP_TOOL_NAMES,
} from "@tamiz/contracts";
import { createGatewayClient } from "../gateway-client.js";
import { createLogger } from "../logger.js";
import { createMcpServer } from "../server.js";
import { selectTools } from "../tools/registry.js";
import { createGatewayModel, DEFAULT_AGENT_MODEL } from "./gateway-model.js";
import { type AgentRun, runAgent, type ToolProtocol } from "./run-agent.js";

const FIXTURE_URL = "http://fixture.invalid";

export interface FixtureRunOptions {
  readonly question: string;
  readonly now: Date;
  /** The cost report the gateway would answer for a query. */
  readonly costReport: (query: CostQueryDto) => CostReportDto;
  readonly gatewayUrl: string;
  readonly apiKey: string;
  readonly model?: string;
  readonly protocol?: ToolProtocol;
  /** Defaults to the real `fetch`; the model calls use it. */
  readonly fetch?: typeof fetch;
}

/** Answers `GET /v1/admin/cost` from the fixture; every other admin path is a 404. */
function fixtureFetch(costReport: FixtureRunOptions["costReport"]): typeof fetch {
  return async (input) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.pathname !== "/v1/admin/cost") {
      return Response.json(
        { error: { type: "not_found", message: "not in the fixture" } },
        {
          status: 404,
        },
      );
    }
    const query = CostQuerySchema.safeParse(Object.fromEntries(url.searchParams));
    if (!query.success) {
      return Response.json(
        { error: { type: "invalid_request", message: "the query fails its contract" } },
        { status: 400 },
      );
    }
    return Response.json(costReport(query.data), { headers: { "x-request-id": "fixture" } });
  };
}

export async function runAgentOnFixture(options: FixtureRunOptions): Promise<AgentRun> {
  const server = createMcpServer({
    tools: selectTools(MCP_TOOL_NAMES),
    context: {
      gateway: createGatewayClient({
        baseUrl: FIXTURE_URL,
        key: "fixture",
        timeoutMs: 2_000,
        fetch: fixtureFetch(options.costReport),
      }),
      simulateModel: "auto",
    },
    logger: createLogger({ level: "silent" }),
  });
  const [clientEnd, serverEnd] = InMemoryTransport.createLinkedPair();
  await server.connect(serverEnd);
  const mcp = await createMCPClient({ transport: clientEnd });
  try {
    return await runAgent({
      question: options.question,
      model: createGatewayModel({
        gatewayUrl: options.gatewayUrl,
        apiKey: options.apiKey,
        model: options.model ?? DEFAULT_AGENT_MODEL,
        ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
      }),
      mcp,
      now: () => options.now,
      ...(options.protocol === undefined ? {} : { protocol: options.protocol }),
    });
  } finally {
    await mcp.close();
    await server.close();
  }
}
