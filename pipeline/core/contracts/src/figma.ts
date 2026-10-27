import { z } from "zod";
import type { TextStyleDef } from "./profile.js";

export type FigmaNodeType =
  | "FRAME"
  | "TEXT"
  | "INSTANCE"
  | "GLYPH"
  | "VECTOR"
  | "IMAGE"
  | "ABSOLUTE";

export type FigmaMappingStatus = "mapped" | "degraded" | "unmapped";

export interface FigmaCoverageNode {
  specId: string;
  specType: string;
  path: string;
  status: FigmaMappingStatus | "skipped";
  reason?: string;
}

export interface FigmaCoverage {
  nodes: FigmaCoverageNode[];
  summary: {
    spec: number;
    derived: number;
    mapped: number;
    degraded: number;
    unmapped: number;
    skipped: number;
  };
}

export interface FigmaPlanNode {
  specId: string;
  type: FigmaNodeType;
  name: string;
  /** Mapping provenance and status stamped by the plan compiler. */
  origin?: "spec" | "derived";
  mapping?: FigmaMappingStatus;
  reason?: string;
  layoutMode?: "VERTICAL" | "HORIZONTAL" | "NONE";
  alignItems?: "CENTER" | "START" | "END";
  justifyContent?: "CENTER" | "SPACE_BETWEEN" | "START" | "END";
  width?: number;
  height?: number;
  padding?: number;
  paddingX?: number;
  paddingY?: number;
  /** Per-side padding; overrides paddingX/paddingY/padding when present. */
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  gap?: number;
  fill?: string;
  fillAlpha?: number;
  stroke?: string;
  strokeWidth?: number;
  /** Per-side borders mirror CSS border-{top,bottom,left}; width defaults to 1. */
  borderTop?: string;
  borderTopWidth?: number;
  borderBottom?: string;
  borderBottomWidth?: number;
  borderLeft?: string;
  borderLeftWidth?: number;
  shadow?: boolean;
  radius?: number;
  clip?: boolean;
  /** Hidden in the Figma frame (ActionMenu sheet); parity only sees the closed state. */
  visible?: boolean;
  layoutGrow?: number;
  layoutAlign?: "STRETCH";
  characters?: string;
  textStyle?: string;
  color?: string;
  align?: "LEFT" | "CENTER" | "RIGHT";
  component?: "Button";
  variant?: string;
  label?: string;
  glyph?: string;
  size?: number;
  assetId?: string;
  svg?: string;
  dataUrl?: string;
  x?: number;
  y?: number;
  child?: FigmaPlanNode;
  children?: FigmaPlanNode[];
}

export interface FigmaButtonVariant {
  fill?: string;
  fillAlpha?: number;
  text: string;
  stroke?: string;
  strokeWidth?: number;
  strokeAlpha?: number;
  radius?: number;
  paddingX?: number;
  paddingY?: number;
  height?: number;
  labelTextStyle: string;
}

export interface FigmaPlan {
  schemaVersion: "1.0";
  project: string;
  pageId: string;
  pageName: string;
  width: number;
  height: number;
  background: string;
  tokens: Record<string, string>;
  textStyles: Record<string, TextStyleDef>;
  components: {
    Button: {
      variants: Record<string, FigmaButtonVariant>;
    };
  };
  coverage?: FigmaCoverage;
  root: FigmaPlanNode;
  stats: {
    frames: number;
    texts: number;
    instances: number;
    icons: number;
    images: number;
  };
}

export interface FigmaBorderSide {
  width: number;
  color: string;
}

export interface FigmaFill {
  color: string;
  alpha: number;
}

