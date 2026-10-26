export interface HandoffFile {
  path: string;
  sha256: string;
  bytes: number;
}

export interface HandoffGate {
  passed: boolean;
  hash: string;
}

export interface HandoffSignoff {
  type: "figma" | "visual";
  signedBy: string;
  signedAt: string;
  hash: string;
}

export interface HandoffAsset {
  path: string;
  license: string;
}

export interface HandoffInput {
  project: string;
  generatedAt: string;
  pipelineVersion: string;
  profile: string;
  catalog: string;
  pages: string[];
  files: HandoffFile[];
  gates: {
    verify: HandoffGate;
    conformance: HandoffGate;
    parity: HandoffGate;
    figmaSign: HandoffGate;
    visualSign: HandoffGate;
  };
  signoffs: HandoffSignoff[];
  figma: {
    files: Array<{ pageId: string; fileKey: string }>;
    pages: string[];
  };
  assets: HandoffAsset[];
  knownGaps: string[];
  archive?: HandoffFile;
}

export interface HandoffManifest extends Omit<HandoffInput, "assets"> {
  schemaVersion: "1.0";
}

export interface HandoffIssue {
  code:
    | "HANDOFF_GATE_FAILED"
    | "HANDOFF_PAGE_MISSING"
    | "HANDOFF_SIGNOFF_STALE"
    | "HANDOFF_SIGNOFF_MISSING"
    | "HANDOFF_LICENSE_MISSING";
  severity: "blocker" | "warning";
  message: string;
}
