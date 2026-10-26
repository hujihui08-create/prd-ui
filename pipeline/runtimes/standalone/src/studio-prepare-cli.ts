import { copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PageSpecSchema, type PageSpec, type SpecNode } from "@prd-ui/contracts";
import { getCatalog, getProfile } from "@prd-ui/design-system";

export const USAGE = `Usage: pnpm studio:prepare --spec-run <dir> --html <dir> --out <dir> [options]

Options:
  --spec-run <dir>    spec:engineer run directory
  --html <dir>        render:html output directory
  --out <dir>         Studio public directory (studio/public)
  --visual-run <dir>  visual:review run directory (findings)
  --assets <dir>      compiled asset package (manifest.json)
  --figma-plan <dir>  figma:plan output directory
  --project <name>    Override project name
  --json              Print one JSON summary
  -h, --help          Print this help and exit`;

class CliUsageError extends Error {}

function readValue(argv: string[], index: number, flag: string): string {
  const value = argv[index];
  if (value === undefined || value.startsWith("--")) {
    throw new CliUsageError(`missing value for ${flag}`);
  }
  return value;
}

interface Options {
  specRun?: string;
  html?: string;
  out?: string;
  visualRun?: string;
  assets?: string;
  figmaPlan?: string;
  project?: string;
  json: boolean;
  help: boolean;
}

export function parseArgs(argv: string[]): Options {
  const options: Options = { json: false, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]!;
    const value = (): string => path.resolve(readValue(argv, ++index, flag));
    switch (flag) {
      case "--spec-run": options.specRun = value(); break;
      case "--html": options.html = value(); break;
      case "--out": options.out = value(); break;
      case "--visual-run": options.visualRun = value(); break;
      case "--assets": options.assets = value(); break;
      case "--figma-plan": options.figmaPlan = value(); break;
      case "--project": options.project = readValue(argv, ++index, flag); break;
      case "--json": options.json = true; break;
      case "--help":
      case "-h": options.help = true; break;
      default: throw new CliUsageError(`unknown argument: ${flag}`);
    }
  }
  return options;
}

function countNodes(node: SpecNode): number {
  return 1 + (node.children ?? []).reduce((sum, child) => sum + countNodes(child), 0) +
    Object.values(node.slots ?? {}).reduce(
      (sum, children) => sum + children.reduce((inner, child) => inner + countNodes(child), 0),
      0
    );
}

async function loadSpecs(specRun: string): Promise<PageSpec[]> {
  const dir = path.join(specRun, "artifacts", "page-spec");
  const files = (await readdir(dir)).filter((file) => file.endsWith(".json")).sort();
  const specs: PageSpec[] = [];
  for (const file of files) {
    const raw = JSON.parse(await readFile(path.join(dir, file), "utf8")) as unknown;
    const parsed = PageSpecSchema.safeParse(raw);
    if (!parsed.success) throw new Error(`PAGE_SPEC_INVALID: ${file}: ${parsed.error.message}`);
    specs.push(parsed.data);
  }
  if (specs.length === 0) throw new Error(`SPEC_RUN_EMPTY: ${dir}`);
  return specs;
}

async function visualFindings(
  visualRun: string | undefined
): Promise<{ visual: unknown[]; deterministic: unknown[]; signoffs: string[] }> {
  if (visualRun === undefined) return { visual: [], deterministic: [], signoffs: [] };
  const readOptional = async (file: string): Promise<Record<string, unknown> | undefined> => {
    try {
      return JSON.parse(await readFile(file, "utf8")) as Record<string, unknown>;
    } catch {
      return undefined;
    }
  };
  const review = await readOptional(path.join(visualRun, "visual-review.json"));
  const gate = await readOptional(path.join(visualRun, "findings", "visual-gate.json"));
  let signoffs: string[] = [];
  try {
    await readFile(path.join(visualRun, "signoff", "visual.md"), "utf8");
    signoffs = ["visual"];
  } catch {
    signoffs = [];
  }
  return {
    visual: Array.isArray(review?.findings) ? review.findings : [],
    deterministic: Array.isArray(gate?.findings) ? gate.findings : [],
    signoffs,
  };
}

