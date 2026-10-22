import { z } from "zod";

/**
 * Human signoff files are Markdown with one machine-readable block:
 *
 * ```md
 * <!-- signoff
 * { "signer": "张三", "date": "2026-10-20", "waivers": [] }
 * -->
 * ```
 *
 * The block is the audit record; free-form notes outside it are allowed.
 * `answers`, `approvals`, and `briefHash` are optional extensions used by the
 * Phase 2 intake gates; existing M1 signoffs remain valid.
 */
export const IaWaiverSchema = z
  .object({
    findingId: z.string().min(1),
    owner: z.string().min(1),
    reason: z.string().min(1),
    expires: z.string().min(1),
  })
  .strict();
export type IaWaiver = z.infer<typeof IaWaiverSchema>;

export const SignoffAnswerSchema = z
  .object({
    questionId: z.string().min(1),
    answer: z.string().min(1),
    source: z.string().min(1).optional(),
  })
  .strict();
export type SignoffAnswer = z.infer<typeof SignoffAnswerSchema>;

export const SignoffApprovalSchema = z
  .object({
    owner: z.enum([
      "product_owner",
      "security_owner",
      "data_owner",
      "design_owner",
    ]),
    signer: z.string().min(1),
    date: z.string().min(1).optional(),
  })
  .strict();
export type SignoffApproval = z.infer<typeof SignoffApprovalSchema>;

export const SignoffBlockSchema = z
  .object({
    signer: z.string().min(1),
    date: z.string().min(1),
    waivers: z.array(IaWaiverSchema).default([]),
    answers: z.array(SignoffAnswerSchema).default([]),
    approvals: z.array(SignoffApprovalSchema).default([]),
    briefHash: z.string().min(1).optional(),
    manifestHash: z.string().min(1).optional(),
    findingsHash: z.string().min(1).optional(),
  })
  .strict();
export type SignoffBlock = z.infer<typeof SignoffBlockSchema>;

export interface ParsedSignoff {
  /** The `<!-- signoff ... -->` block exists. */
  present: boolean;
  /** The block exists and matches the schema. */
  valid: boolean;
  signer?: string;
  date?: string;
  waivers: IaWaiver[];
  answers: SignoffAnswer[];
  approvals: SignoffApproval[];
  briefHash?: string;
  manifestHash?: string;
  findingsHash?: string;
  error?: string;
}

const SIGNOFF_BLOCK = /<!--\s*signoff\s*([\s\S]*?)-->/i;

function isDate(value: string): boolean {
  return !Number.isNaN(Date.parse(value));
}

export function parseSignoffMarkdown(text: string): ParsedSignoff {
  const match = SIGNOFF_BLOCK.exec(text);
  if (match === null || match[1] === undefined) {
    return {
      present: false,
      valid: false,
      waivers: [],
      answers: [],
      approvals: [],
      error: "SIGNOFF_BLOCK_MISSING",
    };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(match[1].trim()) as unknown;
  } catch {
    return {
      present: true,
      valid: false,
      waivers: [],
      answers: [],
      approvals: [],
      error: "SIGNOFF_BLOCK_INVALID_JSON",
    };
  }

  const parsed = SignoffBlockSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      present: true,
      valid: false,
      waivers: [],
      answers: [],
      approvals: [],
      error: `SIGNOFF_BLOCK_INVALID: ${parsed.error.message}`,
    };
  }
  if (!isDate(parsed.data.date)) {
    return {
      present: true,
      valid: false,
      signer: parsed.data.signer,
      date: parsed.data.date,
      waivers: parsed.data.waivers,
      answers: parsed.data.answers,
      approvals: parsed.data.approvals,
      ...(parsed.data.briefHash === undefined
        ? {}
        : { briefHash: parsed.data.briefHash }),
      ...(parsed.data.manifestHash === undefined
        ? {}
        : { manifestHash: parsed.data.manifestHash }),
      ...(parsed.data.findingsHash === undefined
        ? {}
        : { findingsHash: parsed.data.findingsHash }),
      error: "SIGNOFF_DATE_INVALID",
    };
  }

  return {
    present: true,
    valid: true,
    signer: parsed.data.signer,
    date: parsed.data.date,
    waivers: parsed.data.waivers,
    answers: parsed.data.answers,
    approvals: parsed.data.approvals,
    ...(parsed.data.briefHash === undefined
      ? {}
      : { briefHash: parsed.data.briefHash }),
    ...(parsed.data.manifestHash === undefined
      ? {}
      : { manifestHash: parsed.data.manifestHash }),
    ...(parsed.data.findingsHash === undefined
      ? {}
      : { findingsHash: parsed.data.findingsHash }),
  };
}

/** A waiver is valid only while its expiry date has not passed. */
export function waiverIsCurrent(waiver: IaWaiver, now: Date): boolean {
  const expires = Date.parse(waiver.expires);
  if (Number.isNaN(expires)) return false;
  return expires >= now.getTime();
}
