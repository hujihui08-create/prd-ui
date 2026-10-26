import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  AssetManifestSchema,
  UiBriefSchema,
  type AssetManifest,
  type BlockExperimentPage,
  type BlockExperimentReport,
  type BlockManifest,
  type BlockSpec,
  type ConformancePage,
  type Finding,
  type PageSpec,
  type RenderMetrics,
  type RenderMetricsPage,
  type StyleManifest,
  type UiBrief,
} from "@prd-ui/contracts";
import {
  assembleBlocks,
  countRawStyleValues,
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
  type BlockGeneratorPort,
} from "./block/generator.js";
import {
  blockRootHash,
  newSeamsByBlock,
  percentDelta,
  seamBoundaries,
} from "./block/metrics.js";
import { captureStyleManifests } from "./conformance/capture.js";
import { measurePages } from "./measure/measure.js";
import { loadSpecs } from "./structure-check-cli.js";

export const USAGE = `Usage:
  pnpm block:experiment --project <yaml> --baseline <spec-run> --pages <id,id> --fixtures <dir> --runs <dir> [--max-cost-cny <n>] [--json]

Options:
  --project <yaml>      Project config (assets + brief)
  --baseline <spec-run> Completed spec run containing artifacts/page-spec
  --pages <id,id>       Pages to experiment on (default: every baseline page)
  --fixtures <dir>      Deterministic block fixtures (<dir>/<pageId>/<blockId>.json)
  --runtime dsh         Reserved for Task 17; not implemented in this task
  --profile <name>      dsh profile (reserved for Task 17)
  --max-cost-cny <n>    Budget in CNY (default: 3; fixture mode always costs 0)
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

function conformanceRecorded(value: boolean | undefined): "passed" | "failed" | "not_evaluated" {
  if (value === true) return "passed";
  if (value === false) return "failed";
  return "not_evaluated";
}

interface PageSeamDiagnostics {
  pageId: string;
  baselineSeams: number;
  experimentSeams: number;
  newSeams: number;
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
  recorded: "passed" | "failed" | "not_evaluated";
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
 * Run the fixture (or, later, dsh) block experiment. Everything that can be
 * measured is measured; checks that cannot be evaluated are left out of the
 * report rather than assumed green.
 */
export async function runBlockExperiment(
  options: BlockExperimentOptions,
  generator: BlockGeneratorPort
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

  for (const spec of baselineSpecs) {
    const started = Date.now();
    const pageId = spec.meta.pageId;
    const profile = getProfile(spec.meta.profile);
    const archetype = getArchetype(spec.meta.archetype);
    const manifest = splitBlocks(spec, archetype);
    const experimentManifest: BlockManifest = structuredClone(manifest);

    for (let index = 0; index < manifest.blocks.length; index += 1) {
      const block = manifest.blocks[index]!;
      const draft = await generator.generate({
        pageId,
        blockId: block.blockId,
        prompt: `Regenerate block ${block.blockId} (${block.role}).`,
      });
      if (draft.blockId !== block.blockId) {
        throw new Error(
          `BLOCK_DRAFT_ID_MISMATCH: ${pageId} expected ${block.blockId}, got ${draft.blockId}`
        );
      }
      experimentManifest.blocks[index] = {
        ...block,
        root: structuredClone(draft.root),
        hash: blockRootHash(draft.root),
      };
    }

    const experimentSpec = assembleBlocks(spec, experimentManifest);
    // Verify the manifest against the page it assembles to. Verifying it
    // against the baseline page would fail every regenerated block through
    // BLOCK_ROUNDTRIP_MISMATCH; the round-trip contract is about manifest
    // structure, not content equality with the baseline.
    const verifyFindings = verifyBlockManifest(experimentSpec, experimentManifest);
    const context = contextLoad.contexts.get(pageId);
    const validation = context === undefined ? undefined : validatePageSpec(experimentSpec, context);

    const baselineSeams = seamBoundaries(manifest.blocks, profile).filter(Boolean).length;
    const experimentSeams = seamBoundaries(experimentManifest.blocks, profile).filter(Boolean).length;
    const newSeams = newSeamsByBlock(manifest.blocks, experimentManifest.blocks, profile);

    const metrics = manifest.blocks.map((block, index) => ({
      blockId: block.blockId,
      retries: 0,
      seams: newSeams[index] ?? 0,
      tokenDrift: countRawStyleValues(experimentManifest.blocks[index]!.root),
    }));

    const reportPage: BlockExperimentPage = {
      pageId,
      metrics,
      pageRetries: 0,
      costCny: 0,
      durationMs: Date.now() - started,
    };

    outcomes.push({
      report: reportPage,
      experimentSpec,
      experimentManifest,
      verifyFindings,
      ...(validation === undefined ? {} : { validation }),
      seams: { pageId, baselineSeams, experimentSeams, newSeams: newSeams.reduce((sum, n) => sum + n, 0) },
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
    let conformancePassed: boolean | undefined;
    if (hasBlockFailures) conformancePassed = false;
    else if (baselineGate.passed || experimentGate.passed) conformancePassed = experimentGate.passed;
    else if (newBlockers.length > 0) conformancePassed = false;
    else conformancePassed = undefined;
    outcome.report.conformancePassed = conformancePassed;

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
      recorded: conformanceRecorded(conformancePassed),
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
      heightDeltaPct: percentDelta(
        baselinePageMetrics.documentHeight,
        experimentPageMetrics.documentHeight
      ),
      blocks: blockHeights.map((height, index) => ({
        blockId: outcome.experimentManifest.blocks[index]!.blockId,
        ...height,
      })),
    });
  }

  const report = evaluateBlockExperiment({
    project,
    baseline: options.baseline,
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
      "conformancePassed is only true when the page is green or the experiment introduces no new blockers " +
      "relative to the baseline. When the baseline gate itself is red, an unchanged experiment is recorded " +
      "as not_evaluated instead of green.",
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
  lines.push(`# 块级实验报告 — ${report.project}`, "");
  lines.push(`- 结论：${conclusionLabel(report.conclusion)}`);
  lines.push(`- 基线：\`${report.baseline}\``);
  lines.push(`- 运行目录：\`${input.runDir}\``);
  lines.push(`- 预算：¥${input.maxCostCny}（fixture 模式实际成本 ¥0）`);
  lines.push(`- 原因：${report.reasons.length === 0 ? "无" : report.reasons.join("；")}`, "");
  lines.push("## 页面指标", "");
  lines.push("| 页面 | 块数 | 新接缝 | token 漂移 | 重试 | 页高 Δ | conformance | parity |");
  lines.push("| --- | ---: | ---: | ---: | ---: | ---: | --- | --- |");
  for (const page of report.pages) {
    const measurement = input.measurements.find((entry) => entry.pageId === page.pageId);
    const tokenDrift = page.metrics.reduce((sum, metric) => sum + metric.tokenDrift, 0);
    const retries = page.metrics.reduce((sum, metric) => sum + metric.retries, 0);
    const pageDelta =
      measurement?.heightDeltaPct === undefined ? "未测量" : `${measurement.heightDeltaPct}%`;
    const conformance =
      page.conformancePassed === undefined ? "未评估" : page.conformancePassed ? "通过" : "失败";
    const parity = page.parityPassed === undefined ? "未评估" : page.parityPassed ? "通过" : "失败";
    lines.push(
      `| ${page.pageId} | ${page.metrics.length} | ${page.metrics.reduce((sum, metric) => sum + metric.seams, 0)} | ${tokenDrift} | ${retries} | ${pageDelta} | ${conformance} | ${parity} |`
    );
  }
  lines.push("", "## 接缝", "");
  lines.push("| 页面 | 基线接缝 | 实验接缝 | 新增接缝 |");
  lines.push("| --- | ---: | ---: | ---: |");
  for (const seam of input.seamDiagnostics) {
    lines.push(`| ${seam.pageId} | ${seam.baselineSeams} | ${seam.experimentSeams} | ${seam.newSeams} |`);
  }
  lines.push(
    "",
    "> `seams` 指标只统计实验相对基线新增的接缝；基线已有的接缝单独列在上表，不会被当成实验回归，也不会被隐藏。",
    ""
  );
  lines.push("## Conformance gate", "");
  lines.push("| 页面 | 基线 blocker | 实验 blocker | 新增 blocker | 基线 gate | 记录 |");
  lines.push("| --- | ---: | ---: | ---: | --- | --- |");
  for (const page of input.conformancePages) {
    lines.push(
      `| ${page.pageId} | ${page.baseline.blockers} | ${page.experiment.blockers} | ${page.newBlockers.length} | ${page.gateUsable ? "通过" : "未通过"} | ${recordedLabel(page.recorded)} |`
    );
  }
  const gateUnusable = input.conformancePages.filter((page) => !page.gateUsable).length;
  if (gateUnusable > 0) {
    lines.push(
      "",
      `> ${gateUnusable} 页的基线 conformance 本身未通过（已知 plan/HTML 建模差异，见 v0.7 SDD ledger 的 Task 6 记录）。`,
      "> 这些页面只有在没有新增 blocker 时才以 `not_evaluated` 记录；绝对 gate 仍为红色，不能据此推广。"
    );
  }
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
  lines.push("| 页面 | 基线高度 | 实验高度 | Δ |");
  lines.push("| --- | ---: | ---: | ---: |");
  for (const measurement of input.measurements) {
    lines.push(
      `| ${measurement.pageId} | ${measurement.baseline.documentHeight}px | ${measurement.experiment.documentHeight}px | ${
        measurement.heightDeltaPct === undefined ? "未测量" : `${measurement.heightDeltaPct}%`
      } |`
    );
  }
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
  if (options.runtime === "dsh") {
    io.stderr("BLOCK_RUNTIME_NOT_IMPLEMENTED: Task 17 adds the dsh block generator");
    return 2;
  }
  if (options.fixtures === undefined) {
    io.stderr("missing required --fixtures <dir> (or --runtime dsh after Task 17)");
    io.stderr(USAGE);
    return 2;
  }

  try {
    const { report, runDir } = await runBlockExperiment(
      options,
      new FixtureBlockGenerator(options.fixtures)
    );
    if (options.json) {
      io.stdout(JSON.stringify(report));
    } else {
      for (const page of report.pages) {
        io.stdout(
          `Block experiment ${page.pageId}: ${page.metrics.length} blocks, ` +
            `${page.metrics.reduce((sum, metric) => sum + metric.seams, 0)} new seams, ` +
            `conformance ${page.conformancePassed === undefined ? "not evaluated" : page.conformancePassed ? "passed" : "failed"}`
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