export async function main(
  argv: string[],
  io: { stdout: (line: string) => void; stderr: (line: string) => void } = {
    stdout: (line) => console.log(line),
    stderr: (line) => console.error(line),
  }
): Promise<number> {
  let options: Options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    if (error instanceof CliUsageError) {
      io.stderr(error.message);
      io.stderr(USAGE);
      return 2;
    }
    throw error;
  }
  if (options.help) {
    io.stdout(USAGE);
    return 0;
  }
  if (options.specRun === undefined || options.html === undefined || options.out === undefined) {
    io.stderr("--spec-run, --html, and --out are required");
    return 2;
  }
  try {
    const specs = await loadSpecs(options.specRun);
    const first = specs[0]!;
    const profile = getProfile(first.meta.profile);
    const catalog = getCatalog(first.meta.profile);
    const visual = await visualFindings(options.visualRun);
    let assets: {
      complete: boolean;
      assets: Array<{ id: string; kind: string; license: string; file?: string }>;
      placeholders: string[];
    } = { complete: true, assets: [], placeholders: [] };
    if (options.assets !== undefined) {
      try {
        const manifest = JSON.parse(
          await readFile(path.join(options.assets, "manifest.json"), "utf8")
        ) as {
          assets: Array<{
            id: string;
            kind: string;
            license: string;
            files: Array<{ path: string }>;
          }>;
          placeholders: string[];
          complete: boolean;
        };
        assets = {
          complete: manifest.complete,
          assets: manifest.assets.map((asset) => ({
            id: asset.id,
            kind: asset.kind,
            license: asset.license,
            ...(asset.files[0]?.path === undefined ? {} : { file: asset.files[0].path }),
          })),
          placeholders: manifest.placeholders,
        };
      } catch (error) {
        io.stderr(`assets: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    const figmaStatus = options.figmaPlan === undefined ? "not-built" : "plans-ready";
    const data = {
      schemaVersion: "1.0",
      project: options.project ?? first.meta.project,
      runId: path.basename(options.specRun),
      generatedAt: new Date().toISOString(),
      pages: specs.map((spec) => ({
        id: spec.meta.pageId,
        name: spec.meta.name,
        archetype: spec.meta.archetype,
        route: spec.meta.route,
        target: spec.meta.target,
        profile: spec.meta.profile,
        html: `html/${spec.meta.pageId}.html`,
        states: Object.keys(spec.states),
        views: spec.views ?? [],
        ...(spec.defaultView === undefined ? {} : { defaultView: spec.defaultView }),
        formModes: (spec.formModes ?? []).map((mode) => mode.name),
        businessStates: (spec.businessStates ?? []).map((state) => state.name),
        reqRefs: spec.meta.reqRefs,
        roles: spec.meta.roles,
        interactions: spec.interactions.length,
        nodeCount: countNodes(spec.layout),
      })),
      profile: {
        name: profile.meta.name,
        color: profile.color,
        typography: profile.typography,
      },
      catalog: {
        library: catalog.meta.library,
        components: catalog.components.map((component) => ({
          id: component.id,
          availability: component.availability,
          variants: component.variants,
        })),
      },
      findings: { visual: visual.visual, deterministic: visual.deterministic },
      assets,
      figma: {
        status: figmaStatus,
        ...(options.figmaPlan === undefined ? {} : { planDir: options.figmaPlan }),
        diff: null,
      },
      signoffs: visual.signoffs,
    };
    await mkdir(path.join(options.out, "html"), { recursive: true });
    const htmlFiles = (await readdir(options.html)).filter((file) => file.endsWith(".html"));
    for (const file of htmlFiles) {
      await copyFile(path.join(options.html, file), path.join(options.out, "html", file));
    }
    await writeFile(
      path.join(options.out, "studio-data.json"),
      `${JSON.stringify(data, null, 2)}\n`,
      "utf8"
    );
    if (options.json) {
      io.stdout(JSON.stringify({ pages: data.pages.length, out: options.out }, null, 2));
    } else {
      io.stdout(`Studio data: ${data.pages.length} pages -> ${options.out}`);
    }
    return 0;
  } catch (error) {
    io.stderr(error instanceof Error ? error.message : String(error));
    return 1;
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
      process.exitCode = 1;
    });
}
