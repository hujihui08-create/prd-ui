import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  PageSpecSchema,
  UiBriefSchema,
  type PageSpec,
  type UiBrief,
} from "@prd-ui/contracts";
import { compilePageSpec } from "@prd-ui/compiler";
import { getArchetype, getCatalog, getProfile } from "@prd-ui/design-system";
import { briefHash } from "@prd-ui/intake";
import { loadProjectConfig } from "@prd-ui/orchestrator";

export const USAGE = `Usage:
  pnpm spec:refresh --spec-run <dir> --project <yaml> --out <dir> [--brief <json>] [--json]

Options:
  --spec-run <dir>  Completed spec:engineer run directory
  --project <yaml>  Project config (default brief path comes from it)
  --brief <json>    UI Brief to recompile layouts from (defaults to project.brief)
  --out <dir>       Output spec run directory (new; never overwrite the input)
  --json            Print one JSON summary line
  -h, --help        Print this help and exit

Recompiles only each page's layout from the current compiler template and keeps
states/motion/interactions/linkedRoutes/traceability. Exit codes: 0 success,
1 failure, 2 usage or infrastructure error.`;

export class SpecRefreshUsageError extends Error {}

export interface SpecRefreshOptions {
  specRun?: string;
  project?: string;
  brief?: string;
  out?: string;
  json: boolean;
  help: boolean;
}

function readValue(argv: string[], index: number, flag: string): string {
  const value = argv[index];
  if (value === undefined || value.startsWith("--")) {
    throw new SpecRefreshUsageError(`missing value for ${flag}`);
  }
  return value;
}

export function parseArgs(argv: string[]): SpecRefreshOptions {
  const options: SpecRefreshOptions = { json: false, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]!;
    switch (flag) {
      case "--spec-run":
        options.specRun = readValue(argv, ++index, flag);
        break;
      case "--project":
        options.project = readValue(argv, ++index, flag);
        break;
      case "--brief":
        options.brief = readValue(argv, ++index, flag);
        break;
      case "--out":
        options.out = readValue(argv, ++index, flag);
        break;
      case "--json":
        options.json = true;
        break;
      case "-h":
      case "--help":
        options.help = true;
        break;
      default:
        throw new SpecRefreshUsageError(`unknown argument ${flag}`);
    }
  }
  return options;
}

export interface SpecRefreshIo {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
}

function sha256Text(text: string): string {
  return `sha256:${createHash("sha256").update(text, "utf8").digest("hex")}`;
}

async function pageSpecFiles(runDir: string): Promise<string[]> {
  const dir = path.join(runDir, "artifacts", "page-spec");
  const entries = await readdir(dir);
  return entries
    .filter((entry) => entry.endsWith(".json"))
    .sort()
    .map((entry) => path.join(dir, entry));
}

export async function main(
  argv: string[],
  io: SpecRefreshIo = { stdout: console.log, stderr: console.error }
): Promise<number> {
  let options: SpecRefreshOptions;
  try {
    options = parseArgs(argv);
  } catch (error) {
    io.stderr(`${error instanceof Error ? error.message : String(error)}\n${USAGE}`);
    return 2;
  }
  if (options.help) {
    io.stdout(USAGE);
    return 0;
  }
  if (options.specRun === undefined || options.project === undefined || options.out === undefined) {
    io.stderr(`spec:refresh requires --spec-run, --project, and --out\n${USAGE}`);
    return 2;
  }

  try {
    const specRun = path.resolve(options.specRun);
    const out = path.resolve(options.out);
    if (specRun === out) {
      throw new Error("SPEC_REFRESH_OUT_EQUALS_INPUT: choose a new --out directory");
    }

    const { config, baseDir } = loadProjectConfig(options.project);
    const briefPath = path.resolve(
      options.brief ?? path.resolve(baseDir, config.brief)
    );
    const brief: UiBrief = UiBriefSchema.parse(
      JSON.parse(await readFile(briefPath, "utf8"))
    );
    const pagesById = new Map(brief.ia.pages.map((page) => [page.id, page]));

    const files = await pageSpecFiles(specRun);
    if (files.length === 0) {
      throw new Error(`SPEC_REFRESH_NO_PAGES: ${specRun}/artifacts/page-spec`);
    }

    const outDir = path.join(out, "artifacts", "page-spec");
    await mkdir(outDir, { recursive: true });
    const refreshed: PageSpec[] = [];
    for (const file of files) {
      const existing = PageSpecSchema.parse(
        JSON.parse(await readFile(file, "utf8"))
      );
      const page = pagesById.get(existing.meta.pageId);
      if (page === undefined) {
        throw new Error(`BRIEF_PAGE_MISSING: ${existing.meta.pageId}`);
      }
      const base = compilePageSpec({
        brief,
        page,
        profile: getProfile(page.profile),
        catalog: getCatalog(page.profile),
        archetype: getArchetype(page.archetype),
      });
      const next = PageSpecSchema.parse({ ...existing, layout: base.layout });
      refreshed.push(next);
      await writeFile(
        path.join(outDir, path.basename(file)),
        `${JSON.stringify(next, null, 2)}\n`
      );
    }

    const provenance = {
      schemaVersion: "1.0",
      project: config.project,
      sourceSpecRun: path.relative(process.cwd(), specRun),
      brief: path.relative(process.cwd(), briefPath),
      briefHash: briefHash(sha256Text, brief),
      generatedAt: new Date().toISOString(),
      pages: refreshed.map((spec) => spec.meta.pageId),
    };
    await writeFile(
      path.join(out, "provenance.json"),
      `${JSON.stringify(provenance, null, 2)}\n`
    );

    if (options.json) {
      io.stdout(JSON.stringify({ ok: true, out: path.relative(process.cwd(), out), ...provenance }));
    } else {
      io.stdout(`Refreshed ${refreshed.length} page spec(s) -> ${out}`);
      io.stdout(`Brief: ${provenance.briefHash}`);
    }
    return 0;
  } catch (error) {
    io.stderr(
      `spec:refresh failed: ${error instanceof Error ? error.message : String(error)}`
    );
    return 1;
  }
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (invokedDirectly) {
  process.exitCode = await main(process.argv.slice(2));
}
