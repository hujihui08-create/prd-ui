import { z } from "zod";
import {
  AgentUsageSchema,
  NormalizedPrdSchema,
  PrdReviewOutputSchema,
  UiBriefDraftSchema,
  UiBriefSchema,
  mergeAgentUsage,
  redactValue,
  reviewCost,
  type AgentUsage,
  type BriefGate,
  type NormalizedPrd,
  type PrdReviewOutput,
  type ReviewPricing,
  type UiBrief,
  type UiBriefDraft,
} from "@prd-ui/contracts";
import {
  AgentRunnerError,
  IaFindingsArtifactSchema,
  IaMapArtifactSchema,
  IaOutputSchema,
  IaProposedArtifactSchema,
  buildIaPrompt,
  buildPrdReviewPrompt,
  buildUiBrieferPrompt,
  parseSignoffMarkdown,
  writeAgentEvidence,
  writeArtifact,
  writeHistory,
  writePrompt,
  type AgentResult,
  type AgentRunnerPort,
  type AgentTask,
  type AgentValidation,
  type HistoryEntry,
  type IaFindings,
  type IaMap,
  type IaOutput,
  type IaProposed,
  type IntakeRole,
  type ParsedSignoff,
  type SignoffAnswer,
} from "@prd-ui/agents";
import {
  IntakeStateSchema,
  type BriefValidation,
  type IntakeAgentRole,
  type IntakeRunResult,
  type IntakeState,
  type IntakeStatus,
  type RunIntakeInput,
} from "./contracts.js";
import { briefHash, canonicalJson } from "./hash.js";
import {
  combinePrdIaGate,
  runBriefGate,
  runIntakeIaGate,
  runPrdGate,
  type PrdGateResult,
} from "./gates.js";
import { normalizePrd } from "./normalize.js";

