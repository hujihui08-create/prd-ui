import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { BlockManifest, Finding, PageSpec } from "@prd-ui/contracts";
import { verifyBlockManifest } from "@prd-ui/compiler";
import { loadSpecs } from "./structure-check-cli.js";

export const USAGE = `Usage:
  pnpm block:verify --spec-run <dir> [--out <file>] [--json]

Options:
  --spec-run <dir>  Completed spec:engineer run directory
  --out <file>      Output .json file (default: <spec-run>/findings/block-verify.json)
  --json            Print the block verification report as one JSON object
  -h, --help        Print this help and exit

Every page in the run needs artifacts/block-manifest/<pageId>.json. A missing or
malformed manifest is a blocker (fail closed). Exit codes: 0 pass, 1 findings,
2 usage or infrastructure error.`;

export class BlockVerifyUsageError extends Error {}

export interface BlockVerifyOptions {
  specRun?: string;
  out?: string;
  json: boolean;
  help: boolean;
}

export interface BlockVerifyPage {
  pageId: string;
  passed: boolean;
  findings: Finding[];
}

export interface BlockVerifyReport {
  schemaVersion: "1.0";
  project: string;
  generatedAt: string;
  pages: BlockVerifyPage[];
  summary: { passed: boolean; blockers: number };
}

function readValue(argv: string[], index: number, flag: string): string {
  const value = argv[index];
  if (value === undefined || value.startsWith("--")) {
    throw new BlockVerifyUsageError(`missing value for ${flag}`);
  }
  return value;
}

export function parseArgs(argv: string[]): BlockVerifyOptions {
  const options: BlockVerifyOptions = { json: false, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]!;
    switch (flag) {
      case "--spec-run":
        options.specRun = path.resolve(readValue(argv, ++index, flag));
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
        throw new BlockVerifyUsageError(`unknown argument: ${flag}`);
    }
  }
  return options;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * A manifest that does not look like a BlockManifest is rejected here rather
 * than passed to `verifyBlockManifest`, which assumes the contract shape.
 */
function manifestFromJson(raw: unknown): BlockManifest {
  if (!isRecord(raw)) throw new Error("manifest is not an object");
  if (raw.schemaVersion !== "1.0") throw new Error("unsupported schemaVersion");
  if (typeof raw.project !== "string" || raw.project.length === 0) {
    throw new Error("manifest.project is missing");
  }
  if (typeof raw.pageId !== "string" || raw.pageId.length === 0) {
    throw new Error("manifest.pageId is missing");
  }
  if (!isRecord(raw.shell) || !Array.isArray(raw.shell.wrappers)) {
    throw new Error("manifest.shell.wrappers is missing");
  }
  if (!Array.isArray(raw.blocks)) throw new Error("manifest.blocks is missing");
  if (!Array.isArray(raw.skipped)) throw new Error("manifest.skipped is missing");
  return raw as unknown as BlockManifest;
}

function blocker(
  ruleId: string,
  location: string,
  evidence: string,
  issue: string
): Finding {
  return {
    id: `${ruleId}-1`,
    ruleId,
    severity: "blocker",
    category: "block",
    location,
    evidence,
    issue,
  };
}

async function verifyPage(runDir: string, spec: PageSpec): Promise<BlockVerifyPage> {
  const relative = `artifacts/block-manifest/${spec.meta.pageId}.json`;
  const file = path.join(runDir, "artifacts", "block-manifest", `${spec.meta.pageId}.json`);
  const pageId = spec.meta.pageId;

  let manifest: BlockManifest;
  try {
    manifest = manifestFromJson(JSON.parse(await readFile(file, "utf8")) as unknown);
  } catch (error) {
    const missing = (error as NodeJS.ErrnoException).code === "ENOENT";
    return {
      pageId,
      passed: false,
      findings: [
        missing
          ? blocker(
              "BLOCK_MANIFEST_MISSING",
              pageId,
              relative,
              "Block manifest is missing for the page."
            )
          : blocker(
              "BLOCK_MANIFEST_INVALID",
              pageId,
              relative,
              `Block manifest is invalid: ${error instanceof Error ? error.message : String(error)}`
            ),
      ],
    };
  }

  const findings: Finding[] = [];
  if (manifest.project !== spec.meta.project) {
    findings.push(
      blocker(
        "BLOCK_PROJECT_MISMATCH",
        pageId,
        `${manifest.project} != ${spec.meta.project}`,
        "Block manifest project does not match the Page Spec."
      )
    );
  }
  try {
    findings.push(...verifyBlockManifest(spec, manifest));
  } catch (error) {
    findings.push(
      blocker(
        "BLOCK_MANIFEST_INVALID",
        pageId,
        relative,
        `Block manifest could not be verified: ${error instanceof Error ? error.message : String(error)}`
      )
    );
  }

  return {
    pageId,
    passed: findings.every((finding) => finding.severity !== "blocker"),
    findings,
  };
}

function runProject(specs: PageSpec[]): string {
  const projects = new Set(specs.map((spec) => spec.meta.project));
  if (projects.size !== 1) {
    throw new Error(`SPEC_RUN_PROJECT_MIXED: ${[...projects].sort().join(", ")}`);
  }
  return [...projects][0]!;
}

/** Verify every page of a spec run against its block manifest. */
export async function verifyBlockRun(specRun: string): Promise<BlockVerifyReport> {
  const specs = await loadSpecs(specRun);
  const pages: BlockVerifyPage[] = [];
  for (const spec of specs) {
    pages.push(await verifyPage(specRun, spec));
  }
  const blockers = pages.reduce(
    (sum, page) =>
      sum + page.findings.filter((finding) => finding.severity === "blocker").length,
    0
  );
  return {
    schemaVersion: "1.0",
    project: runProject(specs),
    generatedAt: new Date().toISOString(),
    pages,
    summary: { passed: blockers === 0, blockers },
  };
}

export async function main(
  argv: string[],
  io: { stdout: (line: string) => void; stderr: (line: string) => void } = {
    stdout: (line) => console.log(line),
    stderr: (line) => console.error(line),
  }
): Promise<number> {
  let options: BlockVerifyOptions;
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
  if (!options.specRun) {
    io.stderr("missing required --spec-run <dir>");
    io.stderr(USAGE);
    return 2;
  }

  try {
    const report = await verifyBlockRun(options.specRun);
    const file =
      options.out ??
      path.join(options.specRun, "findings", "block-verify.json");
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, `${JSON.stringify(report, null, 2)}\n`, "utf8");

    if (options.json) {
      io.stdout(JSON.stringify(report));
    } else {
      for (const page of report.pages) {
        io.stdout(
          `- ${page.pageId}: ${page.passed ? "PASS" : "FAIL"} (${page.findings.length} findings)`
        );
        for (const finding of page.findings) {
          io.stdout(
            `  - [${finding.severity}] ${finding.ruleId} ${finding.location}: ` +
              `${finding.issue} (${finding.evidence})`
          );
        }
      }
      io.stdout(
        `Block verify: ${report.pages.length} pages, ${report.summary.blockers} ` +
          `blockers -> ${file}`
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
