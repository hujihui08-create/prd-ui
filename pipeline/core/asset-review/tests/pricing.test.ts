import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  parsePricingConfig,
  resolvePricing,
  reviewCost,
  type ReviewPricing,
} from "../src/pricing.js";

const pipelineRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../.."
);

const deepseekFlash: ReviewPricing = {
  inputMissUsdPerMillion: 0.3,
  inputCacheUsdPerMillion: 0.006,
  outputUsdPerMillion: 1.2,
  usdToCny: 7.2,
};

describe("review pricing", () => {
  it("parses pipeline/pricing.json and prices deepseek-flash", async () => {
    const raw = JSON.parse(
      await readFile(path.join(pipelineRoot, "pricing.json"), "utf8")
    ) as unknown;
    const config = parsePricingConfig(raw);
    const pricing = resolvePricing(config, "deepseek-flash");

    expect(pricing.usdToCny).toBe(7.2);
    const cost = reviewCost(
      { inputTokens: 1_000_000, outputTokens: 1_000_000, cacheReadTokens: 0 },
      pricing
    );
    expect(cost.usd).toBeCloseTo(1.5);
    expect(cost.cny).toBeCloseTo(10.8);
  });

  it("bills cache reads at the cache price and ignores totalTokens", () => {
    const cost = reviewCost(
      {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 1_000_000,
        totalTokens: 9_000_000,
      },
      deepseekFlash
    );
    expect(cost.usd).toBeCloseTo(0.006);
    expect(cost.cny).toBeCloseTo(0.0432);
  });

  it("falls back to the configured default provider for an unknown model", () => {
    const config = parsePricingConfig({
      default: "deepseek-flash",
      providers: { "deepseek-flash": deepseekFlash },
    });
    expect(resolvePricing(config, "unknown-model")).toEqual(deepseekFlash);
    expect(resolvePricing(config)).toEqual(deepseekFlash);
  });

  it("rejects malformed pricing with INVALID_PRICING", () => {
    expect(() =>
      parsePricingConfig({
        default: "deepseek-flash",
        providers: { "deepseek-flash": { inputMissUsdPerMillion: 0.3 } },
      })
    ).toThrow(/INVALID_PRICING/);

    expect(() =>
      parsePricingConfig({
        default: "missing",
        providers: { "deepseek-flash": deepseekFlash },
      })
    ).toThrow(/INVALID_PRICING/);

    expect(() =>
      parsePricingConfig({
        default: "deepseek-flash",
        providers: { "deepseek-flash": deepseekFlash },
        unexpected: true,
      })
    ).toThrow(/INVALID_PRICING/);
  });
});
