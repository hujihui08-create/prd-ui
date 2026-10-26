import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";
import { evaluateParityPage } from "@prd-ui/figma";
import type { ParityPage, ParityReport, ParityThresholds } from "@prd-ui/contracts";
import { computeSsim } from "./visual/ssim.js";

export const USAGE = `Usage:
  pnpm figma:parity --figma <dir> --baseline <dir> --spec-run <dir> --out <dir> [--json]

Options:
  --figma <dir>           Directory containing figma.<pageId>.png (plugin save dir: <figmaDir>/parity)
  --baseline <dir>        Signed visual baseline directory (manifest.json + PNGs)
  --spec-run <dir>        Completed spec:engineer run directory
  --out <dir>             Output directory (parity.json, parity.config.json, diff/)
  --max-pixel-diff <n>    Maximum pixel-diff ratio (default 0.005)
  --min-ssim <n>          Minimum mean SSIM (default 0.98)
  --json                  Print the parity report as one JSON object
  -h, --help              Print this help and exit

The baseline case for each page is the manifest entry with state "default".

Exit codes: 0 parity passed, 1 parity failed, 2 usage or infrastructure error.`;

export class ParityUsageError extends Error {}

export interface ParityOptions {
  figma?: string;
  baseline?: string;
  specRun?: string;
  out?: string;
  maxPixelDiff: number;
  minSsim: number;
  json: boolean;
  help: boolean;
}

function readValue(argv: string[], index: number, flag: string): string {
  const value = argv[index];
  if (value === undefined || value.startsWith("--")) {
    throw new ParityUsageError(`missing value for ${flag}`);
  }
  return value;
}

function threshold(argv: string[], index: number, flag: string): number {
  const raw = readValue(argv, index, flag);
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new ParityUsageError(`${flag} must be a number in [0, 1], got ${raw}`);
  }
  return value;
}

export function parseArgs(argv: string[]): ParityOptions {
  const options: ParityOptions = { maxPixelDiff: 0.005, minSsim: 0.98, json: false, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]!;
    switch (flag) {
      case "--figma":
        options.figma = path.resolve(readValue(argv, ++index, flag));
        break;
      case "--baseline":
        options.baseline = path.resolve(readValue(argv, ++index, flag));
        break;
      case "--spec-run":
        options.specRun = path.resolve(readValue(argv, ++index, flag));
        break;
      case "--out":
        options.out = path.resolve(readValue(argv, ++index, flag));
        break;
      case "--max-pixel-diff":
        options.maxPixelDiff = threshold(argv, ++index, flag);
        break;
      case "--min-ssim":
        options.minSsim = threshold(argv, ++index, flag);
        break;
      case "--json":
        options.json = true;
        break;
      case "--help":
      case "-h":
        options.help = true;
        break;
      default:
        throw new ParityUsageError(`unknown argument: ${flag}`);
    }
  }
  return options;
}

function hash(buffer: Buffer): string {
  return `sha256:${createHash("sha256").update(buffer).digest("hex")}`;
}

interface BaselineCase {
  pageId: string;
  state: string;
  file: string;
  viewport?: { width: number; height: number };
}

interface BaselineManifest {
  cases: BaselineCase[];
}

async function loadPageIds(specRun: string): Promise<string[]> {
  const dir = path.join(specRun, "artifacts", "page-spec");
  const files = (await readdir(dir)).filter((file) => file.endsWith(".json"));
  if (files.length === 0) throw new Error(`SPEC_RUN_EMPTY: ${dir}`);
  return files.map((file) => path.basename(file, ".json")).sort();
}

async function loadProject(specRun: string): Promise<string> {
  const dir = path.join(specRun, "artifacts", "page-spec");
  const files = (await readdir(dir)).filter((file) => file.endsWith(".json")).sort();
  const first = files[0];
  if (!first) return "unknown";
  const raw = JSON.parse(await readFile(path.join(dir, first), "utf8")) as {
    meta?: { project?: string };
  };
  return raw.meta?.project ?? "unknown";
}

async function loadBaselineManifest(baselineDir: string): Promise<BaselineManifest> {
  const file = path.join(baselineDir, "manifest.json");
  const raw = JSON.parse(await readFile(file, "utf8")) as Partial<BaselineManifest>;
  if (!Array.isArray(raw.cases)) {
    throw new Error(`BASELINE_MANIFEST_INVALID: ${file}`);
  }
  return { cases: raw.cases };
}

