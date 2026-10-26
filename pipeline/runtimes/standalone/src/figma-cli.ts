import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  FigmaPlanSchema,
  FigmaReadbackSchema,
  PageSpecSchema,
  type FigmaPlan,
  type FigmaReadback,
  type PageSpec,
} from "@prd-ui/contracts";
import { compileFigmaPlans, diffFigma } from "@prd-ui/figma";
import { getCatalog, getProfile } from "@prd-ui/design-system";

export const USAGE = `Usage:
  pnpm figma:plan --spec-run <dir> --out <dir>
  pnpm figma:verify --plan <file> --readback <file> [--out <file>] [--max-major 2] [--json]

Options:
  --spec-run <dir>   Completed spec:engineer run directory
  --out <path>       Output directory (plan) or file (verify)
  --plan <file>      figma-plan.json
  --readback <file>  figma-readback.json
  --max-major <n>    Allowed major findings (default 2)
  --json             Print one JSON summary
  -h, --help         Print this help and exit`;

class CliUsageError extends Error {}

function readValue(argv: string[], index: number, flag: string): string {
  const value = argv[index];
  if (value === undefined || value.startsWith("--")) {
    throw new CliUsageError(`missing value for ${flag}`);
  }
  return value;
}

interface PlanOptions {
  command: "plan";
  specRun?: string;
  out?: string;
  help: boolean;
  json: boolean;
}

interface VerifyOptions {
  command: "verify";
  plan?: string;
  readback?: string;
  out?: string;
  maxMajor?: number;
  help: boolean;
  json: boolean;
}

type Options = PlanOptions | VerifyOptions;

export function parseArgs(argv: string[]): Options {
  const command = argv[0];
  if (command !== "plan" && command !== "verify") {
    throw new CliUsageError(`unknown command "${command ?? ""}"`);
  }
  const base = { command, help: false, json: false } as PlanOptions | VerifyOptions;
  for (let index = 1; index < argv.length; index += 1) {
    const flag = argv[index]!;
    const value = (): string => readValue(argv, ++index, flag);
    switch (flag) {
      case "--help":
      case "-h":
        base.help = true;
        break;
      case "--json":
        base.json = true;
        break;
      case "--spec-run":
        if (base.command !== "plan") throw new CliUsageError("--spec-run is only for plan");
        base.specRun = path.resolve(value());
        break;
      case "--out":
        base.out = path.resolve(value());
        break;
      case "--plan":
        if (base.command !== "verify") throw new CliUsageError("--plan is only for verify");
        base.plan = path.resolve(value());
        break;
      case "--readback":
        if (base.command !== "verify") throw new CliUsageError("--readback is only for verify");
        base.readback = path.resolve(value());
        break;
      case "--max-major": {
        if (base.command !== "verify") throw new CliUsageError("--max-major is only for verify");
        const parsed = Number(value());
        if (!Number.isInteger(parsed) || parsed < 0) {
          throw new CliUsageError("--max-major must be a non-negative integer");
        }
        base.maxMajor = parsed;
        break;
      }
      default:
        throw new CliUsageError(`unknown argument: ${flag}`);
    }
  }
  return base;
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

function sha256(value: string): string {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

async function runPlan(options: PlanOptions): Promise<number> {
  if (options.specRun === undefined) throw new CliUsageError("--spec-run is required");
  if (options.out === undefined) throw new CliUsageError("--out is required");
  const specs = await loadSpecs(options.specRun);
  const plans = compileFigmaPlans(
    specs,
    (page) => getProfile(page.meta.profile),
    (page) => getCatalog(page.meta.profile)
  );
  await mkdir(options.out, { recursive: true });
  const index = [];
  for (const plan of plans) {
    const file = `figma-plan.${plan.pageId}.json`;
    const body = pretty(plan);
    await writeFile(path.join(options.out, file), body, "utf8");
    index.push({
      pageId: plan.pageId,
      pageName: plan.pageName,
      file,
      width: plan.width,
      height: plan.height,
      hash: sha256(body),
    });
  }
  const indexBody = pretty({
    schemaVersion: "1.0",
    project: specs[0]?.meta.project ?? "unknown",
    specRun: options.specRun,
    plans: index,
  });
  await writeFile(path.join(options.out, "figma-plan.index.json"), indexBody, "utf8");
  if (options.json) {
    console.log(JSON.stringify({ plans: plans.length, out: options.out }, null, 2));
  } else {
    console.log(`Figma plans: ${plans.length} -> ${options.out}`);
  }
  return 0;
}

async function runVerify(options: VerifyOptions): Promise<number> {
  if (options.plan === undefined) throw new CliUsageError("--plan is required");
  if (options.readback === undefined) throw new CliUsageError("--readback is required");
  const planRaw = JSON.parse(await readFile(options.plan, "utf8")) as unknown;
  const readbackRaw = JSON.parse(await readFile(options.readback, "utf8")) as unknown;
  const plan = FigmaPlanSchema.parse(planRaw) as FigmaPlan;
  const readback = FigmaReadbackSchema.parse(readbackRaw) as FigmaReadback;
  const diff = diffFigma(plan, readback, {
    ...(options.maxMajor === undefined ? {} : { maxMajor: options.maxMajor }),
  });
  if (options.out !== undefined) {
    await mkdir(path.dirname(options.out), { recursive: true });
    await writeFile(options.out, pretty(diff), "utf8");
  }
  if (options.json) {
    console.log(JSON.stringify(diff, null, 2));
  } else {
    console.log(
      `Figma diff ${plan.pageId}: ${diff.passed ? "passed" : "failed"} ` +
        `(${diff.blockerCount} blocker / ${diff.majorCount} major / ${diff.findings.length} findings)`
    );
    for (const item of diff.findings) {
      console.log(`- [${item.severity}] ${item.code}: ${item.message}`);
    }
  }
  return diff.passed ? 0 : 1;
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
  try {
    if (options.command === "plan") return await runPlan(options);
    return await runVerify(options);
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
