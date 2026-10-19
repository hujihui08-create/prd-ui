import type { AssetBrief, AssetCandidate, HardGateResult } from "./contracts.js";
import { runGate } from "./gate.js";
import { normalizeSvg } from "./gates/svg.js";
import type { ArtifactStorePort, AssetProducerPort } from "./ports.js";

export interface PreflightItem {
  assetId: string;
  passed: boolean;
  candidate?: AssetCandidate;
  gate?: HardGateResult;
  error?: string;
}

export interface PreflightResult {
  items: PreflightItem[];
  passed: boolean;
}

export interface PreflightInput {
  briefs: AssetBrief[];
  producer: AssetProducerPort;
  store: ArtifactStorePort;
  runDir: string;
}

function extensionOf(format: string): string {
  if (format === "svg") return "svg";
  if (format === "png") return "png";
  return "jpg";
}

/**
 * Dry-run: resolve the first source and run deterministic checks only. No
 * reviewer, no freeze, no manifest. Used to separate brief/gate problems from
 * model problems.
 */
export async function preflightAssetBriefs(input: PreflightInput): Promise<PreflightResult> {
  const items: PreflightItem[] = [];

  for (const brief of input.briefs) {
    const source = brief.sourceChain[0]!;
    try {
      const candidate = await input.producer.produce({
        brief,
        source,
        attempt: 1,
        runDir: input.runDir,
      });
      const raw = await input.store.readText(candidate.file.path);
      const normalized = candidate.file.format === "svg" ? normalizeSvg(raw) : raw;
      const normalizedPath = `assets/attempts/${brief.id}/${source}-1/normalized.${extensionOf(
        candidate.file.format
      )}`;
      await input.store.writeText(normalizedPath, normalized);
      const gate = runGate(brief, normalized);
      await input.store.writeJson(`assets/attempts/${brief.id}/${source}-1/gate.json`, gate);
      items.push({
        assetId: brief.id,
        passed: gate.passed,
        candidate,
        gate,
      });
    } catch (error) {
      items.push({
        assetId: brief.id,
        passed: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { items, passed: items.length > 0 && items.every((item) => item.passed) };
}