export async function main(
  argv: string[],
  io: { stdout: (line: string) => void; stderr: (line: string) => void } = {
    stdout: (line) => console.log(line),
    stderr: (line) => console.error(line),
  }
): Promise<number> {
  let options: ParityOptions;
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
  if (!options.figma || !options.baseline || !options.specRun || !options.out) {
    io.stderr("missing required --figma/--baseline/--spec-run/--out");
    io.stderr(USAGE);
    return 2;
  }

  try {
    const pageIds = await loadPageIds(options.specRun);
    const project = await loadProject(options.specRun);
    const thresholds: ParityThresholds = {
      maxPixelDiff: options.maxPixelDiff,
      minSsim: options.minSsim,
    };
    const baselineManifest = await loadBaselineManifest(options.baseline);
    const pages: ParityPage[] = [];
    await mkdir(path.join(options.out, "diff"), { recursive: true });

    for (const pageId of pageIds) {
      const figmaFile = path.join(options.figma, `figma.${pageId}.png`);
      const baselineCase = baselineManifest.cases.find(
        (entry) => entry.pageId === pageId && entry.state === "default"
      );
      if (baselineCase === undefined) throw new Error(`BASELINE_CASE_MISSING: ${pageId}`);
      const baselineFile = path.join(options.baseline, baselineCase.file);
      const figmaBuffer = await readFile(figmaFile);
      const baselineBuffer = await readFile(baselineFile);
      const figma = PNG.sync.read(figmaBuffer);
      const baseline = PNG.sync.read(baselineBuffer);
      const sameSize = figma.width === baseline.width && figma.height === baseline.height;
      let pixelDiffRatio = 1;
      let ssim = 0;
      let diffFile: string | undefined;
      if (sameSize) {
        const diff = new PNG({ width: figma.width, height: figma.height });
        const diffPixels = pixelmatch(
          baseline.data,
          figma.data,
          diff.data,
          figma.width,
          figma.height,
          { threshold: 0.1, includeAA: false }
        );
        pixelDiffRatio = diffPixels / (figma.width * figma.height);
        ssim = computeSsim(baseline.data, figma.data, figma.width, figma.height);
        diffFile = path.join(options.out, "diff", `${pageId}.png`);
        await writeFile(diffFile, PNG.sync.write(diff));
      }
      pages.push(
        evaluateParityPage({
          pageId,
          pixelDiffRatio,
          ssim,
          width: figma.width,
          height: figma.height,
          expectedWidth: baselineCase.viewport?.width ?? baseline.width,
          expectedHeight: baselineCase.viewport?.height ?? baseline.height,
          baselineFile,
          figmaFile,
          baselineHash: hash(baselineBuffer),
          figmaHash: hash(figmaBuffer),
          thresholds,
          ...(diffFile === undefined ? {} : { diffFile }),
        })
      );
    }

    const report: ParityReport = {
      schemaVersion: "1.0",
      project,
      generatedAt: new Date().toISOString(),
      thresholds,
      pages,
      summary: {
        passed: pages.every((page) => page.passed),
        failed: pages.filter((page) => !page.passed).length,
        pages: pages.length,
      },
    };
    await writeFile(
      path.join(options.out, "parity.json"),
      `${JSON.stringify(report, null, 2)}\n`,
      "utf8"
    );
    await writeFile(
      path.join(options.out, "parity.config.json"),
      `${JSON.stringify({ schemaVersion: "1.0", thresholds }, null, 2)}\n`,
      "utf8"
    );
    if (options.json) {
      io.stdout(JSON.stringify(report));
    } else {
      for (const page of pages) {
        io.stdout(
          `Parity ${page.pageId}: ${page.passed ? "passed" : "failed"} ` +
            `(pixel ${(page.pixelDiffRatio * 100).toFixed(3)}%, ssim ${page.ssim.toFixed(4)})`
        );
        for (const finding of page.findings) {
          io.stdout(`- [${finding.severity}] ${finding.code}: ${finding.message}`);
        }
      }
      io.stdout(
        `Parity: ${pages.length} pages, ${report.summary.failed} failed, ` +
          `thresholds pixel<=${(thresholds.maxPixelDiff * 100).toFixed(2)}% ssim>=${thresholds.minSsim}`
      );
    }
    return report.summary.passed ? 0 : 1;
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
