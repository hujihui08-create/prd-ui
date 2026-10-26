import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  FigmaPlanSchema,
  PageSpecSchema,
  isMaterialDerivedId,
  type ConformanceFinding,
  type ConformancePage,
  type ConformanceReport,
  type FigmaPlan,
  type FigmaPlanNode,
  type PageSpec,
  type StyleManifest,
} from "@prd-ui/contracts";
import { comparePlanToStyleManifest } from "@prd-ui/figma";
import { getProfile } from "@prd-ui/design-system";
import { captureStyleManifests } from "./conformance/capture.js";

export const USAGE = `Usage:
  pnpm figma:conformance --spec-run <dir> --html <dir> --plans <dir> --out <dir> [--json]

Options:
  --spec-run <dir>  Completed spec:engineer run directory
  --html <dir>      Rendered HTML directory (one <pageId>.html per spec)
  --plans <dir>     figma:plan output directory (figma-plan.<pageId>.json)
  --out <dir>       Output directory (style-manifest.json + conformance.json)
  --json            Print the conformance report as one JSON object
  -h, --help        Print this help and exit

Exit codes: 0 no blockers, 1 blockers, 2 usage or infrastructure error.`;

export class ConformanceUsageError extends Error {}

export interface ConformanceOptions {
  specRun?: string;
  html?: string;
  plans?: string;
  out?: string;
  json: boolean;
  help: boolean;
}

function readValue(argv: string[], index: number, flag: string): string {
  const value = argv[index];
  if (value === undefined || value.startsWith("--")) {
    throw new ConformanceUsageError(`missing value for ${flag}`);
  }
  return value;
}

export function parseArgs(argv: string[]): ConformanceOptions {
  const options: ConformanceOptions = { json: false, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]!;
    switch (flag) {
      case "--spec-run":
        options.specRun = path.resolve(readValue(argv, ++index, flag));
        break;
      case "--html":
        options.html = path.resolve(readValue(argv, ++index, flag));
        break;
      case "--plans":
        options.plans = path.resolve(readValue(argv, ++index, flag));
        break;
      case "--out":
        options.out = path.resolve(readValue(argv, ++index, flag));
        break;
      case "--json":
        options.json = true;
        break;
      case "--help":
      case "-h":
        options.help = true;
        break;
      default:
        throw new ConformanceUsageError(`unknown argument: ${flag}`);
    }
  }
  return options;
}

async function loadSpecs(specRun: string): Promise<PageSpec[]> {
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

async function loadPlans(plansDir: string, specs: PageSpec[]): Promise<FigmaPlan[]> {
  const plans: FigmaPlan[] = [];
  for (const spec of specs) {
    const file = path.join(plansDir, `figma-plan.${spec.meta.pageId}.json`);
    const raw = JSON.parse(await readFile(file, "utf8")) as unknown;
    const parsed = FigmaPlanSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(`FIGMA_PLAN_INVALID: ${file}: ${parsed.error.message}`);
    }
    if (parsed.data.pageId !== spec.meta.pageId) {
      throw new Error(
        `FIGMA_PLAN_PAGE_MISMATCH: ${file} declares ${parsed.data.pageId}, spec is ${spec.meta.pageId}`
      );
    }
    plans.push(parsed.data);
  }
  return plans;
}

/** Whether the comparator would require at least one HTML node for this plan. */
function planHasVisibleNode(plan: FigmaPlan): boolean {
  const skipped = new Set(
    (plan.coverage?.nodes ?? [])
      .filter((node) => node.status === "skipped")
      .map((node) => node.specId)
  );
  const visible = (node: FigmaPlanNode): boolean =>
    (node.origin !== "derived" || isMaterialDerivedId(node.specId)) &&
    !skipped.has(node.specId);
  const walk = (node: FigmaPlanNode): boolean => {
    if (node.type === "ABSOLUTE") {
      if (visible(node)) return true;
      return (node.child?.children ?? []).some(walk);
    }
    if (visible(node)) return true;
    if (node.child !== undefined && walk(node.child)) return true;
    return (node.children ?? []).some(walk);
  };
  return walk(plan.root);
}

/**
 * A blank or wrong HTML file can return 200 with no `[data-node-id]` nodes.
 * Without this guard the comparator reports every plan node as missing and the
 * CLI exits 1, which is indistinguishable from a real design failure.
 */
