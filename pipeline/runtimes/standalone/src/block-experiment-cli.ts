import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AgentRunnerError } from "@prd-ui/agents";
import {
  AssetManifestSchema,
  UiBriefSchema,
  parsePricingConfig,
  resolvePricing,
  reviewCost,
  type AgentUsage,
  type AssetManifest,
  type BlockConformanceStatus,
  type BlockContentDraft,
  type BlockExperimentPage,
  type BlockExperimentReport,
  type BlockManifest,
  type BlockSpec,
  type ConformancePage,
  type Finding,
  type PageSpec,
  type RenderMetrics,
  type RenderMetricsPage,
  type ReviewPricing,
  type SpecNode,
  type StyleManifest,
  type UiBrief,
} from "@prd-ui/contracts";
import {
  assembleBlocks,
  countRawStyleValues,
  countSeams,
  evaluateBlockExperiment,
  splitBlocks,
  verifyBlockManifest,
} from "@prd-ui/compiler";
import { getArchetype, getCatalog, getProfile } from "@prd-ui/design-system";
import { comparePlanToStyleManifest, compileFigmaPlans } from "@prd-ui/figma";
import { createRunId, loadProjectConfig } from "@prd-ui/orchestrator";
import { renderDocument } from "@prd-ui/renderer-html";
import { validatePageSpec, type ValidationContext, type ValidationReport } from "@prd-ui/validators";
import {
  FixtureBlockGenerator,
  type BlockGeneratorFactory,
  type BlockGeneratorPort,
} from "./block/generator.js";
import {
  blockRootHash,
  newSeamsByBlock,
  percentDelta,
} from "./block/metrics.js";
import { captureStyleManifests } from "./conformance/capture.js";
import { measurePages } from "./measure/measure.js";
import { loadSpecs } from "./structure-check-cli.js";

const pipelineRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../.."
);

export const USAGE = `Usage:
  pnpm block:experiment --project <yaml> --baseline <spec-run> --runs <dir>
    (--fixtures <dir> | --runtime dsh [--profile <name>])
    [--pages <id,id>] [--pricing <path>] [--max-cost-cny <n>] [--json]

Options:
  --project <yaml>      Project config (assets + brief)
  --baseline <spec-run> Completed spec run containing artifacts/page-spec
  --pages <id,id>       Pages to experiment on (default: every baseline page)
  --fixtures <dir>      Deterministic block fixtures (<dir>/<pageId>/<blockId>.json)
  --runtime dsh         Model-backed generation (requires exported provider env)
  --profile <name>      dsh profile for --runtime dsh (default: prd-ui-agents)
  --pricing <path>      Pricing file (default: pipeline/pricing.json)
  --max-cost-cny <n>    Whole-run budget in CNY (default: 3; fixture mode costs 0)
  --runs <dir>          Runs directory (the report is written to <dir>/<runId>/)
  --json                Print the BlockExperimentReport as one JSON object
  -h, --help            Print this help and exit

Exit codes: 0 report written (promote/insufficient_evidence), 1 rollback,
2 usage or infrastructure error.`;

export class BlockExperimentUsageError extends Error {}

export interface BlockExperimentOptions {
  project?: string;
  baseline?: string;
  pages?: string[];
  fixtures?: string;
  runtime?: "dsh";
  profile?: string;
  pricingPath?: string;
  maxCostCny: number;
  runs?: string;
  json: boolean;
  help: boolean;
}

function readValue(argv: string[], index: number, flag: string): string {
  const value = argv[index];
  if (value === undefined || value.startsWith("--")) {
    throw new BlockExperimentUsageError(`missing value for ${flag}`);
  }
  return value;
}

export function parseArgs(argv: string[]): BlockExperimentOptions {
  const options: BlockExperimentOptions = { maxCostCny: 3, json: false, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]!;
    switch (flag) {
      case "--project":
        options.project = path.resolve(readValue(argv, ++index, flag));
        break;
      case "--baseline":
        options.baseline = path.resolve(readValue(argv, ++index, flag));
        break;
      case "--pages":
        options.pages = readValue(argv, ++index, flag)
          .split(",")
          .map((page) => page.trim())
          .filter((page) => page.length > 0);
        if (options.pages.length === 0) {
          throw new BlockExperimentUsageError("--pages must list at least one page id");
        }
        break;
      case "--fixtures":
        options.fixtures = path.resolve(readValue(argv, ++index, flag));
        break;
      case "--runtime": {
        const runtime = readValue(argv, ++index, flag);
        if (runtime !== "dsh") {
          throw new BlockExperimentUsageError(`unsupported --runtime ${runtime}`);
        }
        options.runtime = runtime;
        break;
      }
      case "--profile":
        options.profile = readValue(argv, ++index, flag);
        break;
      case "--pricing":
        options.pricingPath = path.resolve(readValue(argv, ++index, flag));
        break;
      case "--max-cost-cny": {
        const raw = readValue(argv, ++index, flag);
        const parsed = Number.parseFloat(raw);
        if (!Number.isFinite(parsed) || parsed < 0) {
          throw new BlockExperimentUsageError(`invalid --max-cost-cny ${raw}`);
        }
        options.maxCostCny = parsed;
        break;
      }
      case "--runs":
        options.runs = path.resolve(readValue(argv, ++index, flag));
        break;
      case "--json":
        options.json = true;
        break;
      case "--help":
      case "-h":
        options.help = true;
        break;
      default:
        throw new BlockExperimentUsageError(`unknown argument: ${flag}`);
    }
  }
  return options;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function pretty(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, pretty(value), "utf8");
}

async function loadPricing(explicitPath?: string): Promise<ReviewPricing> {
  const file = explicitPath ?? path.join(pipelineRoot, "pricing.json");
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(file, "utf8")) as unknown;
  } catch (error) {
    throw new Error(`INVALID_PRICING: ${file}: ${errorMessage(error)}`);
  }
  const config = parsePricingConfig(raw, file);
  return resolvePricing(config, process.env.PRD_UI_VISION_MODEL);
}

