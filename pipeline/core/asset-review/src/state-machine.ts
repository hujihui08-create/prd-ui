import {
  AssetReviewRunSchema,
  ReviewUsageSchema,
  type AssetAttempt,
  type AssetBrief,
  type AssetCandidate,
  type AssetReviewRecord,
  type AssetReviewRun,
  type AssetReviewSummary,
  type HardGateResult,
  type ReviewResult,
  type ReviewUsage,
  type SourceId,
  type SourcePolicy,
  type SourceTier,
  SourceTierBySource,
} from "./contracts.js";
import { runBatchGates } from "./batch-gates.js";
import { runGate } from "./gate.js";
import { normalizeSvg } from "./gates/svg.js";
import type { AssetReviewPorts } from "./ports.js";
import { reviewCost, type ReviewPricing } from "./pricing.js";
import type { VisualStyle } from "./visual-style.js";
import { validateVerdict } from "./verdict.js";

export interface RunAssetReviewInput {
  runId: string;
  project: string;
  profile: string;
  runDir: string;
  briefs: AssetBrief[];
  style: VisualStyle;
  policy: SourcePolicy;
  ports: AssetReviewPorts;
  only?: string[];
  maxCostUsd?: number;
  maxMinutes?: number;
  continueOnReviewerError?: boolean;
  pricing?: ReviewPricing;
  maxReviewCostCny?: number;
  allowUnknownCost?: boolean;
}

export type AssetReviewRunResult = AssetReviewRun;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function errorDetails(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string") return `${code}: ${errorMessage(error)}`;
  }
  return errorMessage(error);
}

interface ReviewAccounting {
  usage?: ReviewUsage;
  usageComplete?: boolean;
}

/**
 * Reviewers report captured usage on failure too (dsh attaches it to
 * `DshError`). Core reads the fields structurally so it stays runtime-neutral.
 */
function reviewAccountingFromError(error: unknown): ReviewAccounting {
  if (typeof error !== "object" || error === null) return {};
  const candidate = error as { usage?: unknown; usageComplete?: unknown };
  const usage =
    candidate.usage === undefined ? undefined : ReviewUsageSchema.safeParse(candidate.usage);
  return {
    ...(usage?.success === true ? { usage: usage.data } : {}),
    ...(typeof candidate.usageComplete === "boolean"
      ? { usageComplete: candidate.usageComplete }
      : {}),
  };
}

function accountIsIncomplete(accounting: ReviewAccounting): boolean {
  return accounting.usage === undefined || accounting.usageComplete === false;
}

function unresolvedForLimit(
  brief: AssetBrief,
  status: "budget_exceeded" | "usage_incomplete",
  issue: string,
  timestamp: string
): AssetReviewRecord {
  const source = brief.sourceChain[0]!;
  return {
    assetId: brief.id,
    brief,
    status: "unresolved",
    attempts: [
      {
        assetId: brief.id,
        source,
        sourceTier: SourceTierBySource[source],
        attempt: 1,
        status,
        issues: [issue],
        timestamp,
      },
    ],
    degraded: false,
  };
}

function extensionOf(format: string): string {
  if (format === "svg") return "svg";
  if (format === "png") return "png";
  return "jpg";
}

function attemptPath(assetId: string, source: SourceId, attempt: number, file: string): string {
  return `assets/attempts/${assetId}/${source}-${attempt}/${file}`;
}

function freezePath(assetId: string, format: string): string {
  return `assets/frozen/${assetId}/asset.${extensionOf(format)}`;
}

