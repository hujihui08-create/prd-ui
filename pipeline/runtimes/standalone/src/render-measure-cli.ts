import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PageSpecSchema, type PageSpec } from "@prd-ui/contracts";
import { measurePages } from "./measure/measure.js";

export const USAGE = `Usage:
  pnpm render:measure --spec-run <dir> --html <dir> --out <dir> [--json]

Options:
  --spec-run <dir>  Completed spec:engineer run directory
  --html <dir>      Rendered HTML directory (one <pageId>.html per spec)
  --out <dir>       Output directory (render-metrics.json)
  --json            Print the render metrics as one JSON object
  -h, --help        Print this help and exit

Exit codes: 0 measured, 2 usage or infrastructure error.`;

export class MeasureUsageError extends Error {}

export interface MeasureOptions {
  specRun?: string;
  html?: string;
  out?: string;
  json: boolean;
  help: boolean;
}

function readValue(argv: string[], index: number, flag: string): string {
  const value = argv[index];
  if (value === undefined || value.startsWith("--")) {
    throw new MeasureUsageError(`missing value for ${flag}`);
  }
  return value;
}

export function parseArgs(argv: string[]): MeasureOptions {
  const options: MeasureOptions = { json: false, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]!;
    switch (flag) {
      case "--spec-run":
        options.specRun = path.resolve(readValue(argv, ++index, flag));
        break;
      case "--html":
        options.html = path.resolve(readValue(argv, ++index, flag));
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
        throw new MeasureUsageError(`unknown argument: ${flag}`);
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
  let options: MeasureOptions;
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
  if (!options.specRun || !options.html || !options.out) {
    io.stderr("missing required --spec-run/--html/--out");
    io.stderr(USAGE);
    return 2;
  }

  try {
    const specs = await loadSpecs(options.specRun);
    const project = specs[0]?.meta.project ?? "unknown";
    const metrics = await measurePages({
      htmlDir: options.html,
      project,
      pages: specs.map((spec) => ({
        pageId: spec.meta.pageId,
        target: spec.meta.target,
      })),
    });

    await mkdir(options.out, { recursive: true });
    const file = path.join(options.out, "render-metrics.json");
    await writeFile(file, pretty(metrics), "utf8");

    if (options.json) {
      io.stdout(JSON.stringify(metrics));
    } else {
      for (const page of metrics.pages) {
        const fold = page.foldSpecId === undefined ? "" : `, fold at ${page.foldSpecId}`;
        const overflow = page.widest.overflowX ? " (overflow-x)" : "";
        const footer = page.fixedFooter.present
          ? `${page.fixedFooter.height}px${page.fixedFooter.overlapsContent ? ", overlapping" : ""}`
          : "none";
        io.stdout(
          `Measured ${page.pageId}: height ${page.documentHeight}px, ` +
            `${page.firstScreenNodes} first-screen nodes, ` +
            `widest ${page.widest.width}px${overflow}${fold}, footer ${footer}`
        );
      }
      io.stdout(`Render metrics: ${metrics.pages.length} pages -> ${file}`);
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