/** Block failures get two retries; a failed page assembly gets one page retry. */
export const MAX_BLOCK_RETRIES = 2;
export const MAX_PAGE_RETRIES = 1;

export class BlockBudgetExceededError extends Error {
  constructor(
    readonly spentCny: number,
    readonly maxCostCny: number,
    phase: "pre-call" | "post-call" = "post-call"
  ) {
    super(
      phase === "pre-call"
        ? `BUDGET_EXCEEDED: spent ¥${spentCny.toFixed(4)} >= cap ¥${maxCostCny} before dispatch`
        : `BUDGET_EXCEEDED: spent ¥${spentCny.toFixed(4)} > cap ¥${maxCostCny}`
    );
    this.name = "BlockBudgetExceededError";
  }
}

/**
 * A model call completed but the transport could not attest complete usage.
 * Treating it as a free call would let the run "fit" a budget it actually
 * exceeded, so it stops the experiment instead.
 */
export class BlockUsageIncompleteError extends Error {
  constructor(message: string) {
    super(`USAGE_INCOMPLETE: ${message}`);
    this.name = "BlockUsageIncompleteError";
  }
}

/**
 * Whole-run cost accounting for the dsh experiment. Every model call is
 * charged, including calls that later failed. A pre-call guard stops before
 * dispatching once the cap is reached; a single in-flight call can still
 * overshoot, which is the only residual overshoot and never yields `promote`.
 */
export class BlockCostBudget {
  private spent = 0;

  constructor(
    readonly maxCostCny: number,
    readonly pricing: ReviewPricing
  ) {}

  get spentCny(): number {
    return this.spent;
  }

  costOf(usage: AgentUsage | undefined): number {
    return usage === undefined ? 0 : reviewCost(usage, this.pricing).cny;
  }

  canAfford(usage: AgentUsage | undefined): boolean {
    return this.spent + this.costOf(usage) <= this.maxCostCny;
  }

  canStart(): boolean {
    return this.spent < this.maxCostCny;
  }

  /** Refuse to dispatch another call once the cap is already reached. */
  assertCanStart(): void {
    if (!this.canStart()) {
      throw new BlockBudgetExceededError(this.spent, this.maxCostCny, "pre-call");
    }
  }

  /** Charge one call and fail closed once the cap is crossed. */
  charge(usage: AgentUsage | undefined): number {
    const cost = this.costOf(usage);
    this.spent += cost;
    if (this.spent > this.maxCostCny) {
      throw new BlockBudgetExceededError(this.spent, this.maxCostCny);
    }
    return cost;
  }
}

/**
 * Infrastructure failures must never be retried as block failures: a missing
 * key, missing dsh binary, timeout, non-zero exit, incomplete usage, or an
 * exhausted budget will not heal by asking the model again. Only invalid
 * model output is a retryable generation failure.
 */
export function isBlockInfraError(error: unknown): boolean {
  if (error instanceof BlockBudgetExceededError) return true;
  if (error instanceof BlockUsageIncompleteError) return true;
  if (error instanceof AgentRunnerError) {
    return error.code !== "AGENT_INVALID_OUTPUT";
  }
  return /CONFIGURATION_ERROR|DSH_UNAVAILABLE|BUDGET_EXCEEDED|USAGE_INCOMPLETE|BLOCK_EVIDENCE_WRITE_FAILED/.test(
    errorMessage(error)
  );
}

/** Assembly/verification failure is the only failure that retries the page. */
export class BlockAssemblyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BlockAssemblyError";
  }
}

function accountUsage(input: {
  blockId: string;
  generator: BlockGeneratorPort;
  budget?: BlockCostBudget;
  onCost: (cny: number) => void;
}): void {
  const result = input.generator.takeUsage?.();
  if (result === undefined) return;
  // Charge whatever partial usage exists before failing closed, so an
  // incomplete call is not silently free.
  if (result.usage !== undefined) {
    const cost = input.budget?.charge(result.usage);
    if (cost !== undefined) input.onCost(cost);
  }
  if (result.usageComplete !== true) {
    throw new BlockUsageIncompleteError(
      `block ${input.blockId} did not report complete usage`
    );
  }
}

export async function generateBlockWithRetries(input: {
  pageId: string;
  block: BlockSpec;
  generator: BlockGeneratorPort;
  onCost: (cny: number) => void;
  /** Fixture mode passes 0 so a bad fixture still fails immediately. */
  maxRetries?: number;
  budget?: BlockCostBudget;
}): Promise<{ draft: BlockContentDraft; retries: number }> {
  const maxRetries = input.maxRetries ?? MAX_BLOCK_RETRIES;
  let retries = 0;
  for (;;) {
    // Pre-call budget guard: never dispatch once the cap is reached. An
    // in-flight call can still overshoot; that is the only residual overshoot.
    input.budget?.assertCanStart();
    try {
      const draft = await input.generator.generate({
        pageId: input.pageId,
        blockId: input.block.blockId,
        prompt: `Regenerate block ${input.block.blockId} (${input.block.role}).`,
      });
      accountUsage({ ...input, blockId: input.block.blockId });
      return { draft, retries };
    } catch (error) {
      if (
        error instanceof BlockUsageIncompleteError ||
        error instanceof BlockBudgetExceededError
      ) {
        throw error;
      }
      // Charge the failed call before deciding anything, so a budget stop
      // still reflects every token spent. Incomplete usage also stops here.
      accountUsage({ ...input, blockId: input.block.blockId });
      if (isBlockInfraError(error)) throw error;
      if (retries >= maxRetries) throw error;
      retries += 1;
    }
  }
}

function collectNodeIds(node: SpecNode, ids: Set<string> = new Set()): Set<string> {
  if (node.id !== undefined) ids.add(node.id);
  (node.children ?? []).forEach((child) => collectNodeIds(child, ids));
  for (const nodes of Object.values(node.slots ?? {})) {
    nodes.forEach((child) => collectNodeIds(child, ids));
  }
  return ids;
}

