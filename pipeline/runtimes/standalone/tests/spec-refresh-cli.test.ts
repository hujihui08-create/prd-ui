import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { main, parseArgs, SpecRefreshUsageError } from "../src/spec-refresh-cli.js";

const temporaryDirs: string[] = [];
const silent = { stdout: () => undefined, stderr: () => undefined };

afterEach(async () => {
  await Promise.all(
    temporaryDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  );
});

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "prd-ui-spec-refresh-"));
  temporaryDirs.push(dir);
  return dir;
}

const baseArgs = () => [
  "--spec-run", "artifacts/employee-app-phase2/spec-run-v07",
  "--project", "samples/projects/employee-app-phase2/project.yaml",
  "--brief", "samples/projects/employee-app-phase2/ui-brief.json",
];

describe("spec:refresh", () => {
  it("parses required flags and rejects unknown args", () => {
    expect(parseArgs(baseArgs()).specRun).toBe(
      "artifacts/employee-app-phase2/spec-run-v07"
    );
    expect(() => parseArgs(["--nope"])).toThrow(SpecRefreshUsageError);
  });

  it("recompiles layouts and preserves enrichment", async () => {
    const out = path.join(await tempDir(), "refreshed");
    const args = [...baseArgs(), "--out", out, "--json"];
    expect(await main(args, silent)).toBe(0);

    const before = JSON.parse(
      await readFile(
        "artifacts/employee-app-phase2/spec-run-v07/artifacts/page-spec/appointment-detail.json",
        "utf8"
      )
    );
    const after = JSON.parse(
      await readFile(path.join(out, "artifacts/page-spec/appointment-detail.json"), "utf8")
    );
    expect(after.motion).toEqual(before.motion);
    expect(after.interactions).toEqual(before.interactions);
    expect(after.states).toEqual(before.states);
    expect(after.traceability).toEqual(before.traceability);
    expect(JSON.stringify(after.layout)).not.toBe(JSON.stringify(before.layout));

    const provenance = JSON.parse(await readFile(path.join(out, "provenance.json"), "utf8"));
    expect(provenance.pages).toHaveLength(8);
    expect(provenance.briefHash).toBe(
      "sha256:4a70e43ac566c6171713cdf5ce31eb9126a95216ae370d71c548de4ecf31cb47"
    );
  });

  it("refuses to write over the input run", async () => {
    const args = [
      ...baseArgs(),
      "--out", "artifacts/employee-app-phase2/spec-run-v07",
    ];
    const errors: string[] = [];
    expect(
      await main(args, { stdout: () => undefined, stderr: (text) => errors.push(text) })
    ).toBe(1);
    expect(errors.join("")).toContain("SPEC_REFRESH_OUT_EQUALS_INPUT");
  });
});
