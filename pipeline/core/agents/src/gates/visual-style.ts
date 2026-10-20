import type { AssetBrief, UiBrief } from "@prd-ui/contracts";
import type { GateIssue, GateResult } from "../contracts.js";
import type { VisualStyleSpec } from "../roles/visual-style.js";

export interface VisualStyleGateInput {
  visualStyle: VisualStyleSpec;
  assetBriefs: AssetBrief[];
  brief: UiBrief;
}

function blocker(code: string, message: string, evidence?: string): GateIssue {
  return {
    code,
    severity: "blocker",
    message,
    ...(evidence === undefined ? {} : { evidence }),
  };
}

function warning(code: string, message: string, evidence?: string): GateIssue {
  return {
    code,
    severity: "warning",
    message,
    ...(evidence === undefined ? {} : { evidence }),
  };
}

const SOURCE_STRATEGY = {
  library: "library",
  commission: "commission",
  "ai-vector": "ai-vector",
  upload: "upload",
} as const;

function expectedKind(
  group: "icons" | "illustrations" | "images",
  kind: AssetBrief["kind"]
): boolean {
  if (group === "icons") return kind === "icon";
  if (group === "illustrations") return kind === "illustration";
  return kind === "illustration" || kind === "poster";
}

/**
 * Visual Style gate: direction completeness, asset-brief coverage and kind,
 * and source-chain compatibility with the declared strategy.
 */
export function runVisualStyleGate(input: VisualStyleGateInput): GateResult {
  const issues: GateIssue[] = [];

  if (input.visualStyle.direction.palette.length === 0) {
    issues.push(blocker("VISUAL_PALETTE_EMPTY", "visual style has an empty palette"));
  }
  if (
    input.visualStyle.direction.typography.heading.trim() === "" ||
    input.visualStyle.direction.typography.body.trim() === ""
  ) {
    issues.push(blocker("VISUAL_TYPOGRAPHY_EMPTY", "visual style typography is empty"));
  }

  const strategy = (input.visualStyle as { assetStrategy?: Partial<Record<string, string>> })
    .assetStrategy;
  if (
    strategy === undefined ||
    strategy.icons === undefined ||
    strategy.illustrations === undefined ||
    strategy.images === undefined
  ) {
    issues.push(
      blocker("VISUAL_ASSET_STRATEGY_MISSING", "visual style assetStrategy is incomplete")
    );
  }

  const briefById = new Map<string, AssetBrief>();
  for (const brief of input.assetBriefs) {
    if (briefById.has(brief.id)) {
      issues.push(
        blocker("ASSET_BRIEF_DUPLICATE", `duplicate asset brief ${brief.id}`, brief.id)
      );
      continue;
    }
    briefById.set(brief.id, brief);
  }

  const expected = new Map<string, "icons" | "illustrations" | "images">();
  for (const id of input.brief.assets.icons) expected.set(id, "icons");
  for (const id of input.brief.assets.illustrations) expected.set(id, "illustrations");
  for (const id of input.brief.assets.images) expected.set(id, "images");

  for (const [id, group] of expected) {
    const brief = briefById.get(id);
    if (brief === undefined) {
      issues.push(blocker("ASSET_BRIEF_MISSING", `missing asset brief for ${id}`, id));
      continue;
    }
    if (!expectedKind(group, brief.kind)) {
      issues.push(
        blocker(
          "ASSET_BRIEF_KIND_MISMATCH",
          `asset ${id} is a ${group.slice(0, -1)} but the brief kind is ${brief.kind}`,
          brief.kind
        )
      );
    }

    const category = group === "icons" ? "icons" : group === "illustrations" ? "illustrations" : "images";
    const declared = strategy?.[category];
    if (declared !== undefined && declared in SOURCE_STRATEGY) {
      const source = SOURCE_STRATEGY[declared as keyof typeof SOURCE_STRATEGY];
      if (!brief.sourceChain.includes(source)) {
        issues.push(
          blocker(
            "ASSET_SOURCE_STRATEGY_MISMATCH",
            `asset ${id} sourceChain does not include ${source} required by strategy ${declared}`,
            brief.sourceChain.join(",")
          )
        );
      }
    }
  }

  for (const id of briefById.keys()) {
    if (!expected.has(id)) {
      issues.push(
        warning("ASSET_BRIEF_EXTRA", `asset brief ${id} is not referenced by the brief`, id)
      );
    }
  }

  const passed = !issues.some((issue) => issue.severity === "blocker");
  return { passed, status: passed ? "passed" : "failed", issues };
}