/**
 * Conformance blocker diffs are comparable only when the regenerated block
 * still contains every baseline node id. Renaming a root id re-keys the gate,
 * which turns new/fixed blocker counts into noise.
 */
export function preservesBaselineNodeIds(
  baseline: SpecNode,
  experiment: SpecNode
): boolean {
  const experimentIds = collectNodeIds(experiment);
  return [...collectNodeIds(baseline)].every((id) => experimentIds.has(id));
}

function selectPages(specs: PageSpec[], requested: string[] | undefined): PageSpec[] {
  if (requested === undefined) return specs;
  const byId = new Map(specs.map((spec) => [spec.meta.pageId, spec]));
  return requested.map((pageId) => {
    const spec = byId.get(pageId);
    if (spec === undefined) {
      throw new Error(`BLOCK_PAGE_UNKNOWN: ${pageId} is not in the baseline spec run`);
    }
    return spec;
  });
}

function pageNames(specs: PageSpec[]): Record<string, string> {
  return Object.fromEntries(specs.map((spec) => [spec.meta.pageId, spec.meta.name]));
}

function pageRoutes(specs: PageSpec[]): Record<string, string> {
  return Object.fromEntries(specs.map((spec) => [spec.meta.pageId, spec.meta.route]));
}

function pageArchetypes(specs: PageSpec[]): Record<string, string> {
  return Object.fromEntries(specs.map((spec) => [spec.meta.pageId, spec.meta.archetype]));
}

async function renderPages(
  specs: PageSpec[],
  allSpecs: PageSpec[],
  outDir: string
): Promise<void> {
  await mkdir(outDir, { recursive: true });
  for (const spec of specs) {
    const html = renderDocument(spec, getProfile(spec.meta.profile), {
      pageNames: pageNames(allSpecs),
      pageRoutes: pageRoutes(allSpecs),
      pageArchetypes: pageArchetypes(allSpecs),
    });
    await writeFile(path.join(outDir, `${spec.meta.pageId}.html`), html, "utf8");
  }
}

interface ContextLoad {
  contexts: Map<string, ValidationContext>;
  notes: string[];
}

/**
 * Build validation contexts from the project brief and asset manifests. The
 * experiment is still useful without them, so missing inputs are recorded as
 * notes instead of failing the run.
 */
async function loadContexts(
  projectPath: string,
  specs: PageSpec[]
): Promise<ContextLoad> {
  const notes: string[] = [];
  const contexts = new Map<string, ValidationContext>();
  const { config, baseDir } = loadProjectConfig(projectPath);

  let brief: UiBrief | undefined;
  try {
    brief = UiBriefSchema.parse(
      JSON.parse(await readFile(path.resolve(baseDir, config.brief), "utf8"))
    );
  } catch (error) {
    notes.push(`VALIDATION_CONTEXT_UNAVAILABLE: brief: ${errorMessage(error)}`);
    return { contexts, notes };
  }

  const manifests = new Map<string, AssetManifest>();
  for (const spec of specs) {
    const profile = spec.meta.profile;
    if (manifests.has(profile)) continue;
    const relative = config.manifests[profile];
    if (relative === undefined) {
      notes.push(`VALIDATION_CONTEXT_UNAVAILABLE: no asset manifest for ${profile}`);
      continue;
    }
    try {
      manifests.set(
        profile,
        AssetManifestSchema.parse(
          JSON.parse(await readFile(path.resolve(baseDir, relative), "utf8"))
        )
      );
    } catch (error) {
      notes.push(`VALIDATION_CONTEXT_UNAVAILABLE: manifest ${relative}: ${errorMessage(error)}`);
    }
  }

  const briefPages = new Map(brief.ia.pages.map((page) => [page.id, page]));
  for (const spec of specs) {
    const manifest = manifests.get(spec.meta.profile);
    if (manifest === undefined) continue;
    const briefPage = briefPages.get(spec.meta.pageId);
    contexts.set(spec.meta.pageId, {
      profile: getProfile(spec.meta.profile),
      catalog: getCatalog(spec.meta.profile),
      archetype: getArchetype(spec.meta.archetype),
      manifest,
      ...(briefPage?.requiredStates === undefined
        ? {}
        : { requiredStates: briefPage.requiredStates }),
      ...(briefPage === undefined ? {} : { briefPage }),
      navigation: brief.ia.navigation,
    });
  }
  return { contexts, notes };
}

function countBlockers(page: ConformancePage): number {
  return page.findings.filter((finding) => finding.severity === "blocker").length;
}

function blockerSignatures(page: ConformancePage): string[] {
  return page.findings
    .filter((finding) => finding.severity === "blocker")
    .map((finding) => `${finding.code}|${finding.specId ?? ""}|${finding.message}`);
}

interface PageSeamDiagnostics {
  pageId: string;
  baselineSeams: number;
  experimentSeams: number;
  newSeams: number;
  netDelta: number;
}

interface PageMeasurement {
  pageId: string;
  baseline: Pick<RenderMetricsPage, "documentHeight" | "contentHeight" | "firstScreenNodes">;
  experiment: Pick<RenderMetricsPage, "documentHeight" | "contentHeight" | "firstScreenNodes">;
  heightDeltaPct?: number;
  blocks: Array<{
    blockId: string;
    baselineHeight?: number;
    experimentHeight?: number;
    heightDeltaPct?: number;
  }>;
}

interface ConformanceGatePage {
  pageId: string;
  baseline: { passed: boolean; checked: number; skipped: number; blockers: number };
  experiment: { passed: boolean; checked: number; skipped: number; blockers: number };
  newBlockers: string[];
  fixedBlockers: string[];
  gateUsable: boolean;
  comparable: boolean;
  conformance: BlockConformanceStatus;
}

interface PageOutcome {
  report: BlockExperimentPage;
  experimentSpec: PageSpec;
  experimentManifest: BlockManifest;
  verifyFindings: Finding[];
  validation?: ValidationReport;
  seams: PageSeamDiagnostics;
}

