import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

export interface PngDiffResult {
  diffPixels: number;
  totalPixels: number;
  width: number;
  height: number;
}

/**
 * Pixel-compare two PNGs with pixelmatch and write the visual diff to
 * `outPath`. Different dimensions fail closed: a size change is a regression,
 * not a comparable image.
 */
export async function diffPng(
  aPath: string,
  bPath: string,
  outPath: string
): Promise<PngDiffResult> {
  const a = PNG.sync.read(await readFile(aPath));
  const b = PNG.sync.read(await readFile(bPath));
  if (a.width !== b.width || a.height !== b.height) {
    throw new Error(
      `PNG_SIZE_MISMATCH: ${path.basename(aPath)} ${a.width}x${a.height} vs ` +
        `${path.basename(bPath)} ${b.width}x${b.height}`
    );
  }
  if (a.width === 0 || a.height === 0) {
    throw new Error(`PNG_EMPTY: ${path.basename(aPath)} has no pixels`);
  }

  const diff = new PNG({ width: a.width, height: a.height });
  const diffPixels = pixelmatch(
    a.data,
    b.data,
    diff.data,
    a.width,
    a.height,
    { threshold: 0.1 }
  );
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, PNG.sync.write(diff));
  return {
    diffPixels,
    totalPixels: a.width * a.height,
    width: a.width,
    height: a.height,
  };
}
