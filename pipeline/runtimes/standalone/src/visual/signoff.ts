import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import {
  parseSignoffMarkdown,
  waiverIsCurrent,
  type IaWaiver,
  type ParsedSignoff,
} from "@prd-ui/agents";
import type { VisualFinding } from "@prd-ui/visual-review";
import { parseVisualRunState } from "./manifest.js";

export interface UnwaivedGate {
  passed: boolean;
  blockers: VisualFinding[];
}

/**
 * The deterministic gate result after applying the signoff waivers. The raw
 * gate artifact keeps `passed: false` for the unwaived finding set; this is
 * the effective result the run status is based on.
 */
export function unwaivedGate(
  findings: VisualFinding[],
  waivedFindings: readonly string[]
): UnwaivedGate {
  const waived = new Set(waivedFindings);
  const blockers = findings.filter(
    (finding) => finding.severity === "blocker" && !waived.has(finding.id)
  );
  return { passed: blockers.length === 0, blockers };
}

export interface VisualSignoffValidation {
  ok: boolean;
  waivedFindings: string[];
  error?: string;
}

/**
 * Validate a visual signoff against the exact screenshot manifest and
 * findings it claims to approve. Only Visual Critic blockers are waivable;
 * deterministic blockers always reject the signoff.
 */
export function validateVisualSignoff(input: {
  parsed: ParsedSignoff;
  findings: VisualFinding[];
  manifestHash: string;
  findingsHash: string;
  now: Date;
  maxMajor?: number;
}): VisualSignoffValidation {
  const { parsed, findings, manifestHash, findingsHash, now } = input;
  if (!parsed.valid) {
    return {
      ok: false,
      waivedFindings: [],
      error: `VISUAL_SIGNOFF_INVALID: ${parsed.error ?? "invalid signoff"}`,
    };
  }
  if (parsed.manifestHash !== manifestHash) {
    return {
      ok: false,
      waivedFindings: [],
      error: `VISUAL_SIGNOFF_STALE: manifestHash ${parsed.manifestHash ?? "missing"} != ${manifestHash}`,
    };
  }
  if (parsed.findingsHash !== findingsHash) {
    return {
      ok: false,
      waivedFindings: [],
      error: `VISUAL_SIGNOFF_STALE: findingsHash ${parsed.findingsHash ?? "missing"} != ${findingsHash}`,
    };
  }

  const byId = new Map(findings.map((finding) => [finding.id, finding]));
  const maxMajor = input.maxMajor ?? 2;
  const majors = findings.filter((finding) => finding.severity === "major");
  if (majors.length > maxMajor) {
    return {
      ok: false,
      waivedFindings: [],
      error: `VISUAL_MAJOR_LIMIT: ${majors.length} > ${maxMajor}`,
    };
  }
  const accepted = new Map<string, (typeof parsed.acceptedMajors)[number]>();
  for (const entry of parsed.acceptedMajors) {
    if (accepted.has(entry.findingId)) {
      return {
        ok: false,
        waivedFindings: [],
        error: `VISUAL_MAJOR_DUPLICATE: ${entry.findingId}`,
      };
    }
    const finding = byId.get(entry.findingId);
    if (finding === undefined) {
      return {
        ok: false,
        waivedFindings: [],
        error: `VISUAL_MAJOR_UNKNOWN: ${entry.findingId}`,
      };
    }
    if (finding.severity !== "major") {
      return {
        ok: false,
        waivedFindings: [],
        error: `VISUAL_MAJOR_NOT_MAJOR: ${entry.findingId}`,
      };
    }
    accepted.set(entry.findingId, entry);
  }
  for (const major of majors) {
    if (!accepted.has(major.id)) {
      return {
        ok: false,
        waivedFindings: [],
        error: `VISUAL_MAJOR_UNACCEPTED: ${major.id}`,
      };
    }
  }
  const waivers = new Map<string, IaWaiver>();
  for (const waiver of parsed.waivers) {
    if (waivers.has(waiver.findingId)) {
      return {
        ok: false,
        waivedFindings: [],
        error: `VISUAL_WAIVER_DUPLICATE: ${waiver.findingId}`,
      };
    }
    const finding = byId.get(waiver.findingId);
    if (finding === undefined) {
      return {
        ok: false,
        waivedFindings: [],
        error: `VISUAL_WAIVER_UNKNOWN: ${waiver.findingId}`,
      };
    }
    if (finding.code !== "VISUAL_CRITIC_BLOCKER") {
      return {
        ok: false,
        waivedFindings: [],
        error: `VISUAL_WAIVER_NOT_ALLOWED: ${waiver.findingId} (${finding.code})`,
      };
    }
    if (!waiverIsCurrent(waiver, now)) {
      return {
        ok: false,
        waivedFindings: [],
        error: `VISUAL_WAIVER_EXPIRED: ${waiver.findingId}`,
      };
    }
    waivers.set(waiver.findingId, waiver);
  }

  const waivedFindings: string[] = [];
  for (const finding of findings) {
    if (finding.severity !== "blocker") continue;
    if (finding.code !== "VISUAL_CRITIC_BLOCKER") {
      return {
        ok: false,
        waivedFindings: [],
        error: `VISUAL_BLOCKER_UNWAIVED: ${finding.id} (${finding.code})`,
      };
    }
    if (!waivers.has(finding.id)) {
      return {
        ok: false,
        waivedFindings: [],
        error: `VISUAL_BLOCKER_UNWAIVED: ${finding.id}`,
      };
    }
    waivedFindings.push(finding.id);
  }

  return { ok: true, waivedFindings };
}

export interface MatchingSignoff {
  text: string;
  signer: string;
  date: string;
  waivedFindings: string[];
}

/**
 * A signoff approves an exact screenshot manifest and findings set, not a run
 * id. Reusing a matching signoff lets a deterministic re-review stay `passed`.
 */
export async function findMatchingSignoff(input: {
  runsDir: string;
  currentRunDir: string;
  manifestHash: string;
  findingsHash: string;
  findings: VisualFinding[];
  now: Date;
}): Promise<MatchingSignoff | undefined> {
  let entries;
  try {
    entries = await readdir(input.runsDir, { withFileTypes: true });
  } catch {
    return undefined;
  }
  const dirs = entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("run-"))
    .map((entry) => path.join(input.runsDir, entry.name))
    .sort()
    .reverse();

  for (const dir of dirs) {
    if (path.resolve(dir) === path.resolve(input.currentRunDir)) continue;
    let state;
    try {
      state = parseVisualRunState(
        JSON.parse(await readFile(path.join(dir, "state.json"), "utf8")) as unknown,
        path.join(dir, "state.json")
      );
    } catch {
      continue;
    }
    if (
      !(state.status === "success" || state.status === "passed") ||
      !state.signoff.visual
    ) {
      continue;
    }
    let text: string;
    try {
      text = await readFile(path.join(dir, "signoff", "visual.md"), "utf8");
    } catch {
      continue;
    }
    const parsed: ParsedSignoff = parseSignoffMarkdown(text);
    const validation = validateVisualSignoff({
      parsed,
      findings: input.findings,
      manifestHash: input.manifestHash,
      findingsHash: input.findingsHash,
      now: input.now,
    });
    if (!validation.ok || parsed.signer === undefined || parsed.date === undefined) {
      continue;
    }
    return {
      text,
      signer: parsed.signer,
      date: parsed.date,
      waivedFindings: validation.waivedFindings,
    };
  }
  return undefined;
}
