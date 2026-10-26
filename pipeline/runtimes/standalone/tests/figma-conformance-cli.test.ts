import { describe, expect, it } from "vitest";
import { parseArgs } from "../src/figma-conformance-cli.js";

describe("figma:conformance args", () => {
  it("parses the required paths", () => {
    const options = parseArgs([
      "--spec-run", "/tmp/spec",
      "--html", "/tmp/html",
      "--plans", "/tmp/plans",
      "--out", "/tmp/out",
    ]);
    expect(options.specRun).toBe("/tmp/spec");
    expect(options.html).toBe("/tmp/html");
    expect(options.plans).toBe("/tmp/plans");
    expect(options.out).toBe("/tmp/out");
  });

  it("rejects an unknown flag", () => {
    expect(() => parseArgs(["--nope"])).toThrow(/unknown argument/);
  });
});
