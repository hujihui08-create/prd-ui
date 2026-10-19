import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  Phase1RunError,
  runPhase1,
  type Phase1Options,
} from "@prd-ui/orchestrator";

export const USAGE = `Usage: pnpm phase1:verify [options]

Options:
  --project <path>              Load a project config (YAML)
  --brief <path>                Override the brief path
  --manifest <profile>=<path>   Add or override an asset manifest (repeatable)
  --runs <dir>                  Directory that receives run artifacts
  -h, --help                    Print this help and exit

With no options, the sample project samples/project.demo-orders.yaml is used.`;

export interface ParsedCliArgs {
  help: boolean;
  options: Phase1Options;
}

class CliUsageError extends Error {}

function readValue(argv: string[], index: number, flag: string): string {
  const value = argv[index];
  if (value === undefined || value.startsWith("--")) {
    throw new CliUsageError(`missing value for ${flag}`);
  }
  return value;
}

function parseManifest(value: string): [string, string] {
  const separator = value.indexOf("=");
  if (separator <= 0 || separator === value.length - 1) {
    throw new CliUsageError(
      `invalid --manifest "${value}"; expected <profile>=<path>`
    );
  }
  return [value.slice(0, separator), value.slice(separator + 1)];
}

export function parseArgs(argv: string[]): ParsedCliArgs {
  const options: Phase1Options = {};
  const manifests: Record<string, string> = {};
  let help = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]!;

    if (argument === "--help" || argument === "-h") {
      help = true;
      continue;
    }

    const equals = argument.indexOf("=");
    const flag = argument.startsWith("--") && equals > 0
      ? argument.slice(0, equals)
      : argument;
    const inlineValue =
      argument.startsWith("--") && equals > 0 ? argument.slice(equals + 1) : undefined;

    const value = (): string => {
      const raw = inlineValue !== undefined ? inlineValue : readValue(argv, ++index, flag);
      if (raw.length === 0) {
        throw new CliUsageError(`missing value for ${flag}`);
      }
      return raw;
    };

    switch (flag) {
      case "--project":
        options.projectPath = value();
        break;
      case "--brief":
        options.briefPath = value();
        break;
      case "--runs":
        options.runsDir = value();
        break;
      case "--manifest": {
        const [profile, manifestPath] = parseManifest(value());
        manifests[profile] = manifestPath;
        break;
      }
      default:
        throw new CliUsageError(`unknown argument: ${argument}`);
    }
  }

  if (Object.keys(manifests).length > 0) {
    options.manifests = manifests;
  }

  return { help, options };
}

function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export async function main(
  argv: string[],
  io: { stdout: (line: string) => void; stderr: (line: string) => void } = {
    stdout: (line) => console.log(line),
    stderr: (line) => console.error(line),
  }
): Promise<number> {
  let parsed: ParsedCliArgs;
  try {
    parsed = parseArgs(argv);
  } catch (error) {
    if (error instanceof CliUsageError) {
      io.stderr(error.message);
      io.stderr(USAGE);
      return 2;
    }
    throw error;
  }

  if (parsed.help) {
    io.stdout(USAGE);
    return 0;
  }

  try {
    const result = await runPhase1(parsed.options);
    const status = result.passed ? "OK" : "FAILED";
    const line = `Phase 1A ${status}: ${countLabel(result.pages, "page", "pages")}, ${countLabel(
      result.blockers,
      "blocker",
      "blockers"
    )}`;
    io.stdout(line);
    io.stdout(`Run: ${result.runDir}`);
    for (const finding of result.findings.slice(0, 10)) {
      io.stdout(`- ${finding.ruleId}: ${finding.issue}`);
    }
    return result.passed ? 0 : 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    io.stderr(`Phase 1A FAILED: ${message}`);
    if (error instanceof Phase1RunError) {
      io.stderr(`Run: ${error.runDir}`);
    }
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
