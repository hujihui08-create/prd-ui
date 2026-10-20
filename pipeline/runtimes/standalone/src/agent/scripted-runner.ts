import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { AgentUsageSchema } from "@prd-ui/contracts";
import {
  AgentRunnerError,
  type AgentResult,
  type AgentRole,
  type AgentRunnerPort,
  type AgentTask,
} from "@prd-ui/agents";

export const ScriptedAgentFixtureSchema = z
  .object({
    output: z.unknown(),
    usage: AgentUsageSchema.optional(),
    usageComplete: z.boolean().optional(),
    raw: z.string().optional(),
    error: z.string().optional(),
  })
  .strict();
export type ScriptedAgentFixture = z.infer<typeof ScriptedAgentFixtureSchema>;

export type ScriptedAgentScript =
  | ScriptedAgentFixture
  | ScriptedAgentFixture[];

/**
 * Deterministic runner for tests and offline CLI runs. It validates through
 * the same task validator as the real runner and never touches the network.
 * A missing or exhausted script is an error, never an implicit pass.
 */
export class ScriptedAgentRunner implements AgentRunnerPort {
  readonly name = "scripted";
  readonly model = "scripted";
  private readonly counts: Record<AgentRole, number> = {
    ia: 0,
    interaction: 0,
    "visual-style": 0,
  };

  constructor(
    private readonly scripts: Partial<Record<AgentRole, ScriptedAgentScript>>
  ) {}

  async run(task: AgentTask): Promise<AgentResult> {
    const script = this.scripts[task.role];
    if (script === undefined) {
      throw new AgentRunnerError(
        "AGENT_UNAVAILABLE",
        `SCRIPTED_FIXTURE_MISSING: ${task.role}`
      );
    }

    const index = this.counts[task.role];
    this.counts[task.role] += 1;
    const entry = Array.isArray(script) ? script[index] : index === 0 ? script : undefined;
    if (entry === undefined) {
      throw new AgentRunnerError(
        "AGENT_UNAVAILABLE",
        `SCRIPTED_FIXTURE_EXHAUSTED: ${task.role} attempt ${index + 1}`
      );
    }
    if (entry.error !== undefined) {
      throw new AgentRunnerError("AGENT_EXIT_NONZERO", entry.error);
    }

    const validated = task.validate(entry.output);
    if (!validated.success) {
      throw new AgentRunnerError("AGENT_INVALID_OUTPUT", validated.error);
    }

    return {
      output: validated.data,
      usageComplete: entry.usageComplete ?? entry.usage !== undefined,
      raw: entry.raw ?? JSON.stringify(validated.data),
      model: this.model,
      ...(entry.usage === undefined ? {} : { usage: entry.usage }),
    };
  }
}

/** Load `<role>.json` fixtures from a directory. */
export async function loadScriptedAgentFixtures(
  dir: string
): Promise<Record<AgentRole, ScriptedAgentFixture>> {
  const roles: AgentRole[] = ["ia", "interaction", "visual-style"];
  const entries = await Promise.all(
    roles.map(async (role) => {
      const file = path.join(dir, `${role}.json`);
      const raw = JSON.parse(await readFile(file, "utf8")) as unknown;
      return [role, ScriptedAgentFixtureSchema.parse(raw)] as const;
    })
  );
  return Object.fromEntries(entries) as Record<AgentRole, ScriptedAgentFixture>;
}
