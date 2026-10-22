import { describe, expect, it } from "vitest";
import { buildUiBrieferPrompt } from "@prd-ui/agents";
import { iaOutput, prdText, review } from "./fixtures.js";

const prompt = buildUiBrieferPrompt({
  prdText,
  project: {
    project: "demo-orders",
    platforms: ["web", "mobile"],
    profile: "b-dense",
  },
  prdReview: review,
  iaMap: iaOutput.map,
  supportedProfiles: ["b-dense", "b-mobile", "c-expressive"],
});

describe("UI briefer prompt", () => {
  it("requires a label for every page field", () => {
    expect(prompt).toContain("## Mock data and labels");
    expect(prompt).toContain("fieldLabels");
    expect(prompt).toContain("human-readable fieldLabels entry");
  });

  it("requires mock data by page archetype", () => {
    expect(prompt).toContain("mockData.values");
    expect(prompt).toContain("mockData.rows");
    expect(prompt).toContain("mockData.listItems");
    expect(prompt).toContain("feedItems");
  });

  it("requires home content and per-project notice blocks", () => {
    expect(prompt).toContain("home pages");
    expect(prompt).toContain("quickActions");
    expect(prompt).toContain("appointments");
    expect(prompt).toContain("callbacks");
    expect(prompt).toContain("noticeBlocks");
    expect(prompt).toContain("`fields` must be empty");
  });

  it("requires interaction metadata for stateful pages", () => {
    expect(prompt).toContain("businessStates");
    expect(prompt).toContain("formModes");
    expect(prompt).toContain("views");
    expect(prompt).toContain("searchIdleTitle");
    expect(prompt).toContain("must be a subset of page.actions");
  });

  it("forbids host actions and home fields", () => {
    expect(prompt).toContain("Never emit host actions");
    expect(prompt).toContain("前往客户 Tab");
  });

  it("requires illustrative, PII-free example data", () => {
    expect(prompt).toContain("illustrative");
    expect(prompt).toContain("PII");
  });
});
