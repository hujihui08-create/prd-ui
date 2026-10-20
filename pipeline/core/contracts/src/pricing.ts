import { z } from "zod";
import type { AgentUsage } from "./usage.js";

/**
 * Per-provider price table. Prices are in USD per million tokens; `usdToCny`
 * converts the final amount. Cache reads use the cache price, never the
 * cache-miss price, and `totalTokens` is never billed.
 */
export const ReviewPricingSchema = z
  .object({
    inputMissUsdPerMillion: z.number().nonnegative(),
    inputCacheUsdPerMillion: z.number().nonnegative(),
    outputUsdPerMillion: z.number().nonnegative(),
    usdToCny: z.number().positive(),
  })
  .strict();
export type ReviewPricing = z.infer<typeof ReviewPricingSchema>;

export const PricingConfigSchema = z
  .object({
    default: z.string().min(1),
    providers: z.record(z.string().min(1), ReviewPricingSchema),
  })
  .strict();
export type PricingConfig = z.infer<typeof PricingConfigSchema>;

export function parsePricingConfig(
  raw: unknown,
  source = "pricing.json"
): PricingConfig {
  const result = PricingConfigSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`INVALID_PRICING: ${source}: ${result.error.message}`);
  }
  if (!Object.hasOwn(result.data.providers, result.data.default)) {
    throw new Error(
      `INVALID_PRICING: ${source}: default provider ${result.data.default} is not defined`
    );
  }
  return result.data;
}

/**
 * Resolve the price table for the active model. Unknown models fall back to
 * the config's `default` entry; an explicitly selected provider must exist.
 */
export function resolvePricing(
  config: PricingConfig,
  provider?: string
): ReviewPricing {
  const key =
    provider !== undefined && Object.hasOwn(config.providers, provider)
      ? provider
      : config.default;
  const pricing = config.providers[key];
  if (pricing === undefined) {
    throw new Error(`INVALID_PRICING: no pricing for provider ${key}`);
  }
  return pricing;
}

export function reviewCost(
  usage: AgentUsage,
  pricing: ReviewPricing
): { usd: number; cny: number } {
  const usd =
    (usage.inputTokens / 1e6) * pricing.inputMissUsdPerMillion +
    (usage.cacheReadTokens / 1e6) * pricing.inputCacheUsdPerMillion +
    (usage.outputTokens / 1e6) * pricing.outputUsdPerMillion;
  return { usd, cny: usd * pricing.usdToCny };
}

/** Agent-layer alias; the computation is identical to review cost. */
export const usageCost = reviewCost;