function findPage(metrics: RenderMetrics, pageId: string): RenderMetricsPage {
  const page = metrics.pages.find((entry) => entry.pageId === pageId);
  if (page === undefined) throw new Error(`RENDER_METRICS_PAGE_MISSING: ${pageId}`);
  return page;
}

function viewportFor(spec: PageSpec): { width: number; height: number } {
  return spec.meta.target === "web"
    ? { width: 1440, height: 900 }
    : { width: 390, height: 844 };
}

function heightBySpecId(manifest: StyleManifest): Map<string, number> {
  return new Map(manifest.nodes.map((node) => [node.specId, node.rect.height]));
}

function blockHeightDelta(
  block: BlockSpec,
  baselineHeights: Map<string, number>,
  experimentHeights: Map<string, number>
): { baselineHeight?: number; experimentHeight?: number; heightDeltaPct?: number } {
  const id = block.root.id;
  if (id === undefined) return {};
  const baselineHeight = baselineHeights.get(id);
  const experimentHeight = experimentHeights.get(id);
  if (baselineHeight === undefined || experimentHeight === undefined) {
    return {
      ...(baselineHeight === undefined ? {} : { baselineHeight }),
      ...(experimentHeight === undefined ? {} : { experimentHeight }),
    };
  }
  const delta = percentDelta(baselineHeight, experimentHeight);
  return {
    baselineHeight,
    experimentHeight,
    ...(delta === undefined ? {} : { heightDeltaPct: delta }),
  };
}

export interface BlockExperimentResult {
  report: BlockExperimentReport;
  runDir: string;
}

/**
 * Run the fixture or model block experiment. Everything that can be measured
 * is measured; checks that cannot be evaluated are left out of the report
 * rather than assumed green.
 *
 * `generatorSource` is either one shared fixture generator or a per-block
 * factory (the model generator needs each block's role, components, states,
 * and baseline root). `budget` is present only in dsh mode.
 */
