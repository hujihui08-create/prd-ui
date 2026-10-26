import type {
  FigmaButtonVariant,
  FigmaDiff,
  FigmaDiffFinding,
  FigmaPlan,
  FigmaPlanNode,
  FigmaReadback,
  FigmaReadbackNode,
} from "@prd-ui/contracts";
import { sameColor } from "./conformance.js";

function finding(
  code: string,
  severity: FigmaDiffFinding["severity"],
  message: string,
  specId?: string
): FigmaDiffFinding {
  return { code, severity, message, ...(specId === undefined ? {} : { specId }) };
}

function styleUnsupported(
  findings: FigmaDiffFinding[],
  specId: string,
  property: string
): void {
  findings.push(
    finding(
      "READBACK_STYLE_UNSUPPORTED",
      "minor",
      `${specId}: readback reports no ${property}`,
      specId
    )
  );
}

function resolveTokenColor(plan: FigmaPlan, token: string | undefined): string | undefined {
  if (token === undefined) return undefined;
  return plan.tokens[token] ?? token;
}

interface DeclaredBorder {
  property: "borderTop" | "borderBottom" | "borderLeft";
  width: number;
  color: string;
}

/**
 * Borders the plan declares for a node. A uniform `stroke`/`strokeWidth` maps
 * to the readback's top border, mirroring how the plugin reads a Figma stroke
 * back (one strokes array, per-side weights).
 */
function declaredBorders(
  plan: FigmaPlan,
  node: FigmaPlanNode,
  variant: FigmaButtonVariant | undefined
): DeclaredBorder[] {
  const borders: DeclaredBorder[] = [];
  const add = (
    property: DeclaredBorder["property"],
    token: string | undefined,
    width: number | undefined
  ): void => {
    if (token === undefined) return;
    borders.push({ property, width: width ?? 1, color: resolveTokenColor(plan, token)! });
  };
  add(
    "borderTop",
    node.borderTop ?? node.stroke ?? variant?.stroke,
    node.borderTopWidth ?? node.strokeWidth ?? variant?.strokeWidth
  );
  add("borderBottom", node.borderBottom, node.borderBottomWidth);
  add("borderLeft", node.borderLeft, node.borderLeftWidth);
  return borders;
}

function flattenPlan(node: FigmaPlanNode, parent?: FigmaPlanNode): Array<{
  node: FigmaPlanNode;
  parent?: FigmaPlanNode;
}> {
  const entries = [{ node, ...(parent === undefined ? {} : { parent }) }];
  for (const child of node.children ?? []) entries.push(...flattenPlan(child, node));
  if (node.child !== undefined) entries.push(...flattenPlan(node.child, node));
  return entries;
}

function flattenReadback(node: FigmaReadbackNode, parent?: FigmaReadbackNode): Array<{
  node: FigmaReadbackNode;
  parent?: FigmaReadbackNode;
}> {
  const entries = [{ node, ...(parent === undefined ? {} : { parent }) }];
  for (const child of node.children ?? []) entries.push(...flattenReadback(child, node));
  return entries;
}

function expectedPadding(node: FigmaPlanNode): { top: number; right: number; bottom: number; left: number } | undefined {
  if (node.type !== "FRAME") return undefined;
  if (node.padding !== undefined) {
    return { top: node.padding, right: node.padding, bottom: node.padding, left: node.padding };
  }
  if (node.paddingX === undefined && node.paddingY === undefined) return undefined;
  return {
    top: node.paddingY ?? 0,
    right: node.paddingX ?? 0,
    bottom: node.paddingY ?? 0,
    left: node.paddingX ?? 0,
  };
}

function nearly(a: number | undefined, b: number | undefined, tolerance = 1): boolean {
  if (a === undefined || b === undefined) return a === b;
  return Math.abs(a - b) <= tolerance;
}

