import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_STRUCTURE_CONFIG,
  PageSpecSchema,
  type Finding,
  type PageSpec,
  type RenderMetrics,
  type StructureConfig,
} from "@prd-ui/contracts";
import { loadProjectConfig } from "@prd-ui/orchestrator";
import { checkMeasuredStructure } from "@prd-ui/validators";

export const USAGE = `Usage:
  pnpm structure:check --spec-run <dir> --metrics <file> --project <yaml> --out <dir> [--json]

Options:
  --spec-run <dir>  Completed spec:engineer run directory
  --metrics <file>  render:measure output (render-metrics.json)
  --project <yaml>  Project config supplying structure overrides (required)
  --out <dir>       Output directory (structure-measured.json)
  --json            Print the measured-structure report as one JSON object
  -h, --help        Print this help and exit

Findings are warnings in v0.7. Exit codes: 0 no blockers, 1 blockers, 2 usage or infrastructure error.`;

export class StructureCheckUsageError extends Error {}

export interface StructureCheckOptions {
  specRun?: string;
  metrics?: string;
  out?: string;
  project?: string;
  json: boolean;
  help: boolean;
}

export interface StructureMeasuredReport {
  schemaVersion: "1.0";
  project: string;
  generatedAt: string;
  metrics: string;
  findings: Finding[];
  summary: { warnings: number; blockers: number };
}

function readValue(argv: string[], index: number, flag: string): string {
  const value = argv[index];
  if (value === undefined || value.startsWith("--")) {
    throw new StructureCheckUsageError(`missing value for ${flag}`);
  }
  return value;
}

export function parseArgs(argv: string[]): StructureCheckOptions {
  const options: StructureCheckOptions = { json: false, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]!;
    switch (flag) {
      case "--spec-run":
        options.specRun = path.resolve(readValue(argv, ++index, flag));
        break;
      case "--metrics":
        options.metrics = path.resolve(readValue(argv, ++index, flag));
        break;
      case "--out":
        options.out = path.resolve(readValue(argv, ++index, flag));
        break;
      case "--project":
        options.project = path.resolve(readValue(argv, ++index, flag));
        break;
      case "--json":
        options.json = true;
        break;
      case "--help":
      case "-h":
        options.help = true;
        break;
      default:
        throw new StructureCheckUsageError(`unknown argument: ${flag}`);
    }
  }
  if (!options.project && !options.help) {
    throw new StructureCheckUsageError("missing required --project <yaml>");
  }
  return options;
}

export async function loadSpecs(specRun: string): Promise<PageSpec[]> {
  const dir = path.join(specRun, "artifacts", "page-spec");
  const files = (await readdir(dir)).filter((file) => file.endsWith(".json")).sort();
  if (files.length === 0) throw new Error(`SPEC_RUN_EMPTY: ${dir}`);
  const specs: PageSpec[] = [];
  for (const file of files) {
    const raw = JSON.parse(await readFile(path.join(dir, file), "utf8")) as unknown;
    const parsed = PageSpecSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(`PAGE_SPEC_INVALID: ${file}: ${parsed.error.message}`);
    }
    specs.push(parsed.data);
  }
  return specs;
}

export async function loadMetrics(file: string): Promise<RenderMetrics> {
  const raw = JSON.parse(await readFile(file, "utf8")) as unknown;
  if (typeof raw !== "object" || raw === null) {
    throw new Error(`RENDER_METRICS_INVALID: ${file}`);
  }
  const candidate = raw as Partial<RenderMetrics>;
  if (candidate.schemaVersion !== "1.0") {
    throw new Error(`RENDER_METRICS_INVALID: ${file}: unsupported schemaVersion`);
  }
  if (typeof candidate.project !== "string" || !Array.isArray(candidate.pages)) {
    throw new Error(`RENDER_METRICS_INVALID: ${file}: missing project/pages`);
  }
  for (const page of candidate.pages) {
    if (
      typeof page?.pageId !== "string" ||
      (page.target !== "mobile" && page.target !== "web") ||
      typeof page.documentHeight !== "number" ||
      typeof page.contentHeight !== "number" ||
      typeof page.widest?.width !== "number" ||
      typeof page.widest?.overflowX !== "boolean" ||
      typeof page.fixedFooter?.present !== "boolean" ||
      typeof page.fixedFooter?.overlapsContent !== "boolean" ||
      typeof page.contentBottomGap !== "number"
    ) {
      throw new Error(`RENDER_METRICS_INVALID: ${file}: malformed page entry`);
    }
  }
  return raw as RenderMetrics;
}

