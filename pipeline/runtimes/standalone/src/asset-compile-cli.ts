import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AssetManifestSchema, type AssetManifest } from "@prd-ui/contracts";
import {
  compileAssetPackage,
  libraryManifest,
  type AssetSource,
} from "@prd-ui/asset-compiler";

export const USAGE = `Usage:
  pnpm asset:compile --library <index.json> [--source <dir>] [--licenses <dir>] --out <dir>
  pnpm asset:compile --manifest <asset-manifest.json> --source <dir> --licenses <dir> --out <dir>
  pnpm asset:compile --asset-review <run> --licenses <dir> --out <dir>

Options:
  --library <file>      M0/library index.json
  --manifest <file>     AssetManifest JSON
  --asset-review <dir>  asset-review run directory (manifest.review.json + assets/frozen)
  --source <dir>        Source root for library/manifest modes
  --licenses <dir>      Directory containing LICENSE-* files
  --project <name>      Override project
  --profile <name>      Override profile
  --out <dir>           Output package directory
  --json                Print one JSON summary
  -h, --help            Print this help and exit`;

class CliUsageError extends Error {}

function readValue(argv: string[], index: number, flag: string): string {
  const value = argv[index];
  if (value === undefined || value.startsWith("--")) {
    throw new CliUsageError(`missing value for ${flag}`);
  }
  return value;
}

interface Options {
  library?: string;
  manifest?: string;
  assetReview?: string;
  source?: string;
  licenses?: string;
  project?: string;
  profile?: string;
  out?: string;
  json: boolean;
  help: boolean;
}

export function parseArgs(argv: string[]): Options {
  const options: Options = { json: false, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]!;
    const value = (): string => path.resolve(readValue(argv, ++index, flag));
    switch (flag) {
      case "--library":
        options.library = value();
        break;
      case "--manifest":
        options.manifest = value();
        break;
      case "--asset-review":
        options.assetReview = value();
        break;
      case "--source":
        options.source = value();
        break;
      case "--licenses":
        options.licenses = value();
        break;
      case "--project":
        options.project = readValue(argv, ++index, flag);
        break;
      case "--profile":
        options.profile = readValue(argv, ++index, flag);
        break;
      case "--out":
        options.out = value();
        break;
      case "--json":
        options.json = true;
        break;
      case "--help":
      case "-h":
        options.help = true;
        break;
      default:
        throw new CliUsageError(`unknown argument: ${flag}`);
    }
  }
  return options;
}

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(file, "utf8")) as T;
}

async function licenseTexts(directory: string | undefined): Promise<Record<string, string>> {
  if (directory === undefined) return {};
  const files = (await readdir(directory)).filter((file) => file.startsWith("LICENSE-"));
  const texts: Record<string, string> = {};
  for (const file of files) {
    const content = await readFile(path.join(directory, file), "utf8");
    if (/ISC/i.test(file) || /ISC License/i.test(content)) texts.ISC = content;
    const id = file.replace(/^LICENSE-/, "").replace(/\.txt$/i, "");
    if (id.length > 0) texts[id] = content;
  }
  return texts;
}

async function sourcesFor(root: string, files: string[]): Promise<AssetSource[]> {
  const sources: AssetSource[] = [];
  for (const file of files) {
    sources.push({ path: file, data: await readFile(path.join(root, file)) });
  }
  return sources;
}

async function manifestFor(options: Options): Promise<{
  manifest: AssetManifest;
  sourceRoot: string;
  licenseDir?: string;
}> {
  if (options.library !== undefined) {
    const library = await readJson<{
      assets: Array<{
        id: string;
        kind: "icon" | "illustration" | "image";
        file: string;
        license: string;
        library: string;
      }>;
    }>(options.library);
    const sourceRoot = options.source ?? path.dirname(options.library);
    const manifest = libraryManifest({
      project: options.project ?? "m0-library",
      profile: options.profile ?? "b-mobile",
      library,
    });
    return {
      manifest,
      sourceRoot,
      licenseDir: options.licenses ?? path.dirname(sourceRoot),
    };
  }
  if (options.manifest !== undefined) {
    const parsed = AssetManifestSchema.parse(await readJson(options.manifest));
    if (options.source === undefined) throw new CliUsageError("--source is required with --manifest");
    return {
      manifest: {
        ...parsed,
        project: options.project ?? parsed.project,
        profile: options.profile ?? parsed.profile,
      },
      sourceRoot: options.source,
      licenseDir: options.licenses,
    };
  }
  if (options.assetReview !== undefined) {
    const reviewPath = path.join(options.assetReview, "manifest.review.json");
    const review = await readJson<{ assets: Array<{ id: string; status: string }> }>(reviewPath);
    const ids = review.assets
      .filter((asset) => asset.status === "passed")
      .map((asset) => asset.id);
    const manifest: AssetManifest = {
      project: options.project ?? path.basename(options.assetReview),
      profile: options.profile ?? "b-mobile",
      assets: ids.map((id) => ({
        id,
        kind: "icon",
        files: [{ path: `frozen/${id}/asset.svg`, format: "svg" }],
        license: "ISC",
        library: "lucide",
      })),
      placeholders: [],
      complete: true,
    };
    return {
      manifest,
      sourceRoot: path.join(options.assetReview, "assets"),
      licenseDir: options.licenses,
    };
  }
  throw new CliUsageError("one of --library, --manifest, or --asset-review is required");
}

async function writePackage(
  out: string,
  files: Array<{ path: string; data: Buffer }>,
  manifest: AssetManifest,
  licenses: string,
  readme: string
): Promise<void> {
  for (const file of files) {
    const target = path.join(out, file.path);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, file.data);
  }
  await writeFile(path.join(out, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(path.join(out, "LICENSES.md"), licenses);
  await writeFile(path.join(out, "README.md"), readme);
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
  if (options.out === undefined) {
    io.stderr("--out is required");
    return 2;
  }
  try {
    const { manifest, sourceRoot, licenseDir } = await manifestFor(options);
    const filePaths = [...new Set(manifest.assets.flatMap((asset) => asset.files.map((file) => file.path)))];
    const sources = await sourcesFor(sourceRoot, filePaths);
    const texts = await licenseTexts(licenseDir);
    const result = compileAssetPackage({
      project: manifest.project,
      profile: manifest.profile,
      manifest,
      sources,
      licenseTexts: texts,
    });
    await writePackage(options.out, result.files, result.manifest, result.licenses, result.readme);
    const summary = {
      out: options.out,
      assets: result.manifest.assets.length,
      files: result.files.length,
      complete: result.manifest.complete,
      blockers: result.blockers,
    };
    if (options.json) {
      io.stdout(JSON.stringify(summary, null, 2));
    } else {
      io.stdout(
        `Asset package: ${summary.assets} assets / ${summary.files} files -> ${summary.out} ` +
          `(complete=${summary.complete})`
      );
      for (const blocker of summary.blockers) io.stdout(`- ${blocker}`);
    }
    return result.blockers.length === 0 ? 0 : 1;
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
