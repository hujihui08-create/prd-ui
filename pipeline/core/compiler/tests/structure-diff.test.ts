import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { UiBriefSchema, type SpecNode } from "@prd-ui/contracts";
import { getArchetype, getCatalog, getProfile } from "@prd-ui/design-system";
import { compileProject } from "../src/index.js";
import { diffPageStructure } from "../src/structure-diff.js";

const brief = UiBriefSchema.parse(
  JSON.parse(readFileSync("samples/projects/employee-app-phase2/ui-brief.json", "utf8"))
);
const specs = compileProject(brief, { getProfile, getCatalog, getArchetype });
const today = specs.find((spec) => spec.meta.pageId === "today")!;

describe("diffPageStructure", () => {
  it("reports added and removed nodes", () => {
    const after = structuredClone(today);
    after.layout.slots!.content![0]!.children!.push({
      id: "today.new-card",
      type: "Card",
      props: { title: "新卡片" },
      children: [],
    });
    const diff = diffPageStructure(today, after);
    expect(diff.added.some((node) => node.specId === "today.new-card")).toBe(true);
  });

  it("reports a title change", () => {
    const after = structuredClone(today);
    const card = after.layout.slots!.content![0]!.children![0]!;
    card.props = { ...card.props, title: "新标题" };
    const diff = diffPageStructure(today, after);
    expect(
      diff.changed.some(
        (change) => change.specId === card.id && change.property === "title"
      )
    ).toBe(true);
  });

  it("reports a type change", () => {
    const after = structuredClone(today);
    const card = after.layout.slots!.content![0]!.children![0]!;
    card.type = "Section";
    const diff = diffPageStructure(today, after);
    expect(
      diff.changed.some((change) => change.specId === card.id && change.kind === "type")
    ).toBe(true);
  });

  it("records the path of an added node", () => {
    const after = structuredClone(today);
    after.layout.slots!.content![0]!.children!.push({
      id: "today.new-card",
      type: "Card",
      props: { title: "新卡片" },
      children: [],
    });
    const diff = diffPageStructure(today, after);
    expect(diff.added).toEqual([
      { specId: "today.new-card", path: "layout.slots.content[0].children[3]", type: "Card" },
    ]);
    expect(diff.removed).toEqual([]);
  });

  it("reports every node of a removed subtree with its previous path", () => {
    const after = structuredClone(today);
    const section = after.layout.slots!.content![0]!;
    section.children!.splice(0, 1);
    const diff = diffPageStructure(today, after);
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([
      { specId: "today.card.quick-actions", path: "layout.slots.content[0].children[0]", type: "Card" },
      {
        specId: "today.root.content.0.children.0.children.0",
        path: "layout.slots.content[0].children[0].children[0]",
        type: "Row",
      },
      {
        specId: "today.quick.create-order",
        path: "layout.slots.content[0].children[0].children[0].children[0]",
        type: "QuickAction",
      },
      {
        specId: "today.quick.new-appointment",
        path: "layout.slots.content[0].children[0].children[0].children[1]",
        type: "QuickAction",
      },
      {
        specId: "today.quick.customer-search",
        path: "layout.slots.content[0].children[0].children[0].children[2]",
        type: "QuickAction",
      },
    ]);
  });

  it("reports a moved node when its parent changes", () => {
    const after = structuredClone(today);
    const section = after.layout.slots!.content![0]!;
    const [card] = section.children!.splice(0, 1);
    after.layout.slots!.content!.push(card!);
    const diff = diffPageStructure(today, after);
    expect(diff.changed).toEqual(
      expect.arrayContaining([
        {
          specId: card!.id,
          kind: "moved",
          before: section.id,
          after: after.layout.id,
        },
        { specId: card!.id, kind: "slot", before: "children", after: "content" },
      ])
    );
  });

  it("reports a slot change when a node moves under the same parent", () => {
    const after = structuredClone(today);
    const [section] = after.layout.slots!.content!.splice(0, 1);
    after.layout.slots!.footer = [section!];
    const diff = diffPageStructure(today, after);
    expect(diff.changed).toEqual([
      { specId: section!.id, kind: "slot", before: "content", after: "footer" },
    ]);
  });

  it("reports an empty slot added on a matched parent", () => {
    const after = structuredClone(today);
    after.layout.slots!.footer = [];
    const diff = diffPageStructure(today, after);
    expect(diff.changed).toEqual([
      {
        specId: after.layout.id,
        kind: "slot",
        property: "slots",
        before: "bottom-nav,content,top-bar",
        after: "bottom-nav,content,footer,top-bar",
      },
    ]);
  });

  it("throws when the two specs are different pages", () => {
    const other = specs.find((spec) => spec.meta.pageId === "appointment-list")!;
    expect(() => diffPageStructure(today, other)).toThrow(/PAGE_ID_MISMATCH/);
  });

  it("reports an added id-less node with a positional spec id", () => {
    const after = structuredClone(today);
    after.layout.slots!.content![0]!.children!.push({
      type: "Card",
      props: { title: "无 id 卡片" },
      children: [],
    });
    const diff = diffPageStructure(today, after);
    expect(diff.removed).toEqual([]);
    expect(diff.changed).toEqual([]);
    expect(diff.added).toEqual([
      {
        specId: "layout.slots.content[0].children[3]",
        idless: true,
        path: "layout.slots.content[0].children[3]",
        type: "Card",
      },
    ]);
  });

  it("reports a copy change on an id-less node by path", () => {
    const before = structuredClone(today);
    before.layout.slots!.content![0]!.children!.push({
      type: "Text",
      props: { text: "旧文案" },
    });
    const after = structuredClone(before);
    const node = after.layout.slots!.content![0]!.children!.at(-1)!;
    node.props = { ...node.props, text: "新文案" };
    const diff = diffPageStructure(before, after);
    expect(diff.changed).toEqual(
      expect.arrayContaining([
        {
          specId: "layout.slots.content[0].children[3]",
          idless: true,
          kind: "prop",
          property: "text",
          before: "旧文案",
          after: "新文案",
        },
      ])
    );
  });

  it("reports a button label change", () => {
    const after = structuredClone(today);
    const findLabel = (node: SpecNode): SpecNode | undefined => {
      if (typeof node.props?.label === "string") return node;
      for (const child of node.children ?? []) {
        const found = findLabel(child);
        if (found !== undefined) return found;
      }
      for (const nodes of Object.values(node.slots ?? {})) {
        for (const child of nodes) {
          const found = findLabel(child);
          if (found !== undefined) return found;
        }
      }
      return undefined;
    };
    const button = findLabel(after.layout);
    expect(button).toBeDefined();
    button!.props = { ...button!.props, label: "改过的按钮" };
    const diff = diffPageStructure(today, after);
    expect(
      diff.changed.some((change) => change.kind === "prop" && change.property === "label")
    ).toBe(true);
  });

  it("reports a subtitle copy change on a list row", () => {
    const after = structuredClone(today);
    const row = after.layout.slots!.content![0]!.children![1]!.children![0]!;
    expect(typeof row.props?.subtitle).toBe("string");
    row.props = { ...row.props, subtitle: "新的副标题" };
    const diff = diffPageStructure(today, after);
    expect(
      diff.changed.some(
        (change) =>
          change.kind === "prop" &&
          change.property === "subtitle" &&
          change.after === "新的副标题"
      )
    ).toBe(true);
  });

  it("produces empty arrays for an identical spec", () => {
    const diff = diffPageStructure(today, structuredClone(today));
    expect(diff).toEqual({ pageId: "today", added: [], removed: [], changed: [] });
  });
});
