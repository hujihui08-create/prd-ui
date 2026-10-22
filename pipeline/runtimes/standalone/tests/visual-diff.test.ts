import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { PNG } from "pngjs";
import { diffPng } from "../src/visual/diff.js";

const temporaryDirs: string[] = [];

afterAll(async () => {
  await Promise.all(
    temporaryDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  );
});

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "prd-ui-visual-diff-"));
  temporaryDirs.push(dir);
  return dir;
}

type Rgba = [number, number, number, number];

function pngBuffer(width: number, height: number, pixels?: Rgba[]): Buffer {
  const png = new PNG({ width, height });
  for (let index = 0; index < width * height; index += 1) {
    const pixel = pixels?.[index] ?? [0, 0, 0, 255];
    png.data[index * 4] = pixel[0];
    png.data[index * 4 + 1] = pixel[1];
    png.data[index * 4 + 2] = pixel[2];
    png.data[index * 4 + 3] = pixel[3];
  }
  return PNG.sync.write(png);
}

describe("diffPng", () => {
  it("computes diff pixels and writes a diff png", async () => {
    const dir = await tempDir();
    const equalPng = path.join(dir, "equal.png");
    const out = path.join(dir, "out", "diff.png");
    const buffer = pngBuffer(2, 2);
    await writeFile(equalPng, buffer);

    const result = await diffPng(equalPng, equalPng, out);

    expect(result.diffPixels).toBe(0);
    expect(result.totalPixels).toBe(4);
    const written = PNG.sync.read(await readFile(out));
    expect(written.width).toBe(2);
    expect(written.height).toBe(2);
  });

  it("reports changed pixels", async () => {
    const dir = await tempDir();
    const left = path.join(dir, "left.png");
    const right = path.join(dir, "right.png");
    await writeFile(left, pngBuffer(2, 2));
    await writeFile(
      right,
      pngBuffer(2, 2, [
        [255, 255, 255, 255],
        [0, 0, 0, 255],
        [0, 0, 0, 255],
        [0, 0, 0, 255],
      ])
    );

    const result = await diffPng(left, right, path.join(dir, "diff.png"));

    expect(result.diffPixels).toBeGreaterThan(0);
    expect(result.totalPixels).toBe(4);
  });

  it("fails closed when the screenshots have different dimensions", async () => {
    const dir = await tempDir();
    const left = path.join(dir, "left.png");
    const right = path.join(dir, "right.png");
    await writeFile(left, pngBuffer(2, 2));
    await writeFile(right, pngBuffer(3, 3));

    await expect(diffPng(left, right, path.join(dir, "diff.png"))).rejects.toThrow(
      /PNG_SIZE_MISMATCH/
    );
  });
});
