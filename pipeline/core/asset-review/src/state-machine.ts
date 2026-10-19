import {
  type AssetAttempt,
  type AssetBrief,
  type AssetCandidate,
  type AssetReviewRecord,
  type AssetReviewRun,
  type AssetReviewSummary,
  type AssetReviewVerdict,
  type HardGateResult,
  type SourceId,
  type SourcePolicy,
  type SourceTier,
  SourceTierBySource,
} from "./contracts.js";
import { runGate } from "./gate.js";
import { normalizeSvg } from "./gates/svg.js";
import type { AssetReviewPorts, VisualStyle } from "./ports.js";
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
}

export type AssetReviewRunResult = AssetReviewRun;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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

  const records: AssetReviewRecord[] = [];
  let fatalError: string | undefined;

  for (const brief of selected) {
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

    await input.ports.log.log({
      type: "asset_started",
      runId: input.runId,
      assetId: brief.id,
      sourceChain: brief.sourceChain,
    });

    for (const source of brief.sourceChain) {
      if (final !== undefined || fatalError !== undefined || budgetExceeded) break;
      const sourceTier = SourceTierBySource[source];

      await input.ports.log.log({
        type: "source_selected",
        assetId: brief.id,
        source,
        sourceTier,
      });

      for (let attempt = 1; attempt <= input.policy.maxAttemptsPerSource; attempt += 1) {
        if (final !== undefined || fatalError !== undefined) break;

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

        let verdict: AssetReviewVerdict;
        try {
          verdict = await input.ports.reviewer.review({
            brief,
            style: input.style,
            candidate,
            hardGate: gate,
            assetText: normalized,
            runDir: input.runDir,
          });
        } catch (error) {
          attemptRecord.status = "reviewer_error";
          attemptRecord.issues = [`REVIEWER_ERROR: ${errorMessage(error)}`];
          attempts.push(attemptRecord);
          fatalError = `REVIEWER_ERROR: ${errorMessage(error)}`;
          await input.ports.log.log({
            type: "reviewer_error",
            assetId: brief.id,
            source,
            attempt,
            error: errorMessage(error),
          });
          break;
        }

        const check = validateVerdict(verdict, {
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
  };
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
    passed: summary.unresolved === 0 && summary.total > 0 && fatalError === undefined,
    ...(fatalError === undefined ? {} : { error: fatalError }),
  };

  await input.ports.store.writeJson("asset-review.json", result);
  await input.ports.log.log({ type: "run_finished", summary, passed: result.passed });
  return result;
}
