export interface StudioFinding {
  id?: string;
  severity: "blocker" | "major" | "minor" | string;
  code?: string;
  pageId?: string;
  state?: string;
  message: string;
  evidence?: string;
}

export interface StudioAsset {
  id: string;
  kind: string;
  license: string;
  file?: string;
}

export interface StudioPage {
  id: string;
  name: string;
  archetype: string;
  route: string;
  target: string;
  profile: string;
  html: string;
  states: string[];
  views: string[];
  defaultView?: string;
  formModes: string[];
  businessStates: string[];
  reqRefs: string[];
  roles: string[];
  interactions: number;
  nodeCount: number;
}

export interface StudioData {
  schemaVersion: "1.0";
  project: string;
  runId: string;
  generatedAt: string;
  pages: StudioPage[];
  profile: {
    name: string;
    color: Record<string, string>;
    typography: Record<
      string,
      { fontFamily: string; fontSize: number; fontWeight: number; lineHeight: number }
    >;
  };
  catalog: {
    library: string;
    components: Array<{ id: string; availability: string; variants: string[] }>;
  };
  findings: {
    visual: StudioFinding[];
    deterministic: StudioFinding[];
  };
  assets: {
    complete: boolean;
    assets: StudioAsset[];
    placeholders: string[];
  };
  figma: {
    status: "not-built" | "plans-ready" | "manual_required" | "passed" | string;
    planDir?: string;
    diff?: { passed: boolean; blockerCount: number; majorCount: number } | null;
  };
  signoffs: string[];
}
