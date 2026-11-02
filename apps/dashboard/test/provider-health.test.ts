import { describe, expect, it } from "vitest";
import {
  cooldownSeconds,
  formatErrorRate,
  isHighErrorRate,
  type TargetHealth,
} from "@/features/provider-health/model";

// Spec 008 US8-1, US8-2: what the provider health screen derives from a report.

function target(requests: number, errors: number): TargetHealth {
  return {
    targetId: "openai-mini",
    provider: "openai",
    model: "gpt-4o-mini",
    residency: "us",
    circuit: "closed",
    window: {
      requests,
      errors,
      errorRate: requests === 0 ? 0 : errors / requests,
      latencyP50Ms: null,
      latencyP95Ms: null,
    },
  };
}

describe("cooldownSeconds (US8-2)", () => {
  it("counts down from when the report was received, rounding up", () => {
    expect(cooldownSeconds(18_000, 1_000, 1_000)).toBe(18);
    expect(cooldownSeconds(18_000, 1_000, 1_500)).toBe(18);
    expect(cooldownSeconds(18_000, 1_000, 2_001)).toBe(17);
  });

  it("stops at zero", () => {
    expect(cooldownSeconds(2_000, 0, 60_000)).toBe(0);
  });
});

describe("error rate (US8-1)", () => {
  it("shows no rate for an idle target instead of a zero one", () => {
    expect(formatErrorRate(target(0, 0))).toBe("—");
    expect(isHighErrorRate(target(0, 0))).toBe(false);
  });

  it("formats the rate and marks it high from 20 %", () => {
    expect(formatErrorRate(target(6, 2))).toBe("33.3 %");
    expect(isHighErrorRate(target(6, 2))).toBe(true);
    expect(isHighErrorRate(target(19, 1))).toBe(false);
  });
});
