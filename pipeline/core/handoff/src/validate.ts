import type { HandoffInput, HandoffIssue } from "@prd-ui/contracts";

export function validateHandoff(input: HandoffInput): HandoffIssue[] {
  const issues: HandoffIssue[] = [];
  for (const [name, gate] of Object.entries(input.gates)) {
    if (!gate.passed) {
      issues.push({ code: "HANDOFF_GATE_FAILED", severity: "blocker", message: `${name} gate did not pass.` });
    }
  }
  for (const page of input.pages) {
    const hasHtml = input.files.some((file) => file.path === `html/${page}.html`);
    const hasSpec = input.files.some((file) => file.path === `spec/page-spec/${page}.json`);
    if (!hasHtml || !hasSpec) {
      issues.push({ code: "HANDOFF_PAGE_MISSING", severity: "blocker", message: `${page} is missing html or spec.` });
    }
  }
  for (const signoff of input.signoffs) {
    const gate = signoff.type === "figma" ? input.gates.figmaSign : input.gates.visualSign;
    if (signoff.hash !== gate.hash) {
      issues.push({ code: "HANDOFF_SIGNOFF_STALE", severity: "blocker", message: `${signoff.type} signoff hash is stale.` });
    }
  }
  for (const asset of input.assets) {
    if (asset.license.trim().length === 0) {
      issues.push({ code: "HANDOFF_LICENSE_MISSING", severity: "blocker", message: `${asset.path} has no license record.` });
    }
  }
  return issues;
}
