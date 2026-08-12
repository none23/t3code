import { describe, expect, it } from "@effect/vitest";

import { parseRateTable, priceUsage } from "./usagePricing.ts";

const totals = {
  uncachedInputTokens: 100,
  cachedInputTokens: 1_000,
  cacheCreationTokens: 10,
  outputTokens: 50,
  reasoningTokens: 0,
};

describe("fast usage pricing", () => {
  it("uses LiteLLM priority rates for Codex Fast mode", () => {
    const rates = parseRateTable({
      "gpt-5.6-sol": {
        input_cost_per_token: 1e-5,
        cache_read_input_token_cost: 1e-6,
        cache_creation_input_token_cost: 1.25e-5,
        output_cost_per_token: 5e-5,
        input_cost_per_token_priority: 2e-5,
        cache_read_input_token_cost_priority: 2e-6,
        cache_creation_input_token_cost_priority: 2.5e-5,
        output_cost_per_token_priority: 1e-4,
      },
    });

    const standard = priceUsage(rates, "gpt-5.6-sol", "standard", totals, null);
    const fast = priceUsage(rates, "gpt-5.6-sol", "fast", totals, null);

    expect(fast.costUsd).toBeCloseTo(standard.costUsd * 2, 9);
    expect(fast.costSource).toBe("modelPriced");
  });

  it("uses Anthropic's published 2x Fast rate for supported Opus models", () => {
    const rates = parseRateTable({
      "claude-opus-5": {
        input_cost_per_token: 5e-6,
        cache_read_input_token_cost: 5e-7,
        cache_creation_input_token_cost: 6.25e-6,
        output_cost_per_token: 2.5e-5,
      },
    });

    const standard = priceUsage(rates, "claude-opus-5", "standard", totals, null);
    const fast = priceUsage(rates, "claude-opus-5", "fast", totals, null);

    expect(fast.costUsd).toBeCloseTo(standard.costUsd * 2, 9);
    expect(fast.costSource).toBe("modelPriced");
  });

  it("keeps historical Claude Fast usage on its original 6x rate", () => {
    const rates = parseRateTable({
      "claude-opus-4-7": {
        input_cost_per_token: 5e-6,
        cache_read_input_token_cost: 5e-7,
        cache_creation_input_token_cost: 6.25e-6,
        output_cost_per_token: 2.5e-5,
      },
    });

    const standard = priceUsage(rates, "claude-opus-4-7", "standard", totals, null);
    const fast = priceUsage(rates, "claude-opus-4-7", "fast", totals, null);

    expect(fast.costUsd).toBeCloseTo(standard.costUsd * 6, 9);
  });

  it("does not silently apply standard pricing when a fast rate is unknown", () => {
    const rates = parseRateTable({
      "some-model": {
        input_cost_per_token: 1e-5,
        output_cost_per_token: 5e-5,
      },
    });

    expect(priceUsage(rates, "some-model", "fast", totals, null)).toEqual({
      costUsd: 0,
      costSource: "unpriced",
    });
  });
});
