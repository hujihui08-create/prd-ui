import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { zipSync } from "fflate";
import type { HandoffFile } from "@prd-ui/contracts";

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export async function pathExists(target: string): Promise<boolean> {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

export async function copyFileInto(source: string, target: string): Promise<void> {
  await mkdir(path.dirname(target), { recursive: true });
  await copyFile(source, target);
}

/** Copy a directory tree byte-for-byte, preserving relative paths. */
export async function copyDirectory(source: string, target: string): Promise<void> {
  await mkdir(target, { recursive: true });
  const entries = (await readdir(source, { withFileTypes: true })).sort((left, right) =>
    compareStrings(left.name, right.name)
  );
  for (const entry of entries) {
    const from = path.join(source, entry.name);
    const to = path.join(target, entry.name);
    if (entry.isDirectory()) {
      await copyDirectory(from, to);
    } else if (entry.isFile()) {
      await copyFile(from, to);
    }
  }
}

export async function collectFiles(
  root: string,
  exclude: Set<string> = new Set()
): Promise<HandoffFile[]> {
  const files: HandoffFile[] = [];
  const walk = async (dir: string, prefix: string): Promise<void> => {
    const entries = (await readdir(dir, { withFileTypes: true })).sort((left, right) =>
      compareStrings(left.name, right.name)
    );
    for (const entry of entries) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (exclude.has(relative)) continue;
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(absolute, relative);
      } else if (entry.isFile()) {
        const buffer = await readFile(absolute);
        files.push({
          path: relative,
          sha256: `sha256:${createHash("sha256").update(buffer).digest("hex")}`,
          bytes: buffer.length,
        });
      }
    }
  };
  await walk(root, "");
  return files.sort((left, right) => compareStrings(left.path, right.path));
}

/**
 * Zip the whole directory. A fixed 1980-01-01 timestamp avoids per-run drift
 * (fflate otherwise stamps the current time) so repeated packs on one host
 * produce the same archive bytes.
 */
export async function writeHandoffZip(root: string, outFile: string): Promise<HandoffFile> {
  const target = path.resolve(outFile);
  const fixedMtime = Date.UTC(1980, 0, 1);
  const entries: Record<string, Uint8Array> = {};
  const paths: string[] = [];
  const walk = async (dir: string, prefix: string): Promise<void> => {
    const dirents = (await readdir(dir, { withFileTypes: true })).sort((left, right) =>
      compareStrings(left.name, right.name)
    );
    for (const entry of dirents) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      const absolute = path.join(dir, entry.name);
      if (absolute === target) continue;
      if (entry.isDirectory()) await walk(absolute, relative);
      else if (entry.isFile()) paths.push(relative);
    }
  };
  await walk(root, "");
  for (const relative of paths.sort(compareStrings)) {
    entries[relative] = new Uint8Array(await readFile(path.join(root, ...relative.split("/"))));
  }
  const archive = Buffer.from(zipSync(entries, { mtime: fixedMtime }));
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, archive);
  return {
    path: path.basename(outFile),
    sha256: `sha256:${createHash("sha256").update(archive).digest("hex")}`,
    bytes: archive.length,
  };
}