class StopRun extends Error {
  constructor(readonly reason: "budget_exceeded" | "usage_incomplete") {
    super(reason);
    this.name = "StopRun";
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function validator(schema: {
  safeParse(value: unknown):
    | { success: true; data: unknown }
    | { success: false; error: { message: string } };
}): (value: unknown) => AgentValidation {
  return (value) => {
    const parsed = schema.safeParse(value);
    return parsed.success
      ? { success: true, data: parsed.data }
      : { success: false, error: parsed.error.message };
  };
}

function markdownWithEnvelope(
  envelope: {
    schemaVersion: string;
    project: string;
    generatedAt: string;
    model: string;
    promptHash: string;
  },
  body: string
): string {
  return [
    "---",
    `schemaVersion: ${JSON.stringify(envelope.schemaVersion)}`,
    `project: ${JSON.stringify(envelope.project)}`,
    `generatedAt: ${JSON.stringify(envelope.generatedAt)}`,
    `model: ${JSON.stringify(envelope.model)}`,
    `promptHash: ${JSON.stringify(envelope.promptHash)}`,
    "---",
    "",
    body,
  ].join("\n");
}

function createState(
  runId: string,
  project: string,
  prdHash: string,
  now: string
): IntakeState {
  return {
    schemaVersion: "1.0",
    runId,
    project,
    prdHash,
    stage: "init",
    status: "running",
    signoff: { prdIa: false, brief: false },
    gates: { prd: "pending", ia: "pending", brief: "pending" },
    briefRounds: 0,
    usageComplete: true,
    costCny: 0,
    degraded: false,
    startedAt: now,
    updatedAt: now,
  };
}

function injectMeta(input: {
  brief: UiBrief;
  project: string;
  prdHash: string;
  date: string;
  version: string;
  projectProfile?: string;
  projectPlatforms?: Array<"web" | "mobile">;
  review: PrdReviewOutput;
}): UiBrief {
  const platforms =
    input.projectPlatforms !== undefined && input.projectPlatforms.length > 0
      ? input.projectPlatforms
      : input.brief.meta.platforms.length > 0
        ? input.brief.meta.platforms
        : [...new Set(input.brief.ia.pages.map((page) => page.target))];
  const profile =
    input.projectProfile ??
    input.brief.meta.profile ??
    input.review.extract.pages[0]?.profile ??
    "";
  return {
    ...input.brief,
    meta: {
      ...input.brief.meta,
      project: input.project,
      version: input.version,
      sourcePrdHash: input.prdHash,
      date: input.date,
      profile,
      platforms,
    },
  };
}

async function loadJson<T>(
  store: { readText(path: string): Promise<string> },
  path: string
): Promise<T | undefined> {
  try {
    return JSON.parse(await store.readText(path)) as T;
  } catch {
    return undefined;
  }
}

function stripEnvelope(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object") {
    throw new Error("artifact is not an object");
  }
  const {
    schemaVersion: _schemaVersion,
    project: _project,
    generatedAt: _generatedAt,
    model: _model,
    promptHash: _promptHash,
    ...rest
  } = value as Record<string, unknown>;
  return rest;
}

function signoffFrom(text: string | undefined): ParsedSignoff | undefined {
  return text === undefined ? undefined : parseSignoffMarkdown(text);
}

export async function runIntake(input: RunIntakeInput): Promise<IntakeRunResult> {
  const { store, clock, log, validateBrief, hashText } = input.ports;
  const now = (): string => clock.now().toISOString();
  const maxAgentAttempts = input.maxAgentAttempts ?? 3;
  const maxGateRounds = input.maxGateRounds ?? 2;
  const maxCostCny = input.maxCostCny ?? 10;
  const budgetActive = input.pricing !== undefined;
  const allowUnknownCost = input.allowUnknownCost ?? false;

  let totalCostCny = 0;
  let usageComplete = true;
  let usageIncomplete = false;
  let budgetExceeded = false;
  let unknownCostAllowed = false;

  const roleCostCny: Record<IntakeAgentRole, number> = {
    ia: 0,
    "prd-review": 0,
    "ui-briefer": 0,
  };
  const roleUsage: Partial<Record<IntakeAgentRole, AgentUsage>> = {};
  const roleUsageComplete: Partial<Record<IntakeAgentRole, boolean>> = {};
  const history: Record<IntakeAgentRole, HistoryEntry[]> = {
    ia: [],
    "prd-review": [],
    "ui-briefer": [],
  };

  let state = createState(input.runId, input.project, input.prdHash, now());

  if (input.resume) {
    const loaded = await loadJson<unknown>(store, "state.json");
    if (loaded === undefined) throw new Error("RESUME_STATE_MISSING");
    state = IntakeStateSchema.parse(loaded);
    if (state.prdHash !== input.prdHash) throw new Error("PRD_CHANGED");
    totalCostCny = state.costCny;
    usageComplete = state.usageComplete;
    unknownCostAllowed = state.degraded;
  }

  const logEvent = async (event: Record<string, unknown>): Promise<void> => {
    await log.log(
      redactValue({
        ...event,
        runId: input.runId,
        timestamp: now(),
      }) as Record<string, unknown>
    );
  };

  let writeChain: Promise<void> = Promise.resolve();
  const writeState = async (): Promise<void> => {
    state = { ...state, updatedAt: now() };
    state = IntakeStateSchema.parse(state);
    const snapshot = state;
    const queued = writeChain.then(() => store.writeJson("state.json", snapshot));
    writeChain = queued.catch(() => undefined);
    await queued;
    await logEvent({ type: "state", stage: snapshot.stage, status: snapshot.status });
  };

  const finish = async (
    status: IntakeStatus,
    error?: string,
    extras: Partial<IntakeRunResult> = {}
  ): Promise<IntakeRunResult> => {
    state = {
      ...state,
      status,
      stage:
        status === "success" ||
        status === "failed" ||
        status === "partial" ||
        status === "budget_exceeded" ||
        status === "usage_incomplete"
          ? "done"
          : state.stage,
      finishedAt: now(),
      updatedAt: now(),
      costCny: totalCostCny,
      usageComplete,
      ...(unknownCostAllowed
        ? {
            degraded: true,
            degradedReason: "usage incomplete; allowed by --allow-unknown-cost",
          }
        : {}),
      ...(error === undefined ? {} : { error }),
    };
    await writeState();
    await logEvent({
      type: "run_finished",
      status,
      gates: state.gates,
      signoff: state.signoff,
      costCny: state.costCny,
      usageComplete: state.usageComplete,
      ...(error === undefined ? {} : { error }),
    });
    return {
      runId: input.runId,
      runDir: input.runDir,
      project: input.project,
      status,
      state,
      ...extras,
      ...(error === undefined ? {} : { error }),
    };
  };

  const capFor = (role: IntakeAgentRole): number =>
    Math.min(maxCostCny, input.agentMaxCostCny?.[role] ?? Number.POSITIVE_INFINITY);

  const canRepair = (
    role: IntakeAgentRole
  ): ((firstUsage: AgentUsage | undefined) => boolean) | undefined => {
    if (!budgetActive || input.pricing === undefined) return undefined;
    const pricing: ReviewPricing = input.pricing;
    return (firstUsage) => {
      if (firstUsage === undefined) return false;
      const cost = reviewCost(firstUsage, pricing).cny;
      return totalCostCny + cost <= maxCostCny && roleCostCny[role] + cost <= capFor(role);
    };
  };

  const recordUsage = (
    role: IntakeAgentRole,
    usage: AgentUsage | undefined,
    complete: boolean | undefined,
    fromError: boolean
  ): void => {
    if (usage !== undefined) {
      roleUsage[role] = mergeAgentUsage(roleUsage[role], usage);
      if (input.pricing !== undefined) {
        const cost = reviewCost(usage, input.pricing);
        roleCostCny[role] += cost.cny;
        totalCostCny += cost.cny;
      }
      if (complete === false) {
        usageComplete = false;
        roleUsageComplete[role] = false;
      } else {
        roleUsageComplete[role] = true;
      }
    } else if (!fromError) {
      usageComplete = false;
      roleUsageComplete[role] = false;
    }

    if (budgetActive) {
      const incompleteNow = usage === undefined || complete === false;
      if (incompleteNow) {
        usageComplete = false;
        if (!allowUnknownCost && (fromError ? usage !== undefined : true)) {
          usageIncomplete = true;
        } else if (allowUnknownCost) {
          unknownCostAllowed = true;
        }
      }
      if (totalCostCny > maxCostCny || roleCostCny[role] > capFor(role)) {
        budgetExceeded = true;
      }
    }
  };

  const invoke = async (
    role: IntakeAgentRole,
    prompt: string,
    schema: z.ZodType,
    phase: "initial" | "gate-repair"
  ): Promise<{
    output: unknown;
    result: AgentResult;
    model: string;
    promptHash: string;
  }> => {
    const runner: AgentRunnerPort =
      role === "ia" ? input.runners.ia : input.runners[role];
    const validate = validator(schema);
    let attempt = 0;

    for (let round = 1; round <= maxAgentAttempts; round += 1) {
      if (budgetExceeded) throw new StopRun("budget_exceeded");
      if (usageIncomplete) throw new StopRun("usage_incomplete");
      attempt += 1;

      const task: AgentTask = {
        role,
        prompt,
        schema,
        validate,
        runDir: input.runDir,
        inputFiles: [`agents/${role}/prompt.md`],
        ...(budgetActive ? { maxCostCny: capFor(role) } : {}),
        ...(canRepair(role) === undefined ? {} : { canRepair: canRepair(role) }),
      };
      const promptHash = await writePrompt(store, `agents/${role}/prompt.md`, prompt);
      await logEvent({
        type: "agent_attempt",
        role,
        phase,
        attempt,
        model: runner.model,
        promptHash,
      });

      try {
        const result = await runner.run(task);
        recordUsage(role, result.usage, result.usageComplete, false);
        await writeAgentEvidence(store, {
          role,
          phase: "initial",
          attempt,
          prompt,
          runner: { name: runner.name, model: result.model ?? runner.model },
          result,
        });
        history[role].push({
          phase,
          attempt,
          timestamp: now(),
          usage: result.usage ?? null,
          usageComplete: result.usageComplete ?? false,
          ...(budgetActive && result.usage !== undefined
            ? { costCny: reviewCost(result.usage, input.pricing!).cny }
            : {}),
        });

        const checked = validate(result.output);
        if (!checked.success) {
          throw new AgentRunnerError(
            "AGENT_INVALID_OUTPUT",
            `agent output did not match the role schema: ${checked.error}`,
            {
              usage: result.usage,
              usageComplete: result.usageComplete,
              raw: result.raw,
              stdout: result.stdout,
              stderr: result.stderr,
            }
          );
        }
        if (budgetExceeded) throw new StopRun("budget_exceeded");
        if (usageIncomplete) throw new StopRun("usage_incomplete");
        await writeHistory(store, role, history[role]);
        return {
          output: checked.data,
          result,
          model: result.model ?? runner.model,
          promptHash,
        };
      } catch (error) {
        if (error instanceof StopRun) throw error;
        const accounting =
          typeof error === "object" && error !== null
            ? {
                usage:
                  (error as { usage?: unknown }).usage === undefined
                    ? undefined
                    : AgentUsageSchema.safeParse((error as { usage?: unknown }).usage)
                        .success
                      ? AgentUsageSchema.parse((error as { usage?: unknown }).usage)
                      : undefined,
                usageComplete:
                  typeof (error as { usageComplete?: unknown }).usageComplete ===
                  "boolean"
                    ? ((error as { usageComplete: boolean }).usageComplete)
                    : undefined,
              }
            : {};
        recordUsage(role, accounting.usage, accounting.usageComplete, true);
        await writeAgentEvidence(store, {
          role,
          phase: "initial",
          attempt,
          prompt,
          runner: { name: runner.name, model: runner.model },
          error,
        });
        history[role].push({
          phase,
          attempt,
          timestamp: now(),
          usage: accounting.usage ?? null,
          usageComplete: accounting.usageComplete ?? false,
          ...(budgetActive && accounting.usage !== undefined
            ? { costCny: reviewCost(accounting.usage, input.pricing!).cny }
            : {}),
          error: errorMessage(error),
        });
        if (budgetExceeded) throw new StopRun("budget_exceeded");
        if (usageIncomplete) throw new StopRun("usage_incomplete");

        const retryable =
          error instanceof AgentRunnerError &&
          (error.code === "AGENT_TIMEOUT" ||
            error.code === "AGENT_UNAVAILABLE" ||
            error.code === "AGENT_EXIT_NONZERO");
        if (retryable && round < maxAgentAttempts) {
          await logEvent({ type: "agent_retry", role, phase, attempt });
          continue;
        }
        throw error;
      }
    }
    throw new AgentRunnerError(
      "AGENT_EXIT_NONZERO",
      `agent ${role} exhausted ${maxAgentAttempts} attempts`
    );
  };

  const makeEnvelope = (model: string, promptHash: string) => ({
    schemaVersion: "1.0" as const,
    project: input.project,
    generatedAt: now(),
    model,
    promptHash,
  });

  const writeReviewArtifacts = async (
    review: PrdReviewOutput,
    model: string,
    promptHash: string
  ): Promise<void> => {
    const envelope = makeEnvelope(model, promptHash);
    await store.writeJson("artifacts/prd-review.json", { ...envelope, ...review });
    await store.writeJson("artifacts/prd-findings.json", { findings: review.findings });
    await store.writeJson("artifacts/prd-readiness.json", review.readiness);
    await store.writeJson("artifacts/prd-extract.json", review.extract);
    const reviewMarkdown =
      review.reviewMarkdown ??
      [
        "# PRD review",
        "",
        review.readiness.summary,
        "",
        ...review.findings.map(
          (finding) =>
            `- ${finding.id} [${finding.severity}] ${finding.issue} (${finding.location})`
        ),
      ].join("\n");
    await store.writeText(
      "artifacts/prd-review.md",
      markdownWithEnvelope(envelope, reviewMarkdown)
    );
  };

  const writeIaArtifacts = async (
    output: IaOutput,
    model: string,
    promptHash: string
  ): Promise<void> => {
    const envelope = makeEnvelope(model, promptHash);
    await writeArtifact(store, IaMapArtifactSchema, "artifacts/ia-map.json", {
      ...envelope,
      ...output.map,
    });
    await writeArtifact(
      store,
      IaFindingsArtifactSchema,
      "artifacts/ia-findings.json",
      { ...envelope, ...output.findings }
    );
    await writeArtifact(
      store,
      IaProposedArtifactSchema,
      "artifacts/ia-proposed.json",
      { ...envelope, ...output.proposed }
    );
    await store.writeText(
      "artifacts/ia-review.md",
      markdownWithEnvelope(envelope, output.reviewMarkdown)
    );
  };

  const runReview = async (
    normalized: NormalizedPrd
  ): Promise<{ review: PrdReviewOutput; ia: IaOutput }> => {
    state = { ...state, stage: "review" };
    await writeState();
    const prdTask = invoke(
      "prd-review",
      buildPrdReviewPrompt({
        prdText: input.prdText,
        project: {
          project: input.project,
          ...(input.projectConfig.platforms === undefined
            ? {}
            : { platforms: input.projectConfig.platforms }),
        },
        normalized,
      }),
      PrdReviewOutputSchema,
      "initial"
    );
    const iaTask = invoke(
      "ia",
      buildIaPrompt({
        prdText: input.prdText,
        project: {
          project: input.project,
          ...(input.projectConfig.platforms === undefined
            ? {}
            : { platforms: input.projectConfig.platforms }),
        },
        ...(input.existingIa === undefined ? {} : { existingIa: input.existingIa }),
      }),
      IaOutputSchema,
      "initial"
    );
    const [prdSettled, iaSettled] = await Promise.allSettled([prdTask, iaTask]);
    if (prdSettled.status === "rejected") {
      if (prdSettled.reason instanceof StopRun) throw prdSettled.reason;
      if (iaSettled.status === "fulfilled") {
        const ia = iaSettled.value.output as IaOutput;
        await writeIaArtifacts(ia, iaSettled.value.model, iaSettled.value.promptHash);
        state = { ...state, status: "partial", error: "PRD_REVIEW_FAILED" };
        await writeState();
        return Promise.reject(prdSettled.reason);
      }
      throw prdSettled.reason;
    }
    const review = prdSettled.value.output as PrdReviewOutput;
    await writeReviewArtifacts(
      review,
      prdSettled.value.model,
      prdSettled.value.promptHash
    );
    if (iaSettled.status === "rejected") {
      if (iaSettled.reason instanceof StopRun) throw iaSettled.reason;
      state = { ...state, status: "partial", error: "IA_REVIEW_FAILED" };
      await writeState();
      throw iaSettled.reason;
    }
    const ia = iaSettled.value.output as IaOutput;
    await writeIaArtifacts(ia, iaSettled.value.model, iaSettled.value.promptHash);
    return { review, ia };
  };

  const evaluatePrdIa = async (
    normalized: NormalizedPrd,
    review: PrdReviewOutput,
    ia: IaOutput,
    signoffPrdIa: string | undefined
  ): Promise<PrdGateResult & { combined: ReturnType<typeof combinePrdIaGate> }> => {
    const signoff = signoffFrom(signoffPrdIa);
    const prd = runPrdGate({ normalized, review, ...(signoff === undefined ? {} : { signoff }), now: now() });
    const iaGate = runIntakeIaGate({
      review,
      map: ia.map,
      findings: ia.findings,
      ...(signoff === undefined ? {} : { signoff }),
      now: now(),
    });
    const combined = combinePrdIaGate(prd, iaGate);
    state = {
      ...state,
      stage: "prd_ia_gate",
      gates: {
        ...state.gates,
        prd: prd.passed ? "passed" : "blocked",
        ia: iaGate.passed ? "passed" : "blocked",
      },
      signoff: { ...state.signoff, prdIa: signoff?.valid === true },
    };
    await store.writeJson("findings/prd-gate.json", {
      schemaVersion: "1.0",
      project: input.project,
      generatedAt: now(),
      gate: combined,
    });
    await store.writeJson("findings/ia-gate.json", {
      schemaVersion: "1.0",
      project: input.project,
      generatedAt: now(),
      gate: iaGate,
    });
    await writeState();
    await logEvent({
      type: "gate_result",
      gate: "prd_ia",
      passed: combined.passed,
      status: combined.status,
      codes: combined.issues.map((entry) => entry.code),
    });
    return { ...prd, combined };
  };

  const runBrief = async (
    review: PrdReviewOutput,
    ia: IaOutput,
    signoffPrdIa: string | undefined,
    signoffBriefText: string | undefined
  ): Promise<IntakeRunResult> => {
    state = { ...state, stage: "brief" };
    await writeState();
    const signoffBrief = signoffFrom(signoffBriefText);
    const answers: SignoffAnswer[] =
      signoffFrom(signoffPrdIa)?.answers ?? [];
    const basePrompt = buildUiBrieferPrompt({
      prdText: input.prdText,
      project: {
        project: input.project,
        ...(input.projectConfig.platforms === undefined
          ? {}
          : { platforms: input.projectConfig.platforms }),
        ...(input.projectConfig.profile === undefined
          ? {}
          : { profile: input.projectConfig.profile }),
      },
      prdReview: review,
      iaMap: ia.map,
      supportedProfiles: input.ports.supportedProfiles,
      ...(input.ports.supportedArchetypes === undefined
        ? {}
        : { supportedArchetypes: input.ports.supportedArchetypes }),
      ...(input.existingBrief === undefined ? {} : { existingBrief: input.existingBrief }),
      ...(answers.length === 0 ? {} : { answers }),
    });

    let prompt = basePrompt;
    let lastGate: BriefGate | undefined;
    let lastDraft: UiBriefDraft | undefined;
    let lastHash: string | undefined;

    for (let round = 0; round <= maxGateRounds; round += 1) {
      const invocation = await invoke("ui-briefer", prompt, UiBriefDraftSchema, round === 0 ? "initial" : "gate-repair");
      const rawDraft = invocation.output as UiBriefDraft;
      const candidate = injectMeta({
        brief: rawDraft.brief,
        project: input.project,
        prdHash: input.prdHash,
        date: now().slice(0, 10),
        version: input.briefVersion ?? "0.1.0",
        ...(input.projectConfig.profile === undefined
          ? {}
          : { projectProfile: input.projectConfig.profile }),
        ...(input.projectConfig.platforms === undefined
          ? {}
          : { projectPlatforms: input.projectConfig.platforms }),
        review,
      });
      const parsed = UiBriefSchema.safeParse(candidate);
      const brief = parsed.success ? parsed.data : candidate;
      const draft: UiBriefDraft = { ...rawDraft, brief };
      const hash = briefHash(hashText, brief);
      const compile: BriefValidation = parsed.success
        ? validateBrief(brief)
        : { ok: false, errors: [parsed.error.message] };
      const gate: BriefGate = parsed.success
        ? runBriefGate({
            draft,
            expectedPrdHash: input.prdHash,
            prdReview: review,
            iaMap: ia.map,
            projectConfig: input.projectConfig,
            supportedProfiles: input.ports.supportedProfiles,
            supportedArchetypes:
              input.ports.supportedArchetypes ?? [
                "overview",
                "list",
                "detail",
                "form",
                "settings",
                "feed",
                "home",
                "inventory-list",
                "auth",
                "onboarding",
              ],
            ...(signoffFrom(signoffPrdIa)?.answers === undefined
              ? {}
              : { prdAnswers: signoffFrom(signoffPrdIa)!.answers }),
            ...(signoffBrief === undefined ? {} : { signoff: signoffBrief }),
            compile,
            briefHash: hash,
          })
        : {
            passed: false,
            status: "blocked",
            signoff: { valid: signoffBrief?.valid === true },
            issues: [
              {
                code: "BRIEF_SCHEMA",
                severity: "blocker",
                message: "brief failed UiBriefSchema after meta injection",
                evidence: parsed.success ? undefined : parsed.error.message,
              },
            ],
            compile,
            briefHash: hash,
          };

      lastGate = gate;
      lastDraft = draft;
      lastHash = hash;
      state = {
        ...state,
        stage: "brief_gate",
        gates: { ...state.gates, brief: gate.passed ? "passed" : "blocked" },
        signoff: { ...state.signoff, brief: gate.signoff.valid },
        briefRounds: round,
        briefHash: hash,
      };
      await writeState();
      await store.writeJson("findings/brief-gate.json", {
        schemaVersion: "1.0",
        project: input.project,
        generatedAt: now(),
        gate,
      });
      if (parsed.success) {
        await store.writeJson("artifacts/ui-brief.draft.json", draft);
        await store.writeJson("artifacts/questions.json", { questions: draft.questions });
        await store.writeJson("artifacts/assumptions.json", {
          assumptions: draft.assumptions,
        });
      } else {
        await store.writeJson("artifacts/ui-brief.draft.json", rawDraft);
        await store.writeJson("artifacts/brief-schema-error.json", {
          error: parsed.error.message,
        });
      }
      await logEvent({
        type: "gate_result",
        gate: "brief",
        round,
        passed: gate.passed,
        status: gate.status,
        codes: gate.issues.map((entry) => entry.code),
      });

      if (gate.passed) {
        if (gate.signoff.valid && parsed.success) {
          await store.writeJson("artifacts/ui-brief.json", brief);
          return finish("success", undefined, {
            review,
            draft,
            brief,
            briefHash: hash,
            gate,
          });
        }
        return finish("awaiting_signoff", undefined, {
          review,
          draft,
          briefHash: hash,
          gate,
        });
      }
      if (gate.status === "awaiting_signoff") {
        return finish("awaiting_signoff", undefined, {
          review,
          draft,
          briefHash: hash,
          gate,
        });
      }
      if (round >= maxGateRounds) {
        return finish("blocked", "BRIEF_GATE_FAILED", {
          review,
          draft,
          briefHash: hash,
          gate,
        });
      }
      prompt = `${basePrompt}\n\n## Previous gate issues (fix all blockers)\n${JSON.stringify(
        gate.issues,
        null,
        2
      )}\nReturn a corrected JSON object; do not add prose.`;
    }

    return finish("blocked", "BRIEF_GATE_FAILED", {
      review,
      ...(lastDraft === undefined ? {} : { draft: lastDraft }),
      ...(lastHash === undefined ? {} : { briefHash: lastHash }),
      ...(lastGate === undefined ? {} : { gate: lastGate }),
    });
  };

  const loadNormalized = async (): Promise<NormalizedPrd> => {
    const raw = await loadJson<unknown>(store, "artifacts/normalized-prd.json");
    if (raw === undefined) throw new Error("RESUME_ARTIFACT_MISSING: normalized-prd");
    return NormalizedPrdSchema.parse(raw);
  };

  const loadReview = async (): Promise<PrdReviewOutput> => {
    const raw = await loadJson<unknown>(store, "artifacts/prd-review.json");
    if (raw === undefined) throw new Error("RESUME_ARTIFACT_MISSING: prd-review");
    return PrdReviewOutputSchema.parse(stripEnvelope(raw));
  };

  const loadIa = async (): Promise<IaOutput> => {
    const mapRaw = await loadJson<unknown>(store, "artifacts/ia-map.json");
    const findingsRaw = await loadJson<unknown>(store, "artifacts/ia-findings.json");
    const proposedRaw = await loadJson<unknown>(store, "artifacts/ia-proposed.json");
    const reviewText = await store
      .readText("artifacts/ia-review.md")
      .catch(() => "");
    if (mapRaw === undefined || findingsRaw === undefined) {
      throw new Error("RESUME_ARTIFACT_MISSING: ia");
    }
    const map = stripEnvelope(mapRaw) as IaMap;
    const findings = stripEnvelope(findingsRaw) as IaFindings;
    return {
      map,
      findings,
      proposed:
        proposedRaw === undefined
          ? {}
          : (stripEnvelope(proposedRaw) as IaProposed),
      reviewMarkdown: reviewText.replace(/^---[\s\S]*?---\n\n?/, ""),
    };
  };

  const loadDraft = async (): Promise<UiBriefDraft> => {
    const raw = await loadJson<unknown>(store, "artifacts/ui-brief.draft.json");
    if (raw === undefined) throw new Error("RESUME_ARTIFACT_MISSING: brief-draft");
    return UiBriefDraftSchema.parse(raw);
  };

  const loadFinalBrief = async (): Promise<UiBrief | undefined> => {
    const raw = await loadJson<unknown>(store, "artifacts/ui-brief.json");
    return raw === undefined ? undefined : UiBriefSchema.parse(raw);
  };

  await store.writeText("input/prd.md", input.prdText);
  if (input.signoffPrdIa !== undefined) {
    await store.writeText("signoff/prd-ia.md", input.signoffPrdIa);
  }
  if (input.signoffBrief !== undefined) {
    await store.writeText("signoff/brief.md", input.signoffBrief);
  }
  await writeState();
  await logEvent({ type: "run_started", project: input.project, resume: input.resume === true });

  const normalized =
    input.resume
      ? await loadNormalized()
      : normalizePrd({
          prdText: input.prdText,
          project: input.project,
          sourcePath: input.prdPath,
          sourceHash: input.prdHash,
          generatedAt: now(),
        });
  if (!input.resume) {
    await writeArtifact(
      store,
      NormalizedPrdSchema,
      "artifacts/normalized-prd.json",
      normalized
    );
    state = { ...state, stage: "intake" };
    await writeState();
  }

  try {
    if (input.resume) {
      if (state.status === "success") {
        const brief = await loadFinalBrief();
        return finish(
          "success",
          undefined,
          brief === undefined
            ? {}
            : { brief, briefHash: state.briefHash }
        );
      }
      if (state.stage === "brief_gate") {
        const review = await loadReview();
        const ia = await loadIa();
        const draft = await loadDraft();
        const signoffBrief = signoffFrom(input.signoffBrief);
        const hash = briefHash(hashText, draft.brief);
        const compile = validateBrief(draft.brief);
        const gate = runBriefGate({
          draft,
          expectedPrdHash: input.prdHash,
          prdReview: review,
          iaMap: ia.map,
          projectConfig: input.projectConfig,
          supportedProfiles: input.ports.supportedProfiles,
          supportedArchetypes:
            input.ports.supportedArchetypes ?? [
              "overview",
              "list",
              "detail",
              "form",
              "settings",
              "feed",
              "home",
              "inventory-list",
              "auth",
              "onboarding",
            ],
          ...(signoffFrom(input.signoffPrdIa)?.answers === undefined
            ? {}
            : { prdAnswers: signoffFrom(input.signoffPrdIa)!.answers }),
          ...(signoffBrief === undefined ? {} : { signoff: signoffBrief }),
          compile,
          briefHash: hash,
        });
        state = {
          ...state,
          stage: "brief_gate",
          gates: { ...state.gates, brief: gate.passed ? "passed" : "blocked" },
          signoff: { ...state.signoff, brief: gate.signoff.valid },
          briefHash: hash,
        };
        await writeState();
        await store.writeJson("findings/brief-gate.json", {
          schemaVersion: "1.0",
          project: input.project,
          generatedAt: now(),
          gate,
        });
        if (gate.passed && gate.signoff.valid) {
          await store.writeJson("artifacts/ui-brief.json", draft.brief);
          return finish("success", undefined, {
            review,
            draft,
            brief: draft.brief,
            briefHash: hash,
            gate,
          });
        }
        return finish(gate.status === "blocked" ? "blocked" : "awaiting_signoff", undefined, {
          review,
          draft,
          briefHash: hash,
          gate,
        });
      }
      if (
        state.stage === "prd_ia_gate" ||
        (state.status === "awaiting_signoff" &&
          !(await store.exists("artifacts/ui-brief.draft.json")))
      ) {
        const review = await loadReview();
        const ia = await loadIa();
        const gate = await evaluatePrdIa(normalized, review, ia, input.signoffPrdIa);
        if (gate.combined.status === "blocked") {
          return finish("blocked", "PRD_IA_GATE_BLOCKED", { review });
        }
        if (gate.combined.status === "awaiting_signoff") {
          return finish("awaiting_signoff", undefined, { review });
        }
        return runBrief(review, ia, input.signoffPrdIa, input.signoffBrief);
      }
      throw new Error(`RESUME_UNSUPPORTED_STAGE: ${state.stage}`);
    }

    const reviewResult = await runReview(normalized);
    const gate = await evaluatePrdIa(
      normalized,
      reviewResult.review,
      reviewResult.ia,
      input.signoffPrdIa
    );
    if (gate.combined.status === "blocked") {
      return finish("blocked", "PRD_IA_GATE_BLOCKED", { review: reviewResult.review });
    }
    if (gate.combined.status === "awaiting_signoff") {
      return finish("awaiting_signoff", undefined, { review: reviewResult.review });
    }
    return runBrief(
      reviewResult.review,
      reviewResult.ia,
      input.signoffPrdIa,
      input.signoffBrief
    );
  } catch (error) {
    if (error instanceof StopRun) {
      return finish(error.reason, error.reason);
    }
    return finish(
      state.status === "partial" ? "partial" : "failed",
      errorMessage(error)
    );
  }
}

/** Build the JSON-safe CLI summary from a run result. */
export function summarizeIntake(result: IntakeRunResult): Record<string, unknown> {
  const review = result.review;
  const gate = result.gate;
  const candidate = result.brief ?? result.draft?.brief;
  const blockers =
    gate?.issues.filter(
      (entry) => entry.severity === "blocker" && !entry.code.includes("SIGNOFF")
    ).length ?? 0;
  return redactValue({
    runDir: result.runDir,
    runId: result.runId,
    project: result.project,
    status: result.status,
    prd: {
      sourceHash: result.state.prdHash,
      readiness: review?.readiness.status ?? "unknown",
      blockers: review?.readiness.blockers ?? 0,
      questions: review?.readiness.questions ?? 0,
    },
    ia: {
      passed: result.state.gates.ia === "passed",
      blockers: result.state.gates.ia === "blocked" ? 1 : 0,
    },
    brief: {
      passed: gate?.passed ?? false,
      version: candidate?.meta.version ?? null,
      pages: candidate?.ia.pages.length ?? 0,
      hash: result.briefHash ?? null,
      path:
        result.brief !== undefined
          ? `${result.runDir}/artifacts/ui-brief.json`
          : result.draft !== undefined
            ? `${result.runDir}/artifacts/ui-brief.draft.json`
            : null,
    },
    signoff: result.state.signoff,
    cost: {
      cny: result.state.costCny,
      usageComplete: result.state.usageComplete,
    },
    error: result.error ?? null,
  }) as Record<string, unknown>;
}

export { canonicalJson };
