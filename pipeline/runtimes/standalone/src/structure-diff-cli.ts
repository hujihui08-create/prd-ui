import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { PageSpec, StructureDiff, StructurePageDiff } from "@prd-ui/contracts";
import { diffPageStructure } from "@prd-ui/compiler";
import { portableSpecRun } from "./figma-cli.js";
import { loadSpecs } from "./structure-check-cli.js";

export const USAGE = `Usage:
  pnpm structure:diff --before <spec-run> --after <spec-run> [--page <id>] --out <path> [--json]

Options:
  --before <dir>  Baseline spec:engineer run directory
  --after <dir>   Compared spec:engineer run directory
  --page <id>     Diff only this page (default: every page in either run)
  --out <path>    Output .json file, or a directory that receives structure-diff.json
  --json          Print the structure diff as one JSON object
  -h, --help      Print this help and exit

Pages are matched by pageId. A page present in only one run reports all of its
nodes as added or removed. Structural differences do not change the exit code.
Exit codes: 0 success, 2 usage or infrastructure error.`;

export class StructureDiffUsageError extends Error {}

export interface StructureDiffCliOptions {
  before?: string;
  after?: string;
  page?: string;
  out?: string;
  json: boolean;
  help: boolean;
}

function readValue(argv: string[], index: number, flag: string): string {
  const value = argv[index];
  if (value === undefined || value.startsWith("--")) {
    throw new StructureDiffUsageError(`missing value for ${flag}`);
  }
  return value;
}

export function parseArgs(argv: string[]): StructureDiffCliOptions {
  const options: StructureDiffCliOptions = { json: false, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]!;
    switch (flag) {
      case "--before":
        options.before = path.resolve(readValue(argv, ++index, flag));
        break;
      case "--after":
        options.after = path.resolve(readValue(argv, ++index, flag));
        break;
      case "--page":
        options.page = readValue(argv, ++index, flag);
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
        throw new StructureDiffUsageError(`unknown argument: ${flag}`);
    }
  }
  return options;
}

/**
 * A page that exists in only one run is diffed against an empty version of its
 * own shell (same id/type/props, no children or slots), so every node of the
 * page is reported as added or removed without inventing page-level contract
 * fields. Keeping the shell identity also avoids reporting the synthetic shell
 * itself as an id-less node.
 */
function emptyShell(spec: PageSpec): PageSpec {
  return {
    ...spec,
    layout: { ...spec.layout, children: [], slots: {} },
  };
}

function runProject(specs: PageSpec[], label: string): string | undefined {
  const projects = new Set(specs.map((spec) => spec.meta.project));
  if (projects.size > 1) {
    throw new Error(`SPEC_RUN_PROJECT_MIXED: ${label} has ${[...projects].sort().join(", ")}`);
  }
  return [...projects][0];
}

export function diffRuns(
  before: PageSpec[],
  after: PageSpec[],
  page?: string
): StructurePageDiff[] {
  const beforeProject = runProject(before, "before");
  const afterProject = runProject(after, "after");
  if (
    beforeProject !== undefined &&
    afterProject !== undefined &&
    beforeProject !== afterProject
  ) {
    throw new Error(`PROJECT_MISMATCH: before ${beforeProject}, after ${afterProject}`);
  }
  const beforeByPage = new Map(before.map((spec) => [spec.meta.pageId, spec]));
  const afterByPage = new Map(after.map((spec) => [spec.meta.pageId, spec]));
  const pageIds = [...new Set([...beforeByPage.keys(), ...afterByPage.keys()])].sort();
  if (page !== undefined && !pageIds.includes(page as PageSpec["meta"]["pageId"])) {
    throw new StructureDiffUsageError(`page not found in either run: ${page}`);
  }
  const selected = page === undefined ? pageIds : [page as PageSpec["meta"]["pageId"]];

  return selected.map((pageId) => {
    const left = beforeByPage.get(pageId);
    const right = afterByPage.get(pageId);
    if (left && right) return diffPageStructure(left, right);
    if (right) return diffPageStructure(emptyShell(right), right);
    return diffPageStructure(left!, emptyShell(left!));
  });
}

function totals(pages: StructurePageDiff[]): {
  added: number;
  removed: number;
  changed: number;
} {
  return pages.reduce(
    (sum, page) => ({
      added: sum.added + page.added.length,
      removed: sum.removed + page.removed.length,
      changed: sum.changed + page.changed.length,
    }),
    { added: 0, removed: 0, changed: 0 }
  );
}

export async function main(
  argv: string[],
  io: { stdout: (line: string) => void; stderr: (line: string) => void } = {
    stdout: (line) => console.log(line),
    stderr: (line) => console.error(line),
  }
): Promise<number> {
  let options: StructureDiffCliOptions;
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
  if (!options.before || !options.after || !options.out) {
    io.stderr("missing required --before/--after/--out");
    io.stderr(USAGE);
    return 2;
  }

  try {
    const pages = diffRuns(
      await loadSpecs(options.before),
      await loadSpecs(options.after),
      options.page
    );
    const diff: StructureDiff = {
      schemaVersion: "1.0",
      before: portableSpecRun(options.before),
      after: portableSpecRun(options.after),
      pages,
    };

    const file = options.out.endsWith(".json")
      ? options.out
      : path.join(options.out, "structure-diff.json");
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, `${JSON.stringify(diff, null, 2)}\n`, "utf8");

    const summary = totals(pages);
    if (options.json) {
      io.stdout(JSON.stringify(diff));
    } else {
      for (const page of pages) {
        io.stdout(
          `- ${page.pageId}: +${page.added.length} -${page.removed.length} ` +
            `~${page.changed.length}`
        );
      }
      io.stdout(
        `Structure diff: ${pages.length} pages, ${summary.added} added / ` +
          `${summary.removed} removed / ${summary.changed} changed -> ${file}`
      );
    }
    return 0;
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
