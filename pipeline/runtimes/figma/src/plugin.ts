import type {
  FigmaPlan,
  FigmaPlanNode,
  FigmaReadback,
  FigmaReadbackNode,
} from "@prd-ui/contracts";

type FigmaNode = any;
type FigmaStyle = any;

const errors: string[] = [];
const fonts: FigmaReadback["fonts"] = [];
const variables: Record<string, FigmaNode> = {};
const alphaVariables: Record<string, FigmaNode> = {};
const textStyles: Record<string, FigmaStyle> = {};
const componentVariants: Record<string, FigmaNode> = {};
let variableCollection: FigmaNode | undefined;

function post(type: string, payload: Record<string, unknown>): void {
  figma.ui.postMessage({ type, ...payload });
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const value = hex.replace("#", "");
  return {
    r: Number.parseInt(value.slice(0, 2), 16) / 255,
    g: Number.parseInt(value.slice(2, 4), 16) / 255,
    b: Number.parseInt(value.slice(4, 6), 16) / 255,
  };
}

function colorToHex(color: { r: number; g: number; b: number } | undefined): string {
  if (color === undefined) return "#000000";
  const channel = (value: number): string =>
    Math.round(Math.max(0, Math.min(1, value)) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${channel(color.r)}${channel(color.g)}${channel(color.b)}`.toUpperCase();
}

function solidPaintColor(value: any): { r: number; g: number; b: number } | undefined {
  if (value === null || typeof value !== "object") return undefined;
  if (value.type !== undefined && value.type !== "SOLID") return undefined;
  const color = value.color;
  if (color === undefined || typeof color.r !== "number") return undefined;
  return color;
}

/**
 * Effective alpha of a paint. Figma reports opacity 1 for paints bound to an
 * RGBA variable (the plugin tints via `token/alpha-NN` variables), so resolve
 * the bound variable's alpha when present.
 */
async function paintAlpha(value: any): Promise<number> {
  const opacity = typeof value?.opacity === "number" ? value.opacity : 1;
  if (opacity !== 1) return opacity;
  const bound = value?.boundVariables?.color;
  const alias = Array.isArray(bound) ? bound[0] : bound;
  const id = typeof alias === "string" ? alias : alias?.id;
  if (typeof id === "string") {
    try {
      const variable = await figma.variables.getVariableByIdAsync(id);
      const values = variable?.valuesByMode ?? {};
      for (const entry of Object.values(values)) {
        const alpha = (entry as any)?.a;
        if (typeof alpha === "number") return alpha;
      }
    } catch {
      // Unreadable variable: fall back to the paint's own opacity.
    }
  }
  return opacity;
}

function sideWeight(node: FigmaNode, side: "Top" | "Bottom" | "Left"): number | undefined {
  const perSide = node[`stroke${side}Weight`];
  if (typeof perSide === "number") return perSide;
  return typeof node.strokeWeight === "number" ? node.strokeWeight : undefined;
}

function profileName(plan: FigmaPlan): string {
  const first = Object.keys(plan.textStyles)[0] ?? "b-mobile/body.md";
  return first.split("/")[0] ?? "b-mobile";
}

function recordFont(family: string, style: string, fallback: boolean): void {
  if (fonts.some((font) => font.family === family && font.style === style)) return;
  fonts.push({ family, style, fallback });
}

async function loadFont(family: string, weight: number): Promise<{ family: string; style: string }> {
  const style = weight >= 600 ? "SemiBold" : weight >= 500 ? "Medium" : "Regular";
  try {
    await figma.loadFontAsync({ family, style });
    recordFont(family, style, false);
    return { family, style };
  } catch {
    const fallback = { family: "PingFang SC", style: "Regular" };
    await figma.loadFontAsync(fallback);
    recordFont(fallback.family, fallback.style, true);
    return fallback;
  }
}

async function ensureCollection(plan: FigmaPlan): Promise<void> {
  if (variableCollection === undefined) {
    const name = `${profileName(plan)} Tokens`;
    const collections = await figma.variables.getLocalVariableCollectionsAsync();
    const existing = collections.find((collection: FigmaNode) => collection.name === name);
    variableCollection = existing ?? figma.variables.createVariableCollection(name);
  }
  const modeId = variableCollection.modes[0].modeId;
  const findVariable = async (name: string) =>
    (
      await Promise.all(
        variableCollection.variableIds.map((id: string) =>
          figma.variables.getVariableByIdAsync(id)
        )
      )
    ).find((variable: FigmaNode) => variable?.name === name);
  for (const [token, value] of Object.entries(plan.tokens)) {
    if (!token.startsWith("color/")) continue;
    if (variables[token] !== undefined) continue;
    const existingVariable = await findVariable(token);
    const variable =
      existingVariable ??
      figma.variables.createVariable(token, variableCollection, "COLOR");
    variable.setValueForMode(modeId, { ...hexToRgb(value), a: 1 });
    variables[token] = variable;
  }
  // Figma drops paint opacity for variable-bound fills, so tinted tokens need
  // their own RGBA variable (one per token+alpha pair used by the plan).
  const alphaPairs: Array<{ token: string; alpha: number }> = [];
  for (const node of planNodes(plan.root)) {
    if (node.fill !== undefined && node.fillAlpha !== undefined && node.fillAlpha < 1) {
      alphaPairs.push({ token: node.fill, alpha: node.fillAlpha });
    }
  }
  for (const style of Object.values(plan.components.Button.variants)) {
    if (style.stroke !== undefined && style.strokeAlpha !== undefined && style.strokeAlpha < 1) {
      alphaPairs.push({ token: style.stroke, alpha: style.strokeAlpha });
    }
  }
  for (const { token: fill, alpha } of alphaPairs) {
    const key = `${fill}@${alpha}`;
    if (alphaVariables[key] !== undefined) continue;
    const name = `${fill}/alpha-${Math.round(alpha * 100)}`;
    const existingVariable = await findVariable(name);
    const variable =
      existingVariable ??
      figma.variables.createVariable(name, variableCollection, "COLOR");
    const value = plan.tokens[fill];
    variable.setValueForMode(modeId, {
      ...(value === undefined ? { r: 0, g: 0, b: 0 } : hexToRgb(value)),
      a: alpha,
    });
    alphaVariables[key] = variable;
  }
}
function* planNodes(node: FigmaPlanNode): Generator<FigmaPlanNode> {
  yield node;
  if (node.child !== undefined) yield* planNodes(node.child);
  for (const child of node.children ?? []) yield* planNodes(child);
}
function paint(token: string, plan: FigmaPlan, alpha = 1): any {
  const value = plan.tokens[token];
  const solid: any = {
    type: "SOLID",
    color: value === undefined ? { r: 0, g: 0, b: 0 } : hexToRgb(value),
    opacity: alpha,
  };
  const variable = variables[token];
  if (alpha < 1) {
    const alphaVariable = alphaVariables[`${token}@${alpha}`];
    if (alphaVariable !== undefined) {
      return figma.variables.setBoundVariableForPaint(
        { ...solid, opacity: 1 },
        "color",
        alphaVariable
      );
    }
  }
  return variable === undefined
    ? solid
    : figma.variables.setBoundVariableForPaint(solid, "color", variable);
}

async function ensureTextStyle(plan: FigmaPlan, name: string): Promise<FigmaStyle> {
  const existing = textStyles[name] ?? (await figma.getLocalTextStylesAsync()).find((style: FigmaStyle) => style.name === name);
  if (existing !== undefined) {
    textStyles[name] = existing;
    await figma.loadFontAsync(existing.fontName);
    return existing;
  }
  const definition = plan.textStyles[name];
  if (definition === undefined) throw new Error(`TEXT_STYLE_MISSING: ${name}`);
  const font = await loadFont(definition.fontFamily, definition.fontWeight);
  const style = figma.createTextStyle();
  style.name = name;
  style.fontName = font;
  style.fontSize = definition.fontSize;
  style.lineHeight = { unit: "PIXELS", value: definition.lineHeight };
  textStyles[name] = style;
  return style;
}

async function ensureButtonSet(plan: FigmaPlan, page: FigmaNode): Promise<void> {
  if (Object.keys(componentVariants).length > 0) return;
  const name = `${profileName(plan)}/Button`;
  const existing = figma.root.findAll(
    (node: FigmaNode) => node.type === "COMPONENT_SET" && node.name === name
  )[0];
  if (existing !== undefined) {
    for (const child of existing.children ?? []) {
      const match = /Emphasis=(.+)/.exec(child.name ?? "");
      if (match?.[1] !== undefined) componentVariants[match[1]] = child;
    }
    return;
  }
  const bodyStyle = Object.keys(plan.textStyles).find((name) => name.endsWith("/body.md")) ?? Object.keys(plan.textStyles)[0] ?? "b-mobile/body.md";
  const labelStyle = await ensureTextStyle(plan, bodyStyle);
  const components: FigmaNode[] = [];
  for (const [variant, style] of Object.entries(plan.components.Button.variants)) {
    const component = figma.createComponent();
    component.name = `Emphasis=${variant}`;
    component.layoutMode = "HORIZONTAL";
    component.primaryAxisSizingMode = "AUTO";
    component.counterAxisSizingMode = "AUTO";
    component.paddingLeft = style.paddingX ?? 16;
    component.paddingRight = style.paddingX ?? 16;
    component.paddingTop = style.paddingY ?? 8;
    component.paddingBottom = style.paddingY ?? 8;
    component.cornerRadius = style.radius ?? 6;
    component.fills =
      style.fill === undefined ? [] : [paint(style.fill, plan, style.fillAlpha ?? 1)];
    if (style.stroke !== undefined) {
      component.strokes = [paint(style.stroke, plan, style.strokeAlpha ?? 1)];
      component.strokeWeight = style.strokeWidth ?? 1;
      component.strokeAlign = "INSIDE";
    } else {
      component.strokes = [];
    }
    if (style.height !== undefined) {
      component.resize(component.width, style.height);
      component.counterAxisSizingMode = "FIXED";
    }
    const variantLabelStyle = await ensureTextStyle(
      plan,
      style.labelTextStyle ?? bodyStyle
    );
    const label = figma.createText();
    label.name = "Label";
    await figma.loadFontAsync(variantLabelStyle.fontName);
    await label.setTextStyleIdAsync(variantLabelStyle.id);
    label.characters = "按钮";
    label.fills = [paint(style.text, plan)];
    component.appendChild(label);
    components.push(component);
    componentVariants[variant] = component;
  }
  const set = figma.combineAsVariants(components, page);
  set.name = name;
  set.x = plan.width + 100;
  set.y = 0;
  for (const component of components) {
    const match = /Emphasis=(.+)/.exec(component.name);
    if (match?.[1] !== undefined) componentVariants[match[1]] = component;
  }
}

function applyFrameStyle(node: FigmaNode, planNode: FigmaPlanNode, plan: FigmaPlan): void {
  const layoutMode = planNode.layoutMode ?? "NONE";
  if (layoutMode !== "NONE") {
    node.layoutMode = layoutMode;
    const width = planNode.width;
    const height = planNode.height;
    node.resize(width ?? 100, height ?? 100);
    const horizontal = layoutMode === "HORIZONTAL";
    node.primaryAxisSizingMode =
      (horizontal ? width : height) === undefined ? "AUTO" : "FIXED";
    node.counterAxisSizingMode =
      (horizontal ? height : width) === undefined ? "AUTO" : "FIXED";
    node.itemSpacing = planNode.gap ?? 0;
    const padding = planNode.padding;
    const paddingX = planNode.paddingX;
    const paddingY = planNode.paddingY;
    node.paddingLeft = planNode.paddingLeft ?? padding ?? paddingX ?? 0;
    node.paddingRight = planNode.paddingRight ?? padding ?? paddingX ?? 0;
    node.paddingTop = planNode.paddingTop ?? padding ?? paddingY ?? 0;
    node.paddingBottom = planNode.paddingBottom ?? padding ?? paddingY ?? 0;
    const alignMap: Record<string, string> = { START: "MIN", CENTER: "CENTER", END: "MAX" };
    if (planNode.alignItems !== undefined) {
      node.counterAxisAlignItems = alignMap[planNode.alignItems] ?? "MIN";
    }
    if (planNode.justifyContent !== undefined) {
      node.primaryAxisAlignItems =
        planNode.justifyContent === "SPACE_BETWEEN"
          ? "SPACE_BETWEEN"
          : alignMap[planNode.justifyContent] ?? "MIN";
    }
  } else {
    node.resize(planNode.width ?? 100, planNode.height ?? 100);
  }
  if (planNode.clip !== undefined) node.clipsContent = planNode.clip;
  if (planNode.fill !== undefined) {
    node.fills = [paint(planNode.fill, plan, planNode.fillAlpha ?? 1)];
    node.setPluginData("fillToken", planNode.fill);
  } else {
    node.fills = [];
  }
  const borderTop = planNode.borderTop;
  const borderBottom = planNode.borderBottom;
  const borderLeft = planNode.borderLeft;
  if (borderTop !== undefined || borderBottom !== undefined || borderLeft !== undefined) {
    const token = borderTop ?? borderBottom ?? borderLeft!;
    node.strokes = [paint(token, plan)];
    node.strokeAlign = "INSIDE";
    node.strokeTopWeight =
      borderTop === undefined ? 0 : (planNode.borderTopWidth ?? 1);
    node.strokeBottomWeight =
      borderBottom === undefined ? 0 : (planNode.borderBottomWidth ?? 1);
    node.strokeLeftWeight =
      borderLeft === undefined ? 0 : (planNode.borderLeftWidth ?? 1);
    node.strokeRightWeight = 0;
    node.setPluginData("strokeToken", token);
  } else if (planNode.stroke !== undefined) {
    node.strokes = [paint(planNode.stroke, plan)];
    node.strokeWeight = planNode.strokeWidth ?? 1;
    node.strokeAlign = "INSIDE";
    node.setPluginData("strokeToken", planNode.stroke);
  }
  if (planNode.radius !== undefined) node.cornerRadius = planNode.radius;
  if (planNode.shadow === true) {
    node.effects = [
      {
        type: "DROP_SHADOW",
        color: { r: 0, g: 0, b: 0, a: 0.06 },
        offset: { x: 0, y: 1 },
        radius: 2,
        spread: 0,
        visible: true,
        blendMode: "NORMAL",
      },
    ];
  }
}

function applyLayoutChild(node: FigmaNode, planNode: FigmaPlanNode): void {
  if (planNode.layoutGrow !== undefined) node.layoutGrow = planNode.layoutGrow;
  if (planNode.layoutAlign !== undefined) node.layoutAlign = planNode.layoutAlign;
}

async function buildNode(planNode: FigmaPlanNode, plan: FigmaPlan): Promise<FigmaNode> {
  if (planNode.type === "ABSOLUTE") {
    const wrapper = figma.createFrame();
    wrapper.name = planNode.name;
    wrapper.layoutMode = "NONE";
    wrapper.resize(planNode.width, planNode.height);
    wrapper.x = planNode.x;
    wrapper.y = planNode.y;
    wrapper.clipsContent = false;
    wrapper.fills = [];
    wrapper.setPluginData("specId", planNode.specId);
    wrapper.setPluginData("kind", "ABSOLUTE");
    const child = await buildNode(planNode.child!, plan);
    wrapper.appendChild(child);
    child.x = 0;
    child.y = 0;
    return wrapper;
  }

  if (planNode.type === "FRAME") {
    const node = figma.createFrame();
    node.name = planNode.name;
    node.setPluginData("specId", planNode.specId);
    node.setPluginData("kind", "FRAME");
    applyFrameStyle(node, planNode, plan);
    for (const childPlan of planNode.children ?? []) {
      const child = await buildNode(childPlan, plan);
      node.appendChild(child);
      applyLayoutChild(child, childPlan);
      const stretchVertical =
        planNode.layoutMode === "VERTICAL" &&
        (planNode.alignItems === undefined || planNode.alignItems === "START") &&
        childPlan.width === undefined &&
        childPlan.layoutAlign === undefined;
      if (stretchVertical) {
        child.layoutAlign = "STRETCH";
        child.layoutSizingHorizontal = "FILL";
      }
    }
    return node;
  }

  if (planNode.type === "TEXT") {
    const styleName = planNode.textStyle;
    if (styleName === undefined) throw new Error(`TEXT_STYLE_MISSING: ${planNode.specId}`);
    const style = await ensureTextStyle(plan, styleName);
    await figma.loadFontAsync(style.fontName);
    const node = figma.createText();
    node.name = planNode.name;
    node.setPluginData("specId", planNode.specId);
    node.setPluginData("kind", "TEXT");
    await node.setTextStyleIdAsync(style.id);
    node.setPluginData("textStyleName", styleName);
    node.characters = planNode.characters ?? "";
    if (planNode.color !== undefined) {
      node.fills = [paint(planNode.color, plan)];
      node.setPluginData("fillToken", planNode.color);
    }
    if (planNode.align !== undefined) {
      node.textAlignHorizontal =
        planNode.align === "CENTER" ? "CENTER" : planNode.align === "RIGHT" ? "RIGHT" : "LEFT";
    }
    node.textAutoResize = "WIDTH_AND_HEIGHT";
    return node;
  }

  if (planNode.type === "INSTANCE") {
    const component = componentVariants[planNode.variant ?? "primary"];
    if (component === undefined) throw new Error(`BUTTON_VARIANT_MISSING: ${planNode.variant}`);
    const instance = component.createInstance();
    instance.name = planNode.name;
    instance.setPluginData("specId", planNode.specId);
    instance.setPluginData("kind", "INSTANCE");
    instance.setPluginData("variant", planNode.variant ?? "");
    if (planNode.height !== undefined) instance.resize(instance.width, planNode.height);
    const label = instance.findOne((node: FigmaNode) => node.type === "TEXT");
    if (label !== undefined && planNode.label !== undefined) {
      await figma.loadFontAsync(label.fontName);
      label.characters = planNode.label;
    }
    return instance;
  }

  if (planNode.type === "GLYPH") {
    let font = { family: "Material Symbols Rounded", style: "Regular" };
    try {
      await figma.loadFontAsync(font);
      recordFont(font.family, font.style, false);
    } catch {
      font = await loadFont("Noto Sans SC", 400);
      errors.push(`GLYPH_FONT_FALLBACK: ${planNode.specId}`);
    }
    const node = figma.createText();
    node.name = planNode.name;
    node.setPluginData("specId", planNode.specId);
    node.setPluginData("kind", "GLYPH");
    node.fontName = font;
    node.characters = planNode.glyph ?? "";
    node.fontSize = planNode.size ?? 24;
    node.textAutoResize = "NONE";
    node.resize(planNode.size ?? 24, planNode.size ?? 24);
    node.textAlignHorizontal = "CENTER";
    node.textAlignVertical = "CENTER";
    if (planNode.color !== undefined) {
      node.fills = [paint(planNode.color, plan)];
      node.setPluginData("fillToken", planNode.color);
    }
    return node;
  }

  if (planNode.type === "VECTOR") {
    const node = figma.createNodeFromSvg(planNode.svg ?? "");
    node.name = planNode.name;
    node.setPluginData("specId", planNode.specId);
    node.setPluginData("kind", "VECTOR");
    node.resize(planNode.size ?? node.width, planNode.size ?? node.height);
    return node;
  }

  if (planNode.type === "IMAGE") {
    const node = figma.createRectangle();
    node.name = planNode.name;
    node.setPluginData("specId", planNode.specId);
    node.setPluginData("kind", "IMAGE");
    node.resize(planNode.width, planNode.height);
    const base64 = (planNode.dataUrl ?? "").split(",")[1] ?? "";
    const image = figma.createImage(figma.base64Decode(base64));
    node.fills = [{ type: "IMAGE", imageHash: image.hash, scaleMode: "FILL" }];
    node.setPluginData("fillToken", "image");
    if (planNode.radius !== undefined) node.cornerRadius = planNode.radius;
    return node;
  }

  throw new Error(`PLAN_NODE_UNSUPPORTED: ${planNode.type}`);
}

async function readbackNode(node: FigmaNode): Promise<FigmaReadbackNode> {
  const kind = node.getPluginData("kind") || node.type;
  const fillToken = node.getPluginData("fillToken");
  const textStyleName = node.getPluginData("textStyleName");
  const variant = node.getPluginData("variant");
  const text = node.findOne?.((child: FigmaNode) => child.type === "TEXT");
  const mainComponent =
    node.type === "INSTANCE" ? await node.getMainComponentAsync() : null;
  const result: FigmaReadbackNode = {
    nodeId: node.id,
    type: kind,
    name: node.name,
    ...(node.getPluginData("specId") ? { specId: node.getPluginData("specId") } : {}),
    ...(node.layoutMode ? { layoutMode: node.layoutMode } : {}),
    ...(node.itemSpacing !== undefined ? { itemSpacing: node.itemSpacing } : {}),
    ...(node.paddingLeft !== undefined
      ? {
          padding: {
            top: node.paddingTop,
            right: node.paddingRight,
            bottom: node.paddingBottom,
            left: node.paddingLeft,
          },
        }
      : {}),
    ...(node.width !== undefined ? { width: node.width } : {}),
    ...(node.height !== undefined ? { height: node.height } : {}),
    ...(node.x !== undefined ? { x: node.x } : {}),
    ...(node.y !== undefined ? { y: node.y } : {}),
    ...(fillToken ? { fills: [fillToken] } : {}),
    ...(textStyleName ? { textStyleName } : {}),
    ...(node.characters !== undefined ? { characters: node.characters } : {}),
    ...(node.fontName !== undefined && node.fontName !== figma.mixed
      ? { fontName: { family: node.fontName.family, style: node.fontName.style } }
      : {}),
    ...(node.fontSize !== undefined && node.fontSize !== figma.mixed
      ? { fontSize: node.fontSize }
      : {}),
    ...(node.type === "INSTANCE"
      ? {
          componentName: mainComponent?.name,
          variantProperties: { emphasis: variant },
          characters: text?.characters,
        }
      : {}),
    children: [],
  };
  const fills = Array.isArray(node.fills) ? node.fills : [];
  const fillDetails: Array<{ color: string; alpha: number }> = [];
  for (const paintValue of fills) {
    const color = solidPaintColor(paintValue);
    if (color === undefined) continue;
    fillDetails.push({ color: colorToHex(color), alpha: await paintAlpha(paintValue) });
  }
  if (fillDetails.length > 0) result.fillDetails = fillDetails;
  if (typeof node.cornerRadius === "number") result.cornerRadius = node.cornerRadius;
  if (Array.isArray(node.strokes) && node.strokes.length > 0) {
    const strokeColor = solidPaintColor(node.strokes[0]);
    if (strokeColor !== undefined) {
      const border = (
        property: "borderTop" | "borderBottom" | "borderLeft",
        side: "Top" | "Bottom" | "Left"
      ): void => {
        const width = sideWeight(node, side);
        if (width === undefined) return;
        result[property] = { width, color: colorToHex(strokeColor) };
      };
      border("borderTop", "Top");
      border("borderBottom", "Bottom");
      border("borderLeft", "Left");
    }
  }
  if (node.type === "TEXT") {
    if (typeof node.fontWeight === "number") result.fontWeight = node.fontWeight;
    const textPaint = fills.find((paintValue: any) => solidPaintColor(paintValue) !== undefined);
    const textColor = solidPaintColor(textPaint);
    if (textColor !== undefined) result.textColor = colorToHex(textColor);
    const lineHeight = node.lineHeight;
    if (
      lineHeight !== null &&
      typeof lineHeight === "object" &&
      lineHeight.unit === "PIXELS" &&
      typeof lineHeight.value === "number"
    ) {
      result.lineHeight = lineHeight.value;
    }
  }
  const children = node.type === "INSTANCE" ? [] : (node.children ?? []);
  const childNodes: FigmaReadbackNode[] = [];
  for (const child of children) {
    childNodes.push(await readbackNode(child));
  }
  result.children = childNodes;
  return result;
}

async function build(
  plan: FigmaPlan,
  mode: "scratch" | "delivery"
): Promise<{ readback: FigmaReadback; root: FigmaNode }> {
  errors.length = 0;
  fonts.length = 0;
  await figma.loadAllPagesAsync();
  const pageName = mode === "scratch" ? `${plan.pageName} [scratch]` : plan.pageName;
  const existing = figma.root.children.find((page: FigmaNode) => page.name === pageName);
  if (existing !== undefined) {
    if (mode === "delivery") throw new Error(`PAGE_EXISTS: ${pageName}`);
    if (figma.currentPage.id === existing.id) {
      const fallback =
        figma.root.children.find((page: FigmaNode) => page.id !== existing.id) ??
        figma.createPage();
      await figma.setCurrentPageAsync(fallback);
    }
    existing.remove();
    for (const key of Object.keys(componentVariants)) delete componentVariants[key];
  }
  const page = figma.createPage();
  page.name = pageName;
  await figma.setCurrentPageAsync(page);
  await ensureCollection(plan);
  await ensureButtonSet(plan, page);
  const root = await buildNode(plan.root, plan);
  page.appendChild(root);
  figma.viewport.scrollAndZoomIntoView([root]);
  const readback: FigmaReadback = {
    schemaVersion: "1.0",
    pageId: plan.pageId,
    ...(figma.fileKey ? { fileKey: figma.fileKey } : {}),
    builtAt: new Date().toISOString(),
    fonts: [...fonts],
    variables: Object.keys(variables),
    textStyles: Object.keys(textStyles),
    components: [`${profileName(plan)}/Button`],
    nodes: [await readbackNode(root)],
    errors: [...errors],
  };
  return { readback, root };
}

figma.showUI(__html__, { width: 440, height: 680, themeColors: true });

figma.ui.onmessage = async (message: any) => {
  if (message?.type === "build") {
    try {
      post("status", { message: "building" });
      const plan = message.plan as FigmaPlan;
      const mode = message.mode === "delivery" ? "delivery" : "scratch";
      const { readback, root } = await build(plan, mode);
      post("readback", { readback, mode, pageId: plan.pageId });
      // The plugin cannot write files; the UI auto-saves these bytes to
      // `figma:serve` and keeps a download link as fallback.
      const png = await root.exportAsync({
        format: "PNG",
        constraint: { type: "SCALE", value: 1 },
      });
      post("png", { bytes: Array.from(png), pageId: plan.pageId });
    } catch (error) {
      post("error", { message: error instanceof Error ? error.message : String(error) });
    }
  }
};
