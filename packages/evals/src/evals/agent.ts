/**
 * Agent eval (spec 009 agent-eval addendum, FR-026 … FR-029).
 *
 * Each case of `agent-spend.v1.jsonl` runs the real agent: its model through the gateway,
 * its tools over an in-process MCP server whose admin data comes from the case
 * (`runAgentOnFixture`). A case passes when the run answers within the step limit and the
 * answer:
 * - names the expected route before any other route of the case (so "X changed most" with
 *   a wrong X fails, even if the right route is mentioned later);
 * - contains both daily totals, each within half a cent (`$0.84` matches 0.842).
 *
 * The gate is `answer_accuracy`. Answers never enter the report: a failing case shows only
 * which checks failed, the route named first and the number of model calls.
 */

import type { CostQueryDto, CostReportDto, EvalFailingCase } from "@tamiz/contracts";
import { runAgentOnFixture } from "@tamiz/mcp-server/agent/fixture-run";
import { type AgentCase, AgentCaseSchema } from "../datasets.js";
import { type Eval, ServiceError } from "../eval.js";

export const AGENT_DATASET = { name: "agent-spend", version: 1 } as const;
/** Half a cent: an answer may round to cents. */
const AMOUNT_TOLERANCE = 0.005;
/** The baseline the fixture reports: the frontier target's price, for every row. */
const BASELINE = { targetId: "anthropic-sonnet", inputUsdPerMillion: 3, outputUsdPerMillion: 15 };
const INPUT_TOKENS_PER_REQUEST = 4_000;
const OUTPUT_TOKENS_PER_REQUEST = 1_000;

export interface AgentObservation {
  readonly stopReason: "answered" | "step_limit" | "gateway_error";
  readonly modelCalls: number;
  /** Kept in memory for scoring only; never reported. */
  readonly answer: string;
  readonly protocol: string;
}

export interface AgentOutcome {
  readonly ok: boolean;
  readonly answered: boolean;
  readonly firstRoute: string | null;
  readonly totalsFound: readonly [boolean, boolean];
  readonly modelCalls: number;
}

const round = (usd: number) => Math.round(usd * 1e6) / 1e6;

function costRow(key: string, requests: number, costUsd: number) {
  const inputTokens = requests * INPUT_TOKENS_PER_REQUEST;
  const outputTokens = requests * OUTPUT_TOKENS_PER_REQUEST;
  const baselineCostUsd =
    (inputTokens * BASELINE.inputUsdPerMillion + outputTokens * BASELINE.outputUsdPerMillion) / 1e6;
  return {
    key,
    requests,
    inputTokens,
    outputTokens,
    costUsd: round(costUsd),
    baselineCostUsd: round(baselineCostUsd),
  };
}

/** The cost report the gateway would answer for `query` over the case's two days. */
export function fixtureCostReport(c: AgentCase, query: CostQueryDto): CostReportDto {
  const from = Date.parse(query.from);
  const to = Date.parse(query.to);
  const days = c.days.filter((day) => {
    const start = Date.parse(`${day.date}T00:00:00Z`);
    return start >= from && start < to;
  });
  const rows =
    query.groupBy === "day"
      ? days.map((day) =>
          costRow(
            day.date,
            day.routes.reduce((sum, r) => sum + r.requests, 0),
            day.routes.reduce((sum, r) => sum + r.costUsd, 0),
          ),
        )
      : [...new Set(days.flatMap((day) => day.routes.map((r) => r.route)))].map((route) => {
          const matching = days.flatMap((day) => day.routes.filter((r) => r.route === route));
          return costRow(
            route,
            matching.reduce((sum, r) => sum + r.requests, 0),
            matching.reduce((sum, r) => sum + r.costUsd, 0),
          );
        });
  const total = costRow(
    "total",
    rows.reduce((sum, r) => sum + r.requests, 0),
    rows.reduce((sum, r) => sum + r.costUsd, 0),
  );
  return {
    from: query.from,
    to: query.to,
    groupBy: query.groupBy,
    baseline: BASELINE,
    rows,
    notServed: { requests: 0, blocked: 0, failed: 0 },
    totals: total,
  };
}

/** Decimal numbers in a text, `0,84` (Spanish) read as 0.84. */
function amountsIn(text: string): number[] {
  return [...text.matchAll(/\d+(?:[.,]\d+)?/g)].map((m) => Number(m[0].replace(",", ".")));
}

