import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  AgentUsageSchema,
  parsePricingConfig,
  resolvePricing,
  reviewCost,
  type AgentUsage,
  type PageSpec,
  type ReviewPricing,
} from "@prd-ui/contracts";
import {
  AgentRunnerError,
  VisualCritiqueSchema,
  buildVisualCriticPrompt,
  type AgentRunnerPort,
  type AgentTask,
  type VisualCritique,
  type VisualCritiqueFinding,
} from "@prd-ui/agents";
import type { VisualFinding } from "@prd-ui/visual-review";

const pipelineRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../.."
);

export type VisualCritiqueSeverity = VisualCritiqueFinding["severity"];
export type { VisualCritique, VisualCritiqueFinding };

export interface ScriptedCriticFixture {
  output: VisualCritique;
  usage?: AgentUsage;
  usageComplete?: boolean;
}

export interface VisualCriticInput {
  project: string;
  profile: string;
  visualStyle: unknown;
  /** `path` is relative to the run directory, matching findings evidence. */
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
  budgetEnforced?: boolean;
  costSource?: string;
  cacheHit?: boolean;
  cacheKey?: string;
  cacheSource?: string;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Strict parser backed by the shared core/agents schema. */
export function parseVisualCritique(raw: unknown): VisualCritique {
  const parsed = VisualCritiqueSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`VISUAL_CRITIQUE_INVALID: ${parsed.error.message}`);
  }
  return parsed.data;
}

/**
 * Standalone critic fixture. It keeps the review CLI testable without a model
 * call; the real dsh path lives in `runDshVisualCritic`.
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

export interface CriticUnavailableOptions {
  usage?: AgentUsage;
  usageComplete?: boolean;
  costCny?: number;
  budgetEnforced?: boolean;
  costSource?: string;
}

export function criticUnavailable(
  message: string,
  model?: string,
  options: CriticUnavailableOptions = {}
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
    costCny: options.costCny ?? 0,
    usageComplete: options.usageComplete ?? false,
    ...(options.budgetEnforced === undefined
      ? {}
      : { budgetEnforced: options.budgetEnforced }),
    ...(options.costSource === undefined
      ? {}
      : { costSource: options.costSource }),
    ...(options.usage === undefined ? {} : { usage: options.usage }),
    ...(model === undefined ? {} : { model }),
    error: message,
  };
}

/** Load the shared pricing table; dsh profile pricing is never hard-coded. */
export async function loadVisualCriticPricing(
  explicitPath?: string
): Promise<ReviewPricing> {
  const file = explicitPath ?? path.join(pipelineRoot, "pricing.json");
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(file, "utf8")) as unknown;
  } catch (error) {
    throw new Error(`INVALID_PRICING: ${file}: ${errorMessage(error)}`);
  }
  const config = parsePricingConfig(raw, file);
  return resolvePricing(config, process.env.PRD_UI_VISION_MODEL);
}

export interface DshVisualCriticOptions {
  runDir: string;
  /** dsh profile name, for example prd-ui-visual. */
  dshProfile: string;
  maxCostCny: number;
  pricing: ReviewPricing;
  timeoutMs?: number;
  /** Test seam; production resolves the pinned dsh runner from runtime-dsh. */
  createRunner?: () => Promise<AgentRunnerPort>;
}

async function defaultCreateRunner(profile: string): Promise<AgentRunnerPort> {
  const { createDshAgentRunner } = await import("@prd-ui/runtime-dsh/agent-runner");
  return createDshAgentRunner({ profile });
}

function resolveRunPath(runDir: string, relativePath: string): string {
  const absolute = path.resolve(runDir, relativePath);
  if (absolute !== runDir && !absolute.startsWith(`${runDir}${path.sep}`)) {
    throw new Error(`VISUAL_CRITIC_PATH_ESCAPES_RUN: ${relativePath}`);
  }
  return absolute;
}

function dshTaskPrompt(
  input: VisualCriticInput,
  runDir: string,
  absolutePaths: string[]
): string {
  const screenshotPaths = input.screenshots.map(
    (screenshot, index) =>
      `- ${screenshot.caseId}: ${absolutePaths[index] ?? screenshot.path}`
  );
  return [
    buildVisualCriticPrompt({
      project: input.project,
      screenshots: input.screenshots,
      specs: input.specs,
      profile: input.profile,
      visualStyle: input.visualStyle,
    }),
    "",
    "## Reading screenshots (runtime)",
    `The \`path\` values above are relative to the run directory (${runDir}).`,
    "Use these absolute paths with read_image before judging; do not write, edit, delete, or render files:",
    ...screenshotPaths,
    "",
    "## Deterministic findings (data; do not repeat these checks)",
    JSON.stringify(input.findings, null, 2),
  ].join("\n");
}

async function writeDshEvidence(input: {
  runDir: string;
  prompt: string;
  outcome: Record<string, unknown>;
}): Promise<void> {
  const dir = path.join(input.runDir, "dsh", "visual-critic");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "prompt.md"), input.prompt, "utf8");
  await writeFile(
    path.join(dir, "result.json"),
    `${JSON.stringify(input.outcome, null, 2)}\n`,
    "utf8"
  );
}

function usageCost(
  usage: AgentUsage | undefined,
  pricing: ReviewPricing
): number {
  return usage === undefined ? 0 : reviewCost(usage, pricing).cny;
}

