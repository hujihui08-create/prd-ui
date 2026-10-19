import type { Finding, PageSpec, Profile } from "@prd-ui/contracts";
import {
  collectStrings,
  finalizeFindings,
  walkSpecNodes,
  type FindingDraft,
  type ValidationContext,
} from "./types.js";

/** `#hex`, rgb()/hsl() and hard-coded px/rem/em values. */
const RAW_VALUE_PATTERN =
  /(?:#[0-9a-fA-F]{3,8}\b)|(?:\brgba?\()|(?:\bhsla?\()|(?:\b\d+(?:\.\d+)?(?:px|rem|em)\b)/i;

const TOKEN_PREFIXES = ["space.", "radius.", "color.", "motion."] as const;

const MIN_FONT_SIZE = { web: 12, mobile: 11 } as const;

function linearizeChannel(channel: number): number {
  const normalized = channel / 255;
  return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(hex: string): number {
  const match = /^#([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!match) throw new Error(`Unsupported color value: ${hex}`);
  const value = match[1]!;
  const red = linearizeChannel(parseInt(value.slice(0, 2), 16));
  const green = linearizeChannel(parseInt(value.slice(2, 4), 16));
  const blue = linearizeChannel(parseInt(value.slice(4, 6), 16));
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

/**
 * WCAG 2.x contrast ratio for `#RRGGBB` inputs. Returns a value in [1, 21].
 * Throws for unsupported color formats (profiles are schema-validated, so this
 * only happens with a hand-built context).
 */
export function contrastRatio(foreground: string, background: string): number {
  const fg = relativeLuminance(foreground);
  const bg = relativeLuminance(background);
  const lighter = Math.max(fg, bg);
  const darker = Math.min(fg, bg);
  return (lighter + 0.05) / (darker + 0.05);
}

function profileTokenExists(profile: Profile, prefix: string, key: string): boolean {
  const bucket =
    prefix === "space."
      ? profile.space
      : prefix === "radius."
        ? profile.radius
        : prefix === "color."
          ? profile.color
          : profile.motion;
  return Object.prototype.hasOwnProperty.call(bucket, key);
}

/**
 * Design-token checks.
 *
 * - `TOKEN-RAW-VALUE`: props contain a raw color/size value.
 * - `TOKEN-UNKNOWN`: a `space.*`/`radius.*`/`color.*`/`motion.*` reference is
 *   not defined by the profile.
 * - `TOKEN-TEXTROLE`: `textRole` is unknown, or a Text node omits it.
 * - `TOKEN-CONTRAST`: primary/secondary text on the default surface is below
 *   4.5:1.
 * - `TOKEN-FONT-SIZE`: a used text role is below the target's minimum size.
 */
export function validateToken(spec: PageSpec, ctx: ValidationContext): Finding[] {
  const drafts: FindingDraft[] = [];
  const visits = walkSpecNodes(spec.layout);

  const push = (
    ruleId: string,
    location: string,
    evidence: string,
    issue: string,
    severity: FindingDraft["severity"] = "blocker"
  ): void => {
    drafts.push({
      ruleId,
      severity,
      category: "token",
      location,
      evidence,
      issue,
    });
  };

  for (const { node, path } of visits) {
    const props = node.props ?? {};
    const serialized = JSON.stringify(props);
    const rawMatch = serialized.match(RAW_VALUE_PATTERN);
    if (rawMatch) {
      push(
        "TOKEN-RAW-VALUE",
        `${path}.props`,
        rawMatch[0],
        `Raw color/size value "${rawMatch[0]}" is not allowed; use a design token.`
      );
    }

    for (const value of collectStrings(props)) {
      const prefix = TOKEN_PREFIXES.find((candidate) => value.startsWith(candidate));
      if (!prefix) continue;
      const key = value.slice(prefix.length);
      if (!profileTokenExists(ctx.profile, prefix, key)) {
        push(
          "TOKEN-UNKNOWN",
          `${path}.props`,
          value,
          `Token "${value}" is not defined in profile "${ctx.profile.meta.name}".`
        );
      }
    }
  }

  const usedTextRoles = new Set<string>();
  for (const { node, path } of visits) {
    if (node.textRole !== undefined) {
      if (!Object.prototype.hasOwnProperty.call(ctx.profile.typography, node.textRole)) {
        push(
          "TOKEN-TEXTROLE",
          `${path}.textRole`,
          node.textRole,
          `Text role "${node.textRole}" is not defined in profile "${ctx.profile.meta.name}".`
        );
      } else {
        usedTextRoles.add(node.textRole);
      }
    } else if (node.type === "Text") {
      push(
        "TOKEN-TEXTROLE",
        `${path}.textRole`,
        "(missing)",
        "Text nodes must declare a textRole so font metrics can be validated."
      );
    }
  }

  const target = spec.meta?.target === "mobile" ? "mobile" : "web";
  const minimum = MIN_FONT_SIZE[target];
  for (const role of usedTextRoles) {
    const style = ctx.profile.typography[role]!;
    if (style.fontSize < minimum) {
      push(
        "TOKEN-FONT-SIZE",
        `profile.typography.${role}`,
        `${style.fontSize}px`,
        `Text role "${role}" uses ${style.fontSize}px, below the ${minimum}px minimum for ${target} pages.`,
        "major"
      );
    }
  }

  const surface = ctx.profile.color["surface.default"];
  if (surface) {
    for (const textToken of ["text.primary", "text.secondary"]) {
      const foreground = ctx.profile.color[textToken];
      if (!foreground) continue;
      try {
        const ratio = contrastRatio(foreground, surface);
        if (ratio < 4.5) {
          push(
            "TOKEN-CONTRAST",
            `profile.color.${textToken}`,
            `${foreground} on ${surface} = ${ratio.toFixed(2)}:1`,
            `Contrast ratio for "${textToken}" on "surface.default" is ${ratio.toFixed(2)}:1, below the 4.5:1 minimum.`,
            "major"
          );
        }
      } catch {
        // Unsupported profile color format. ProfileSchema catches it; do not
        // double-report from the page validator.
      }
    }
  }

  return finalizeFindings(drafts);
}
