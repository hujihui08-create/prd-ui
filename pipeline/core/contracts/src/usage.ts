import { z } from "zod";

/**
 * Billing-relevant token usage from one model call. `inputTokens` is
 * cache-miss input only; cache reads are tracked separately and `totalTokens`
 * is audit-only (never used to compute cost).
 *
 * Shared by asset review and the M1 agent layer so both compute cost the same
 * way without one depending on the other.
 */
export const AgentUsageSchema = z
  .object({
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    cacheReadTokens: z.number().int().nonnegative(),
    totalTokens: z.number().int().nonnegative().optional(),
    cacheWriteTokens: z.number().int().nonnegative().optional(),
    reasoningTokens: z.number().int().nonnegative().optional(),
  })
  .strict();
export type AgentUsage = z.infer<typeof AgentUsageSchema>;

export function mergeAgentUsage(
  left: AgentUsage | undefined,
  right: AgentUsage | undefined
): AgentUsage | undefined {
  if (left === undefined) return right;
  if (right === undefined) return left;
  const total = (a: number | undefined, b: number | undefined): number | undefined =>
    a === undefined || b === undefined ? undefined : a + b;
  const totalTokens = total(left.totalTokens, right.totalTokens);
  const cacheWriteTokens = total(left.cacheWriteTokens, right.cacheWriteTokens);
  const reasoningTokens = total(left.reasoningTokens, right.reasoningTokens);
  return {
    inputTokens: left.inputTokens + right.inputTokens,
    outputTokens: left.outputTokens + right.outputTokens,
    cacheReadTokens: left.cacheReadTokens + right.cacheReadTokens,
    ...(totalTokens === undefined ? {} : { totalTokens }),
    ...(cacheWriteTokens === undefined ? {} : { cacheWriteTokens }),
    ...(reasoningTokens === undefined ? {} : { reasoningTokens }),
  };
}
