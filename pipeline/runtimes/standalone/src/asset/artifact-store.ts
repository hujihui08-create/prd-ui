import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ArtifactStorePort } from "@prd-ui/asset-review";

export class FileArtifactStore implements ArtifactStorePort {
  private readonly root: string;

  constructor(rootDir: string) {
    this.root = path.resolve(rootDir);
  }

  private resolve(relativePath: string): string {
    const absolute = path.resolve(this.root, relativePath);
    if (absolute !== this.root && !absolute.startsWith(`${this.root}${path.sep}`)) {
      throw new Error(`artifact path escapes run directory: ${relativePath}`);
    }
    return absolute;
  }

  async writeText(relativePath: string, value: string): Promise<void> {
    const absolute = this.resolve(relativePath);
    await mkdir(path.dirname(absolute), { recursive: true });
    const temporary = `${absolute}.tmp-${process.pid}-${Date.now()}`;
    await writeFile(temporary, value, "utf8");
    await rename(temporary, absolute);
  }

  async writeJson(relativePath: string, value: unknown): Promise<void> {
    await this.writeText(relativePath, `${JSON.stringify(value, null, 2)}\n`);
  }

  async readText(relativePath: string): Promise<string> {
    return readFile(this.resolve(relativePath), "utf8");
  }

  async hash(relativePath: string): Promise<string> {
    const buffer = await readFile(this.resolve(relativePath));
    return `sha256:${createHash("sha256").update(buffer).digest("hex")}`;
  }
}
