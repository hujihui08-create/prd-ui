import { z } from "zod";
import type {
  AssetBrief,
  PageSpec,
  UiBrief,
} from "@prd-ui/contracts";
import type { IaMap, InteractionSpec, MotionSpec } from "@prd-ui/agents";

export const SpecIssueSchema = z
  .object({
    code: z.string().min(1),
    severity: z.enum(["blocker", "warning"]),
    message: z.string().min(1),
    evidence: z.string().min(1).optional(),
  })
  .strict();
export type SpecIssue = z.infer<typeof SpecIssueSchema>;

export const SpecEngineerGateSchema = z
  .object({
    passed: z.boolean(),
    issues: z.array(SpecIssueSchema),
  })
  .strict();
export type SpecEngineerGate = z.infer<typeof SpecEngineerGateSchema>;

export const SpecEngineerAssetsSchema = z
  .object({
    referenced: z.array(z.string().min(1)),
    unusedBriefs: z.array(z.string().min(1)),
    missing: z.array(z.string().min(1)),
  })
  .strict();
export type SpecEngineerAssets = z.infer<typeof SpecEngineerAssetsSchema>;

export const SpecEngineerSummarySchema = z
  .object({
    schemaVersion: z.literal("1.0"),
    runId: z.string().min(1),
    project: z.string().min(1),
    agentRunId: z.string().min(1).optional(),
    generatedAt: z.string().min(1),
    pages: z.array(z.string().min(1)),
    motionPages: z.array(z.string().min(1)),
    assets: SpecEngineerAssetsSchema,
    gate: SpecEngineerGateSchema,
    passed: z.boolean(),
    error: z.string().min(1).optional(),
  })
  .strict();
export type SpecEngineerSummary = z.infer<typeof SpecEngineerSummarySchema>;

export interface SpecEngineerInput {
  runId: string;
  project: string;
  agentRunId?: string;
  brief: UiBrief;
  baseSpecs: PageSpec[];
  interactionSpec: InteractionSpec;
  motionSpec: MotionSpec;
  iaMap?: IaMap;
  assetBriefs?: AssetBrief[];
  generatedAt: string;
}

export interface SpecEngineerResult {
  specs: PageSpec[];
  gate: SpecEngineerGate;
  summary: SpecEngineerSummary;
}

export interface AssetReference {
  pageId: string;
  path: string;
  assetId: string;
}