export function diffFigma(
  plan: FigmaPlan,
  readback: FigmaReadback,
  options: { maxMajor?: number } = {}
): FigmaDiff {
  const findings: FigmaDiffFinding[] = [];
  const maxMajor = options.maxMajor ?? 2;

  if (readback.errors.length > 0) {
    findings.push(
      finding(
        "FIGMA_READBACK_INCOMPLETE",
        "blocker",
        `readback errors: ${readback.errors.join("; ")}`
      )
    );
  }
  if (plan.pageId !== readback.pageId) {
    findings.push(
      finding(
        "FIGMA_PAGE_MISMATCH",
        "blocker",
        `plan ${plan.pageId} != readback ${readback.pageId}`
      )
    );
  }

  if (plan.coverage === undefined) {
    findings.push(
      finding(
        "COVERAGE_MISSING",
        "blocker",
        "Plan has no coverage report; regenerate with figma:plan."
      )
    );
  } else {
    for (const node of plan.coverage.nodes) {
      if (node.status === "unmapped") {
        findings.push(
          finding(
            node.reason?.startsWith("SPEC_NODE_ID_MISSING")
              ? "SPEC_NODE_ID_MISSING"
              : "UNMAPPED_COMPONENT",
            "blocker",
            `${node.specType} at ${node.path}: ${node.reason ?? "unmapped"}`,
            node.specId
          )
        );
      } else if (node.status === "degraded") {
        findings.push(
          finding(
            node.reason?.startsWith("UNMAPPED_PROP") ? "UNMAPPED_PROP" : "UNMAPPED_STYLE",
            "major",
            `${node.specType} at ${node.path}: ${node.reason ?? "degraded"}`,
            node.specId
          )
        );
      }
    }
  }

  const planEntries = flattenPlan(plan.root);
  const readbackEntries = flattenReadback({
    nodeId: "root",
    type: "FRAME",
    name: plan.pageName,
    children: readback.nodes,
  });
  // Readbacks produced before the style extension carry none of these fields;
  // they can only be reported as unsupported, not as a concrete mismatch.
  const styleCapable = readbackEntries.some(
    ({ node }) =>
      node.cornerRadius !== undefined ||
      node.borderTop !== undefined ||
      node.borderBottom !== undefined ||
      node.borderLeft !== undefined ||
      node.fillDetails !== undefined ||
      node.fontWeight !== undefined ||
      node.textColor !== undefined ||
      node.lineHeight !== undefined
  );
  const readbackBySpec = new Map(
    readbackEntries
      .filter((entry) => entry.node.specId !== undefined)
      .map((entry) => [entry.node.specId!, entry])
  );

  for (const entry of planEntries) {
    const expected = entry.node;
    const actual = readbackBySpec.get(expected.specId);
    if (actual === undefined) {
      findings.push(
        finding("FIGMA_NODE_MISSING", "blocker", `missing ${expected.type} ${expected.specId}`, expected.specId)
      );
      continue;
    }
    const node = actual.node;
    const expectedChildren = [...(expected.children ?? []), ...(expected.child === undefined ? [] : [expected.child])];
    const actualChildren = node.children ?? [];
    if (expectedChildren.length !== actualChildren.length) {
      findings.push(
        finding(
          "FIGMA_HIERARCHY",
          "blocker",
          `${expected.specId}: expected ${expectedChildren.length} children, got ${actualChildren.length}`,
          expected.specId
        )
      );
    } else {
      for (let index = 0; index < expectedChildren.length; index += 1) {
        const expectedChild = expectedChildren[index]!;
        const actualChild = actualChildren[index]!;
        if (expectedChild.specId !== actualChild.specId) {
          findings.push(
            finding(
              "FIGMA_HIERARCHY",
              "blocker",
              `${expected.specId}[${index}]: expected ${expectedChild.specId}, got ${actualChild.specId ?? actualChild.name}`,
              expected.specId
            )
          );
        }
      }
    }

    if (expected.type === "FRAME" || expected.type === "ABSOLUTE") {
      if (expected.layoutMode !== undefined && expected.layoutMode !== "NONE") {
        if (node.layoutMode !== expected.layoutMode) {
          findings.push(
            finding(
              "FIGMA_LAYOUT_MODE",
              "blocker",
              `${expected.specId}: expected ${expected.layoutMode}, got ${node.layoutMode ?? "none"}`,
              expected.specId
            )
          );
        }
      }
      const padding = expectedPadding(expected);
      if (padding !== undefined && node.padding !== undefined) {
        const diffs = (Object.keys(padding) as Array<keyof typeof padding>).filter(
          (key) => !nearly(padding[key], node.padding?.[key])
        );
        if (diffs.length > 0) {
          findings.push(
            finding(
              "FIGMA_SPACING",
              "major",
              `${expected.specId}: padding differs (${diffs.join(", ")})`,
              expected.specId
            )
          );
        }
      }
      if (expected.gap !== undefined && !nearly(expected.gap, node.itemSpacing)) {
        findings.push(
          finding(
            "FIGMA_SPACING",
            "major",
            `${expected.specId}: gap ${node.itemSpacing ?? "missing"} != ${expected.gap}`,
            expected.specId
          )
        );
      }
    }

    if (expected.width !== undefined && !nearly(expected.width, node.width)) {
      findings.push(
        finding("FIGMA_SIZE", "major", `${expected.specId}: width ${node.width ?? "missing"} != ${expected.width}`, expected.specId)
      );
    }
    if (expected.height !== undefined && !nearly(expected.height, node.height)) {
      findings.push(
        finding("FIGMA_SIZE", "major", `${expected.specId}: height ${node.height ?? "missing"} != ${expected.height}`, expected.specId)
      );
    }

    if (expected.type === "ABSOLUTE") {
      if (
        !nearly(expected.x, node.x) ||
        !nearly(expected.y, node.y) ||
        !nearly(expected.width, node.width) ||
        !nearly(expected.height, node.height)
      ) {
        findings.push(
          finding(
            "FIGMA_ABSOLUTE",
            "major",
            `${expected.specId}: absolute position/size differs`,
            expected.specId
          )
        );
      }
    }

    if (expected.fill !== undefined) {
      if (!readback.variables.includes(expected.fill)) {
        findings.push(
          finding(
            "FIGMA_FILL_UNBOUND",
            "major",
            `${expected.specId}: fill token ${expected.fill} is not a variable`,
            expected.specId
          )
        );
      } else if (node.fills !== undefined && !node.fills.includes(expected.fill)) {
        findings.push(
          finding(
            "FIGMA_FILL_UNBOUND",
            "major",
            `${expected.specId}: fill ${expected.fill} not bound on node`,
            expected.specId
          )
        );
      }
    }

    if (expected.type === "TEXT") {
      if (expected.textStyle !== undefined) {
        if (node.textStyleName !== expected.textStyle) {
          findings.push(
            finding(
              "FIGMA_TEXT_STYLE",
              "blocker",
              `${expected.specId}: text style ${node.textStyleName ?? "missing"} != ${expected.textStyle}`,
              expected.specId
            )
          );
        }
        const style = plan.textStyles[expected.textStyle];
        if (style !== undefined) {
          if (node.fontName !== undefined && node.fontName.family !== style.fontFamily) {
            findings.push(
              finding(
                "FIGMA_FONT",
                "major",
                `${expected.specId}: font ${node.fontName.family} != ${style.fontFamily}`,
                expected.specId
              )
            );
          }
          if (!nearly(node.fontSize, style.fontSize, 0)) {
            findings.push(
              finding(
                "FIGMA_FONT",
                "major",
                `${expected.specId}: font size ${node.fontSize ?? "missing"} != ${style.fontSize}`,
                expected.specId
              )
            );
          }
        }
      }
      if (expected.characters !== undefined) {
        if (node.characters === undefined || node.characters === "") {
          findings.push(
            finding("FIGMA_TEXT_MISSING", "blocker", `${expected.specId}: missing characters`, expected.specId)
          );
        } else if (node.characters !== expected.characters) {
          findings.push(
            finding(
              "FIGMA_TEXT_MISSING",
              "major",
              `${expected.specId}: characters "${node.characters}" != "${expected.characters}"`,
              expected.specId
            )
          );
        }
      }
    }

    const variant =
      expected.type === "INSTANCE"
        ? plan.components.Button.variants[expected.variant ?? ""]
        : undefined;

    const radius = expected.radius ?? variant?.radius;
    if (radius !== undefined) {
      if (node.cornerRadius === undefined) {
        styleUnsupported(findings, expected.specId, "cornerRadius");
      } else if (!nearly(radius, node.cornerRadius, 0.5)) {
        findings.push(
          finding(
            "FIGMA_RADIUS_MISMATCH",
            "major",
            `${expected.specId}: radius ${node.cornerRadius} != ${radius}`,
            expected.specId
          )
        );
      }
    }

    for (const border of declaredBorders(plan, expected, variant)) {
      const actualBorder = node[border.property];
      if (actualBorder === undefined) {
        // A legacy readback cannot distinguish "no border" from "not
        // reported", so it gets the minor unsupported finding. A
        // style-capable readback should have emitted the declared field, so
        // its absence is a concrete mismatch. Exactly one finding per side.
        if (styleCapable) {
          findings.push(
            finding(
              "FIGMA_BORDER_MISMATCH",
              "major",
              `${expected.specId}: ${border.property} missing (expected ${border.width}px ${border.color})`,
              expected.specId
            )
          );
        } else {
          styleUnsupported(findings, expected.specId, border.property);
        }
        continue;
      }
      const problems: string[] = [];
      if (!nearly(border.width, actualBorder.width, 0.5)) {
        problems.push(`width ${actualBorder.width} != ${border.width}`);
      }
      if (border.width > 0 && !sameColor(border.color, actualBorder.color, 1)) {
        problems.push(`color ${actualBorder.color} != ${border.color}`);
      }
      if (problems.length > 0) {
        findings.push(
          finding(
            "FIGMA_BORDER_MISMATCH",
            "major",
            `${expected.specId}: ${border.property} ${problems.join(", ")}`,
            expected.specId
          )
        );
      }
    }

    const fillToken = expected.fill ?? variant?.fill;
    if (fillToken !== undefined) {
      const fillColor = resolveTokenColor(plan, fillToken)!;
      const fillAlpha = expected.fillAlpha ?? variant?.fillAlpha ?? 1;
      const actualFill = node.fillDetails?.[0];
      if (actualFill === undefined) {
        styleUnsupported(findings, expected.specId, "fillDetails");
      } else if (
        !sameColor(fillColor, actualFill.color, 1) ||
        Math.abs(fillAlpha - actualFill.alpha) > 0.01
      ) {
        findings.push(
          finding(
            "FIGMA_FILL_MISMATCH",
            "major",
            `${expected.specId}: fill ${actualFill.color}@${actualFill.alpha} != ${fillColor}@${fillAlpha}`,
            expected.specId
          )
        );
      }
    }

    if (expected.type === "TEXT" && expected.textStyle !== undefined) {
      const style = plan.textStyles[expected.textStyle];
      if (style !== undefined) {
        if (node.fontWeight === undefined) {
          styleUnsupported(findings, expected.specId, "fontWeight");
        } else if (node.fontWeight !== style.fontWeight) {
          findings.push(
            finding(
              "FIGMA_FONT_WEIGHT_MISMATCH",
              "major",
              `${expected.specId}: font weight ${node.fontWeight} != ${style.fontWeight}`,
              expected.specId
            )
          );
        }
        if (node.lineHeight === undefined) {
          styleUnsupported(findings, expected.specId, "lineHeight");
        } else if (!nearly(node.lineHeight, style.lineHeight, 0.5)) {
          findings.push(
            finding(
              "FIGMA_LINE_HEIGHT_MISMATCH",
              "major",
              `${expected.specId}: line height ${node.lineHeight} != ${style.lineHeight}`,
              expected.specId
            )
          );
        }
      }
    }

    if ((expected.type === "TEXT" || expected.type === "GLYPH") && expected.color !== undefined) {
      const textColor = resolveTokenColor(plan, expected.color)!;
      if (node.textColor === undefined) {
        styleUnsupported(findings, expected.specId, "textColor");
      } else if (!sameColor(textColor, node.textColor, 1)) {
        findings.push(
          finding(
            "FIGMA_TEXT_COLOR_MISMATCH",
            "major",
            `${expected.specId}: text color ${node.textColor} != ${textColor}`,
            expected.specId
          )
        );
      }
    }

    if (expected.type === "INSTANCE") {
      if (node.type !== "INSTANCE" || node.componentName === undefined) {
        findings.push(
          finding("FIGMA_COMPONENT_INSTANCE", "blocker", `${expected.specId}: not a component instance`, expected.specId)
        );
      } else {
        if (node.variantProperties?.emphasis !== expected.variant) {
          findings.push(
            finding(
              "FIGMA_COMPONENT_INSTANCE",
              "blocker",
              `${expected.specId}: variant ${node.variantProperties?.emphasis ?? "missing"} != ${expected.variant}`,
              expected.specId
            )
          );
        }
        if (expected.label !== undefined && node.characters !== expected.label) {
          findings.push(
            finding(
              "FIGMA_COMPONENT_INSTANCE",
              "major",
              `${expected.specId}: label ${node.characters ?? "missing"} != ${expected.label}`,
              expected.specId
            )
          );
        }
      }
    }

    if (expected.type === "GLYPH" || expected.type === "VECTOR") {
      if (node.type !== expected.type) {
        findings.push(
          finding("FIGMA_ICON", "major", `${expected.specId}: icon type ${node.type} != ${expected.type}`, expected.specId)
        );
      }
      if (expected.size !== undefined && !nearly(node.width, expected.size) && !nearly(node.height, expected.size)) {
        findings.push(
          finding("FIGMA_ICON", "major", `${expected.specId}: icon size differs`, expected.specId)
        );
      }
    }

    if (expected.type === "IMAGE" && (node.fills === undefined || node.fills.length === 0)) {
      findings.push(
        finding("FIGMA_IMAGE", "major", `${expected.specId}: image fill missing`, expected.specId)
      );
    }
  }

  const planIds = new Set(planEntries.map((entry) => entry.node.specId));
  for (const entry of readbackEntries) {
    if (entry.node.specId !== undefined && !planIds.has(entry.node.specId)) {
      findings.push(
        finding("FIGMA_NODE_EXTRA", "blocker", `extra ${entry.node.type} ${entry.node.specId}`, entry.node.specId)
      );
    }
  }

  const blockerCount = findings.filter((item) => item.severity === "blocker").length;
  const majorCount = findings.filter((item) => item.severity === "major").length;
  return {
    schemaVersion: "1.0",
    pageId: plan.pageId,
    passed: blockerCount === 0 && majorCount <= maxMajor,
    findings,
    majorCount,
    blockerCount,
  };
}

export function diffFigmaPlans(
  pairs: Array<{ plan: FigmaPlan; readback: FigmaReadback }>,
  options: { maxMajor?: number } = {}
): FigmaDiff[] {
  return pairs.map(({ plan, readback }) => diffFigma(plan, readback, options));
}
