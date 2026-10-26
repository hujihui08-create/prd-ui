import { describe, expect, it } from "vitest";
import type { PageSpec } from "@prd-ui/contracts";
import { diffRuns } from "../src/structure-diff-cli.js";

function page(pageId: string, project = "fixture"): PageSpec {
  return {
    meta: {
      pageId,
      project,
      name: pageId,
      target: "mobile",
      profile: "b-mobile",
      archetype: "home",
      purpose: "fixture",
      route: `/${pageId}`,
      roles: ["store_manager"],
      reqRefs: ["REQ-APPT-001"],
      version: "0.1.0",
    },
    layout: {
      type: "MobileShell",
      id: `${pageId}.page.root`,
      slots: {
        content: [
          { id: `${pageId}.card`, type: "Card", props: { title: "Card" }, children: [] },
        ],
      },
    },
    states: { default: { name: "default" } },
    interactions: [],
    traceability: { reqMap: {}, designDefaults: [], unmapped: [] },
  } as PageSpec;
}

describe("structure:diff runs", () => {
  it("produces empty pages for the same run twice", () => {
    expect(diffRuns([page("today")], [page("today")])).toEqual([
      { pageId: "today", added: [], removed: [], changed: [] },
    ]);
  });

  it("rejects runs from different projects", () => {
    expect(() => diffRuns([page("today", "alpha")], [page("today", "beta")])).toThrow(
      /PROJECT_MISMATCH: before alpha, after beta/
    );
  });

  it("filters to one page with --page", () => {
    const diff = diffRuns([page("today"), page("list")], [page("today"), page("list")], "list");
    expect(diff.map((entry) => entry.pageId)).toEqual(["list"]);
  });

  it("reports a page present in only one run as all added", () => {
    const diff = diffRuns([page("today")], [page("today"), page("list")]);
    const list = diff.find((entry) => entry.pageId === "list")!;
    expect(list.removed).toEqual([]);
    // The empty shell keeps the page's own id/type, so only its content is new.
    expect(list.added.map((node) => node.specId)).toEqual(["list.card"]);
  });

  it("reports a page removed from the after run as all removed", () => {
    const diff = diffRuns([page("today"), page("list")], [page("today")]);
    const list = diff.find((entry) => entry.pageId === "list")!;
    expect(list.added).toEqual([]);
    expect(list.removed.map((node) => node.specId)).toEqual(["list.card"]);
  });
});
