import { describe, expect, it } from "vitest";
import { CatalogSchema, ProfileSchema, type Catalog } from "@prd-ui/contracts";
import {
  archetypes,
  bDenseCatalog,
  bDenseProfile,
  cExpressiveCatalog,
  cExpressiveProfile,
  getArchetype,
  getCatalog,
  getProfile,
} from "../src/index.js";

const libraryNames = ["b-dense", "c-expressive"] as const;

const requiredCatalogComponents: Record<(typeof libraryNames)[number], string[]> = {
  "b-dense": [
    "PageShell",
    "Sidebar",
    "Header",
    "Section",
    "FilterBar",
    "DataTable",
    "Pagination",
    "Button",
    "Input",
    "Select",
    "FormField",
    "Card",
    "Stat",
    "List",
    "ListItem",
    "Badge",
    "EmptyState",
    "Skeleton",
    "ErrorState",
    "Modal",
  ],
  "c-expressive": [
    "MobileShell",
    "TopBar",
    "BottomNav",
    "FeedCard",
    "Image",
    "Card",
    "Button",
    "IconButton",
    "Input",
    "FormField",
    "Avatar",
    "Badge",
    "List",
    "ListItem",
    "Tabs",
    "SearchBar",
    "EmptyState",
    "Skeleton",
    "ErrorState",
    "StepIndicator",
  ],
};

const minimumProps: Record<(typeof libraryNames)[number], Record<string, Record<string, string>>> = {
  "b-dense": {
    PageShell: { title: "string", nav: "string[]" },
    Section: { padding: "string", gap: "string" },
    FilterBar: { fields: "string[]", action: "string" },
    DataTable: { columns: "string[]", pageSize: "number" },
    Pagination: { pageSize: "number" },
    Button: { label: "string", emphasis: "enum", size: "enum", disabled: "boolean", loading: "boolean" },
    Card: { title: "string" },
    Stat: { label: "string", value: "string" },
    FormField: { label: "string", required: "boolean", readOnly: "boolean" },
    Input: { name: "string", placeholder: "string", inputType: "enum" },
    Select: { options: "string[]" },
    List: { items: "number" },
  },
  "c-expressive": {
    MobileShell: { title: "string", tabs: "string[]" },
    FeedCard: { title: "string", body: "string" },
    BottomNav: { items: "string[]" },
    Image: { assetRef: "string", ratio: "string" },
    StepIndicator: { steps: "number" },
    Button: { label: "string", emphasis: "enum", size: "enum" },
    FormField: { label: "string", required: "boolean", readOnly: "boolean" },
    Input: { name: "string", placeholder: "string", inputType: "enum" },
    Card: { title: "string" },
    List: { items: "number" },
  },
};

const templateComponents: Record<string, string[]> = {
  overview: ["Section", "Stat", "Card", "List"],
  list: ["Section", "FilterBar", "DataTable", "Pagination"],
  detail: ["Section", "Card", "List", "FormField", "Button"],
  form: ["Section", "FormField", "Input", "Button"],
  settings: ["Section", "Card", "FormField", "Select", "Button"],
  feed: ["FeedCard", "BottomNav"],
  auth: ["FormField", "Input", "Button"],
  onboarding: ["Image", "Button"],
};

const expectedSlots: Record<string, string[]> = {
  overview: ["content"],
  list: ["content"],
  detail: ["summary", "fields", "actions"],
  form: ["fields", "actions"],
  settings: ["groups", "actions"],
  feed: ["feed", "bottom-nav"],
  auth: ["title", "fields", "actions"],
  onboarding: ["illustration", "title", "body", "actions"],
};

const expectedStates: Record<string, string[]> = {
  overview: ["default", "loading", "error"],
  list: ["default", "empty", "loading", "error"],
  detail: ["default", "loading", "error"],
  form: ["default", "loading", "error", "disabled"],
  settings: ["default", "loading", "error"],
  feed: ["default", "empty", "loading", "error"],
  auth: ["default", "loading", "error", "disabled"],
  onboarding: ["default", "loading", "error"],
};

const layoutPrimitives = ["Text", "Grid", "Row", "Stack", "Icon"];

