import { createHash, randomUUID } from "node:crypto";
import { access, appendFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AgentArtifactStorePort } from "@prd-ui/agents";
import type { ArtifactStorePort } from "@prd-ui/asset-review";

export class FileArtifactStore implements ArtifactStorePort, AgentArtifactStorePort {
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
    const temporary = `${absolute}.tmp-${process.pid}-${randomUUID()}`;
    await writeFile(temporary, value, "utf8");
    await rename(temporary, absolute);
  }

  async writeJson(relativePath: string, value: unknown): Promise<void> {
    await this.writeText(relativePath, `${JSON.stringify(value, null, 2)}\n`);
  }

  async appendText(relativePath: string, value: string): Promise<void> {
    const absolute = this.resolve(relativePath);
    await mkdir(path.dirname(absolute), { recursive: true });
    await appendFile(absolute, value, "utf8");
  }

  async readText(relativePath: string): Promise<string> {
    return readFile(this.resolve(relativePath), "utf8");
  }

  async exists(relativePath: string): Promise<boolean> {
    try {
      await access(this.resolve(relativePath));
      return true;
    } catch {
      return false;
    }
  }

  async hash(relativePath: string): Promise<string> {
    const buffer = await readFile(this.resolve(relativePath));
    return `sha256:${createHash("sha256").update(buffer).digest("hex")}`;
  }
}
