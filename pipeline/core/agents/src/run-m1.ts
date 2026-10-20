import {
  AgentUsageSchema,
  AssetBriefSchema,
  mergeAgentUsage,
  redactValue,
  reviewCost,
  type AgentUsage,
  type ReviewPricing,
  type UiBrief,
} from "@prd-ui/contracts";
import {
  AgentRunnerError,
  buildGateRepairPrompt,
  type AgentArtifactStorePort,
  type AgentResult,
  type AgentRole,
  type AgentRunnerPort,
  type AgentTask,
  type AgentValidation,
  type GateResult,
} from "./contracts.js";
import {
  AgentGateArtifactSchema,
  IaFindingsArtifactSchema,
  IaMapArtifactSchema,
  IaProposedArtifactSchema,
  InteractionSpecArtifactSchema,
  MotionSpecArtifactSchema,
  VisualStyleArtifactSchema,
} from "./artifacts.js";
import {
  readOptionalText,
  writeAgentEvidence,
  writeArtifact,
  writeHistory,
  writePrompt,
  type HistoryEntry,
} from "./evidence.js";
import { runIaGate } from "./gates/ia.js";
import { runInteractionGate } from "./gates/interaction.js";
import { runVisualStyleGate } from "./gates/visual-style.js";
import {
  IaOutputSchema,
  buildIaPrompt,
  type IaMap,
  type IaOutput,
} from "./roles/ia.js";
import {
  InteractionOutputSchema,
  buildInteractionPrompt,
  type InteractionOutput,
} from "./roles/interaction.js";
import {
  VisualStyleOutputSchema,
  buildVisualStylePrompt,
  type VisualStyleOutput,
} from "./roles/visual-style.js";
import { parseSignoffMarkdown, type IaWaiver, type ParsedSignoff } from "./signoff.js";
import {
  M1RunStateSchema,
  createM1State,
  withAgentState,
  type M1RunState,
  type M1Status,
} from "./state.js";

export interface M1Ports {
  store: AgentArtifactStorePort;
  clock: { now(): Date };
  log: { log(event: Record<string, unknown>): Promise<void> };
}

export interface RunM1Input {
  runId: string;
  project: string;
  runDir: string;
  brief: UiBrief;
  prdText: string;
  runners: Record<AgentRole, AgentRunnerPort>;
  ports: M1Ports;
  pricing?: ReviewPricing;
  /** Whole-run cost cap in CNY. Defaults to 10 when pricing is supplied. */
  maxCostCny?: number;
  agentMaxCostCny?: Partial<Record<AgentRole, number>>;
  allowUnknownCost?: boolean;
  allowUnreviewed?: boolean;
  /** Model/network retries per agent call. Default 3. */
  maxAgentAttempts?: number;
  /** Gate repair rounds after the initial output. Default 2. */
  maxGateRounds?: number;
  /** Run only these design roles. IA always runs. */
  onlyRoles?: AgentRole[];
  waivers?: IaWaiver[];
  brandMaterials?: string[];
  references?: string[];
  catalog?: unknown;
  motionTokens?: unknown;
  pageSpecs?: unknown;
}

export interface M1RunResult {
  runId: string;
  runDir: string;
  project: string;
  state: M1RunState;
  passed: boolean;
  error?: string;
}

interface Invocation {
  output: unknown;
  result: AgentResult;
  model: string;
  promptHash: string;
}

interface SignoffRead {
  exists: boolean;
  parsed: ParsedSignoff;
}

interface DesignResult {
  role: "interaction" | "visual-style";
  gate?: GateResult;
  error?: string;
}

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

