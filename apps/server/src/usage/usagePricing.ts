/**
 * Model rate lookup and cost arithmetic.
 *
 * Rates come from LiteLLM's `model_prices_and_context_window.json`, the same
 * table `ccusage` prices against. Everything here is pure: fetching and caching
 * the table lives in `UsageService`.
 *
 * @module usagePricing
 */
import type { UsageCostSource, UsageTokenTotals } from "@t3tools/contracts";

import type { UsageSpeed } from "./usageTranscripts.ts";

/**
 * The subset of a LiteLLM entry we price against. All values are USD per token.
 *
 * LiteLLM publishes priority rates alongside the base rates. They correspond
 * to API Fast/Priority processing; provider-specific fast rates that LiteLLM
 * does not carry are derived below from the provider's published multiplier.
 */
export interface TokenRate {
  readonly inputCostPerToken: number;
  readonly outputCostPerToken: number;
  readonly cacheReadCostPerToken: number;
  readonly cacheCreationCostPerToken: number;
}

export interface ModelRate extends TokenRate {
  readonly fast?: TokenRate;
}

export type RateTable = ReadonlyMap<string, ModelRate>;

/** Raw shape of one LiteLLM entry, narrowed to the fields we read. */
interface LiteLlmEntry {
  readonly input_cost_per_token?: unknown;
  readonly output_cost_per_token?: unknown;
  readonly cache_read_input_token_cost?: unknown;
  readonly cache_creation_input_token_cost?: unknown;
  readonly input_cost_per_token_priority?: unknown;
  readonly output_cost_per_token_priority?: unknown;
  readonly cache_read_input_token_cost_priority?: unknown;
  readonly cache_creation_input_token_cost_priority?: unknown;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Projects the LiteLLM document into a rate table.
 *
 * Entries without both an input and an output rate are dropped: a half-priced
 * model would silently under-report cost, which is worse than reporting the
 * model as unpriced.
 */
export function parseRateTable(document: unknown): RateTable {
  const table = new Map<string, ModelRate>();
  if (typeof document !== "object" || document === null) return table;

  for (const [name, raw] of Object.entries(document as Record<string, unknown>)) {
    if (typeof raw !== "object" || raw === null) continue;
    const entry = raw as LiteLlmEntry;
    const input = finiteNumber(entry.input_cost_per_token);
    const output = finiteNumber(entry.output_cost_per_token);
    if (input === null || output === null) continue;

    const standard: TokenRate = {
      inputCostPerToken: input,
      outputCostPerToken: output,
      // Anthropic bills cache reads at a discount and cache writes at a
      // premium. When a model omits them, cached input is priced as plain
      // input rather than as free.
      cacheReadCostPerToken: finiteNumber(entry.cache_read_input_token_cost) ?? input,
      cacheCreationCostPerToken: finiteNumber(entry.cache_creation_input_token_cost) ?? input,
    };
    const normalizedName = normalizeModelName(name);
    const priorityInput = finiteNumber(entry.input_cost_per_token_priority);
    const priorityOutput = finiteNumber(entry.output_cost_per_token_priority);
    const priorityRate =
      priorityInput !== null && priorityOutput !== null
        ? {
            inputCostPerToken: priorityInput,
            outputCostPerToken: priorityOutput,
            cacheReadCostPerToken:
              finiteNumber(entry.cache_read_input_token_cost_priority) ?? priorityInput,
            cacheCreationCostPerToken:
              finiteNumber(entry.cache_creation_input_token_cost_priority) ?? priorityInput,
          }
        : undefined;
    const fastMultiplier = claudeFastMultiplier(normalizedName);
    const fast =
      priorityRate ?? (fastMultiplier === null ? undefined : scaleRate(standard, fastMultiplier));

    table.set(normalizedName, {
      ...standard,
      ...(fast === undefined ? {} : { fast }),
    });
  }
  return table;
}

function scaleRate(rate: TokenRate, multiplier: number): TokenRate {
  return {
    inputCostPerToken: rate.inputCostPerToken * multiplier,
    outputCostPerToken: rate.outputCostPerToken * multiplier,
    cacheReadCostPerToken: rate.cacheReadCostPerToken * multiplier,
    cacheCreationCostPerToken: rate.cacheCreationCostPerToken * multiplier,
  };
}

/**
 * Anthropic's Fast multiplier follows the model generation. Opus 4.6 and 4.7
 * used the original $30/$150 rate; Opus 5 and 4.8 use $10/$50. Keeping the
 * retired rates matters because the usage page scans historical transcripts.
 */
function claudeFastMultiplier(model: string): number | null {
  if (/^claude-opus-(?:5|4-8)(?:-|$)/.test(model)) return 2;
  if (/^claude-opus-4-[67](?:-|$)/.test(model)) return 6;
  return null;
}

/**
 * Canonicalises a model name for lookup.
 *
 * Strips a `provider/` prefix (LiteLLM publishes both `claude-opus-5` and
 * `anthropic/claude-opus-5`) and lowercases, since transcripts are inconsistent
 * about casing.
 */
export function normalizeModelName(model: string): string {
  const trimmed = model.trim().toLowerCase();
  const slash = trimmed.lastIndexOf("/");
  return slash === -1 ? trimmed : trimmed.slice(slash + 1);
}

/**
 * Models we never price, regardless of the table.
 *
 * `<synthetic>` marks locally generated messages that were never billed. Bare
 * family names ("opus", "sonnet") are genuinely ambiguous across generations,
 * so we report them as unpriced instead of guessing a generation.
 */
const UNPRICEABLE_MODELS = new Set([
  "<synthetic>",
  "synthetic",
  "opus",
  "sonnet",
  "haiku",
  "fable",
]);

export function lookupRate(
  table: RateTable,
  model: string,
  speed: UsageSpeed = "standard",
): TokenRate | null {
  const normalized = normalizeModelName(model);
  if (normalized.length === 0 || UNPRICEABLE_MODELS.has(normalized)) return null;
  const rate = table.get(normalized);
  if (rate === undefined) return null;
  return speed === "fast" ? (rate.fast ?? null) : rate;
}

export interface PricedUsage {
  readonly costUsd: number;
  readonly costSource: UsageCostSource;
}

/**
 * Prices a bucket's tokens.
 *
 * `reasoningTokens` is intentionally not charged separately: it is already
 * counted inside `outputTokens`.
 */
export function priceUsage(
  table: RateTable,
  model: string,
  speed: UsageSpeed,
  totals: UsageTokenTotals,
  reportedCostUsd: number | null,
): PricedUsage {
  if (reportedCostUsd !== null && Number.isFinite(reportedCostUsd)) {
    return { costUsd: reportedCostUsd, costSource: "providerReported" };
  }

  const rate = lookupRate(table, model, speed);
  if (rate === null) return { costUsd: 0, costSource: "unpriced" };

  const costUsd =
    totals.uncachedInputTokens * rate.inputCostPerToken +
    totals.cachedInputTokens * rate.cacheReadCostPerToken +
    totals.cacheCreationTokens * rate.cacheCreationCostPerToken +
    totals.outputTokens * rate.outputCostPerToken;

  return { costUsd, costSource: "modelPriced" };
}

/**
 * What the cached input would have cost at full input rates, minus what it
 * actually cost. Drives the "cache savings" figure.
 */
export function cacheSavingsUsd(
  table: RateTable,
  model: string,
  speed: UsageSpeed,
  totals: UsageTokenTotals,
): number {
  const rate = lookupRate(table, model, speed);
  if (rate === null) return 0;
  return totals.cachedInputTokens * (rate.inputCostPerToken - rate.cacheReadCostPerToken);
}
