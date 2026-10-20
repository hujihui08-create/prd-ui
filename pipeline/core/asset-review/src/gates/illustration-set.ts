import type { AssetBrief, HardGateIssue, HardGateResult } from "../contracts.js";
import { attr, gateResult, issue, parseSvg, parseViewBox } from "./svg.js";

interface IllustrationSignature {
  id: string;
  styleRef: string;
  palette: string;
  size: string;
}

function normalizedPalette(brief: AssetBrief): string {
  const palette = brief.constraints.palette ?? [];
  if (palette.length === 0) return "(none)";
  return [...new Set(palette.map((color) => color.trim().toLowerCase()))].sort().join(",");
}

/**
 * Set-level consistency for illustrations. Every image is checked against the
 * brief palette on its own by `checkIllustration`; this gate makes the whole
 * collection agree on style reference, palette and canvas size. Call it once
 * after all illustrations pass their individual gates.
 */
export function checkIllustrationSet(
  illustrations: Array<{ id: string; svg: string; brief: AssetBrief }>
): HardGateResult {
  const issues: HardGateIssue[] = [];
  const signatures: IllustrationSignature[] = [];

  for (const illustration of illustrations) {
    const parsed = parseSvg(illustration.svg);
    if (!parsed) {
      issues.push(
        issue(
          "ILLUSTRATION_SET_INVALID",
          `Illustration ${illustration.id} is not a well-formed SVG.`,
          illustration.id
        )
      );
      continue;
    }
    const viewBox = parseViewBox(attr(parsed.root, "viewBox"));
    signatures.push({
      id: illustration.id,
      styleRef: illustration.brief.styleRef,
      palette: normalizedPalette(illustration.brief),
      size: viewBox ? `${viewBox[2]}x${viewBox[3]}` : "(no-viewBox)",
    });
  }

  const compare = (label: string, valueOf: (signature: IllustrationSignature) => string): void => {
    const byValue = new Map<string, string[]>();
    for (const signature of signatures) {
      const value = valueOf(signature);
      const ids = byValue.get(value);
      if (ids === undefined) {
        byValue.set(value, [signature.id]);
      } else {
        ids.push(signature.id);
      }
    }
    if (byValue.size > 1) {
      const detail = [...byValue.entries()]
        .map(([value, ids]) => `${value}:${ids.join(",")}`)
        .join(" | ");
      issues.push(
        issue(
          "ILLUSTRATION_SET_INCONSISTENT",
          `Illustration set disagrees on ${label}: ${detail}.`,
          label
        )
      );
    }
  };

  compare("styleRef", (signature) => signature.styleRef);
  compare("palette", (signature) => signature.palette);
  compare("viewBox", (signature) => signature.size);

  return gateResult(issues);
}