export async function runM1(input: RunM1Input): Promise<M1RunResult> {
  const { store, clock, log } = input.ports;
  const budgetActive = input.pricing !== undefined;
  const maxCostCny = input.maxCostCny ?? 10;
  const maxAgentAttempts = input.maxAgentAttempts ?? 3;
  const maxGateRounds = input.maxGateRounds ?? 2;
  const allowUnknownCost = input.allowUnknownCost ?? false;
  const allowUnreviewed = input.allowUnreviewed ?? false;

  const roleCostUsd: Record<AgentRole, number> = {
    ia: 0,
    interaction: 0,
    "visual-style": 0,
  };
  const roleCostCny: Record<AgentRole, number> = {
    ia: 0,
    interaction: 0,
    "visual-style": 0,
  };
  const roleUsage: Partial<Record<AgentRole, AgentUsage>> = {};
  const roleUsageComplete: Partial<Record<AgentRole, boolean>> = {};
  const history: Record<AgentRole, HistoryEntry[]> = {
    ia: [],
    interaction: [],
    "visual-style": [],
  };

  let totalCostUsd = 0;
  let totalCostCny = 0;
  let usageComplete = true;
  let usageIncomplete = false;
  let budgetExceeded = false;
  let unknownCostAllowed = false;

  let state = createM1State(input.runId, input.project, clock.now().toISOString());

  const logEvent = async (event: Record<string, unknown>): Promise<void> => {
    await log.log(
      redactValue({
        ...event,
        runId: input.runId,
        timestamp: clock.now().toISOString(),
      }) as Record<string, unknown>
    );
  };

  let writeChain: Promise<void> = Promise.resolve();
  const writeState = async (): Promise<void> => {
    state = { ...state, updatedAt: clock.now().toISOString() };
    state = M1RunStateSchema.parse(state);
    const snapshot = state;
    // Design agents run in parallel; serialize state writes so the last
    // snapshot on disk is always the newest one.
    const queued = writeChain.then(() => store.writeJson("state.json", snapshot));
    writeChain = queued.catch(() => undefined);
    await queued;
    await logEvent({ type: "state", stage: snapshot.stage, status: snapshot.status });
  };

  const finish = async (
    status: M1Status,
    error?: string
  ): Promise<M1RunResult> => {
    if (status === "budget_exceeded" || status === "usage_incomplete") {
      const agents = { ...state.agents };
      for (const role of ["ia", "interaction", "visual-style"] as const) {
        const current = agents[role];
        if (current.status === "pending" || current.status === "running") {
          agents[role] = {
            ...current,
            status,
            error: status === "budget_exceeded" ? "BUDGET_EXCEEDED" : "USAGE_INCOMPLETE",
          };
        }
      }
      state = { ...state, agents };
    }
    state = {
      ...state,
      status,
      stage: status === "awaiting_signoff" ? "signoff" : "done",
      finishedAt: clock.now().toISOString(),
      updatedAt: clock.now().toISOString(),
      ...(unknownCostAllowed && !state.degraded
        ? {
            degraded: true,
            degradedReason: "usage incomplete; allowed by --allow-unknown-cost",
          }
        : {}),
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
      state,
      passed: status === "success",
      ...(error === undefined ? {} : { error }),
    };
  };

  const capFor = (role: AgentRole): number =>
    Math.min(maxCostCny, input.agentMaxCostCny?.[role] ?? Number.POSITIVE_INFINITY);

  const canRepair = (
    role: AgentRole
  ): ((firstUsage: AgentUsage | undefined) => boolean) | undefined => {
    if (!budgetActive || input.pricing === undefined) return undefined;
    const pricing = input.pricing;
    return (firstUsage) => {
      if (firstUsage === undefined) return false;
      const cost = reviewCost(firstUsage, pricing).cny;
      return (
        totalCostCny + cost <= maxCostCny &&
        roleCostCny[role] + cost <= capFor(role)
      );
    };
  };

  const recordUsage = (
    role: AgentRole,
    usage: AgentUsage | undefined,
    complete: boolean | undefined,
    fromError: boolean
  ): void => {
    if (usage !== undefined) {
      roleUsage[role] = mergeAgentUsage(roleUsage[role], usage);
      if (input.pricing !== undefined) {
        const cost = reviewCost(usage, input.pricing);
        roleCostUsd[role] += cost.usd;
        roleCostCny[role] += cost.cny;
        totalCostUsd += cost.usd;
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
      if (
        totalCostCny > maxCostCny ||
        roleCostCny[role] > capFor(role)
      ) {
        budgetExceeded = true;
      }
    }
  };

  const syncState = (): void => {
    const usageFor = (role: AgentRole) => roleUsage[role];
    const costCnyFor = (role: AgentRole) =>
      budgetActive && roleCostCny[role] > 0 ? roleCostCny[role] : undefined;
    const costUsdFor = (role: AgentRole) =>
      budgetActive && roleCostUsd[role] > 0 ? roleCostUsd[role] : undefined;
    state = {
      ...state,
      agents: {
        ia: {
          ...state.agents.ia,
          ...(usageFor("ia") === undefined ? {} : { usage: usageFor("ia") }),
          ...(costCnyFor("ia") === undefined ? {} : { costCny: costCnyFor("ia") }),
          ...(costUsdFor("ia") === undefined ? {} : { costUsd: costUsdFor("ia") }),
          ...(roleUsageComplete.ia === undefined
            ? {}
            : { usageComplete: roleUsageComplete.ia }),
        },
        interaction: {
          ...state.agents.interaction,
          ...(usageFor("interaction") === undefined
            ? {}
            : { usage: usageFor("interaction") }),
          ...(costCnyFor("interaction") === undefined
            ? {}
            : { costCny: costCnyFor("interaction") }),
          ...(costUsdFor("interaction") === undefined
            ? {}
            : { costUsd: costUsdFor("interaction") }),
          ...(roleUsageComplete.interaction === undefined
            ? {}
            : { usageComplete: roleUsageComplete.interaction }),
        },
        "visual-style": {
          ...state.agents["visual-style"],
          ...(usageFor("visual-style") === undefined
            ? {}
            : { usage: usageFor("visual-style") }),
          ...(costCnyFor("visual-style") === undefined
            ? {}
            : { costCny: costCnyFor("visual-style") }),
          ...(costUsdFor("visual-style") === undefined
            ? {}
            : { costUsd: costUsdFor("visual-style") }),
          ...(roleUsageComplete["visual-style"] === undefined
            ? {}
            : { usageComplete: roleUsageComplete["visual-style"] }),
        },
      },
      costCny: budgetActive ? totalCostCny : 0,
      usageComplete,
    };
  };

  const setAgent = (
    role: AgentRole,
    patch: Partial<M1RunState["agents"][AgentRole]>
  ): void => {
    state = withAgentState(state, role, patch);
    syncState();
  };

  const readSignoff = async (name: "ia" | "visual-style"): Promise<SignoffRead> => {
    const text = await readOptionalText(store, `signoff/${name}.md`);
    if (text === undefined) {
      return {
        exists: false,
        parsed: { present: false, valid: false, waivers: [] },
      };
    }
    return { exists: true, parsed: parseSignoffMarkdown(text) };
  };

  const makeEnvelope = (model: string, promptHash: string) => ({
    schemaVersion: "1.0" as const,
    project: input.project,
    generatedAt: clock.now().toISOString(),
    model,
    promptHash,
  });

  const invoke = async (
    role: AgentRole,
    phase: "initial" | "gate-repair",
    prompt: string
  ): Promise<Invocation> => {
    const runner = input.runners[role];
    const repairAllowed = canRepair(role);
    const task: AgentTask = {
      role,
      prompt,
      schema: role === "ia" ? IaOutputSchema : undefined,
      validate: () => ({ success: true, data: undefined }),
      runDir: input.runDir,
      inputFiles: [`agents/${role}/prompt.md`],
      maxCostCny: budgetActive ? capFor(role) : undefined,
      ...(repairAllowed === undefined ? {} : { canRepair: repairAllowed }),
    };

    const schema =
      role === "ia"
        ? IaOutputSchema
        : role === "interaction"
          ? InteractionOutputSchema
          : VisualStyleOutputSchema;
    const validate = validator(schema);
    const taskWithSchema: AgentTask = { ...task, schema, validate };

    let attempt = state.agents[role].attempts;
    for (let round = 1; round <= maxAgentAttempts; round += 1) {
      if (budgetExceeded) throw new StopRun("budget_exceeded");
      if (usageIncomplete) throw new StopRun("usage_incomplete");

      attempt += 1;
      setAgent(role, { status: "running", attempts: attempt });
      await writeState();
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
        const result = await runner.run(taskWithSchema);
        recordUsage(role, result.usage, result.usageComplete, false);
        setAgent(role, {
          model: result.model ?? runner.model,
          promptHash,
          ...(result.repairAttempted === true
            ? { repairAttempts: state.agents[role].repairAttempts + 1 }
            : {}),
        });
        await writeAgentEvidence(store, {
          role,
          phase,
          attempt,
          prompt,
          runner: { name: runner.name, model: result.model ?? runner.model },
          result,
        });
        history[role].push({
          phase,
          attempt,
          timestamp: clock.now().toISOString(),
          usage: result.usage ?? null,
          usageComplete: result.usageComplete ?? false,
          ...(budgetActive && result.usage !== undefined
            ? { costCny: reviewCost(result.usage, input.pricing!).cny }
            : {}),
          ...(result.repairAttempted === true ? { repairAttempted: true } : {}),
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

        if (budgetExceeded) {
          setAgent(role, { status: "budget_exceeded", error: "BUDGET_EXCEEDED" });
          await writeHistory(store, role, history[role]);
          await writeState();
          throw new StopRun("budget_exceeded");
        }
        if (usageIncomplete) {
          setAgent(role, { status: "usage_incomplete", error: "USAGE_INCOMPLETE" });
          await writeHistory(store, role, history[role]);
          await writeState();
          throw new StopRun("usage_incomplete");
        }

        setAgent(role, { status: "passed" });
        await writeHistory(store, role, history[role]);
        await writeState();
        await logEvent({
          type: "agent_finished",
          role,
          phase,
          attempt,
          usageComplete: result.usageComplete ?? false,
          repairAttempted: result.repairAttempted ?? false,
        });
        return {
          output: checked.data,
          result,
          model: result.model ?? runner.model,
          promptHash,
        };
      } catch (error) {
        if (error instanceof StopRun) throw error;

        const accounting = errorAccounting(error);
        recordUsage(role, accounting.usage, accounting.usageComplete, true);
        await writeAgentEvidence(store, {
          role,
          phase,
          attempt,
          prompt,
          runner: { name: runner.name, model: runner.model },
          error,
        });
        history[role].push({
          phase,
          attempt,
          timestamp: clock.now().toISOString(),
          usage: accounting.usage ?? null,
          usageComplete: accounting.usageComplete ?? false,
          ...(budgetActive && accounting.usage !== undefined
            ? { costCny: reviewCost(accounting.usage, input.pricing!).cny }
            : {}),
          error: errorMessage(error),
        });

        if (budgetExceeded) {
          setAgent(role, { status: "budget_exceeded", error: "BUDGET_EXCEEDED" });
          await writeHistory(store, role, history[role]);
          await writeState();
          throw new StopRun("budget_exceeded");
        }
        if (usageIncomplete) {
          setAgent(role, { status: "usage_incomplete", error: "USAGE_INCOMPLETE" });
          await writeHistory(store, role, history[role]);
          await writeState();
          throw new StopRun("usage_incomplete");
        }

        const retryable =
          error instanceof AgentRunnerError &&
          (error.code === "AGENT_TIMEOUT" ||
            error.code === "AGENT_UNAVAILABLE" ||
            error.code === "AGENT_EXIT_NONZERO");
        if (retryable && round < maxAgentAttempts) {
          await logEvent({
            type: "agent_retry",
            role,
            phase,
            attempt,
            code: error.code,
          });
          continue;
        }

        setAgent(role, { status: "failed", error: errorMessage(error) });
        await writeHistory(store, role, history[role]);
        await writeState();
        await logEvent({
          type: "agent_failed",
          role,
          phase,
          attempt,
          error: errorMessage(error),
        });
        throw error;
      }
    }

    throw new AgentRunnerError(
      "AGENT_EXIT_NONZERO",
      `agent ${role} exhausted ${maxAgentAttempts} attempts`
    );
  };

  const designRoles: AgentRole[] = input.onlyRoles
    ? input.onlyRoles.filter((role) => role !== "ia")
    : ["interaction", "visual-style"];
  const runInteraction = designRoles.includes("interaction");
  const runVisual = designRoles.includes("visual-style");

  const skipDesign = (): void => {
    if (state.agents.interaction.status !== "skipped") {
      setAgent("interaction", { status: "skipped" });
    }
    if (state.agents["visual-style"].status !== "skipped") {
      setAgent("visual-style", { status: "skipped" });
    }
  };

  await writeState();
  await logEvent({ type: "run_started", project: input.project });

  // ---- IA ----
  state = { ...state, stage: "ia" };
  await writeState();

  const iaSignoffAtStart = await readSignoff("ia");
  const waivers = [
    ...(input.waivers ?? []),
    ...iaSignoffAtStart.parsed.waivers,
  ];

  let ia: { output: IaOutput; model: string; promptHash: string } | undefined;
  try {
    const invocation = await invoke(
      "ia",
      "initial",
      buildIaPrompt({ prdText: input.prdText, brief: input.brief })
    );
    const output = invocation.output as IaOutput;
    const envelope = makeEnvelope(invocation.model, invocation.promptHash);
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
    ia = { output, model: invocation.model, promptHash: invocation.promptHash };
  } catch (error) {
    if (error instanceof StopRun) {
      return finish(error.reason, error.reason);
    }
    skipDesign();
    return finish("failed", errorMessage(error));
  }

  // ---- IA gate ----
  state = { ...state, stage: "ia_gate" };
  await writeState();
  const iaGate = runIaGate({
    map: ia.output.map,
    findings: ia.output.findings,
    brief: input.brief,
    waivers,
    now: clock.now().toISOString(),
  });
  state = { ...state, gates: { ...state.gates, ia: iaGate.status } };
  if (iaGate.status === "failed") {
    setAgent("ia", {
      status: "failed",
      error: "IA_GATE_FAILED",
    });
  }
  await writeArtifact(
    store,
    AgentGateArtifactSchema,
    "findings/ia-gate.json",
    {
      ...makeEnvelope(ia.model, ia.promptHash),
      role: "ia",
      gate: iaGate,
    }
  );
  await writeState();
  await logEvent({
    type: "gate_result",
    role: "ia",
    passed: iaGate.passed,
    status: iaGate.status,
    codes: iaGate.issues.map((issue) => issue.code),
  });

  if (!iaGate.passed) {
    skipDesign();
    await writeState();
    return finish("failed", "IA_GATE_FAILED");
  }

  if (!runInteraction) setAgent("interaction", { status: "skipped" });
  if (!runVisual) setAgent("visual-style", { status: "skipped" });

  const iaSigned =
    iaSignoffAtStart.exists && iaSignoffAtStart.parsed.valid;
  state = { ...state, signoff: { ...state.signoff, ia: iaSigned } };

  if (!iaSigned && !allowUnreviewed) {
    setAgent("interaction", { status: "skipped" });
    setAgent("visual-style", { status: "skipped" });
    await writeState();
    await logEvent({
      type: "awaiting_signoff",
      role: "ia",
      reason: "SIGNOFF_MISSING",
    });
    return finish("awaiting_signoff");
  }

  // ---- Design (parallel) ----
  state = { ...state, stage: "design" };
  await writeState();

  const runDesign = async (
    role: "interaction" | "visual-style"
  ): Promise<DesignResult> => {
    const iaMap: IaMap = ia!.output.map;
    const basePrompt =
      role === "interaction"
        ? buildInteractionPrompt({
            brief: input.brief,
            iaMap,
            ...(input.catalog === undefined ? {} : { catalog: input.catalog }),
            ...(input.motionTokens === undefined
              ? {}
              : { motionTokens: input.motionTokens }),
            ...(input.pageSpecs === undefined ? {} : { pageSpecs: input.pageSpecs }),
          })
        : buildVisualStylePrompt({
            brief: input.brief,
            iaMap,
            ...(input.brandMaterials === undefined
              ? {}
              : { brandMaterials: input.brandMaterials }),
            ...(input.references === undefined ? {} : { references: input.references }),
          });

    let prompt = basePrompt;
    let gateRound = 0;
    for (;;) {
      const invocation = await invoke(
        role,
        gateRound === 0 ? "initial" : "gate-repair",
        prompt
      );
      const envelope = makeEnvelope(invocation.model, invocation.promptHash);

      let gate: GateResult;
      if (role === "interaction") {
        const output = invocation.output as InteractionOutput;
        await writeArtifact(
          store,
          InteractionSpecArtifactSchema,
          "artifacts/interaction-spec.json",
          { ...envelope, ...output.interactionSpec }
        );
        await writeArtifact(
          store,
          MotionSpecArtifactSchema,
          "artifacts/motion-spec.json",
          { ...envelope, ...output.motionSpec }
        );
        await store.writeText(
          "artifacts/interaction-review.md",
          markdownWithEnvelope(envelope, output.reviewMarkdown)
        );
        gate = runInteractionGate({
          interactionSpec: output.interactionSpec,
          motionSpec: output.motionSpec,
          brief: input.brief,
        });
      } else {
        const output = invocation.output as VisualStyleOutput;
        await writeArtifact(
          store,
          VisualStyleArtifactSchema,
          "artifacts/visual-style.json",
          { ...envelope, ...output.visualStyle }
        );
        for (const brief of output.assetBriefs) {
          await writeArtifact(
            store,
            AssetBriefSchema,
            `artifacts/asset-briefs/${brief.id}.json`,
            brief
          );
        }
        gate = runVisualStyleGate({
          visualStyle: output.visualStyle,
          assetBriefs: output.assetBriefs,
          brief: input.brief,
        });
      }

      const gateKey = role === "interaction" ? "interaction" : "visualStyle";
      state = { ...state, gates: { ...state.gates, [gateKey]: gate.status } };
      setAgent(role, {
        status: gate.passed ? "passed" : "failed",
        ...(gate.passed ? {} : { error: "GATE_FAILED" }),
      });
      await writeArtifact(
        store,
        AgentGateArtifactSchema,
        `findings/${role}-gate.json`,
        { ...envelope, role, gate }
      );
      await writeState();
      await logEvent({
        type: "gate_result",
        role,
        round: gateRound,
        passed: gate.passed,
        status: gate.status,
        codes: gate.issues.map((issue) => issue.code),
      });

      if (gate.passed) return { role, gate };
      if (gateRound >= maxGateRounds) {
        return { role, gate, error: "GATE_FAILED" };
      }
      gateRound += 1;
      setAgent(role, { status: "running", gateRounds: gateRound, error: "GATE_REPAIR" });
      await writeState();
      prompt = buildGateRepairPrompt(basePrompt, gate.issues);
    }
  };

  const designTasks: Promise<DesignResult>[] = [];
  if (runInteraction) designTasks.push(runDesign("interaction"));
  if (runVisual) designTasks.push(runDesign("visual-style"));
  const settled = await Promise.allSettled(designTasks);

  state = { ...state, stage: "design_gate" };
  await writeState();

  let designFailure = false;
  for (const [index, outcome] of settled.entries()) {
    const role = (runInteraction ? ["interaction", "visual-style"] : ["visual-style"])[
      index
    ] as "interaction" | "visual-style";
    if (outcome.status === "fulfilled") {
      if (outcome.value.error !== undefined) designFailure = true;
      continue;
    }
    designFailure = true;
    const reason = outcome.reason;
    if (reason instanceof StopRun) {
      // The stop flags were set during the call; the role status is already
      // budget_exceeded/usage_incomplete.
      continue;
    }
    setAgent(role, { status: "failed", error: errorMessage(reason) });
    await logEvent({
      type: "agent_failed",
      role,
      phase: "design",
      error: errorMessage(reason),
    });
  }
  await writeState();

  // ---- Signoff ----
  state = { ...state, stage: "signoff" };
  const iaSignoffFinal = await readSignoff("ia");
  const visualSignoffFinal = await readSignoff("visual-style");
  const iaSignedFinal = iaSignoffFinal.exists && iaSignoffFinal.parsed.valid;
  const visualSignedFinal =
    visualSignoffFinal.exists && visualSignoffFinal.parsed.valid;
  state = {
    ...state,
    signoff: { ia: iaSignedFinal, visualStyle: visualSignedFinal },
  };
  await writeState();
  await logEvent({
    type: "signoff",
    ia: iaSignedFinal,
    visualStyle: visualSignedFinal,
    allowUnreviewed,
  });

  if (usageIncomplete) {
    return finish("usage_incomplete", "USAGE_INCOMPLETE");
  }
  if (budgetExceeded) {
    return finish("budget_exceeded", "BUDGET_EXCEEDED");
  }
  if (designFailure) {
    const ranRoles = [runInteraction, runVisual].filter(Boolean).length;
    const passedRoles = (["interaction", "visual-style"] as const).filter(
      (role) => state.agents[role].status === "passed"
    ).length;
    return finish(
      passedRoles > 0 && passedRoles < ranRoles ? "partial" : "failed",
      "AGENT_FAILED"
    );
  }

  const requiredSignoffs = [
    iaSignedFinal,
    ...(runVisual ? [visualSignedFinal] : []),
  ];
  const signoffsOk = requiredSignoffs.every(Boolean);
  if (!signoffsOk || allowUnreviewed) {
    return finish("awaiting_signoff", allowUnreviewed ? "ALLOW_UNREVIEWED" : undefined);
  }

  return finish("success");
}

/**
 * Runners attach usage to failures; core reads the fields structurally so it
 * stays independent of a specific adapter error class.
 */
function errorAccounting(error: unknown): {
  usage?: AgentUsage;
  usageComplete?: boolean;
} {
  if (typeof error !== "object" || error === null) return {};
  const candidate = error as { usage?: unknown; usageComplete?: unknown };
  const usage =
    candidate.usage === undefined
      ? undefined
      : AgentUsageSchema.safeParse(candidate.usage);
  return {
    ...(usage?.success === true ? { usage: usage.data } : {}),
    ...(typeof candidate.usageComplete === "boolean"
      ? { usageComplete: candidate.usageComplete }
      : {}),
  };
}
