import type {
  BlockConformanceStatus,
  BlockExperimentReport,
  BlockSpec,
  Profile,
  SpecNode,
} from "@prd-ui/contracts";

const RAW_STYLE = /(#[0-9a-fA-F]{3,8}\b)|\brgba?\(|\bhsla?\(|\b\d+(\.\d+)?(px|rem|em)\b/;

function walk(node: SpecNode, visit: (node: SpecNode) => void): void {
  visit(node);
  (node.children ?? []).forEach((child) => walk(child, visit));
  for (const nodes of Object.values(node.slots ?? {})) nodes.forEach((child) => walk(child, visit));
}

/**
 * Count hard-coded visual values in a node tree.
 *
 * The token validator uses the same pattern, so this is the block-level
 * equivalent of "hard-coded colors, lengths, and font sizes".
 */
export function countRawStyleValues(node: SpecNode): number {
  let count = 0;
  walk(node, (entry) => {
    for (const value of Object.values(entry.props ?? {})) {
      if (typeof value === "string" && RAW_STYLE.test(value)) count += 1;
    }
  });
  return count;
}

function paddingValue(value: unknown, profile: Profile): number {
  if (typeof value !== "string") return 0;
  const key = value.replace(/^space[.-]/, "");
  const raw = profile.space[key];
  return raw === undefined ? 0 : Number.parseInt(raw, 10) || 0;
}

/**
 * Count seams between adjacent blocks: both roots add their own positive
 * padding, or both carry the same non-empty title. The check is structural and
 * does not assume a particular component class.
 */
export function countSeams(blocks: BlockSpec[], profile: Profile): number {
  let count = 0;
  for (let index = 1; index < blocks.length; index += 1) {
    const previous = blocks[index - 1]!;
    const current = blocks[index]!;
    const previousBottom = paddingValue(previous.root.props?.padding, profile);
    const currentTop = paddingValue(current.root.props?.padding, profile);
    if (previousBottom > 0 && currentTop > 0) count += 1;
    const previousTitle = previous.root.props?.title;
    const currentTitle = current.root.props?.title;
    if (typeof previousTitle === "string" && previousTitle === currentTitle && previousTitle.length > 0) {
      count += 1;
    }
  }
  return count;
}

/**
 * Decide whether the block experiment can be promoted.
 *
 * Conformance is a required tri-state. `failed` is a hard failure (rollback);
 * `not_evaluated` means the gate did not run, so the result is insufficient
 * evidence unless another hard failure already forces a rollback. A missing
 * parity result is likewise insufficient evidence, never a pass.
 */
export function evaluateBlockExperiment(input: {
  project: string;
  baseline: string;
  maxCostCny?: number;
  pages: Array<{
    pageId: string;
    pageRetries: number;
    costCny: number;
    durationMs: number;
    metrics: Array<{
      blockId: string;
      retries: number;
      seams: number;
      tokenDrift: number;
      heightDeltaPct?: number;
    }>;
    conformance: BlockConformanceStatus;
    heightDeltaPct?: number;
    blockVerifyPassed?: boolean;
    parityPassed?: boolean;
    conformanceComparable?: boolean;
  }>;
}): BlockExperimentReport {
  const reasons: string[] = [];
  const budget = input.maxCostCny ?? 3;
  const allMetrics = input.pages.flatMap((page) => page.metrics);
  const seams = allMetrics.reduce((sum, metric) => sum + metric.seams, 0);
  const retries = allMetrics.reduce((sum, metric) => sum + metric.retries, 0);
  const cost = input.pages.reduce((sum, page) => sum + page.costCny, 0);
  // Page-level height is the machine gate. Block-level deltas are kept as a
  // second hard check, but they disappear when a model renames root ids, so
  // they must never be the only height evidence.
  const blockHeightDeltas = allMetrics
    .map((metric) => metric.heightDeltaPct)
    .filter((value): value is number => value !== undefined);
  const pageHeightDeltas = input.pages
    .map((page) => page.heightDeltaPct)
    .filter((value): value is number => value !== undefined);
  const heightDeltaExceeded = [...blockHeightDeltas, ...pageHeightDeltas].some(
    (value) => Math.abs(value) > 5
  );
  const heightNotEvaluated =
    input.pages.length === 0 ||
    input.pages.some((page) => page.heightDeltaPct === undefined);
  const conformanceFailed = input.pages.some((page) => page.conformance === "failed");
  const blockVerifyFailed = input.pages.some((page) => page.blockVerifyPassed === false);
  const conformanceNotEvaluated =
    input.pages.length === 0 ||
    input.pages.some((page) => page.conformance === "not_evaluated");
  const conformancePassed =
    input.pages.length > 0 &&
    input.pages.every((page) => page.conformance === "passed");
  const conformanceNotComparable = input.pages.some(
    (page) => page.conformanceComparable === false
  );
  const parityEvaluated =
    input.pages.length > 0 && input.pages.every((page) => page.parityPassed !== undefined);
  const parityFailed = input.pages.some((page) => page.parityPassed === false);

  if (seams > 0) reasons.push(`seams=${seams}`);
  if (retries > 6) reasons.push(`retries=${retries}`);
  if (cost > budget) reasons.push(`cost=${cost}`);
  if (heightDeltaExceeded) reasons.push("heightDelta>5%");
  else if (heightNotEvaluated) reasons.push("height not evaluated");
  if (blockVerifyFailed) reasons.push("block verification failed");
  if (conformanceFailed) reasons.push("conformance failed");
  else if (conformanceNotEvaluated) reasons.push("conformance not evaluated");
  if (conformanceNotComparable) reasons.push("conformance not comparable");
  if (parityFailed) reasons.push("parity failed");
  else if (!parityEvaluated) reasons.push("parity not evaluated");

  const hardFailure =
    seams > 0 ||
    retries > 6 ||
    cost > budget ||
    heightDeltaExceeded ||
    blockVerifyFailed ||
    conformanceFailed ||
    parityFailed;
  const conclusion = hardFailure
    ? "rollback"
    : conformancePassed && parityEvaluated && !heightNotEvaluated && !conformanceNotComparable
      ? "promote"
      : "insufficient_evidence";

  return {
    schemaVersion: "1.0",
    project: input.project,
    baseline: input.baseline,
    pages: input.pages,
    conclusion,
    reasons,
  };
}
