// spike/figma-plugin/src/code.ts
import bPlan from "../../spec/figma-plan.b-end.json";
import cPlan from "../../spec/figma-plan.c-end.json";
import { resolveSizingModes } from "../../plan/layout-sizing";

type Plan = typeof bPlan;
type PlanNode = Plan["root"];

interface BuildContext {
  variables: Record<string, Variable>;
  textStyles: Record<string, TextStyle>;
  buttons: ComponentNode[];
}

const SAMPLE_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lK3l5QAAAABJRU5ErkJggg==";

function hexToRgb(hex: string): RGB {
  const value = hex.replace("#", "");
  return {
    r: Number.parseInt(value.slice(0, 2), 16) / 255,
    g: Number.parseInt(value.slice(2, 4), 16) / 255,
    b: Number.parseInt(value.slice(4, 6), 16) / 255,
  };
}

function paint(token: string, variables: Record<string, Variable>): Paint {
  const variable = variables[token];
  const color = variable ? "#D1D5DB" : token.startsWith("#") ? token : "#D1D5DB";
  const solid: SolidPaint = { type: "SOLID", color: hexToRgb(color) };
  if (!variable) return solid;
  return figma.variables.setBoundVariableForPaint(solid, "color", variable);
}

async function loadFont(family: string, style: string): Promise<FontName> {
  try {
    await figma.loadFontAsync({ family, style });
    return { family, style };
  } catch {
    const fallback: FontName = { family: "PingFang SC", style: "Regular" };
    await figma.loadFontAsync(fallback);
    return fallback;
  }
}

async function buildPlan(plan: Plan, pageName: string) {
  const page = figma.createPage();
  page.name = pageName;
  await figma.setCurrentPageAsync(page);

  const collection = figma.variables.createVariableCollection(`${pageName} Tokens`);
  const modeId = collection.modes[0].modeId;
  const variables: Record<string, Variable> = {};
  for (const [name, value] of Object.entries(plan.tokens)) {
    if (!name.startsWith("color.")) continue;
    const variable = figma.variables.createVariable(name, collection, "COLOR");
    variable.setValueForMode(modeId, { ...hexToRgb(value as string), a: 1 });
    variables[name] = variable;
  }

  const textStyles: Record<string, TextStyle> = {};
  for (const [name, style] of Object.entries(plan.textStyles)) {
    const weight = style.fontWeight >= 600 ? "SemiBold" : "Regular";
    const font = await loadFont(style.fontFamily, weight);
    const textStyle = figma.createTextStyle();
    textStyle.name = name;
    textStyle.fontName = font;
    textStyle.fontSize = style.fontSize;
    textStyle.lineHeight = { unit: "PIXELS", value: style.lineHeight };
    textStyles[name] = textStyle;
  }

  const buttons: ComponentNode[] = [];
  const variants = plan.components.Button?.variants ?? {};
  for (const [variant, style] of Object.entries(variants)) {
    const component = figma.createComponent();
    component.name = `Variant=${variant}`;
    component.layoutMode = "HORIZONTAL";
    component.primaryAxisSizingMode = "AUTO";
    component.counterAxisSizingMode = "AUTO";
    component.paddingLeft = 16;
    component.paddingRight = 16;
    component.paddingTop = 8;
    component.paddingBottom = 8;
    component.cornerRadius = 8;
    component.fills = [paint(style.fill, variables)];

    const label = figma.createText();
    label.fontName = await loadFont("Noto Sans SC", "Regular");
    label.characters = "按钮";
    label.fills = [paint(style.text, variables)];
    component.appendChild(label);
    buttons.push(component);
  }
  if (buttons.length > 0) {
    const set = figma.combineAsVariants(buttons, page);
    set.name = "Button";
  }

  const context: BuildContext = { variables, textStyles, buttons };
  const root = await buildNode(plan.root, context);
  page.appendChild(root);
  figma.viewport.scrollAndZoomIntoView([root]);
  return root;
}

async function buildNode(
  node: PlanNode,
  context: BuildContext,
  parentLayout?: "VERTICAL" | "HORIZONTAL"
): Promise<SceneNode> {
  switch (node.type) {
    case "FRAME": {
      const frame = figma.createFrame();
      frame.name = node.name;
      frame.layoutMode = node.layout;
      frame.itemSpacing = node.gap ?? 0;
      const basePadding = node.padding ?? 0;
      const paddingX = node.paddingX ?? basePadding;
      const paddingY = node.paddingY ?? basePadding;
      frame.paddingLeft = paddingX;
      frame.paddingRight = paddingX;
      frame.paddingTop = paddingY;
      frame.paddingBottom = paddingY;
      if (node.alignItems) frame.counterAxisAlignItems = node.alignItems;
      if (node.justifyContent) frame.primaryAxisAlignItems = node.justifyContent;
      const sizing = resolveSizingModes({
        ...node,
        layout: node.layout as "VERTICAL" | "HORIZONTAL",
        parentLayout,
      });
      if (node.width != null && node.height != null) {
        frame.resize(node.width, node.height);
      } else if (node.width != null) {
        frame.resize(node.width, frame.height);
      } else if (node.height != null) {
        frame.resize(frame.width, node.height);
      }
      frame.primaryAxisSizingMode = sizing.primary;
      frame.counterAxisSizingMode = sizing.counter;
      if (node.layoutGrow != null) frame.layoutGrow = node.layoutGrow;
      if (node.layoutAlign === "STRETCH") frame.layoutAlign = "STRETCH";
      if (node.fill) frame.fills = [paint(node.fill, context.variables)];
      for (const child of node.children) {
        frame.appendChild(
          await buildNode(
            child,
            context,
            node.layout as "VERTICAL" | "HORIZONTAL"
          )
        );
      }
      return frame;
    }

    case "TEXT": {
      const text = figma.createText();
      text.name = node.name;
      const style = context.textStyles[node.textStyle];
      if (style) text.fontName = style.fontName;
      text.characters = node.characters;
      if (style) text.textStyleId = style.id;
      text.fills = [paint("color.text.primary", context.variables)];
      return text;
    }

    case "INSTANCE": {
      const variant = node.variant ?? "primary";
      const component =
        context.buttons.find((item) => item.name === `Variant=${variant}`) ??
        context.buttons[0];
      if (!component) throw new Error("Button component not found");
      const instance = component.createInstance();
      instance.name = node.name;
      return instance;
    }

    case "ICON": {
      const icon = figma.createNodeFromSvg(node.svg);
      icon.name = node.name;
      icon.resize(node.size, node.size);
      return icon;
    }

    case "IMAGE": {
      const rectangle = figma.createRectangle();
      rectangle.name = node.name;
      rectangle.resize(node.width, node.height);
      const image = figma.createImage(figma.base64Decode(SAMPLE_PNG));
      rectangle.fills = [
        { type: "IMAGE", imageHash: image.hash, scaleMode: "FILL" },
      ];
      return rectangle;
    }
  }
}

async function main() {
  await buildPlan(bPlan, "Spike B");
  await buildPlan(cPlan, "Spike C");
  figma.closePlugin("Spike pages built");
}

main().catch((error: unknown) => {
  console.error(error);
  figma.closePlugin(`Spike failed: ${(error as Error).message}`);
});