/**
 * Metrics must describe exactly the pages of this spec run, with the same
 * target. A partial or stale file would silently under-report structure
 * problems, so it is an infrastructure error rather than a pass.
 */
export function assertMetricsMatchSpecs(metrics: RenderMetrics, specs: PageSpec[]): void {
  const project = specs[0]?.meta.project;
  if (project !== undefined && metrics.project !== project) {
    throw new Error(
      `RENDER_METRICS_PROJECT_MISMATCH: ${metrics.project} measured, ${project} expected`
    );
  }
  const targets = new Map(specs.map((spec) => [spec.meta.pageId, spec.meta.target]));
  for (const page of metrics.pages) {
    const target = targets.get(page.pageId);
    if (target === undefined) {
      throw new Error(`RENDER_METRICS_PAGE_MISMATCH: ${page.pageId} is not in the spec run`);
    }
    if (page.target !== target) {
      throw new Error(
        `RENDER_METRICS_TARGET_MISMATCH: ${page.pageId} measured as ${page.target}, ` +
          `spec is ${target}`
      );
    }
    targets.delete(page.pageId);
  }
  const missing = [...targets.keys()].sort();
  if (missing.length > 0) {
    throw new Error(`RENDER_METRICS_INCOMPLETE: ${missing.join(", ")}`);
  }
}

export function resolveStructureConfig(projectPath: string): StructureConfig {
  const overrides = loadProjectConfig(projectPath).config.structure;
  return {
    maxRepeatedSections:
      overrides?.maxRepeatedSections ?? DEFAULT_STRUCTURE_CONFIG.maxRepeatedSections,
    pageHeightBudget: {
      mobile:
        overrides?.pageHeightBudget?.mobile ?? DEFAULT_STRUCTURE_CONFIG.pageHeightBudget.mobile,
      web: overrides?.pageHeightBudget?.web ?? DEFAULT_STRUCTURE_CONFIG.pageHeightBudget.web,
    },
  };
}

function pretty(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export async function main(
  argv: string[],
  io: { stdout: (line: string) => void; stderr: (line: string) => void } = {
    stdout: (line) => console.log(line),
    stderr: (line) => console.error(line),
  }
): Promise<number> {
  let options: StructureCheckOptions;
  try {
    options = parseArgs(argv);
  } catch (error) {
    io.stderr(error instanceof Error ? error.message : String(error));
    io.stderr(USAGE);
    return 2;
  }
  if (options.help) {
    io.stdout(USAGE);
    return 0;
  }
  if (!options.specRun || !options.metrics || !options.out || !options.project) {
    io.stderr("missing required --spec-run/--metrics/--project/--out");
    io.stderr(USAGE);
    return 2;
  }

  try {
    const specs = await loadSpecs(options.specRun);
    const metrics = await loadMetrics(options.metrics);
    assertMetricsMatchSpecs(metrics, specs);
    const config = resolveStructureConfig(options.project);
    const findings = checkMeasuredStructure(metrics, config);
    const report: StructureMeasuredReport = {
      schemaVersion: "1.0",
      project: specs[0]?.meta.project ?? metrics.project,
      generatedAt: new Date().toISOString(),
      metrics: path.basename(options.metrics),
      findings,
      summary: {
        warnings: findings.filter((finding) => finding.severity === "warning").length,
        blockers: findings.filter((finding) => finding.severity === "blocker").length,
      },
    };

    await mkdir(options.out, { recursive: true });
    const file = path.join(options.out, "structure-measured.json");
    await writeFile(file, pretty(report), "utf8");

    if (options.json) {
      io.stdout(JSON.stringify(report));
    } else {
      for (const finding of findings) {
        io.stdout(
          `- [${finding.severity}] ${finding.ruleId} ${finding.location}: ` +
            `${finding.issue} (${finding.evidence})`
        );
      }
      io.stdout(
        `Structure measured: ${metrics.pages.length} pages, ` +
          `${report.summary.warnings} warning / ${report.summary.blockers} blocker -> ${file}`
      );
    }
    return report.summary.blockers > 0 ? 1 : 0;
  } catch (error) {
    io.stderr(error instanceof Error ? error.message : String(error));
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