export function assertManifestUsable(manifest: StyleManifest, plan: FigmaPlan): void {
  if (manifest.nodes.length > 0) return;
  if (!planHasVisibleNode(plan)) return;
  throw new Error(`CONFORMANCE_MANIFEST_EMPTY: ${plan.pageId}`);
}

function countFindings(pages: ConformancePage[]): { blockers: number; majors: number } {
  let blockers = 0;
  let majors = 0;
  for (const page of pages) {
    for (const finding of page.findings) {
      if (finding.severity === "blocker") blockers += 1;
      else if (finding.severity === "major") majors += 1;
    }
  }
  return { blockers, majors };
}

function topCounts(findings: ConformanceFinding[], pick: (finding: ConformanceFinding) => string): string {
  const counts = new Map<string, number>();
  for (const finding of findings) {
    const key = pick(finding);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 6)
    .map(([key, count]) => `${key}=${count}`)
    .join(", ");
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
  let options: ConformanceOptions;
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
  if (!options.specRun || !options.html || !options.plans || !options.out) {
    io.stderr("missing required --spec-run/--html/--plans/--out");
    io.stderr(USAGE);
    return 2;
  }

  try {
    const specs = await loadSpecs(options.specRun);
    const plans = await loadPlans(options.plans, specs);
    const manifests = await captureStyleManifests({
      htmlDir: options.html,
      pages: specs.map((spec) => ({
        pageId: spec.meta.pageId,
        viewport:
          spec.meta.target === "web"
            ? { width: 1440, height: 900 }
            : { width: 390, height: 844 },
      })),
    });
    const manifestByPage = new Map(manifests.map((manifest) => [manifest.pageId, manifest]));
    const specByPage = new Map(specs.map((spec) => [spec.meta.pageId, spec]));
    const pages = plans.map((plan) => {
      const manifest = manifestByPage.get(plan.pageId);
      if (manifest === undefined) {
        throw new Error(`CONFORMANCE_MANIFEST_MISSING: ${plan.pageId}`);
      }
      assertManifestUsable(manifest, plan);
      return comparePlanToStyleManifest({
        plan,
        manifest,
        profile: getProfile(specByPage.get(plan.pageId)!.meta.profile),
      });
    });
    const { blockers, majors } = countFindings(pages);
    const report: ConformanceReport = {
      schemaVersion: "1.0",
      project: specs[0]?.meta.project ?? "unknown",
      generatedAt: new Date().toISOString(),
      pages,
      summary: { blockers, majors, pages: pages.length },
    };

    await mkdir(options.out, { recursive: true });
    await writeFile(
      path.join(options.out, "style-manifest.json"),
      pretty({ schemaVersion: "1.0", project: report.project, pages: manifests }),
      "utf8"
    );
    await writeFile(path.join(options.out, "conformance.json"), pretty(report), "utf8");

    if (options.json) {
      io.stdout(JSON.stringify(report));
    } else {
      for (const page of pages) {
        const pageBlockers = page.findings.filter(
          (finding) => finding.severity === "blocker"
        ).length;
        const pageMajors = page.findings.filter((finding) => finding.severity === "major").length;
        io.stdout(
          `Conformance ${page.pageId}: ${page.passed ? "passed" : "failed"} ` +
            `(${pageBlockers} blocker / ${pageMajors} major / ${page.findings.length} findings, ` +
            `${page.checked} checked, ${page.skipped} skipped)`
        );
        for (const finding of page.findings.slice(0, 8)) {
          io.stdout(
            `- [${finding.severity}] ${finding.code} ${finding.property ?? ""} ` +
              `${finding.specId ?? ""}: ${finding.message}`
          );
        }
        if (page.findings.length > 8) {
          io.stdout(`- ... ${page.findings.length - 8} more`);
        }
      }
      const allFindings = pages.flatMap((page) => page.findings);
      io.stdout(
        `Conformance: ${pages.length} pages, ${blockers} blocker / ${majors} major`
      );
      io.stdout(
        `Top codes: ${topCounts(allFindings, (finding) => finding.code) || "none"}`
      );
      io.stdout(
        `Top properties: ${topCounts(allFindings, (finding) => finding.property ?? "none") || "none"}`
      );
    }
    return blockers === 0 ? 0 : 1;
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
