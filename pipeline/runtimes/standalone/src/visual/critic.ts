import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  AgentUsageSchema,
  type AgentUsage,
  type PageSpec,
} from "@prd-ui/contracts";
import type { VisualFinding } from "@prd-ui/visual-review";

export type VisualCritiqueSeverity = "blocker" | "major" | "minor";

export interface VisualCritiqueFinding {
  id: string;
  severity: VisualCritiqueSeverity;
  pageId: string;
  state: string;
  evidence: string;
  issue: string;
  proposal: string;
}

export interface VisualCritique {
  verdict: "pass" | "changes";
  findings: VisualCritiqueFinding[];
  summary: string;
}

export interface ScriptedCriticFixture {
  output: VisualCritique;
  usage?: AgentUsage;
  usageComplete?: boolean;
}

export interface VisualCriticInput {
  project: string;
  profile: string;
  visualStyle: unknown;
  screenshots: Array<{ caseId: string; path: string }>;
  specs: PageSpec[];
  findings: VisualFinding[];
}

export interface VisualCriticRun {
  findings: VisualFinding[];
  critique?: VisualCritique;
  usage?: AgentUsage;
  costCny: number;
  usageComplete: boolean;
  model?: string;
  error?: string;
}

const CRITIQUE_KEYS = new Set(["verdict", "findings", "summary"]);
const FINDING_KEYS = new Set([
  "id",
  "severity",
  "pageId",
  "state",
  "evidence",
  "issue",
  "proposal",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(
  value: Record<string, unknown>,
  key: string,
  source: string
): string {
  const entry = value[key];
  if (typeof entry !== "string" || entry.length === 0) {
    throw new Error(`VISUAL_CRITIQUE_INVALID: ${source}: ${key} must be a non-empty string`);
  }
  return entry;
}

function rejectUnknownKeys(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  source: string
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new Error(`VISUAL_CRITIQUE_INVALID: ${source}: unknown key ${key}`);
    }
  }
}

/** Strict parser matching the Visual Critic schema from the design. */
export function parseVisualCritique(raw: unknown): VisualCritique {
  const source = "visual critique";
  if (!isRecord(raw)) {
    throw new Error(`VISUAL_CRITIQUE_INVALID: ${source}: expected an object`);
  }
  rejectUnknownKeys(raw, CRITIQUE_KEYS, source);
  const verdict = raw.verdict;
  if (verdict !== "pass" && verdict !== "changes") {
    throw new Error(`VISUAL_CRITIQUE_INVALID: ${source}: invalid verdict`);
  }
  if (!Array.isArray(raw.findings)) {
    throw new Error(`VISUAL_CRITIQUE_INVALID: ${source}: findings must be an array`);
  }
  const findings = raw.findings.map((entry, index) => {
    const findingSource = `${source} finding ${index + 1}`;
    if (!isRecord(entry)) {
      throw new Error(`VISUAL_CRITIQUE_INVALID: ${findingSource}: expected an object`);
    }
    rejectUnknownKeys(entry, FINDING_KEYS, findingSource);
    const severity = entry.severity;
    if (severity !== "blocker" && severity !== "major" && severity !== "minor") {
      throw new Error(`VISUAL_CRITIQUE_INVALID: ${findingSource}: invalid severity`);
    }
    const typedSeverity: VisualCritiqueSeverity = severity;
    return {
      id: requireString(entry, "id", findingSource),
      severity: typedSeverity,
      pageId: requireString(entry, "pageId", findingSource),
      state: requireString(entry, "state", findingSource),
      evidence: requireString(entry, "evidence", findingSource),
      issue: requireString(entry, "issue", findingSource),
      proposal: requireString(entry, "proposal", findingSource),
    };
  });
  return {
    verdict,
    findings,
    summary: requireString(raw, "summary", source),
  };
}

/**
 * Standalone critic fixture. Task 8 owns the real `samples/agents/
 * visual-critic` fixture and the dsh runner; this loader keeps the review CLI
 * testable without a model call.
 */
export async function loadScriptedCriticFixture(
  dir: string
): Promise<ScriptedCriticFixture> {
  const file = path.join(dir, "visual-critic.json");
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`VISUAL_CRITIC_FIXTURE_MISSING: ${file}`);
    }
    throw new Error(`VISUAL_CRITIC_FIXTURE_INVALID: ${file}`);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text) as unknown;
  } catch {
    throw new Error(`VISUAL_CRITIC_FIXTURE_INVALID: ${file}: invalid JSON`);
  }
  if (!isRecord(raw)) {
    throw new Error(`VISUAL_CRITIC_FIXTURE_INVALID: ${file}: expected an object`);
  }
  if (typeof raw.error === "string" && raw.error.length > 0) {
    throw new Error(`VISUAL_CRITIC_FIXTURE_ERROR: ${raw.error}`);
  }
  let usage: AgentUsage | undefined;
  if (raw.usage !== undefined) {
    const parsed = AgentUsageSchema.safeParse(raw.usage);
    if (!parsed.success) {
      throw new Error(`VISUAL_CRITIC_FIXTURE_INVALID: ${file}: ${parsed.error.message}`);
    }
    usage = parsed.data;
  }
  if (raw.usageComplete !== undefined && typeof raw.usageComplete !== "boolean") {
    throw new Error(`VISUAL_CRITIC_FIXTURE_INVALID: ${file}: usageComplete must be boolean`);
  }
  return {
    output: parseVisualCritique(raw.output),
    ...(usage === undefined ? {} : { usage }),
    ...(raw.usageComplete === undefined ? {} : { usageComplete: raw.usageComplete }),
  };
}

export function critiqueToVisualFindings(
  critique: VisualCritique
): VisualFinding[] {
  return critique.findings.map((finding) => ({
    id: finding.id,
    severity: finding.severity,
    code: `VISUAL_CRITIC_${finding.severity.toUpperCase()}`,
    pageId: finding.pageId,
    state: finding.state,
    message: `${finding.issue} Proposal: ${finding.proposal}`,
    evidence: finding.evidence,
  }));
}

export function criticUnavailable(
  message: string,
  model?: string
): VisualCriticRun {
  return {
    findings: [
      {
        id: "VISUAL_CRITIC_UNAVAILABLE",
        severity: "blocker",
        code: "VISUAL_CRITIC_UNAVAILABLE",
        message,
      },
    ],
    costCny: 0,
    usageComplete: false,
    ...(model === undefined ? {} : { model }),
    error: message,
  };
}