export async function runBlockExperiment(
  options: BlockExperimentOptions,
  generatorSource: BlockGeneratorPort | BlockGeneratorFactory,
  budget?: BlockCostBudget
): Promise<BlockExperimentResult> {
  if (options.project === undefined) throw new BlockExperimentUsageError("--project is required");
  if (options.baseline === undefined) throw new BlockExperimentUsageError("--baseline is required");
  if (options.runs === undefined) throw new BlockExperimentUsageError("--runs is required");

  const { config } = loadProjectConfig(options.project);
  const allBaselineSpecs = await loadSpecs(options.baseline);
  const project = allBaselineSpecs[0]?.meta.project;
  if (project === undefined) throw new Error(`SPEC_RUN_EMPTY: ${options.baseline}`);
  if (project !== config.project) {
    throw new Error(`BLOCK_PROJECT_MISMATCH: project config ${config.project}, baseline ${project}`);
  }
  const baselineSpecs = selectPages(allBaselineSpecs, options.pages);

  const runId = createRunId();
  const runDir = path.join(options.runs, runId);
  const baselineHtmlDir = path.join(runDir, "baseline-html");
  const experimentHtmlDir = path.join(runDir, "html");
  const specDir = path.join(runDir, "artifacts", "page-spec");
  const manifestDir = path.join(runDir, "artifacts", "block-manifest");
  await mkdir(specDir, { recursive: true });
  await mkdir(manifestDir, { recursive: true });

  const contextLoad = await loadContexts(options.project, baselineSpecs);
  const outcomes: PageOutcome[] = [];
  const experimentSpecs: PageSpec[] = [];

  const generatorFor = (block: BlockSpec): BlockGeneratorPort =>
    typeof generatorSource === "function"
      ? generatorSource(block, {
          runDir: path.join(runDir, "dsh", block.pageId, block.blockId),
        })
      : generatorSource;
  // Retries belong to the model path; fixture mode stays deterministic and
  // reports structural findings instead of re-reading identical files.
  const maxBlockRetries = options.runtime === "dsh" ? MAX_BLOCK_RETRIES : 0;
  const maxPageRetries = options.runtime === "dsh" ? MAX_PAGE_RETRIES : 0;

  for (const spec of baselineSpecs) {
    const started = Date.now();
    const pageId = spec.meta.pageId;
    const profile = getProfile(spec.meta.profile);
    const archetype = getArchetype(spec.meta.archetype);
    const manifest = splitBlocks(spec, archetype);
    const retriesByBlock: number[] = manifest.blocks.map(() => 0);
    let pageRetries = 0;
    let pageCostCny = 0;
    let experimentManifest: BlockManifest | undefined;
    let experimentSpec: PageSpec | undefined;
    let verifyFindings: Finding[] | undefined;

    for (;;) {
      const attempt: BlockManifest = structuredClone(manifest);
      for (let index = 0; index < manifest.blocks.length; index += 1) {
        const block = manifest.blocks[index]!;
        const { draft, retries } = await generateBlockWithRetries({
          pageId,
          block,
          generator: generatorFor(block),
          onCost: (cny) => {
            pageCostCny += cny;
          },
          maxRetries: maxBlockRetries,
          ...(budget === undefined ? {} : { budget }),
        });
        retriesByBlock[index] = (retriesByBlock[index] ?? 0) + retries;
        if (draft.blockId !== block.blockId) {
          throw new Error(
            `BLOCK_DRAFT_ID_MISMATCH: ${pageId} expected ${block.blockId}, got ${draft.blockId}`
          );
        }
        attempt.blocks[index] = {
          ...block,
          root: structuredClone(draft.root),
          hash: blockRootHash(draft.root),
        };
      }

      let candidateSpec: PageSpec;
      let findings: Finding[];
      try {
        candidateSpec = assembleBlocks(spec, attempt);
        // Verify the manifest against the page it assembles to. Verifying it
        // against the baseline page would fail every regenerated block through
        // BLOCK_ROUNDTRIP_MISMATCH; the round-trip contract is about manifest
        // structure, not content equality with the baseline.
        findings = verifyBlockManifest(candidateSpec, attempt);
      } catch (error) {
        // Assembly itself failing is not a content judgement; retry the page
        // once in dsh mode, then stop honestly instead of fabricating a report.
        if (pageRetries >= maxPageRetries) {
          throw new BlockAssemblyError(
            `BLOCK_ASSEMBLY_FAILED: ${pageId}: ${errorMessage(error)}`
          );
        }
        pageRetries += 1;
        continue;
      }

      const blockers = findings.filter((finding) => finding.severity === "blocker");
      if (blockers.length > 0 && pageRetries < maxPageRetries) {
        pageRetries += 1;
        continue;
      }
      // After the retry budget is spent, keep the findings and let the report
      // conclude rollback (blockVerifyPassed=false) rather than exiting green.
      experimentManifest = attempt;
      experimentSpec = candidateSpec;
      verifyFindings = findings;
      break;
    }

    if (
      experimentManifest === undefined ||
      experimentSpec === undefined ||
      verifyFindings === undefined
    ) {
      throw new Error(`BLOCK_PAGE_GENERATION_MISSING: ${pageId}`);
    }

    const context = contextLoad.contexts.get(pageId);
    const validation = context === undefined ? undefined : validatePageSpec(experimentSpec, context);

    const baselineSeams = countSeams(manifest.blocks, profile);
    const experimentSeams = countSeams(experimentManifest.blocks, profile);
    const newSeams = newSeamsByBlock(manifest.blocks, experimentManifest.blocks, profile);

    const metrics = manifest.blocks.map((block, index) => ({
      blockId: block.blockId,
      retries: retriesByBlock[index] ?? 0,
      seams: newSeams[index] ?? 0,
      tokenDrift: countRawStyleValues(experimentManifest!.blocks[index]!.root),
    }));

    // Renaming baseline ids re-keys conformance, so blocker diffs stop being
    // evidence. Record that explicitly instead of reporting noisy counts.
    const conformanceComparable = manifest.blocks.every((block, index) =>
      preservesBaselineNodeIds(
        block.root,
        experimentManifest!.blocks[index]!.root
      )
    );

    const reportPage: BlockExperimentPage = {
      pageId,
      metrics,
      pageRetries,
      costCny: pageCostCny,
      durationMs: Date.now() - started,
      conformance: "not_evaluated",
      conformanceComparable,
    };

    outcomes.push({
      report: reportPage,
      experimentSpec,
      experimentManifest,
      verifyFindings,
      ...(validation === undefined ? {} : { validation }),
      seams: {
        pageId,
        baselineSeams,
        experimentSeams,
        newSeams: newSeams.reduce((sum, n) => sum + n, 0),
        netDelta: experimentSeams - baselineSeams,
      },
    });
    experimentSpecs.push(experimentSpec);

    await writeJson(path.join(specDir, `${pageId}.json`), experimentSpec);
    await writeJson(path.join(manifestDir, `${pageId}.json`), experimentManifest);
    await writeJson(path.join(manifestDir, `baseline.${pageId}.json`), manifest);
  }

  await renderPages(baselineSpecs, allBaselineSpecs, baselineHtmlDir);
  await renderPages(experimentSpecs, allBaselineSpecs, experimentHtmlDir);

  const measureTargets = baselineSpecs.map((spec) => ({
    pageId: spec.meta.pageId,
    target: spec.meta.target,
  }));
  const baselineMetrics = await measurePages({
    htmlDir: baselineHtmlDir,
    project,
    pages: measureTargets,
  });
  const experimentMetrics = await measurePages({
    htmlDir: experimentHtmlDir,
    project,
    pages: measureTargets,
  });

  const captureTargets = baselineSpecs.map((spec) => ({
    pageId: spec.meta.pageId,
    viewport: viewportFor(spec),
  }));
  const baselineStyles = await captureStyleManifests({
    htmlDir: baselineHtmlDir,
    pages: captureTargets,
  });
  const experimentStyles = await captureStyleManifests({
    htmlDir: experimentHtmlDir,
    pages: captureTargets,
  });
  const baselineStyleByPage = new Map(baselineStyles.map((style) => [style.pageId, style]));
  const experimentStyleByPage = new Map(experimentStyles.map((style) => [style.pageId, style]));

  const experimentAllSpecs = allBaselineSpecs.map(
    (spec) => experimentSpecs.find((entry) => entry.meta.pageId === spec.meta.pageId) ?? spec
  );
  const baselinePlans = compileFigmaPlans(
    allBaselineSpecs,
    (page) => getProfile(page.meta.profile),
    (page) => getCatalog(page.meta.profile)
  );
  const experimentPlans = compileFigmaPlans(
    experimentAllSpecs,
    (page) => getProfile(page.meta.profile),
    (page) => getCatalog(page.meta.profile)
  );
  const baselinePlanByPage = new Map(baselinePlans.map((plan) => [plan.pageId, plan]));
  const experimentPlanByPage = new Map(experimentPlans.map((plan) => [plan.pageId, plan]));

  const seamDiagnostics: PageSeamDiagnostics[] = [];
  const measurements: PageMeasurement[] = [];
  const conformancePages: ConformanceGatePage[] = [];
  const blockVerifyPages: Array<{ pageId: string; findings: Finding[]; passed: boolean }> = [];
  const validationPages: Array<{
    pageId: string;
    passed: boolean;
    blockers: number;
    major: number;
    minor: number;
  }> = [];

  for (const outcome of outcomes) {
    const pageId = outcome.report.pageId;
    const spec = baselineSpecs.find((entry) => entry.meta.pageId === pageId)!;
    const profile = getProfile(spec.meta.profile);
    const baselineStyle = baselineStyleByPage.get(pageId);
    const experimentStyle = experimentStyleByPage.get(pageId);
    if (baselineStyle === undefined || experimentStyle === undefined) {
      throw new Error(`CONFORMANCE_MANIFEST_MISSING: ${pageId}`);
    }
    const baselinePlan = baselinePlanByPage.get(pageId);
    const experimentPlan = experimentPlanByPage.get(pageId);
    if (baselinePlan === undefined || experimentPlan === undefined) {
      throw new Error(`FIGMA_PLAN_MISSING: ${pageId}`);
    }

    const baselineGate = comparePlanToStyleManifest({
      plan: baselinePlan,
      manifest: baselineStyle,
      profile,
    });
    const experimentGate = comparePlanToStyleManifest({
      plan: experimentPlan,
      manifest: experimentStyle,
      profile,
    });
    const baselineSignatures = new Set(blockerSignatures(baselineGate));
    const experimentSignatures = new Set(blockerSignatures(experimentGate));
    const newBlockers = [...experimentSignatures].filter(
      (signature) => !baselineSignatures.has(signature)
    );
    const fixedBlockers = [...baselineSignatures].filter(
      (signature) => !experimentSignatures.has(signature)
    );

    const verifyFindings = outcome.verifyFindings;
    const hasBlockFailures = verifyFindings.some((finding) => finding.severity === "blocker");
    outcome.report.blockVerifyPassed = !hasBlockFailures;
    const conformance: BlockConformanceStatus = experimentGate.passed ? "passed" : "failed";
    outcome.report.conformance = conformance;

    conformancePages.push({
      pageId,
      baseline: {
        passed: baselineGate.passed,
        checked: baselineGate.checked,
        skipped: baselineGate.skipped,
        blockers: countBlockers(baselineGate),
      },
      experiment: {
        passed: experimentGate.passed,
        checked: experimentGate.checked,
        skipped: experimentGate.skipped,
        blockers: countBlockers(experimentGate),
      },
      newBlockers,
      fixedBlockers,
      gateUsable: baselineGate.passed,
      comparable: outcome.report.conformanceComparable !== false,
      conformance,
    });

    blockVerifyPages.push({
      pageId,
      findings: verifyFindings,
      passed: !hasBlockFailures,
    });
    if (outcome.validation !== undefined) {
      validationPages.push({
        pageId,
        passed: outcome.validation.passed,
        blockers: outcome.validation.blockers,
        major: outcome.validation.major,
        minor: outcome.validation.minor,
      });
    }

    seamDiagnostics.push(outcome.seams);

    const baselinePageMetrics = findPage(baselineMetrics, pageId);
    const experimentPageMetrics = findPage(experimentMetrics, pageId);
    const baselineHeights = heightBySpecId(baselineStyle);
    const experimentHeights = heightBySpecId(experimentStyle);
    const blockHeights = outcome.experimentManifest.blocks.map((block) =>
      blockHeightDelta(block, baselineHeights, experimentHeights)
    );
    outcome.report.metrics.forEach((metric, index) => {
      const height = blockHeights[index];
      if (height?.heightDeltaPct !== undefined) metric.heightDeltaPct = height.heightDeltaPct;
    });
    // The page-level documentHeight delta is the height gate. Per-block
    // lookups cannot substitute for it: they key on root ids, which a model
    // may rename.
    const pageHeightDelta = percentDelta(
      baselinePageMetrics.documentHeight,
      experimentPageMetrics.documentHeight
    );
    if (pageHeightDelta !== undefined) {
      outcome.report.heightDeltaPct = pageHeightDelta;
    }
    measurements.push({
      pageId,
      baseline: {
        documentHeight: baselinePageMetrics.documentHeight,
        contentHeight: baselinePageMetrics.contentHeight,
        firstScreenNodes: baselinePageMetrics.firstScreenNodes,
      },
      experiment: {
        documentHeight: experimentPageMetrics.documentHeight,
        contentHeight: experimentPageMetrics.contentHeight,
        firstScreenNodes: experimentPageMetrics.firstScreenNodes,
      },
      heightDeltaPct: pageHeightDelta,
      blocks: blockHeights.map((height, index) => ({
        blockId: outcome.experimentManifest.blocks[index]!.blockId,
        ...height,
      })),
    });
  }

  const report = evaluateBlockExperiment({
    project,
    baseline: options.baseline,
    maxCostCny: options.maxCostCny,
    pages: outcomes.map((outcome) => outcome.report),
  });

  await writeJson(path.join(runDir, "block-experiment.json"), report);
  await writeJson(path.join(runDir, "block-verify.json"), {
    schemaVersion: "1.0",
    project,
    pages: blockVerifyPages,
    summary: {
      passed: blockVerifyPages.every((page) => page.passed),
      blockers: blockVerifyPages.reduce(
        (sum, page) =>
          sum + page.findings.filter((finding) => finding.severity === "blocker").length,
        0
      ),
    },
  });
  await writeJson(path.join(runDir, "validation.json"), {
    schemaVersion: "1.0",
    project,
    pages: validationPages,
    notes: contextLoad.notes,
  });
  await writeJson(path.join(runDir, "conformance", "conformance.json"), {
    schemaVersion: "1.0",
    project,
    pages: conformancePages,
    note:
      "conformance is a tri-state: passed means the in-process gate ran with 0 blockers; " +
      "failed means it ran and found blockers (including a pre-existing red baseline); " +
      "not_evaluated means it did not run. newBlockers and fixedBlockers are regression " +
      "diagnostics only; they never rewrite failed as passed.",
  });
  await writeJson(path.join(runDir, "conformance", "style-manifest.baseline.json"), {
    schemaVersion: "1.0",
    project,
    pages: baselineStyles,
  });
  await writeJson(path.join(runDir, "conformance", "style-manifest.experiment.json"), {
    schemaVersion: "1.0",
    project,
    pages: experimentStyles,
  });
  await writeJson(path.join(runDir, "measurements.json"), {
    schemaVersion: "1.0",
    project,
    pages: measurements,
  });
  await writeJson(path.join(runDir, "render-metrics.baseline.json"), baselineMetrics);
  await writeJson(path.join(runDir, "render-metrics.experiment.json"), experimentMetrics);

  await writeFile(
    path.join(runDir, "block-experiment.md"),
    renderMarkdown({
      report,
      runDir,
      maxCostCny: options.maxCostCny,
      seamDiagnostics,
      measurements,
      conformancePages,
      blockVerifyPages,
      validationPages,
    }),
    "utf8"
  );

  return { report, runDir };
}