export async function runAssetReview(input: RunAssetReviewInput): Promise<AssetReviewRunResult> {
  const startedAt = input.ports.clock.now();
  const startedAtIso = startedAt.toISOString();
  const selected = input.only?.length
    ? input.briefs.filter((brief) => input.only!.includes(brief.id))
    : input.briefs;
  const maxCostUsd = input.maxCostUsd ?? input.policy.maxCostUsd;
  const maxMinutes = input.maxMinutes ?? input.policy.maxMinutes;
  const continueOnReviewerError = input.continueOnReviewerError ?? true;
  const maxReviewCostCny = input.maxReviewCostCny;
  const reviewPricing = input.pricing;
  const allowUnknownCost = input.allowUnknownCost ?? false;
  if (maxReviewCostCny !== undefined && reviewPricing === undefined) {
    throw new Error("CONFIGURATION_ERROR: pricing is required when maxReviewCostCny is set");
  }

  const records: AssetReviewRecord[] = [];
  let fatalError: string | undefined;
  let reviewerErrors = 0;
  let costBudgetExceeded = false;
  let usageIncomplete = false;
  let totalReviewCostUsd = 0;
  let totalReviewCostCny = 0;
  let reviewInputTokens = 0;
  let reviewOutputTokens = 0;
  let reviewCacheTokens = 0;
  let hasUsage = false;
  let reviewCount = 0;
  let anyIncomplete = false;
  let renderWarnings = 0;

  const recordReview = (
    accounting: ReviewAccounting,
    attempt: AssetAttempt,
    completeness: "full" | "partial-only" = "full"
  ): void => {
    reviewCount += 1;
    if (accounting.usage !== undefined) {
      hasUsage = true;
      attempt.reviewUsage = accounting.usage;
      reviewInputTokens += accounting.usage.inputTokens;
      reviewOutputTokens += accounting.usage.outputTokens;
      reviewCacheTokens += accounting.usage.cacheReadTokens;
      if (input.pricing !== undefined) {
        const cost = reviewCost(accounting.usage, input.pricing);
        attempt.reviewCostUsd = cost.usd;
        attempt.reviewCostCny = cost.cny;
        totalReviewCostUsd += cost.usd;
        totalReviewCostCny += cost.cny;
      }
    }
    if (accountIsIncomplete(accounting)) anyIncomplete = true;
    if (maxReviewCostCny !== undefined) {
      // A completed review fails closed whenever usage is missing or
      // incomplete. An errored review only fails closed on partial usage: a
      // no-usage error is already a reviewer error (MISSING_CREDENTIAL etc.)
      // and must not turn the batch into REVIEW_USAGE_INCOMPLETE.
      const failsClosed =
        completeness === "full"
          ? accountIsIncomplete(accounting)
          : accounting.usage !== undefined && accounting.usageComplete === false;
      if (totalReviewCostCny > maxReviewCostCny) {
        costBudgetExceeded = true;
      } else if (failsClosed && !allowUnknownCost) {
        usageIncomplete = true;
      }
    }
  };

  // Reviewers that can retry internally must not spend past the review budget.
  // The first attempt's cost is the best available estimate for a repair;
  // without usage or a budget the callback is omitted (or denies) rather than
  // guessing zero.
  const canRepair =
    maxReviewCostCny === undefined || reviewPricing === undefined
      ? undefined
      : (firstUsage: ReviewUsage | undefined): boolean => {
          if (firstUsage === undefined) return false;
          return (
            totalReviewCostCny + reviewCost(firstUsage, reviewPricing).cny <=
            maxReviewCostCny
          );
        };

  for (const brief of selected) {
    if (costBudgetExceeded || usageIncomplete) {
      records.push(
        unresolvedForLimit(
          brief,
          costBudgetExceeded ? "budget_exceeded" : "usage_incomplete",
          costBudgetExceeded ? "REVIEW_COST_BUDGET_EXCEEDED" : "REVIEW_USAGE_INCOMPLETE",
          input.ports.clock.now().toISOString()
        )
      );
      continue;
    }
    if (fatalError !== undefined) {
      records.push({
        assetId: brief.id,
        brief,
        status: "unresolved",
        attempts: [
          {
            assetId: brief.id,
            source: brief.sourceChain[0]!,
            sourceTier: SourceTierBySource[brief.sourceChain[0]!],
            attempt: 1,
            status: "reviewer_error",
            issues: [fatalError],
            timestamp: input.ports.clock.now().toISOString(),
          },
        ],
        degraded: false,
      });
      continue;
    }

    const preferredTier = SourceTierBySource[brief.sourceChain[0]!];
    const attempts: AssetAttempt[] = [];
    let totalAttempts = 0;
    let totalCost = 0;
    let fallbackFrom: SourceTier | undefined;
    let fallbackReason: string | undefined;
    let final: AssetReviewRecord | undefined;
    let budgetExceeded = false;
    let reviewerFailed = false;

    await input.ports.log.log({
      type: "asset_started",
      runId: input.runId,
      assetId: brief.id,
      sourceChain: brief.sourceChain,
    });

    for (const source of brief.sourceChain) {
      if (
        final !== undefined ||
        fatalError !== undefined ||
        reviewerFailed ||
        budgetExceeded ||
        costBudgetExceeded ||
        usageIncomplete
      ) {
        break;
      }
      const sourceTier = SourceTierBySource[source];

      await input.ports.log.log({
        type: "source_selected",
        assetId: brief.id,
        source,
        sourceTier,
      });

      for (let attempt = 1; attempt <= input.policy.maxAttemptsPerSource; attempt += 1) {
        if (
          final !== undefined ||
          fatalError !== undefined ||
          costBudgetExceeded ||
          usageIncomplete
        ) {
          break;
        }

        const elapsedMinutes = (input.ports.clock.now().getTime() - startedAt.getTime()) / 60_000;
        if (
          totalAttempts >= input.policy.maxAttemptsPerAsset ||
          totalCost > maxCostUsd ||
          elapsedMinutes > maxMinutes
        ) {
          attempts.push({
            assetId: brief.id,
            source,
            sourceTier,
            attempt,
            status: "budget_exceeded",
            issues: [
              `BUDGET_EXCEEDED attempts=${totalAttempts} cost=${totalCost} elapsedMinutes=${elapsedMinutes}`,
            ],
            costUsd: totalCost,
            timestamp: input.ports.clock.now().toISOString(),
          });
          await input.ports.log.log({
            type: "budget_exceeded",
            assetId: brief.id,
            source,
            attempt,
            totalAttempts,
            totalCost,
            elapsedMinutes,
          });
          budgetExceeded = true;
          break;
        }

        totalAttempts += 1;
        const attemptRecord: AssetAttempt = {
          assetId: brief.id,
          source,
          sourceTier,
          attempt,
          status: "gate_failed",
          issues: [],
          timestamp: input.ports.clock.now().toISOString(),
        };

        await input.ports.log.log({
          type: "attempt_started",
          assetId: brief.id,
          source,
          sourceTier,
          attempt,
        });

        let candidate: AssetCandidate;
        try {
          candidate = await input.ports.producer.produce({
            brief,
            source,
            attempt,
            runDir: input.runDir,
          });
          attemptRecord.candidate = candidate;
          totalCost += candidate.costUsd ?? 0;
          await input.ports.store.writeJson(
            attemptPath(brief.id, source, attempt, "candidate.meta.json"),
            candidate
          );
        } catch (error) {
          attemptRecord.status = "gate_failed";
          attemptRecord.issues = [`PRODUCE_FAILED: ${errorMessage(error)}`];
          attempts.push(attemptRecord);
          await input.ports.log.log({
            type: "attempt_failed",
            assetId: brief.id,
            source,
            attempt,
            reason: "produce",
            error: errorMessage(error),
          });
          continue;
        }

        let normalized: string;
        let gate: HardGateResult;
        try {
          const raw = await input.ports.store.readText(candidate.file.path);
          normalized = candidate.file.format === "svg" ? normalizeSvg(raw) : raw;
          await input.ports.store.writeText(
            attemptPath(brief.id, source, attempt, `normalized.${extensionOf(candidate.file.format)}`),
            normalized
          );
          gate = runGate(brief, normalized);
          attemptRecord.gate = gate;
          await input.ports.store.writeJson(
            attemptPath(brief.id, source, attempt, "gate.json"),
            gate
          );
        } catch (error) {
          attemptRecord.status = "normalize_failed";
          attemptRecord.issues = [`NORMALIZE_FAILED: ${errorMessage(error)}`];
          attempts.push(attemptRecord);
          await input.ports.log.log({
            type: "attempt_failed",
            assetId: brief.id,
            source,
            attempt,
            reason: "normalize",
            error: errorMessage(error),
          });
          continue;
        }

        await input.ports.log.log({
          type: "gate_result",
          assetId: brief.id,
          source,
          attempt,
          passed: gate.passed,
          codes: gate.issues.map((entry) => entry.code),
        });

        if (!gate.passed) {
          attemptRecord.status = "gate_failed";
          attemptRecord.issues = gate.issues.map((entry) => entry.code);
          attempts.push(attemptRecord);
          continue;
        }

        let reviewResult: ReviewResult;
        try {
          reviewResult = await input.ports.reviewer.review({
            brief,
            style: input.style,
            candidate,
            hardGate: gate,
            assetText: normalized,
            runDir: input.runDir,
            ...(canRepair === undefined ? {} : { canRepair }),
          });
        } catch (error) {
          recordReview(reviewAccountingFromError(error), attemptRecord, "partial-only");
          attemptRecord.status = "reviewer_error";
          attemptRecord.issues = [`REVIEWER_ERROR: ${errorDetails(error)}`];
          attempts.push(attemptRecord);
          reviewerErrors += 1;
          reviewerFailed = true;
          if (!continueOnReviewerError) {
            fatalError = `REVIEWER_ERROR: ${errorDetails(error)}`;
          }
          await input.ports.log.log({
            type: "reviewer_error",
            assetId: brief.id,
            source,
            attempt,
            error: errorDetails(error),
          });
          break;
        }

        recordReview(reviewResult, attemptRecord);

        if (reviewResult.renderWarning !== undefined) {
          renderWarnings += 1;
          await input.ports.log.log({
            type: "render_warning",
            assetId: brief.id,
            source,
            attempt,
            warning: reviewResult.renderWarning,
          });
        }

        const check = validateVerdict(reviewResult.verdict, {
          brandCritical: brief.brandCritical ?? false,
        });
        attemptRecord.review = check.verdict;
        attemptRecord.issues = check.inconsistencies;
        await input.ports.store.writeJson(attemptPath(brief.id, source, attempt, "review.json"), {
          ...check.verdict,
          inconsistencies: check.inconsistencies,
        });
        await input.ports.log.log({
          type: "review_result",
          assetId: brief.id,
          source,
          attempt,
          verdict: check.verdict.verdict,
          scores: check.verdict.scores,
          inconsistencies: check.inconsistencies,
        });

        if (check.verdict.verdict === "pass") {
          const frozen = freezePath(brief.id, candidate.file.format);
          await input.ports.store.writeText(frozen, normalized);
          const hash = await input.ports.store.hash(frozen);
          attempts.push({ ...attemptRecord, status: "passed" });
          final = {
            assetId: brief.id,
            brief,
            status: "passed",
            sourceTier,
            source,
            attempts,
            degraded: sourceTier !== preferredTier,
            ...(sourceTier !== preferredTier
              ? { degradedReason: `used source tier ${sourceTier} instead of preferred ${preferredTier}` }
              : {}),
            ...(fallbackFrom === undefined ? {} : { fallbackFrom, fallbackReason }),
            frozen: { path: frozen, format: candidate.file.format, hash },
            license: candidate.license,
            files: [{ path: frozen, format: candidate.file.format }],
            review: {
              agent: "asset-reviewer",
              status: brief.humanSignoffRequired ? "pending" : "not-required",
            },
          };
          await input.ports.log.log({
            type: "asset_frozen",
            assetId: brief.id,
            source,
            sourceTier,
            degraded: sourceTier !== preferredTier,
            frozen,
            hash,
          });
          break;
        }

        if (check.verdict.verdict === "fallback") {
          attemptRecord.status = "fallback";
          attempts.push(attemptRecord);
          fallbackFrom = sourceTier;
          fallbackReason = check.verdict.reason;
          await input.ports.log.log({
            type: "source_fallback",
            assetId: brief.id,
            source,
            sourceTier,
            reason: check.verdict.reason,
          });
          break;
        }

        attemptRecord.status = "retry";
        attempts.push(attemptRecord);
      }
    }

    if (final === undefined) {
      final = {
        assetId: brief.id,
        brief,
        status: "unresolved",
        attempts,
        degraded: false,
        ...(fallbackFrom === undefined ? {} : { fallbackFrom, fallbackReason }),
      };
      await input.ports.log.log({
        type: "asset_unresolved",
        assetId: brief.id,
        attempts: attempts.length,
        ...(fallbackFrom === undefined ? {} : { fallbackFrom, fallbackReason }),
        ...(fatalError === undefined ? {} : { error: fatalError }),
      });
    }

    records.push(final);
  }

  const summary: AssetReviewSummary = {
    total: records.length,
    passed: records.filter((record) => record.status === "passed").length,
    retried: records.filter((record) => record.attempts.length > 1).length,
    unresolved: records.filter((record) => record.status === "unresolved").length,
    degraded: records.filter((record) => record.degraded).length,
    reviewerErrors,
    ...(renderWarnings === 0 ? {} : { renderWarnings }),
    ...(hasUsage
      ? {
          reviewInputTokens,
          reviewOutputTokens,
          reviewCacheTokens,
          ...(input.pricing === undefined
            ? {}
            : { reviewCostUsd: totalReviewCostUsd, reviewCostCny: totalReviewCostCny }),
        }
      : {}),
  };
  const batchGates = await runBatchGates({
    records,
    store: input.ports.store,
    ...(input.only === undefined ? {} : { only: input.only }),
  });
  if (batchGates.skipped) {
    await input.ports.log.log({
      type: "batch_gates_skipped",
      reason: batchGates.reason,
      scope: batchGates.scope,
    });
  }
  const setFailed =
    batchGates.iconSet?.passed === false || batchGates.illustrationSet?.passed === false;
  const setError =
    batchGates.iconSet?.passed === false
      ? "ICON_SET_INCONSISTENT"
      : batchGates.illustrationSet?.passed === false
        ? "ILLUSTRATION_SET_INCONSISTENT"
        : undefined;
  const reviewerError =
    reviewerErrors > 0 ? `REVIEWER_ERROR: ${reviewerErrors} asset(s)` : undefined;
  const costError = usageIncomplete
    ? "REVIEW_USAGE_INCOMPLETE"
    : costBudgetExceeded
      ? "REVIEW_COST_BUDGET_EXCEEDED"
      : undefined;
  // Error precedence keeps the root cause visible: a reviewer crash is never
  // replaced by a cost/usage error, even though the cost guard still stopped
  // the batch and forces `passed: false`.
  const error = fatalError ?? reviewerError ?? costError ?? setError;
  const finishedAt = input.ports.clock.now().toISOString();
  const result: AssetReviewRunResult = {
    runId: input.runId,
    runDir: input.runDir,
    project: input.project,
    profile: input.profile,
    startedAt: startedAtIso,
    finishedAt,
    assets: records,
    summary,
    batchGates,
    ...(reviewCount === 0
      ? {}
      : {
          usageSource: hasUsage ? ("json-events" as const) : ("unavailable" as const),
          usageComplete: !anyIncomplete,
        }),
    passed:
      summary.unresolved === 0 &&
      summary.total > 0 &&
      fatalError === undefined &&
      reviewerErrors === 0 &&
      !setFailed &&
      !costBudgetExceeded &&
      !usageIncomplete,
    ...(error === undefined ? {} : { error }),
  };

  const validated = AssetReviewRunSchema.safeParse(result);
  if (!validated.success) {
    throw new Error(`CONTRACT_VIOLATION: asset-review.json: ${validated.error.message}`);
  }
  await input.ports.store.writeJson("asset-review.json", validated.data);
  await input.ports.log.log({ type: "run_finished", summary, passed: result.passed });
  return validated.data;
}
