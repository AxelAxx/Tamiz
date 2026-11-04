import { describe, expect, it } from "vitest";
import {
  AuditBlockReasonSchema,
  AuditQuerySchema,
  CHAT_MESSAGES_MAX,
  ChatCompletionRequestSchema,
  CostQuerySchema,
  InspectedSensitivitySchema,
  SensitivityLevelSchema,
  SimulateResponseSchema,
  SimulateRoutingInputSchema,
} from "../src/index.js";

// Code audit 2026-11-03, L18: one source per enum, and the bounds the schemas state.

describe("shared enums", () => {
  it("the inspected sensitivity is the policy levels plus unknown", () => {
    expect(InspectedSensitivitySchema.options).toEqual([
      "unknown",
      ...SensitivityLevelSchema.options,
    ]);
  });

  it("a simulation never reports a residency block; the audit can", () => {
    expect(AuditBlockReasonSchema.options).toContain("residency");
    const simulated = SimulateResponseSchema.safeParse({ blockReason: "residency" });
    expect(simulated.success).toBe(false);
    expect(JSON.stringify(simulated.error?.issues)).toContain("blockReason");
  });
});

describe("bounds", () => {
  const message = { role: "user" as const, content: "Hola" };

  it("a chat request has at most CHAT_MESSAGES_MAX messages and a bounded model name", () => {
    const many = Array.from({ length: CHAT_MESSAGES_MAX + 1 }, () => message);
    expect(ChatCompletionRequestSchema.safeParse({ model: "m", messages: many }).success).toBe(
      false,
    );
    expect(
      ChatCompletionRequestSchema.safeParse({ model: "m".repeat(201), messages: [message] })
        .success,
    ).toBe(false);
    expect(
      ChatCompletionRequestSchema.safeParse({ model: "m", messages: [message], max_tokens: 1e12 })
        .success,
    ).toBe(false);
  });

  it("the MCP simulation's messages share the 32,000-character budget of its text", () => {
    const long = { role: "user" as const, content: "a".repeat(20_000) };
    expect(SimulateRoutingInputSchema.safeParse({ messages: [long] }).success).toBe(true);
    expect(SimulateRoutingInputSchema.safeParse({ messages: [long, long] }).success).toBe(false);
  });

  it("audit filters are slugs, so an unbounded string is refused", () => {
    expect(AuditQuerySchema.safeParse({ route: "mistral-small" }).success).toBe(true);
    expect(AuditQuerySchema.safeParse({ route: "x".repeat(10_000) }).success).toBe(false);
  });

  it("a cost range must end after it starts", () => {
    const from = "2026-11-02T00:00:00Z";
    const to = "2026-11-03T00:00:00Z";
    expect(CostQuerySchema.safeParse({ from, to }).success).toBe(true);
    expect(CostQuerySchema.safeParse({ from: to, to: from }).success).toBe(false);
    expect(CostQuerySchema.safeParse({ from, to: from }).success).toBe(false);
  });
});