function conclusionLabel(conclusion: BlockExperimentReport["conclusion"]): string {
  if (conclusion === "promote") return "可推广 (`promote`)";
  if (conclusion === "rollback") return "回滚 (`rollback`)";
  return "证据不足 (`insufficient_evidence`)";
}

function recordedLabel(value: "passed" | "failed" | "not_evaluated"): string {
  if (value === "passed") return "通过";
  if (value === "failed") return "失败";
  return "未评估";
}

function renderMarkdown(input: {
  report: BlockExperimentReport;
  runDir: string;
  maxCostCny: number;
  seamDiagnostics: PageSeamDiagnostics[];
  measurements: PageMeasurement[];
  conformancePages: ConformanceGatePage[];
  blockVerifyPages: Array<{ pageId: string; findings: Finding[]; passed: boolean }>;
  validationPages: Array<{
    pageId: string;
    passed: boolean;
    blockers: number;
    major: number;
    minor: number;
  }>;
}): string {
  const { report } = input;
  const lines: string[] = [];
  const totalCost = report.pages.reduce((sum, page) => sum + page.costCny, 0);
  lines.push(`# 块级实验报告 — ${report.project}`, "");
  lines.push(`- 结论：${conclusionLabel(report.conclusion)}`);
  lines.push(`- 基线：\`${report.baseline}\``);
  lines.push(`- 运行目录：\`${input.runDir}\``);
  lines.push(
    `- 预算：¥${input.maxCostCny}；实际成本：¥${totalCost.toFixed(4)}（fixture 模式为 ¥0）`
  );
  lines.push(`- 原因：${report.reasons.length === 0 ? "无" : report.reasons.join("；")}`, "");
  lines.push("## 页面指标", "");
  lines.push(
    "| 页面 | 块数 | 新接缝 | token 漂移 | 块重试 | 页重试 | 页高 Δ | 页高门禁 | conformance | parity |"
  );
  lines.push("| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |");
  for (const page of report.pages) {
    const measurement = input.measurements.find((entry) => entry.pageId === page.pageId);
    const pageDelta = page.heightDeltaPct ?? measurement?.heightDeltaPct;
    const tokenDrift = page.metrics.reduce((sum, metric) => sum + metric.tokenDrift, 0);
    const retries = page.metrics.reduce((sum, metric) => sum + metric.retries, 0);
    const pageDeltaLabel = pageDelta === undefined ? "未测量" : `${pageDelta}%`;
    const heightGate =
      pageDelta === undefined
        ? "未测量"
        : Math.abs(pageDelta) > 5
          ? "未通过"
          : "通过";
    const conformance = recordedLabel(page.conformance);
    const parity = page.parityPassed === undefined ? "未评估" : page.parityPassed ? "通过" : "失败";
    lines.push(
      `| ${page.pageId} | ${page.metrics.length} | ${page.metrics.reduce((sum, metric) => sum + metric.seams, 0)} | ${tokenDrift} | ${retries} | ${page.pageRetries} | ${pageDeltaLabel} | ${heightGate} | ${conformance} | ${parity} |`
    );
  }
  lines.push(
    "",
    "> 页高门禁以页面级 `documentHeight` Δ 为准：|Δ| > 5% 是硬性 rollback 原因（`heightDelta>5%`），",
    "> 与块级 root id 是否保留无关；块级 Δ 只作为附加诊断。",
    "> `durationMs` 在 fixture 模式只覆盖块生成/组装/校验，不含浏览器测量与 conformance 捕获；",
    "> dsh 模式下还包含模型调用，但同样不含浏览器测量与 conformance 捕获。",
    ""
  );
  lines.push("## 接缝", "");
  lines.push("| 页面 | 基线 countSeams | 实验 countSeams | 新增 seam 类型 | 净 Δ |");
  lines.push("| --- | ---: | ---: | ---: | ---: |");
  for (const seam of input.seamDiagnostics) {
    lines.push(
      `| ${seam.pageId} | ${seam.baselineSeams} | ${seam.experimentSeams} | ${seam.newSeams} | ${seam.netDelta} |`
    );
  }
  lines.push(
    "",
    "> `countSeams` 在每条块边界分别计数：padding seam 与 duplicate-title seam 各算 1。",
    "> “新增 seam 类型”是逐边界正增量之和，`metrics.seams` 使用同一值；“净 Δ”是实验总数减基线总数。",
    "> 基线已有的接缝（例如 appointment-list 的 calendar/list 互斥视图面板）会显示在基线列，不会被隐藏。",
    ""
  );
  lines.push("## Conformance gate", "");
  lines.push(
    "| 页面 | 基线 blocker | 实验 blocker | 新增 blocker | id 可比 | 基线 gate | conformance |"
  );
  lines.push("| --- | ---: | ---: | ---: | --- | --- | --- |");
  for (const page of input.conformancePages) {
    const newBlockers = page.comparable ? `${page.newBlockers.length}` : "不可比";
    lines.push(
      `| ${page.pageId} | ${page.baseline.blockers} | ${page.experiment.blockers} | ${newBlockers} | ${page.comparable ? "可比" : "不可比"} | ${page.gateUsable ? "通过" : "未通过"} | ${recordedLabel(page.conformance)} |`
    );
  }
  const gateUnusable = input.conformancePages.filter((page) => !page.gateUsable).length;
  if (gateUnusable > 0) {
    lines.push(
      "",
      `> ${gateUnusable} 页的基线 conformance 本身未通过（已知 plan/HTML 建模差异，见 v0.7 SDD ledger 的 Task 6 记录）。`,
      "> 这些页面按 fail-closed 记录为 `failed`，结论回滚；新增 blocker 只是回归诊断，不能抵消基线红灯。"
    );
  }
  lines.push(
    "",
    "> `conformance` 是 tri-state：`passed` 仅当 gate 运行且 0 blocker；`failed` 表示 gate 运行且有 blocker；",
    "> `not_evaluated` 表示 gate 未运行。`新增 blocker` / `修复 blocker` 只在 `id 可比` 时具有证据意义：",
    "> 如果模型重命名 baseline 节点 id，gate 会按不同 key 比较，新增/修复数不可引用，也不能据此 promote。",
    ""
  );
  lines.push("", "## 页面校验与块校验", "");
  lines.push("| 页面 | Phase 1 blockers | Phase 1 major | 块校验 |", "| --- | ---: | ---: | --- |");
  for (const page of report.pages) {
    const validation = input.validationPages.find((entry) => entry.pageId === page.pageId);
    const verify = input.blockVerifyPages.find((entry) => entry.pageId === page.pageId);
    lines.push(
      `| ${page.pageId} | ${validation?.blockers ?? "未运行"} | ${validation?.major ?? "未运行"} | ${verify?.passed === true ? "通过" : "失败"} |`
    );
  }
  lines.push("", "## 页高实测", "");
  lines.push("| 页面 | 基线高度 | 实验高度 | Δ | 5% 门禁 |");
  lines.push("| --- | ---: | ---: | ---: | --- |");
  for (const measurement of input.measurements) {
    const delta = measurement.heightDeltaPct;
    const gate =
      delta === undefined ? "未测量" : Math.abs(delta) > 5 ? "未通过（回滚）" : "通过";
    lines.push(
      `| ${measurement.pageId} | ${measurement.baseline.documentHeight}px | ${measurement.experiment.documentHeight}px | ${
        delta === undefined ? "未测量" : `${delta}%`
      } | ${gate} |`
    );
  }
  lines.push(
    "",
    "> 上表 Δ 是机器门禁输入；`|Δ| > 5%` 会写入 `reasons` 并强制 `rollback`。",
    ""
  );
  lines.push("", "## 证据路径", "");
  lines.push(`- \`${path.join(input.runDir, "block-experiment.json")}\``);
  lines.push(`- \`${path.join(input.runDir, "block-experiment.md")}\``);
  lines.push(`- \`${path.join(input.runDir, "block-verify.json")}\``);
  lines.push(`- \`${path.join(input.runDir, "validation.json")}\``);
  lines.push(`- \`${path.join(input.runDir, "conformance", "conformance.json")}\``);
  lines.push(`- \`${path.join(input.runDir, "measurements.json")}\``);
  lines.push(`- \`${path.join(input.runDir, "artifacts", "block-manifest")}\``);
  lines.push(`- \`${path.join(input.runDir, "html")}\``);
  lines.push("");
  return lines.join("\n");
}