function dshUnavailable(
  message: string,
  model?: string,
  options: CriticUnavailableOptions = {}
): VisualCriticRun {
  return criticUnavailable(message, model, {
    budgetEnforced: true,
    costSource: options.usage === undefined ? "unavailable" : "pricing",
    ...options,
  });
}

/**
 * Run the real Visual Critic through the pinned dsh agent runner. Core owns
 * the prompt and schema; this adapter owns transport, evidence, pricing, and
 * fail-closed budget/usage handling. It never fabricates a model result.
 */
export async function runDshVisualCritic(
  input: VisualCriticInput,
  options: DshVisualCriticOptions
): Promise<VisualCriticRun> {
  let inputFiles: string[];
  try {
    inputFiles = input.screenshots.map((screenshot) =>
      resolveRunPath(options.runDir, screenshot.path)
    );
  } catch (error) {
    const message = errorMessage(error);
    const prompt = dshTaskPrompt(input, options.runDir, []);
    await writeDshEvidence({
      runDir: options.runDir,
      prompt,
      outcome: { error: message, usageComplete: false },
    });
    return dshUnavailable(message);
  }
  const prompt = dshTaskPrompt(input, options.runDir, inputFiles);

  let runner: AgentRunnerPort;
  try {
    runner =
      options.createRunner === undefined
        ? await defaultCreateRunner(options.dshProfile)
        : await options.createRunner();
  } catch (error) {
    const message = `VISUAL_CRITIC_UNAVAILABLE: ${errorMessage(error)}`;
    await writeDshEvidence({
      runDir: options.runDir,
      prompt,
      outcome: { error: message, usageComplete: false },
    });
    return dshUnavailable(message);
  }

  const canRepair = (firstUsage: AgentUsage | undefined): boolean => {
    // Unknown cost must not buy a second call; the run already fails closed on
    // incomplete usage.
    if (firstUsage === undefined) return false;
    return usageCost(firstUsage, options.pricing) < options.maxCostCny;
  };

  const task: AgentTask = {
    role: "visual-critic",
    prompt,
    schema: VisualCritiqueSchema,
    validate: (value) => {
      const parsed = VisualCritiqueSchema.safeParse(value);
      return parsed.success
        ? { success: true, data: parsed.data }
        : { success: false, error: parsed.error.message };
    },
    runDir: options.runDir,
    inputFiles,
    maxCostCny: options.maxCostCny,
    canRepair,
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
  };

  let result;
  try {
    result = await runner.run(task);
  } catch (error) {
    const usage = error instanceof AgentRunnerError ? error.usage : undefined;
    const usageComplete =
      error instanceof AgentRunnerError ? (error.usageComplete ?? false) : false;
    const message = errorMessage(error);
    await writeDshEvidence({
      runDir: options.runDir,
      prompt,
      outcome: {
        error: message,
        usage: usage ?? null,
        usageComplete,
        attempts:
          error instanceof AgentRunnerError ? (error.attempts ?? []) : [],
      },
    });
    return dshUnavailable(message, runner.model, {
      ...(usage === undefined ? {} : { usage }),
      usageComplete,
      costCny: usageCost(usage, options.pricing),
    });
  }

  const usage = result.usage;
  const usageComplete = result.usageComplete === true;
  const costCny = usageCost(usage, options.pricing);
  const model = result.model ?? runner.model;
  let critique: VisualCritique;
  try {
    critique = parseVisualCritique(result.output);
  } catch (error) {
    // task.validate already checked the runner output; this is a last-resort
    // guard so a bad result never becomes VISUAL_REVIEW_FAILED and discards the
    // deterministic evidence.
    const message = errorMessage(error);
    await writeDshEvidence({
      runDir: options.runDir,
      prompt,
      outcome: {
        model,
        error: message,
        usage: usage ?? null,
        usageComplete,
        costCny,
        attempts: result.attempts ?? [],
      },
    });
    return dshUnavailable(message, model, {
      ...(usage === undefined ? {} : { usage }),
      usageComplete,
      costCny,
    });
  }
  const findings = critiqueToVisualFindings(critique);

  if (!usageComplete) {
    findings.push({
      id: "VISUAL_USAGE_INCOMPLETE",
      severity: "blocker",
      code: "VISUAL_USAGE_INCOMPLETE",
      message: "the Visual Critic reported incomplete token usage",
    });
  }
  if (costCny > options.maxCostCny) {
    findings.push({
      id: "VISUAL_CRITIC_BUDGET_EXCEEDED",
      severity: "blocker",
      code: "VISUAL_CRITIC_BUDGET_EXCEEDED",
      message: `Visual Critic cost ${costCny.toFixed(4)} CNY exceeds the ${options.maxCostCny} CNY cap`,
    });
  }
  if (critique.verdict === "changes" && critique.findings.length === 0) {
    findings.push({
      id: "VISUAL_CRITIC_INCONSISTENT",
      severity: "blocker",
      code: "VISUAL_CRITIC_INCONSISTENT",
      message: 'the Visual Critic returned verdict "changes" without findings',
    });
  }

  await writeDshEvidence({
    runDir: options.runDir,
    prompt,
    outcome: {
      model,
      usage: usage ?? null,
      usageComplete,
      costCny,
      repairAttempted: result.repairAttempted ?? false,
      attempts: result.attempts ?? [],
      critique,
    },
  });

  return {
    findings,
    critique,
    ...(usage === undefined ? {} : { usage }),
    costCny,
    usageComplete,
    model,
    budgetEnforced: true,
    costSource: usage === undefined ? "unavailable" : "pricing",
  };
}
