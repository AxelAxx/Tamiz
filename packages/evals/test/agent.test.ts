import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { type AgentCase, AgentCaseSchema } from "../src/datasets.js";
import {
  type AgentObservation,
  agentEval,
  BASELINE,
  fixtureCostReport,
  scoreAgent,
} from "../src/evals/agent.js";
import { THRESHOLDS } from "../src/thresholds.js";

// Spec 009 agent-eval addendum FR-026 … FR-029: the fixture, the scorer and the summary are
// pure; the agent itself is covered by apps/mcp-server/test/agent.test.ts.

const DATASET = resolve(import.meta.dirname, "../datasets/agent-spend.v2.jsonl");

async function cases(): Promise<AgentCase[]> {
  const lines = (await readFile(DATASET, "utf8")).split("\n").filter((l) => l.trim() !== "");
  return lines.slice(1).map((line) => AgentCaseSchema.parse(JSON.parse(line)));
}

function observed(answer: string, overrides: Partial<AgentObservation> = {}): AgentObservation {
  return { stopReason: "answered", modelCalls: 3, answer, protocol: "text", ...overrides };
}

describe("agent dataset", () => {
  it("FR-026: every case's totals are its routes' sums, and its cause changed most", async () => {
    for (const c of await cases()) {
      const totals = c.days.map((day) => day.routes.reduce((sum, r) => sum + r.costUsd, 0));
      expect(totals[0], c.id).toBeCloseTo(c.expected.totals[0], 6);
      expect(totals[1], c.id).toBeCloseTo(c.expected.totals[1], 6);
      const [before, after] = c.days;
      const change = (route: string) =>
        Math.abs(
          (after?.routes.find((r) => r.route === route)?.costUsd ?? 0) -
            (before?.routes.find((r) => r.route === route)?.costUsd ?? 0),
        );
      const routes = after?.routes.map((r) => r.route) ?? [];
      const biggest = [...routes].sort((a, b) => change(b) - change(a))[0];
      expect(biggest, c.id).toBe(c.expected.route);
    }
  });
});

describe("agent dataset cannot be passed by a fixed answer (code audit 2026-11-03, H2)", () => {
  it("the fixture's baseline is not a route of any case", async () => {
    for (const c of await cases()) {
      const routes = c.days.flatMap((day) => day.routes.map((r) => r.route));
      expect(routes, c.id).not.toContain(BASELINE.targetId);
    }
  });

  it("naming the same route every time, with both totals copied, stays below the gate", async () => {
    const all = await cases();
    const routes = new Set(all.flatMap((c) => c.days.flatMap((d) => d.routes.map((r) => r.route))));
    const gate = THRESHOLDS.find(
      (t) => t.eval === "agent" && t.metric === "answer_accuracy",
    )?.bound;
    if (gate === undefined) throw new Error("the agent eval has a gate");
    for (const route of routes) {
      const results = all.map((c) => {
        const [before, after] = c.expected.totals;
        const answer = `${route} changed most. Total spent: $${before} → $${after}.`;
        return { c, result: scoreAgent(c, observed(answer)) };
      });
      const accuracy = agentEval
        .summarize(results)
        .metrics.find((m) => m.name === "answer_accuracy");
      expect(accuracy?.value, route).toBeLessThan(gate);
    }
  });
});

describe("fixture cost report", () => {
  it("FR-027: answers by day and by route over the requested UTC days", async () => {
    const [c] = await cases();
    if (c === undefined) throw new Error("the dataset has cases");
    const byDay = fixtureCostReport(c, {
      from: "2026-11-01T00:00:00Z",
      to: "2026-11-03T00:00:00Z",
      groupBy: "day",
    });
    expect(byDay.rows.map((r) => [r.key, r.costUsd])).toEqual([
      ["2026-11-01", 0.42],
      ["2026-11-02", 0.842],
    ]);
    const yesterday = fixtureCostReport(c, {
      from: "2026-11-02T00:00:00Z",
      to: "2026-11-03T00:00:00Z",
      groupBy: "route",
    });
    expect(yesterday.rows.find((r) => r.key === "anthropic-sonnet")?.costUsd).toBe(0.732);
    expect(yesterday.totals.costUsd).toBe(0.842);
    expect(yesterday.totals.baselineCostUsd).toBeGreaterThan(yesterday.totals.costUsd);
  });
});

describe("agent scorer", () => {
  const c: AgentCase = {
    id: "agent-900",
    question: "why did spend rise yesterday?",
    today: "2026-11-03",
    days: [
      {
        date: "2026-11-01",
        routes: [
          { route: "ollama-llama", requests: 30, costUsd: 0 },
          { route: "anthropic-sonnet", requests: 10, costUsd: 0.31 },
        ],
      },
      {
        date: "2026-11-02",
        routes: [
          { route: "ollama-llama", requests: 30, costUsd: 0 },
          { route: "anthropic-sonnet", requests: 24, costUsd: 0.732 },
        ],
      },
    ],
    expected: { route: "anthropic-sonnet", totals: [0.31, 0.732] },
  };

  it("FR-028: passes the cause named first with both totals, rounded to cents", () => {
    const outcome = scoreAgent(
      c,
      observed(
        "anthropic-sonnet changed most. Total spent: $0.31 → $0.73. ollama-llama stayed at $0.",
      ),
    );
    expect(outcome).toMatchObject({ ok: true, firstRoute: "anthropic-sonnet" });
  });

  it("FR-028: reads Spanish decimal commas", () => {
    expect(scoreAgent(c, observed("anthropic-sonnet: de 0,31 a 0,732 dólares")).ok).toBe(true);
  });

  it("FR-028: fails a wrong route named first, a missing total, or no answer", () => {
    expect(
      scoreAgent(c, observed("ollama-llama changed most; anthropic-sonnet went $0.31 → $0.73")),
    ).toMatchObject({ ok: false, firstRoute: "ollama-llama" });
    expect(scoreAgent(c, observed("anthropic-sonnet rose to $0.73")).totalsFound).toEqual([
      false,
      true,
    ]);
    expect(scoreAgent(c, observed("", { stopReason: "step_limit", modelCalls: 6 }))).toMatchObject({
      ok: false,
      answered: false,
    });
  });

  it("FR-029: the summary reports the accuracy and no answer text", () => {
    const right = scoreAgent(c, observed("anthropic-sonnet: $0.31 → $0.73"));
    const wrong = scoreAgent(c, observed("ollama-llama did it: secret words $0.31"));
    const summary = agentEval.summarize([
      { c, result: right },
      { c: { ...c, id: "agent-901" }, result: wrong },
    ]);
    expect(summary.metrics.find((m) => m.name === "answer_accuracy")?.value).toBe(0.5);
    expect(summary.failing).toEqual([
      {
        id: "agent-901",
        reason: "wrong or missing route, missing daily total",
        expected: { route: "anthropic-sonnet", totals: "0.31 → 0.73" },
        actual: { route: "ollama-llama", totalsFound: 1, modelCalls: 3 },
      },
    ]);
    expect(JSON.stringify(summary)).not.toContain("secret words");
  });
});