function component(catalog: Catalog, id: string) {
  const found = catalog.components.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`missing component ${id} in ${catalog.meta.library}`);
  return found;
}

describe("design-system baselines", () => {
  it("provides two profiles and catalogs", () => {
    expect(getProfile("b-dense").meta.name).toBe("b-dense");
    expect(getProfile("c-expressive").meta.name).toBe("c-expressive");
    expect(getCatalog("b-dense").components.length).toBeGreaterThanOrEqual(12);
    expect(getCatalog("c-expressive").components.length).toBeGreaterThanOrEqual(12);
  });

  it("conforms to the profile contract", () => {
    for (const [name, profile] of [
      ["b-dense", bDenseProfile],
      ["c-expressive", cExpressiveProfile],
    ] as const) {
      expect(ProfileSchema.safeParse(profile).success, name).toBe(true);
      expect(profile.meta.name).toBe(name);
      expect(profile.meta.origin).toBe("baseline");
    }
    expect(bDenseProfile.color["action.primary"]).toBe("#030213");
    expect(cExpressiveProfile.color["action.primary"]).toBe("#FF5A5F");
  });

  it("conforms to the catalog contract", () => {
    for (const catalog of [bDenseCatalog, cExpressiveCatalog]) {
      expect(CatalogSchema.safeParse(catalog).success, catalog.meta.library).toBe(true);
      for (const contract of catalog.components) {
        expect(contract.library).toBe(catalog.meta.library);
        expect(contract.source).toBe("baseline");
        expect(contract.version).toBe(catalog.meta.version);
      }
    }
  });

  it("includes the required baseline components", () => {
    for (const library of libraryNames) {
      const catalog = getCatalog(library);
      const ids = catalog.components.map((contract) => contract.id);
      for (const id of requiredCatalogComponents[library]) {
        expect(ids, `${library} missing ${id}`).toContain(id);
      }
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("declares the props and slots used by the compiler templates", () => {
    for (const library of libraryNames) {
      const catalog = getCatalog(library);
      for (const [componentId, props] of Object.entries(minimumProps[library])) {
        const contract = component(catalog, componentId);
        for (const [prop, type] of Object.entries(props)) {
          expect(contract.props[prop]?.type, `${componentId}.${prop}`).toBe(type);
        }
      }
    }

    const button = component(bDenseCatalog, "Button");
    expect(button.props.label?.required).toBe(true);
    expect(button.props.emphasis?.enum).toEqual(["primary", "secondary", "ghost", "danger"]);
    expect(button.props.size?.enum).toEqual(["sm", "md", "lg"]);
    expect(component(bDenseCatalog, "Input").props.inputType?.enum).toEqual(["text", "email", "password"]);
    expect(component(cExpressiveCatalog, "Input").props.inputType?.enum).toEqual(["text", "email", "password"]);

    const pageShell = component(bDenseCatalog, "PageShell");
    expect(Object.keys(pageShell.slots ?? {}).sort()).toEqual(["actions", "content", "fields", "groups", "summary"]);
    for (const slot of ["content", "summary", "fields", "actions", "groups"]) {
      expect(pageShell.slots?.[slot], `PageShell.${slot}`).toBeDefined();
    }
    expect(pageShell.slots?.actions?.allowed).toContain("Section");
    expect(pageShell.slots?.groups?.allowed).toEqual(
      expect.arrayContaining(["Section", "Card", "FormField", "Input", "Select", "Button", "List", "ListItem", "Text"])
    );

    const mobileShell = component(cExpressiveCatalog, "MobileShell");
    expect(Object.keys(mobileShell.slots ?? {}).sort()).toEqual([
      "actions",
      "body",
      "bottom-nav",
      "feed",
      "fields",
      "illustration",
      "summary",
      "title",
    ]);
    for (const slot of ["feed", "bottom-nav", "summary", "title", "fields", "actions", "illustration", "body"]) {
      expect(mobileShell.slots?.[slot], `MobileShell.${slot}`).toBeDefined();
    }
    expect(mobileShell.slots?.summary?.allowed).toEqual([
      "Card",
      "List",
      "ListItem",
      "Badge",
      "Stack",
      "Row",
      "Text",
    ]);
    expect(mobileShell.slots?.fields?.allowed).not.toContain("Select");
  });

  it("has eight archetypes", () => {
    expect(archetypes).toHaveLength(8);
    expect(archetypes.map((archetype) => archetype.id).sort()).toEqual([
      "auth",
      "detail",
      "feed",
      "form",
      "list",
      "onboarding",
      "overview",
      "settings",
    ]);
  });

  it("declares the expected target and required slots for each archetype", () => {
    const expectedTargets: Record<string, string> = {
      overview: "web",
      list: "web",
      detail: "any",
      form: "web",
      settings: "web",
      feed: "mobile",
      auth: "mobile",
      onboarding: "mobile",
    };
    for (const archetype of archetypes) {
      expect(archetype.target, archetype.id).toBe(expectedTargets[archetype.id]);
      expect(archetype.requiredSlots, archetype.id).toEqual(expectedSlots[archetype.id]);
      expect(archetype.requiredStates, archetype.id).toEqual(expectedStates[archetype.id]);
    }
  });

  it("every allowed component exists in its catalog", () => {
    for (const archetype of archetypes) {
      // `detail` is target "any", so it is valid for either catalog; check the
      // union. Web/mobile archetypes are checked against their own catalog.
      const candidateCatalogs =
        archetype.target === "web"
          ? [bDenseCatalog]
          : archetype.target === "mobile"
            ? [cExpressiveCatalog]
            : [bDenseCatalog, cExpressiveCatalog];

      for (const componentId of archetype.allowedComponents) {
        const exists = candidateCatalogs.some((catalog) =>
          catalog.components.some((contract) => contract.id === componentId)
        );
        expect(exists, `${archetype.id} allows unknown component ${componentId}`).toBe(true);
      }
    }
  });

  it("every archetype allows the components used by its compiler template", () => {
    for (const archetype of archetypes) {
      const used = templateComponents[archetype.id] ?? [];
      expect(archetype.allowedComponents, archetype.id).toEqual(expect.arrayContaining(used));
    }
  });

  it("keeps primitives and root shells out of catalogs and allowedComponents", () => {
    // Text/Grid/Row/Stack/Icon are layout primitives, not catalog components.
    // PageShell/MobileShell are root shells validated separately by the
    // layout validator, so they are not in allowedComponents either.
    const rootShells = ["PageShell", "MobileShell"];

    for (const catalog of [bDenseCatalog, cExpressiveCatalog]) {
      const ids = catalog.components.map((contract) => contract.id);
      for (const primitive of layoutPrimitives) {
        expect(ids, `${catalog.meta.library} must not catalog ${primitive}`).not.toContain(primitive);
      }
    }

    for (const archetype of archetypes) {
      for (const excluded of [...layoutPrimitives, ...rootShells]) {
        expect(archetype.allowedComponents, `${archetype.id} allows ${excluded}`).not.toContain(excluded);
      }
    }
  });

  it("keeps primitives in slot allow-lists instead of the catalog", () => {
    const pageShell = component(bDenseCatalog, "PageShell");
    expect(pageShell.slots?.content?.allowed).toEqual(expect.arrayContaining(["Text", "Grid", "Stack"]));

    const mobileShell = component(cExpressiveCatalog, "MobileShell");
    expect(mobileShell.slots?.title?.allowed).toContain("Text");
    expect(mobileShell.slots?.["bottom-nav"]?.allowed).toEqual(["BottomNav"]);
  });

  it("every component is available", () => {
    for (const catalog of [bDenseCatalog, cExpressiveCatalog]) {
      for (const contract of catalog.components) {
        expect(contract.availability).toBe("available");
      }
    }
  });

  it("gets an archetype by id", () => {
    expect(getArchetype("list").requiredSlots).toContain("content");
  });

  it("throws for unknown baseline names", () => {
    expect(() => getProfile("unknown")).toThrow("Unknown profile: unknown");
    expect(() => getCatalog("unknown")).toThrow("Unknown catalog: unknown");
    expect(() => getArchetype("unknown")).toThrow("Unknown archetype: unknown");
  });
});
