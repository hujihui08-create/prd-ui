import { access, mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { redactValue } from "@prd-ui/contracts";
import { buildVisualMatrix, type ScreenshotEvidence } from "@prd-ui/visual-review";
import {
  captureVisualCases,
  type CaptureVisualCasesInput,
} from "./visual/screenshot.js";
import {
  loadVisualProject,
  manifestCaseFor,
  readVisualManifest,
  visualManifestHash,
  type VisualManifest,
  type VisualManifestCase,
} from "./visual/manifest.js";

const pipelineRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../.."
);

export const USAGE = `Usage: pnpm visual:baseline [options]

Capture the deterministic screenshot matrix and write a baseline. No model is
called; baselines are only updated when this command is run explicitly.

Options:
  --project <path>     Project YAML
  --spec-run <dir>     spec:engineer run directory (required)
  --html <dir>         Rendered HTML directory (required)
  --out <dir>          Baseline directory (required)
  --json               Print one JSON summary to stdout
  -h, --help           Print this help and exit`;

export interface VisualBaselineOptions {
  projectPath: string;
  specRunPath?: string;
  htmlPath?: string;
  outPath?: string;
  json: boolean;
  help: boolean;
}

export interface VisualBaselineDeps {
  captureVisualCases?: (
    input: CaptureVisualCasesInput
  ) => Promise<Awaited<ReturnType<typeof captureVisualCases>>>;
}

export class VisualBaselineUsageError extends Error {}

function readValue(argv: string[], index: number, flag: string): string {
  const value = argv[index];
  if (value === undefined || value.startsWith("--")) {
    throw new VisualBaselineUsageError(`missing value for ${flag}`);
  }
  return value;
}

export function parseArgs(argv: string[]): VisualBaselineOptions {
  const options: VisualBaselineOptions = {
    projectPath: path.join(
      pipelineRoot,
      "samples",
      "projects",
      "employee-app-phase2",
      "project.yaml"
    ),
    json: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]!;
    if (argument === "--help" || argument === "-h") {
      options.help = true;
      continue;
    }
    const equals = argument.indexOf("=");
    const flag =
      argument.startsWith("--") && equals > 0 ? argument.slice(0, equals) : argument;
    const inlineValue =
      argument.startsWith("--") && equals > 0 ? argument.slice(equals + 1) : undefined;
    const value = (): string => inlineValue ?? readValue(argv, ++index, flag);

    switch (flag) {
      case "--project":
        options.projectPath = path.resolve(value());
        break;
      case "--spec-run":
        options.specRunPath = path.resolve(value());
        break;
      case "--html":
        options.htmlPath = path.resolve(value());
        break;
      case "--out":
        options.outPath = path.resolve(value());
        break;
      case "--json":
        options.json = true;
        break;
      default:
        throw new VisualBaselineUsageError(`unknown argument: ${argument}`);
    }
  }
  return options;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function assertHtmlFiles(htmlDir: string, pageIds: string[]): Promise<void> {
  for (const pageId of pageIds) {
    const file = path.join(htmlDir, `${pageId}.html`);
    try {
      await access(file);
    } catch {
      throw new Error(`VISUAL_HTML_MISSING: ${file}`);
    }
  }
}

/**
 * Commit a fully captured baseline: back up existing PNGs, rename staged PNGs
 * into place, rename the manifest last, and roll every file back if any step
 * fails. The previous manifest/PNGs stay usable on a partial update.
 */
