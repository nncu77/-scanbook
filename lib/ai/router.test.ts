import { describe, it, expect } from "vitest";
import { computeCostUsd } from "./router";

describe("computeCostUsd", () => {
  it("prices Sonnet 4.6 at $3 in / $15 out per M tokens", () => {
    // 1000 input × $3 + 500 output × $15 = 3000 + 7500 = 10 500 / 1e6 = $0.0105
    expect(
      computeCostUsd("claude-sonnet-4-6", { input_tokens: 1000, output_tokens: 500 })
    ).toBeCloseTo(0.0105, 4);
  });

  it("prices Haiku 4.5 at $1 in / $5 out per M tokens", () => {
    // 1000 × $1 + 500 × $5 = 1000 + 2500 = 3500 / 1e6 = $0.0035
    expect(
      computeCostUsd("claude-haiku-4-5", { input_tokens: 1000, output_tokens: 500 })
    ).toBeCloseTo(0.0035, 4);
  });

  it("matches model IDs by prefix so dated snapshots work", () => {
    expect(
      computeCostUsd("claude-haiku-4-5-20251001", { input_tokens: 1000, output_tokens: 500 })
    ).toBeCloseTo(0.0035, 4);
  });

  it("prices Opus 4.7 at $15 in / $75 out", () => {
    expect(
      computeCostUsd("claude-opus-4-7", { input_tokens: 1000, output_tokens: 500 })
    ).toBeCloseTo(0.0525, 4);
  });

  it("returns null for unknown model IDs", () => {
    expect(computeCostUsd("gpt-4", { input_tokens: 1000, output_tokens: 500 })).toBeNull();
    expect(computeCostUsd("", { input_tokens: 1000, output_tokens: 500 })).toBeNull();
  });
});
