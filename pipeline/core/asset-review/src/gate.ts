import type { AssetBrief, HardGateResult } from "./contracts.js";
import { checkIcon } from "./gates/icon.js";
import { checkIllustration } from "./gates/illustration.js";
import { gateResult, issue } from "./gates/svg.js";

/** Deterministic gate dispatch by asset kind. Poster gates arrive in M2. */
export function runGate(brief: AssetBrief, svg: string): HardGateResult {
  if (brief.kind === "icon") return checkIcon(svg, brief);
  if (brief.kind === "illustration") return checkIllustration(svg, brief);
  return gateResult([
    issue("POSTER_NOT_IMPLEMENTED", "Poster hard gates are not implemented in M0.", brief.kind),
  ]);
}