/** The route of the case that the answer names first, or `null`. */
function firstRouteIn(c: AgentCase, answer: string): string | null {
  const routes = [...new Set(c.days.flatMap((day) => day.routes.map((r) => r.route)))];
  let first: { route: string; at: number } | null = null;
  for (const route of routes) {
    const at = answer.indexOf(route);
    if (at >= 0 && (first === null || at < first.at)) first = { route, at };
  }
  return first?.route ?? null;
}

export function scoreAgent(c: AgentCase, observation: AgentObservation): AgentOutcome {
  const answered = observation.stopReason === "answered";
  const amounts = amountsIn(observation.answer);
  const found = (usd: number) => amounts.some((a) => Math.abs(a - usd) <= AMOUNT_TOLERANCE);
  const totalsFound = [found(c.expected.totals[0]), found(c.expected.totals[1])] as const;
  const firstRoute = firstRouteIn(c, observation.answer);
  return {
    ok: answered && firstRoute === c.expected.route && totalsFound[0] && totalsFound[1],
    answered,
    firstRoute,
    totalsFound,
    modelCalls: observation.modelCalls,
  };
}

function reasonOf(c: AgentCase, outcome: AgentOutcome): string {
  if (!outcome.answered) return "no answer";
  const reasons: string[] = [];
  if (outcome.firstRoute !== c.expected.route) reasons.push("wrong or missing route");
  if (!outcome.totalsFound[0] || !outcome.totalsFound[1]) reasons.push("missing daily total");
  return reasons.join(", ");
}

export const agentEval: Eval<AgentCase, AgentObservation, AgentOutcome> = {
  id: "agent",
  dataset: { file: "agent-spend.v1.jsonl", name: AGENT_DATASET.name, schema: AgentCaseSchema },
  requires: ["TAMIZ_EVAL_AGENT_GATEWAY_URL", "TAMIZ_EVAL_API_KEY"],

  prepare({ config, fetch }) {
    return {
      async observe(c) {
        // Gateway failures come back as `stopReason: "gateway_error"`. Anything thrown here
        // is the harness's own (a prompt file, the in-process MCP server): an internal error,
        // not "gateway unavailable" (code audit 2026-11-03, L16).
        const run = await runAgentOnFixture({
          question: c.question,
          now: new Date(`${c.today}T09:00:00Z`),
          costReport: (query) => fixtureCostReport(c, query),
          gatewayUrl: config.TAMIZ_EVAL_AGENT_GATEWAY_URL ?? "",
          apiKey: config.TAMIZ_EVAL_API_KEY ?? "",
          protocol: config.TAMIZ_EVAL_AGENT_PROTOCOL,
          model: config.TAMIZ_EVAL_AGENT_MODEL,
          fetch,
        });
        // A gateway that refuses every call (down, wrong key) is a broken harness, not a
        // wrong answer.
        if (run.stopReason === "gateway_error" && run.requestIds.length <= 1) {
          throw new ServiceError("gateway", run.gatewayError?.type ?? "unavailable");
        }
        return {
          stopReason: run.stopReason,
          modelCalls: run.requestIds.length,
          answer: run.answer ?? "",
          protocol: run.protocol,
        };
      },
    };
  },

  score: scoreAgent,

  summarize(results) {
    const correct = results.filter((r) => r.result.ok).length;
    const calls = results.reduce((sum, r) => sum + r.result.modelCalls, 0);
    const failing: EvalFailingCase[] = results
      .filter((r) => !r.result.ok)
      .map(({ c, result }) => ({
        id: c.id,
        reason: reasonOf(c, result),
        expected: {
          route: c.expected.route,
          totals: c.expected.totals.map((t) => t.toFixed(2)).join(" → "),
        },
        actual: {
          route: result.firstRoute ?? "none",
          totalsFound: result.totalsFound.filter(Boolean).length,
          modelCalls: result.modelCalls,
        },
      }));
    return {
      metrics: [
        {
          name: "answer_accuracy",
          value: results.length === 0 ? 0 : correct / results.length,
          unit: "ratio",
        },
        {
          name: "model_calls_mean",
          value: results.length === 0 ? 0 : calls / results.length,
          unit: "count",
        },
        { name: "cases", value: results.length, unit: "count" },
      ],
      failing,
    };
  },
};