export interface FigmaReadbackNode {
  specId?: string;
  nodeId: string;
  type: string;
  name: string;
  visible?: boolean;
  layoutMode?: string;
  itemSpacing?: number;
  padding?: { top: number; right: number; bottom: number; left: number };
  width?: number;
  height?: number;
  x?: number;
  y?: number;
  fills?: string[];
  cornerRadius?: number;
  borderTop?: FigmaBorderSide;
  borderBottom?: FigmaBorderSide;
  borderLeft?: FigmaBorderSide;
  fillDetails?: FigmaFill[];
  fontName?: { family: string; style: string };
  fontSize?: number;
  fontWeight?: number;
  textColor?: string;
  lineHeight?: number;
  textStyleName?: string;
  characters?: string;
  componentName?: string;
  variantProperties?: Record<string, string>;
  children?: FigmaReadbackNode[];
}

export interface FigmaReadback {
  schemaVersion: "1.0";
  pageId: string;
  fileKey?: string;
  builtAt: string;
  fonts: Array<{ family: string; style: string; fallback: boolean }>;
  variables: string[];
  textStyles: string[];
  components: string[];
  nodes: FigmaReadbackNode[];
  errors: string[];
}

export type FigmaDiffSeverity = "blocker" | "major" | "minor";

export interface FigmaDiffFinding {
  code: string;
  severity: FigmaDiffSeverity;
  specId?: string;
  message: string;
}

export interface FigmaDiff {
  schemaVersion: "1.0";
  pageId: string;
  passed: boolean;
  findings: FigmaDiffFinding[];
  majorCount: number;
  blockerCount: number;
}

const FigmaPlanNodeSchema: z.ZodType<FigmaPlanNode> = z.lazy(() =>
  z
    .object({
      specId: z.string().min(1),
      type: z.enum(["FRAME", "TEXT", "INSTANCE", "GLYPH", "VECTOR", "IMAGE", "ABSOLUTE"]),
      name: z.string().min(1),
      origin: z.enum(["spec", "derived"]).optional(),
      mapping: z.enum(["mapped", "degraded", "unmapped"]).optional(),
      reason: z.string().min(1).optional(),
      layoutMode: z.enum(["VERTICAL", "HORIZONTAL", "NONE"]).optional(),
      alignItems: z.enum(["CENTER", "START", "END"]).optional(),
      justifyContent: z.enum(["CENTER", "SPACE_BETWEEN", "START", "END"]).optional(),
      width: z.number().nonnegative().optional(),
      height: z.number().nonnegative().optional(),
      padding: z.number().nonnegative().optional(),
      paddingX: z.number().nonnegative().optional(),
      paddingY: z.number().nonnegative().optional(),
      paddingTop: z.number().nonnegative().optional(),
      paddingRight: z.number().nonnegative().optional(),
      paddingBottom: z.number().nonnegative().optional(),
      paddingLeft: z.number().nonnegative().optional(),
      gap: z.number().nonnegative().optional(),
      fill: z.string().min(1).optional(),
      fillAlpha: z.number().min(0).max(1).optional(),
      stroke: z.string().min(1).optional(),
      strokeWidth: z.number().nonnegative().optional(),
      borderTop: z.string().min(1).optional(),
      borderTopWidth: z.number().nonnegative().optional(),
      borderBottom: z.string().min(1).optional(),
      borderBottomWidth: z.number().nonnegative().optional(),
      borderLeft: z.string().min(1).optional(),
      borderLeftWidth: z.number().nonnegative().optional(),
      shadow: z.boolean().optional(),
      radius: z.number().nonnegative().optional(),
      clip: z.boolean().optional(),
      visible: z.boolean().optional(),
      layoutGrow: z.number().nonnegative().optional(),
      layoutAlign: z.literal("STRETCH").optional(),
      characters: z.string().optional(),
      textStyle: z.string().min(1).optional(),
      color: z.string().min(1).optional(),
      align: z.enum(["LEFT", "CENTER", "RIGHT"]).optional(),
      component: z.literal("Button").optional(),
      variant: z.string().min(1).optional(),
      label: z.string().optional(),
      glyph: z.string().min(1).optional(),
      size: z.number().positive().optional(),
      assetId: z.string().min(1).optional(),
      svg: z.string().min(1).optional(),
      dataUrl: z.string().min(1).optional(),
      x: z.number().optional(),
      y: z.number().optional(),
      child: FigmaPlanNodeSchema.optional(),
      children: z.array(FigmaPlanNodeSchema).optional(),
    })
    .strict()
    .superRefine((node, ctx) => {
      if (node.type === "FRAME" && node.layoutMode === undefined) {
        ctx.addIssue({ code: "custom", message: "FRAME requires layoutMode" });
      }
      if (node.type === "FRAME" && node.children === undefined) {
        ctx.addIssue({ code: "custom", message: "FRAME requires children" });
      }
      if (node.type === "TEXT" && (node.characters === undefined || node.textStyle === undefined)) {
        ctx.addIssue({ code: "custom", message: "TEXT requires characters/textStyle" });
      }
      if (node.type === "INSTANCE" && (node.component === undefined || node.variant === undefined)) {
        ctx.addIssue({ code: "custom", message: "INSTANCE requires component/variant" });
      }
      if (node.type === "GLYPH" && (node.glyph === undefined || node.size === undefined)) {
        ctx.addIssue({ code: "custom", message: "GLYPH requires glyph/size" });
      }
      if (node.type === "VECTOR" && (node.assetId === undefined || node.svg === undefined)) {
        ctx.addIssue({ code: "custom", message: "VECTOR requires assetId/svg" });
      }
      if (node.type === "IMAGE" && (node.assetId === undefined || node.dataUrl === undefined)) {
        ctx.addIssue({ code: "custom", message: "IMAGE requires assetId/dataUrl" });
      }
      if (node.type === "ABSOLUTE" && (node.child === undefined || node.x === undefined || node.y === undefined)) {
        ctx.addIssue({ code: "custom", message: "ABSOLUTE requires child/x/y" });
      }
    })
);

