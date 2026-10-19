import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  SourceTierBySource,
  type AssetCandidate,
} from "@prd-ui/asset-review";
import type {
  ArtifactStorePort,
  AssetProducerInput,
  AssetProducerPort,
} from "@prd-ui/asset-review";

const LibraryAssetSchema = z
  .object({
    id: z.string().min(1),
    kind: z.enum(["icon", "illustration", "poster"]),
    file: z.string().min(1),
    license: z.string().min(1),
    library: z.string().min(1).optional(),
    style: z.string().min(1).optional(),
  })
  .strict();

export const LibraryIndexSchema = z
  .object({
    assets: z.array(LibraryAssetSchema).min(1),
  })
  .strict();
export type LibraryIndex = z.infer<typeof LibraryIndexSchema>;

export async function loadLibraryIndex(libraryDir: string): Promise<LibraryIndex> {
  const raw = await readFile(path.join(libraryDir, "index.json"), "utf8");
  return LibraryIndexSchema.parse(JSON.parse(raw) as unknown);
}

function formatOf(file: string): string {
  const extension = path.extname(file).toLowerCase();
  if (extension === ".svg") return "svg";
  if (extension === ".png") return "png";
  if (extension === ".jpg" || extension === ".jpeg") return "jpg";
  return extension.replace(/^\./, "") || "raw";
}

export interface LibrarySourceOptions {
  libraryDir: string;
  index: LibraryIndex;
  store: ArtifactStorePort;
}

/**
 * M0 A-library adapter. It reads only the local fixture index; B/C adapters
 * return SOURCE_NOT_CONFIGURED until their real integrations land.
 */
export class LibrarySourceAdapter implements AssetProducerPort {
  constructor(private readonly options: LibrarySourceOptions) {}

  async produce(input: AssetProducerInput): Promise<AssetCandidate> {
    if (input.source !== "library") {
      throw new Error(`SOURCE_NOT_CONFIGURED: ${input.source}`);
    }

    const entry = this.options.index.assets.find((asset) => asset.id === input.brief.id);
    if (!entry) {
      throw new Error(`LIBRARY_MISSING: ${input.brief.id}`);
    }
    if (entry.kind !== input.brief.kind) {
      throw new Error(
        `LIBRARY_KIND_MISMATCH: ${input.brief.id} is ${entry.kind}, brief wants ${input.brief.kind}`
      );
    }

    const format = formatOf(entry.file);
    if (format !== input.brief.format) {
      throw new Error(
        `LIBRARY_FORMAT_MISMATCH: ${input.brief.id} is ${format}, brief wants ${input.brief.format}`
      );
    }

    const sourcePath = path.join(this.options.libraryDir, entry.file);
    const content = await readFile(sourcePath, "utf8");
    const destination = `assets/attempts/${input.brief.id}/${input.source}-${input.attempt}/candidate.${format}`;
    await this.options.store.writeText(destination, content);
    const hash = await this.options.store.hash(destination);

    return {
      assetId: input.brief.id,
      source: input.source,
      sourceTier: SourceTierBySource[input.source],
      attempt: input.attempt,
      file: { path: destination, format, hash },
      producer: {
        tool: "library",
        ...(entry.library === undefined ? {} : { model: entry.library }),
        references: [entry.file],
      },
      license: entry.license,
      costUsd: 0,
      producedAt: new Date().toISOString(),
    };
  }
}
