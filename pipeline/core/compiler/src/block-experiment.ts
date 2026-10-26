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
 * C4 conditions are all load-bearing:
 * - conformance is a required tri-state (`failed` rolls back, `not_evaluated`
 *   withholds promotion);
 * - page height is gated on both `documentHeight` (viewport-floored) and
 *   `contentHeight` (raw scroll content), because a page shorter than the
 *   viewport can grow without changing `documentHeight`;
 * - Phase 1 semantic-validator blockers are a hard failure;
 * - experiment token drift may not exceed the measured baseline drift;
 * - parity is required, and a missing parity result is insufficient evidence.
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
      baselineTokenDrift?: number;
      heightDeltaPct?: number;
    }>;
    conformance: BlockConformanceStatus;
    heightDeltaPct?: number;
    contentHeightDeltaPct?: number;
    baselineTokenDrift?: number;
    phase1Blockers?: number;
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
    .flatMap((page) => [page.heightDeltaPct, page.contentHeightDeltaPct])
    .filter((value): value is number => value !== undefined);
  const heightDeltaExceeded = [...blockHeightDeltas, ...pageHeightDeltas].some(
    (value) => Math.abs(value) > 5
  );
  const heightNotEvaluated =
    input.pages.length === 0 ||
    input.pages.some(
      (page) =>
        page.heightDeltaPct === undefined || page.contentHeightDeltaPct === undefined
    );
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

  // Phase 1 semantic blockers are a hard failure; a page whose Phase 1 gate
  // never ran withholds promotion rather than counting as clean.
  const phase1Blockers = input.pages.reduce(
    (sum, page) => sum + (page.phase1Blockers ?? 0),
    0
  );
  const phase1Failed = phase1Blockers > 0;
  const phase1NotEvaluated =
    input.pages.length === 0 ||
    input.pages.some((page) => page.phase1Blockers === undefined);

  // Token drift is only a regression when measured against the baseline; an
  // unmeasured baseline is insufficient evidence, not an implicit zero.
  const baselineTokenDrift = input.pages.map((page) => {
    const perBlock = page.metrics.map((metric) => metric.baselineTokenDrift);
    if (page.metrics.length > 0 && perBlock.every((value) => value !== undefined)) {
      return perBlock.reduce<number>((sum, value) => sum + (value ?? 0), 0);
    }
    return page.baselineTokenDrift;
  });
  const tokenDriftNotEvaluated =
    input.pages.length === 0 || baselineTokenDrift.some((value) => value === undefined);
  const experimentTokenDrift = allMetrics.reduce((sum, metric) => sum + metric.tokenDrift, 0);
  const baselineTokenDriftTotal = baselineTokenDrift.reduce<number>(
    (sum, value) => sum + (value ?? 0),
    0
  );
  const tokenDriftRegressed =
    !tokenDriftNotEvaluated && experimentTokenDrift > baselineTokenDriftTotal;

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
  if (phase1Failed) reasons.push(`phase1Blockers=${phase1Blockers}`);
  else if (phase1NotEvaluated) reasons.push("phase1 not evaluated");
  if (tokenDriftRegressed) reasons.push("tokenDrift>baseline");
  else if (tokenDriftNotEvaluated) reasons.push("token drift not evaluated");

  const hardFailure =
    seams > 0 ||
    retries > 6 ||
    cost > budget ||
    heightDeltaExceeded ||
    blockVerifyFailed ||
    conformanceFailed ||
    parityFailed ||
    phase1Failed ||
    tokenDriftRegressed;
  const conclusion = hardFailure
    ? "rollback"
    : conformancePassed &&
        parityEvaluated &&
        !heightNotEvaluated &&
        !conformanceNotComparable &&
        !phase1NotEvaluated &&
        !tokenDriftNotEvaluated
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
