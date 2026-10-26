import { createHash } from "node:crypto";
import path from "node:path";
import type { AssetEntry, AssetManifest } from "@prd-ui/contracts";

export interface AssetSource {
  /** Path relative to the compiler source root. */
  path: string;
  data: Buffer;
}

export interface AssetCompileInput {
  project: string;
  profile: string;
  manifest: AssetManifest;
  sources: AssetSource[];
  licenseTexts: Record<string, string>;
}

export interface AssetPackageFile {
  path: string;
  data: Buffer;
  sha256: string;
}

export interface AssetPackage {
  files: AssetPackageFile[];
  manifest: AssetManifest;
  licenses: string;
  readme: string;
  blockers: string[];
}

const TEST_FIXTURE_NOTE =
  "test-fixture: 仅用于本地测试，不是生产资产；不得随产品发布。";

function sha256(data: Buffer): string {
  return `sha256:${createHash("sha256").update(data).digest("hex")}`;
}

function sourceFor(sources: AssetSource[], filePath: string): AssetSource | undefined {
  const normalized = filePath.replace(/\\/g, "/");
  return (
    sources.find((source) => source.path === normalized) ??
    sources.find((source) => source.path.endsWith(`/${normalized}`)) ??
    sources.find((source) => normalized.endsWith(`/${source.path}`))
  );
}

function packagePath(kind: AssetEntry["kind"], sourcePath: string): string {
  const directory =
    kind === "icon" ? "icons" : kind === "illustration" ? "illustrations" : "images";
  return `${directory}/${path.basename(sourcePath)}`;
}

function licenseSection(
  license: string,
  licenseTexts: Record<string, string>
): string {
  if (license === "test-fixture") return TEST_FIXTURE_NOTE;
  return licenseTexts[license] ?? "";
}

export function compileAssetPackage(input: AssetCompileInput): AssetPackage {
  const blockers: string[] = [];
  const files: AssetPackageFile[] = [];
  const assets: AssetEntry[] = [];
  const usedLicenses = new Set<string>();
  const seenIds = new Set<string>();

  if (!input.manifest.complete) blockers.push("ASSET_MANIFEST_INCOMPLETE");
  if (input.manifest.placeholders.length > 0) {
    blockers.push(`ASSET_PLACEHOLDERS: ${input.manifest.placeholders.join(", ")}`);
  }

  for (const asset of input.manifest.assets) {
    if (seenIds.has(asset.id)) {
      blockers.push(`ASSET_DUPLICATE_ID: ${asset.id}`);
      continue;
    }
    seenIds.add(asset.id);
    usedLicenses.add(asset.license);
    if (asset.license !== "test-fixture" && !input.licenseTexts[asset.license]) {
      blockers.push(`ASSET_LICENSE_MISSING: ${asset.id} (${asset.license})`);
    }
    const packagedFiles: AssetEntry["files"] = [];
    for (const file of asset.files) {
      const source = sourceFor(input.sources, file.path);
      if (source === undefined) {
        blockers.push(`ASSET_FILE_MISSING: ${asset.id} (${file.path})`);
        continue;
      }
      const target = packagePath(asset.kind, source.path);
      const packageFile: AssetPackageFile = {
        path: target,
        data: source.data,
        sha256: sha256(source.data),
      };
      files.push(packageFile);
      packagedFiles.push({
        path: target,
        ...(file.scale === undefined ? {} : { scale: file.scale }),
        format: file.format,
      });
    }
    if (packagedFiles.length === 0) continue;
    assets.push({
      ...asset,
      files: packagedFiles,
      hash: sha256(Buffer.from(JSON.stringify(packagedFiles))),
    });
  }

  const manifest: AssetManifest = {
    project: input.project || input.manifest.project,
    profile: input.profile || input.manifest.profile,
    assets,
    placeholders: input.manifest.placeholders,
    complete: blockers.length === 0,
  };

  const licenseSections = [...usedLicenses].sort().map((license) => {
    const text = licenseSection(license, input.licenseTexts);
    return `## ${license}\n\n${text || "（缺少 license 文本）"}`;
  });
  const licenses = `# Asset licenses\n\n${licenseSections.join("\n\n")}\n`;
  const readme = `# Asset package\n\n- project: ${manifest.project}\n- profile: ${manifest.profile}\n- assets: ${manifest.assets.length}\n- files: ${files.length}\n- complete: ${manifest.complete}\n- licenses: ${[...usedLicenses].sort().join(", ") || "none"}\n`;

  return { files, manifest, licenses, readme, blockers };
}

export function libraryManifest(input: {
  project: string;
  profile: string;
  library: {
    assets: Array<{
      id: string;
      kind: AssetEntry["kind"];
      file: string;
      license: string;
      library: string;
    }>;
  };
}): AssetManifest {
  return {
    project: input.project,
    profile: input.profile,
    assets: input.library.assets.map((asset) => ({
      id: asset.id,
      kind: asset.kind,
      library: asset.library,
      files: [{ path: asset.file, format: path.extname(asset.file).slice(1) }],
      license: asset.license,
    })),
    placeholders: [],
    complete: true,
  };
}
