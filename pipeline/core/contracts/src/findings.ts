import { z } from "zod";

export type Severity = "blocker" | "major" | "minor" | "question" | "warning";

export interface Finding {
  id: string;
  ruleId: string;
  severity: Severity;
  category: string;
  location: string;
  evidence: string;
  issue: string;
  suggestedQuestion?: string;
  owner?: string;
  confidence?: number;
}

export const FindingSchema = z
  .object({
    id: z.string().min(1),
    ruleId: z.string().min(1),
    severity: z.enum(["blocker", "major", "minor", "question", "warning"]),
    category: z.string().min(1),
    location: z.string().min(1),
    evidence: z.string().min(1),
    issue: z.string().min(1),
    suggestedQuestion: z.string().optional(),
    owner: z.string().optional(),
    confidence: z.number().min(0).max(1).optional(),
  })
  .strict();
