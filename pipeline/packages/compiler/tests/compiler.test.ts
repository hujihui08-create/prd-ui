import { describe, expect, it } from "vitest";
import { PageSpecSchema, UiBriefSchema, type SpecNode } from "@prd-ui/contracts";
import {
  getArchetype,
  getCatalog,
  getProfile,
  isLayoutPrimitive,
} from "@prd-ui/design-system";
import briefJson from "../../../samples/ui-brief.sample.json";
import { compileProject } from "../src/index.js";

const brief = UiBriefSchema.parse(briefJson);
const deps = { getProfile, getCatalog, getArchetype };
const specs = compileProject(brief, deps);
const specsByPageId = new Map(specs.map((spec) => [spec.meta.pageId, spec]));

const rawValuePattern = /(#[0-9a-fA-F]{3,8}\b)|\brgba?\(|\bhsla?\(|\b\d+(\.\d+)?(px|rem|em)\b/;
const rootShells = new Set(["PageShell", "MobileShell"]);

function collectNodes(node: SpecNode, nodes: SpecNode[] = []): SpecNode[] {
  nodes.push(node);
  for (const child of node.children ?? []) collectNodes(child, nodes);
  for (const slotNodes of Object.values(node.slots ?? {})) {
    for (const child of slotNodes) collectNodes(child, nodes);
  }
  return nodes;
}

describe("compileProject", () => {
  it("compiles exactly the eight sample pages", () => {
    expect(specs).toHaveLength(8);
    expect([...specsByPageId.keys()].sort()).toEqual(
      brief.ia.pages.map((page) => page.id).sort()
    );
  });

  it("preserves page metadata", () => {
    for (const page of brief.ia.pages) {
      const spec = specsByPageId.get(page.id);
      expect(spec, page.id).toBeDefined();
      expect(spec!.meta).toMatchObject({
        pageId: page.id,
        project: brief.meta.project,
        name: page.name,
        target: page.target,
        profile: page.profile,
        archetype: page.archetype,
      });
      expect(spec!.meta.reqRefs).toEqual(page.reqRefs);
    }
  });

  it("uses the target-appropriate shell as the root", () => {
    for (const page of brief.ia.pages) {
      const spec = specsByPageId.get(page.id)!;
      expect(spec.layout.type, page.id).toBe(
        page.target === "web" ? "PageShell" : "MobileShell"
      );
    }
  });

  it("emits every required slot with at least one node", () => {
    for (const page of brief.ia.pages) {
      const archetype = getArchetype(page.archetype);
      const spec = specsByPageId.get(page.id)!;
      for (const slot of archetype.requiredSlots) {
        expect(spec.layout.slots?.[slot], `${page.id}.${slot}`).toBeDefined();
        expect(spec.layout.slots?.[slot]?.length, `${page.id}.${slot}`).toBeGreaterThan(0);
      }
    }
  });

  it("only places node types allowed by the root shell slot contracts", () => {
    for (const page of brief.ia.pages) {
      const spec = specsByPageId.get(page.id)!;
      const catalog = getCatalog(page.profile);
      const shell = catalog.components.find((component) => component.id === spec.layout.type);
      expect(shell, `${page.id} root ${spec.layout.type}`).toBeDefined();

      for (const [slot, nodes] of Object.entries(spec.layout.slots ?? {})) {
        const allowed = shell?.slots?.[slot]?.allowed;
        expect(allowed, `${spec.layout.type}.${slot}`).toBeDefined();
        for (const node of nodes) {
          expect(allowed, `${page.id}.${slot} -> ${node.type}`).toContain(node.type);
        }
      }
    }
  });

  it("includes archetype and page required states", () => {
    for (const page of brief.ia.pages) {
      const archetype = getArchetype(page.archetype);
      const spec = specsByPageId.get(page.id)!;
      const expected = new Set([...archetype.requiredStates, ...page.requiredStates]);

      expect(new Set(Object.keys(spec.states))).toEqual(expected);
      for (const [name, state] of Object.entries(spec.states)) {
        expect(state.name).toBe(name);
      }
    }
  });

  it("only emits catalog components that are available", () => {
    for (const page of brief.ia.pages) {
      const spec = specsByPageId.get(page.id)!;
      const catalog = getCatalog(page.profile);
      const components = new Map(catalog.components.map((component) => [component.id, component]));

      for (const node of collectNodes(spec.layout)) {
        if (isLayoutPrimitive(node.type)) continue;
        const component = components.get(node.type);
        expect(component, `${page.id} uses unknown component ${node.type}`).toBeDefined();
        expect(component?.availability, `${page.id} ${node.type}`).toBe("available");
      }
    }
  });

  it("only emits archetype-approved components outside the root shell", () => {
    for (const page of brief.ia.pages) {
      const archetype = getArchetype(page.archetype);
      const spec = specsByPageId.get(page.id)!;

      for (const node of collectNodes(spec.layout)) {
        if (isLayoutPrimitive(node.type) || rootShells.has(node.type)) continue;
        expect(archetype.allowedComponents, `${page.id} uses ${node.type}`).toContain(node.type);
      }
    }
  });

  it("parses with PageSpecSchema", () => {
    for (const spec of specs) {
      expect(() => PageSpecSchema.parse(spec), spec.meta.pageId).not.toThrow();
    }
  });

  it("has at least one requirement reference per spec", () => {
    for (const spec of specs) {
      expect(spec.meta.reqRefs.length, spec.meta.pageId).toBeGreaterThan(0);
      expect(spec.layout.reqRef, spec.meta.pageId).toBe(spec.meta.reqRefs[0]);
      expect(Object.keys(spec.traceability.reqMap).length, spec.meta.pageId).toBeGreaterThan(0);
    }
  });

  it("does not emit raw color or size values in props", () => {
    for (const spec of specs) {
      for (const node of collectNodes(spec.layout)) {
        expect(JSON.stringify(node.props ?? {}), `${spec.meta.pageId} ${node.type}`).not.toMatch(
          rawValuePattern
        );
      }
    }
  });
});