const TextStyleDefSchema = z
  .object({
    fontFamily: z.string().min(1),
    fontSize: z.number().int().positive(),
    fontWeight: z.number().int().min(100).max(900),
    lineHeight: z.number().int().positive(),
  })
  .strict();

const FigmaCoverageNodeSchema: z.ZodType<FigmaCoverageNode> = z
  .object({
    specId: z.string().min(1),
    specType: z.string().min(1),
    path: z.string().min(1),
    status: z.enum(["mapped", "degraded", "unmapped", "skipped"]),
    reason: z.string().min(1).optional(),
  })
  .strict();

const FigmaCoverageSchema: z.ZodType<FigmaCoverage> = z
  .object({
    nodes: z.array(FigmaCoverageNodeSchema),
    summary: z
      .object({
        spec: z.number().int().nonnegative(),
        derived: z.number().int().nonnegative(),
        mapped: z.number().int().nonnegative(),
        degraded: z.number().int().nonnegative(),
        unmapped: z.number().int().nonnegative(),
        skipped: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict();

export const FigmaPlanSchema: z.ZodType<FigmaPlan> = z
  .object({
    schemaVersion: z.literal("1.0"),
    project: z.string().min(1),
    pageId: z.string().min(1),
    pageName: z.string().min(1),
    width: z.number().positive(),
    height: z.number().positive(),
    background: z.string().min(1),
    tokens: z.record(z.string(), z.string().min(1)),
    textStyles: z.record(z.string(), TextStyleDefSchema),
    components: z
      .object({
        Button: z
          .object({
            variants: z.record(
              z.string().min(1),
              z
                .object({
                  fill: z.string().min(1).optional(),
                  fillAlpha: z.number().min(0).max(1).optional(),
                  text: z.string().min(1),
                  stroke: z.string().min(1).optional(),
                  strokeWidth: z.number().nonnegative().optional(),
                  strokeAlpha: z.number().min(0).max(1).optional(),
                  radius: z.number().nonnegative().optional(),
                  paddingX: z.number().nonnegative().optional(),
                  paddingY: z.number().nonnegative().optional(),
                  height: z.number().nonnegative().optional(),
                  labelTextStyle: z.string().min(1),
                })
                .strict()
            ),
          })
          .strict(),
      })
      .strict(),
    coverage: FigmaCoverageSchema.optional(),
    root: FigmaPlanNodeSchema,
    stats: z
      .object({
        frames: z.number().int().nonnegative(),
        texts: z.number().int().nonnegative(),
        instances: z.number().int().nonnegative(),
        icons: z.number().int().nonnegative(),
        images: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict();

const FigmaReadbackNodeSchema: z.ZodType<FigmaReadbackNode> = z.lazy(() =>
  z
    .object({
      specId: z.string().min(1).optional(),
      nodeId: z.string().min(1),
      type: z.string().min(1),
      name: z.string().min(1),
      visible: z.boolean().optional(),
      layoutMode: z.string().optional(),
      itemSpacing: z.number().optional(),
      padding: z
        .object({
          top: z.number(),
          right: z.number(),
          bottom: z.number(),
          left: z.number(),
        })
        .strict()
        .optional(),
      width: z.number().optional(),
      height: z.number().optional(),
      x: z.number().optional(),
      y: z.number().optional(),
      fills: z.array(z.string()).optional(),
      cornerRadius: z.number().nonnegative().optional(),
      borderTop: z.object({ width: z.number().nonnegative(), color: z.string().min(1) }).strict().optional(),
      borderBottom: z.object({ width: z.number().nonnegative(), color: z.string().min(1) }).strict().optional(),
      borderLeft: z.object({ width: z.number().nonnegative(), color: z.string().min(1) }).strict().optional(),
      fillDetails: z.array(z.object({ color: z.string().min(1), alpha: z.number().min(0).max(1) }).strict()).optional(),
      fontName: z.object({ family: z.string(), style: z.string() }).strict().optional(),
      fontSize: z.number().optional(),
      fontWeight: z.number().int().min(100).max(900).optional(),
      textColor: z.string().min(1).optional(),
      lineHeight: z.number().nonnegative().optional(),
      textStyleName: z.string().optional(),
      characters: z.string().optional(),
      componentName: z.string().optional(),
      variantProperties: z.record(z.string(), z.string()).optional(),
      children: z.array(FigmaReadbackNodeSchema).optional(),
    })
    .strict()
);

export const FigmaReadbackSchema: z.ZodType<FigmaReadback> = z
  .object({
    schemaVersion: z.literal("1.0"),
    pageId: z.string().min(1),
    fileKey: z.string().optional(),
    builtAt: z.string().min(1),
    fonts: z.array(
      z
        .object({
          family: z.string().min(1),
          style: z.string().min(1),
          fallback: z.boolean(),
        })
        .strict()
    ),
    variables: z.array(z.string()),
    textStyles: z.array(z.string()),
    components: z.array(z.string()),
    nodes: z.array(FigmaReadbackNodeSchema),
    errors: z.array(z.string()),
  })
  .strict();

export const FigmaDiffFindingSchema: z.ZodType<FigmaDiffFinding> = z
  .object({
    code: z.string().min(1),
    severity: z.enum(["blocker", "major", "minor"]),
    specId: z.string().min(1).optional(),
    message: z.string().min(1),
  })
  .strict();

export const FigmaDiffSchema: z.ZodType<FigmaDiff> = z
  .object({
    schemaVersion: z.literal("1.0"),
    pageId: z.string().min(1),
    passed: z.boolean(),
    findings: z.array(FigmaDiffFindingSchema),
    majorCount: z.number().int().nonnegative(),
    blockerCount: z.number().int().nonnegative(),
  })
  .strict();

/**
 * Human Figma signoff block (`<!-- signoff { ... } -->`). It binds the five
 * evidence hashes; any evidence change makes the previous block stale.
 */
export const FigmaSignoffBlockSchema = z
  .object({
    signer: z.string().min(1),
    date: z.string().min(1),
    project: z.string().min(1).optional(),
    planHash: z.string().min(1),
    readbackHash: z.string().min(1),
    conformanceHash: z.string().min(1),
    parityHash: z.string().min(1),
    baselineHash: z.string().min(1),
  })
  .strict();
export type FigmaSignoffBlock = z.infer<typeof FigmaSignoffBlockSchema>;
