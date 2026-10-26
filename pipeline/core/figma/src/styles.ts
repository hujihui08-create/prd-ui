import type {
  Catalog,
  FigmaPlan,
  FigmaPlanNode,
  Profile,
} from "@prd-ui/contracts";

export const MOBILE_WIDTH = 390;
export const MOBILE_HEIGHT = 844;
export const WEB_WIDTH = 1440;
export const WEB_HEIGHT = 900;

export function tokenKey(group: "color" | "space" | "radius", key: string): string {
  return `${group}/${key.replace(/\./g, "/")}`;
}

export function colorToken(key: string): string {
  return tokenKey("color", key);
}

function normalizeKey(group: "space" | "radius", key: string): string {
  const dot = `${group}.`;
  const dash = `${group}-`;
  if (key.startsWith(dot)) return key.slice(dot.length);
  if (key.startsWith(dash)) return key.slice(dash.length);
  return key;
}

export function spacePx(profile: Profile, key: string | undefined, fallback = 0): number {
  if (key === undefined) return fallback;
  const raw = profile.space[normalizeKey("space", key)];
  if (raw === undefined) return fallback;
  return Number.parseInt(raw, 10);
}

export function radiusPx(profile: Profile, key: string | undefined, fallback = 0): number {
  if (key === undefined) return fallback;
  const raw = profile.radius[normalizeKey("radius", key)];
  if (raw === undefined) return fallback;
  return Number.parseInt(raw, 10);
}

export function textStyleName(profile: Profile, role: string): string {
  return `${profile.meta.name}/${role}`;
}

export function textStyleFor(profile: Profile, role: string) {
  const fallback = profile.typography["body.md"];
  return profile.typography[role] ?? fallback;
}

export function textColorFor(role: string): string {
  if (role === "label.sm") return colorToken("text.tertiary");
  if (role === "body.sm") return colorToken("text.secondary");
  return colorToken("text.primary");
}

export function statusColor(tone: string): string {
  if (tone === "success") return colorToken("status.success");
  if (tone === "warning") return colorToken("status.warning");
  if (tone === "danger") return colorToken("status.danger");
  if (tone === "info") return colorToken("status.info");
  if (tone === "customer") return colorToken("accent.customer");
  if (tone === "inventory") return colorToken("accent.inventory");
  return colorToken("text.secondary");
}

export function badgeFill(tone: string): string {
  if (tone === "success") return colorToken("status.success");
  if (tone === "warning") return colorToken("status.warning");
  if (tone === "danger") return colorToken("status.danger");
  if (tone === "info") return colorToken("status.info");
  if (tone === "customer") return colorToken("accent.customer");
  if (tone === "inventory") return colorToken("accent.inventory");
  return colorToken("surface.subtle");
}

export function badgeText(tone: string): string {
  if (tone === "neutral") return colorToken("text.secondary");
  return statusColor(tone);
}

export function planTokens(profile: Profile): Record<string, string> {
  return {
    ...Object.fromEntries(
      Object.entries(profile.color).map(([key, value]) => [colorToken(key), value])
    ),
    ...Object.fromEntries(
      Object.entries(profile.space).map(([key, value]) => [tokenKey("space", key), value])
    ),
    ...Object.fromEntries(
      Object.entries(profile.radius).map(([key, value]) => [tokenKey("radius", key), value])
    ),
  };
}

export function planTextStyles(profile: Profile): FigmaPlan["textStyles"] {
  return Object.fromEntries(
    Object.entries(profile.typography).map(([role, style]) => [
      textStyleName(profile, role),
      style,
    ])
  );
}

export function planButtonComponents(profile: Profile): FigmaPlan["components"] {
  const labelStyle = textStyleName(profile, "body.md");
  return {
    Button: {
      variants: {
        primary: {
          fill: colorToken("action.primary"),
          text: colorToken("text.onAction"),
          labelTextStyle: labelStyle,
        },
        secondary: {
          fill: colorToken("surface.default"),
          text: colorToken("text.primary"),
          labelTextStyle: labelStyle,
        },
        ghost: {
          fill: colorToken("surface.default"),
          text: colorToken("text.secondary"),
          labelTextStyle: labelStyle,
        },
        danger: {
          fill: colorToken("surface.default"),
          text: colorToken("status.danger"),
          labelTextStyle: labelStyle,
        },
      },
    },
  };
}

export function buttonMapping(catalog: Catalog): string {
  return (
    catalog.components.find((component) => component.id === "Button")?.mapping?.figma ??
    "b-mobile/Button"
  );
}

export function frame(
  specId: string,
  name: string,
  layoutMode: "VERTICAL" | "HORIZONTAL" | "NONE",
  children: FigmaPlanNode[],
  options: Partial<FigmaPlanNode> = {}
): FigmaPlanNode {
  return {
    specId,
    type: "FRAME",
    name,
    layoutMode,
    children,
    ...options,
  };
}

export function text(
  specId: string,
  name: string,
  characters: string,
  profile: Profile,
  role: string,
  options: Partial<FigmaPlanNode> = {}
): FigmaPlanNode {
  return {
    specId,
    type: "TEXT",
    name,
    characters,
    textStyle: textStyleName(profile, role),
    color: textColorFor(role),
    ...options,
  };
}

export function glyph(
  specId: string,
  name: string,
  glyphName: string,
  size: number,
  color: string
): FigmaPlanNode {
  return {
    specId,
    type: "GLYPH",
    name,
    glyph: glyphName,
    size,
    color,
  };
}

export function instance(
  specId: string,
  label: string,
  variant: string,
  options: Partial<FigmaPlanNode> = {}
): FigmaPlanNode {
  return {
    specId,
    type: "INSTANCE",
    name: `Button:${label}`,
    component: "Button",
    variant,
    label,
    ...options,
  };
}