export async function main(
  argv: string[],
  io: { stdout: (line: string) => void; stderr: (line: string) => void } = {
    stdout: (line) => console.log(line),
    stderr: (line) => console.error(line),
  }
): Promise<number> {
  let options: BlockExperimentOptions;
  try {
    options = parseArgs(argv);
  } catch (error) {
    io.stderr(errorMessage(error));
    io.stderr(USAGE);
    return 2;
  }
  if (options.help) {
    io.stdout(USAGE);
    return 0;
  }
  if (options.runtime !== "dsh" && options.fixtures === undefined) {
    io.stderr("missing required --fixtures <dir> (or use --runtime dsh)");
    io.stderr(USAGE);
    return 2;
  }
  if (options.runtime === "dsh" && options.fixtures !== undefined) {
    io.stderr("--fixtures selects fixture mode; omit it with --runtime dsh");
    io.stderr(USAGE);
    return 2;
  }

  try {
    let generatorSource: BlockGeneratorPort | BlockGeneratorFactory;
    let budget: BlockCostBudget | undefined;
    if (options.runtime === "dsh") {
      const { DshBlockGenerator } = await import("./block/dsh-generator.js");
      const pricing = await loadPricing(options.pricingPath);
      const activeBudget = new BlockCostBudget(options.maxCostCny, pricing);
      const dshHome = process.env.DSH_HOME ?? path.join(pipelineRoot, "dsh", "home");
      const profile = options.profile ?? "prd-ui-agents";
      budget = activeBudget;
      generatorSource = (block, context) =>
        new DshBlockGenerator({
          runDir: context.runDir,
          dshHome,
          profile,
          baseline: block.root,
          allowedComponents: block.allowedComponents,
          requiredStates: block.requiredStates,
          role: block.role,
          canRepair: (usage) => activeBudget.canAfford(usage),
          remainingBudgetCny: () =>
            Math.max(0, activeBudget.maxCostCny - activeBudget.spentCny),
        });
    } else {
      generatorSource = new FixtureBlockGenerator(options.fixtures!);
    }

    const { report, runDir } = await runBlockExperiment(
      options,
      generatorSource,
      budget
    );
    if (options.json) {
      io.stdout(JSON.stringify(report));
    } else {
      for (const page of report.pages) {
        io.stdout(
          `Block experiment ${page.pageId}: ${page.metrics.length} blocks, ` +
            `${page.metrics.reduce((sum, metric) => sum + metric.seams, 0)} new seams, ` +
            `conformance ${page.conformance}`
        );
      }
      io.stdout(`Block experiment: ${report.conclusion} -> ${runDir}`);
      if (report.reasons.length > 0) io.stdout(`Reasons: ${report.reasons.join(", ")}`);
    }
    return report.conclusion === "rollback" ? 1 : 0;
  } catch (error) {
    io.stderr(errorMessage(error));
    return 2;
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
const isMain = invokedPath === fileURLToPath(import.meta.url);

if (isMain) {
  main(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error: unknown) => {
      console.error(error);
      process.exitCode = 2;
    });
}