async function commitBaseline(input: {
  tempDir: string;
  outDir: string;
  manifest: VisualManifest;
}): Promise<void> {
  const nonce = `${process.pid}-${Date.now()}`;
  const backupDir = path.join(input.outDir, `.backup-${nonce}`);
  const manifestTemp = path.join(input.outDir, `.manifest-${nonce}.json`);
  await writeFile(
    manifestTemp,
    `${JSON.stringify(input.manifest, null, 2)}\n`,
    "utf8"
  );
  const committed: Array<{ file: string; hadBackup: boolean }> = [];

  try {
    await mkdir(backupDir, { recursive: true });
    for (const entry of input.manifest.cases) {
      const finalPath = path.join(input.outDir, entry.file);
      const backupPath = path.join(backupDir, entry.file);
      await mkdir(path.dirname(backupPath), { recursive: true });
      let hadBackup = false;
      try {
        await rename(finalPath, backupPath);
        hadBackup = true;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      try {
        await rename(path.join(input.tempDir, entry.file), finalPath);
      } catch (error) {
        if (hadBackup) {
          await rename(backupPath, finalPath).catch(() => undefined);
        }
        throw error;
      }
      committed.push({ file: entry.file, hadBackup });
    }
    await rename(manifestTemp, path.join(input.outDir, "manifest.json"));
  } catch (error) {
    for (const entry of committed.reverse()) {
      const finalPath = path.join(input.outDir, entry.file);
      const backupPath = path.join(backupDir, entry.file);
      await rm(finalPath, { force: true }).catch(() => undefined);
      if (entry.hadBackup) {
        await rename(backupPath, finalPath).catch(() => undefined);
      }
    }
    await rm(manifestTemp, { force: true }).catch(() => undefined);
    throw error;
  } finally {
    await rm(backupDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

function failureSummary(
  baselineDir: string | null,
  cases: number,
  screenshots: number,
  message: string
): Record<string, unknown> {
  return redactValue({
    baselineDir,
    status: "blocked",
    cases,
    screenshots,
    diff: { passed: 0, failed: 0, missing: 0 },
    findings: [],
    costCny: 0,
    usageComplete: true,
    manifestHash: null,
    error: message,
  }) as Record<string, unknown>;
}

export async function main(
  argv: string[],
  io: { stdout: (line: string) => void; stderr: (line: string) => void } = {
    stdout: (line) => console.log(line),
    stderr: (line) => console.error(line),
  },
  deps: VisualBaselineDeps = {}
): Promise<number> {
  let options: VisualBaselineOptions;
  try {
    options = parseArgs(argv);
  } catch (error) {
    if (error instanceof VisualBaselineUsageError) {
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
  if (options.specRunPath === undefined) {
    io.stderr("missing required --spec-run <dir>");
    io.stderr(USAGE);
    return 2;
  }
  if (options.htmlPath === undefined) {
    io.stderr("missing required --html <dir>");
    io.stderr(USAGE);
    return 2;
  }
  if (options.outPath === undefined) {
    io.stderr("missing required --out <dir>");
    io.stderr(USAGE);
    return 2;
  }

  const outDir = options.outPath;
  let casesCount = 0;
  let screenshotsCount = 0;

  try {
    const { project, specs } = await loadVisualProject({
      projectPath: options.projectPath,
      specRunDir: options.specRunPath,
    });
    const cases = buildVisualMatrix(specs);
    casesCount = cases.length;
    await assertHtmlFiles(
      options.htmlPath,
      [...new Set(cases.map((visualCase) => visualCase.pageId))]
    );
    await mkdir(outDir, { recursive: true });

    const tempDir = path.join(outDir, `.tmp-${process.pid}-${Date.now()}`);
    const capture = deps.captureVisualCases ?? captureVisualCases;
    let evidence: ScreenshotEvidence[];
    try {
      evidence = await capture({
        htmlDir: options.htmlPath,
        cases,
        outDir: tempDir,
      });
      screenshotsCount = evidence.length;
      const captured = new Set(evidence.map((entry) => entry.caseId));
      const missing = cases
        .map((visualCase) => visualCase.id)
        .filter((id) => !captured.has(id));
      if (missing.length > 0) {
        throw new Error(`VISUAL_SCREENSHOTS_MISSING: ${missing.join(", ")}`);
      }

      const byCase = new Map(evidence.map((entry) => [entry.caseId, entry]));
      const manifestCases: VisualManifestCase[] = [];
      for (const visualCase of cases) {
        const entry = byCase.get(visualCase.id)!;
        manifestCases.push(
          manifestCaseFor(
            visualCase,
            `${visualCase.id}.png`,
            entry.sha256,
            entry.visualHash
          )
        );
      }

      const manifest: VisualManifest = {
        schemaVersion: "1.0",
        project,
        generatedAt: new Date().toISOString(),
        cases: manifestCases,
      };
      const manifestHash = visualManifestHash(manifest);

      let previous: VisualManifest | undefined;
      try {
        previous = await readVisualManifest(path.join(outDir, "manifest.json"));
      } catch {
        // An unreadable old manifest is not a reason to fail a new baseline.
      }

      // Stage every PNG by renaming, write the manifest last, then remove stale
      // files; any commit failure rolls back to the previous baseline.
      await commitBaseline({ tempDir, outDir, manifest });

      if (previous !== undefined) {
        const keep = new Set(manifest.cases.map((entry) => entry.file));
        for (const entry of previous.cases) {
          if (keep.has(entry.file)) continue;
          await rm(path.join(outDir, entry.file), { force: true }).catch(
            () => undefined
          );
        }
      }

      const summary = redactValue({
        baselineDir: outDir,
        status: "passed",
        cases: manifest.cases.length,
        screenshots: evidence.length,
        diff: { passed: 0, failed: 0, missing: 0 },
        findings: [],
        costCny: 0,
        usageComplete: true,
        manifestHash,
        error: null,
      }) as Record<string, unknown>;
      if (options.json) io.stdout(JSON.stringify(summary));
      else {
        io.stdout(
          `Visual baseline OK: ${manifest.cases.length} cases, ${evidence.length} screenshots`
        );
        io.stdout(`Manifest: ${manifestHash}`);
        io.stdout(`Baseline: ${outDir}`);
      }
      return 0;
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  } catch (error) {
    const message = redactValue(errorMessage(error)) as string;
    if (options.json) {
      io.stdout(
        JSON.stringify(
          failureSummary(outDir, casesCount, screenshotsCount, message)
        )
      );
    } else {
      io.stderr(`Visual baseline FAILED: ${message}`);
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
