import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { VisualStyleSchema } from "../src/visual-style.js";

const pipelineRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../.."
);

describe("VisualStyleSchema", () => {
  it("accepts the existing m0 style fixture", async () => {
    const raw = JSON.parse(
      await readFile(path.join(pipelineRoot, "samples", "assets", "m0", "style.json"), "utf8")
    ) as unknown;
    expect(VisualStyleSchema.parse(raw)).toMatchObject({ id: "b-mobile-neutral-m0" });
  });

  it("requires an id and rejects unknown keys", () => {
    expect(() => VisualStyleSchema.parse({ name: "missing id" })).toThrow();
    expect(() => VisualStyleSchema.parse({ id: "b-mobile", unexpected: true })).toThrow();
  });
});
