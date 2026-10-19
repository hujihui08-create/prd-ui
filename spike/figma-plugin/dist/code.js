"use strict";
(() => {
  var __defProp = Object.defineProperty;
  var __defProps = Object.defineProperties;
  var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
  var __getOwnPropSymbols = Object.getOwnPropertySymbols;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __propIsEnum = Object.prototype.propertyIsEnumerable;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __spreadValues = (a, b) => {
    for (var prop in b || (b = {}))
      if (__hasOwnProp.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    if (__getOwnPropSymbols)
      for (var prop of __getOwnPropSymbols(b)) {
        if (__propIsEnum.call(b, prop))
          __defNormalProp(a, prop, b[prop]);
      }
    return a;
  };
  var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));

  // ../spec/figma-plan.b-end.json
  var figma_plan_b_end_default = {
    page: "orders-list",
    width: 1440,
    height: 900,
    tokens: {
      "color.surface.default": "#FFFFFF",
      "color.surface.subtle": "#F3F4F6",
      "color.text.primary": "#111827",
      "color.text.secondary": "#6B7280",
      "color.action.primary": "#030213",
      "color.onAction": "#FFFFFF",
      "color.border.subtle": "#E5E7EB",
      "space.2": "8px",
      "space.3": "12px",
      "space.4": "16px",
      "space.6": "24px",
      "space.8": "32px",
      "radius.sm": "4px",
      "radius.md": "8px",
      "radius.lg": "12px"
    },
    textStyles: {
      "heading.1": {
        fontFamily: "Noto Sans SC",
        fontSize: 32,
        fontWeight: 700,
        lineHeight: 40
      },
      "heading.2": {
        fontFamily: "Noto Sans SC",
        fontSize: 24,
        fontWeight: 600,
        lineHeight: 32
      },
      "heading.3": {
        fontFamily: "Noto Sans SC",
        fontSize: 18,
        fontWeight: 600,
        lineHeight: 26
      },
      "body.md": {
        fontFamily: "Noto Sans SC",
        fontSize: 14,
        fontWeight: 400,
        lineHeight: 20
      },
      "label.sm": {
        fontFamily: "Noto Sans SC",
        fontSize: 12,
        fontWeight: 500,
        lineHeight: 16
      }
    },
    components: {
      Button: {
        variants: {
          primary: {
            fill: "color.action.primary",
            text: "color.onAction"
          },
          secondary: {
            fill: "color.surface.default",
            text: "color.text.primary"
          }
        }
      }
    },
    root: {
      type: "FRAME",
      name: "PageShell",
      layout: "HORIZONTAL",
      children: [
        {
          type: "FRAME",
          name: "Sidebar",
          layout: "VERTICAL",
          children: [
            {
              type: "TEXT",
              name: "Brand",
              characters: "ACME",
              textStyle: "heading.2"
            },
            {
              type: "TEXT",
              name: "Nav-1",
              characters: "\u6982\u89C8",
              textStyle: "body.md"
            },
            {
              type: "TEXT",
              name: "Nav-2",
              characters: "\u8BA2\u5355",
              textStyle: "body.md"
            },
            {
              type: "TEXT",
              name: "Nav-3",
              characters: "\u5BA2\u6237",
              textStyle: "body.md"
            },
            {
              type: "TEXT",
              name: "Nav-4",
              characters: "\u8BBE\u7F6E",
              textStyle: "body.md"
            }
          ],
          width: 240,
          padding: 16,
          gap: 8,
          fill: "color.surface.subtle",
          layoutAlign: "STRETCH"
        },
        {
          type: "FRAME",
          name: "Content",
          layout: "VERTICAL",
          children: [
            {
              type: "FRAME",
              name: "Header",
              layout: "HORIZONTAL",
              children: [
                {
                  type: "TEXT",
                  name: "PageTitle",
                  characters: "\u8BA2\u5355\u7BA1\u7406",
                  textStyle: "heading.2"
                }
              ],
              height: 64,
              padding: 24,
              gap: 8,
              fill: "color.surface.default",
              layoutAlign: "STRETCH"
            },
            {
              type: "FRAME",
              name: "Section",
              layout: "VERTICAL",
              children: [
                {
                  type: "FRAME",
                  name: "FilterBar",
                  layout: "HORIZONTAL",
                  children: [
                    {
                      type: "FRAME",
                      name: "Search",
                      layout: "HORIZONTAL",
                      children: [
                        {
                          type: "TEXT",
                          name: "SearchLabel",
                          characters: "\u641C\u7D22\u8BA2\u5355\u53F7 / \u5BA2\u6237",
                          textStyle: "body.md"
                        }
                      ],
                      width: 320,
                      height: 36,
                      padding: 12,
                      gap: 8,
                      fill: "color.surface.subtle"
                    },
                    {
                      type: "INSTANCE",
                      name: "CreateButton",
                      component: "Button",
                      variant: "primary",
                      props: {
                        label: "\u65B0\u5EFA\u8BA2\u5355"
                      }
                    }
                  ],
                  height: 56,
                  padding: 0,
                  gap: 12,
                  fill: "color.surface.default",
                  layoutAlign: "STRETCH"
                },
                {
                  type: "FRAME",
                  name: "DataTable",
                  layout: "VERTICAL",
                  children: [
                    {
                      type: "FRAME",
                      name: "HeaderRow",
                      layout: "HORIZONTAL",
                      children: [
                        {
                          type: "TEXT",
                          name: "Header-1",
                          characters: "\u8BA2\u5355\u53F7",
                          textStyle: "label.sm"
                        },
                        {
                          type: "TEXT",
                          name: "Header-2",
                          characters: "\u5BA2\u6237",
                          textStyle: "label.sm"
                        },
                        {
                          type: "TEXT",
                          name: "Header-3",
                          characters: "\u91D1\u989D",
                          textStyle: "label.sm"
                        },
                        {
                          type: "TEXT",
                          name: "Header-4",
                          characters: "\u72B6\u6001",
                          textStyle: "label.sm"
                        },
                        {
                          type: "TEXT",
                          name: "Header-5",
                          characters: "\u521B\u5EFA\u65F6\u95F4",
                          textStyle: "label.sm"
                        }
                      ],
                      height: 40,
                      padding: 12,
                      gap: 8,
                      fill: "color.surface.subtle",
                      layoutAlign: "STRETCH"
                    },
                    {
                      type: "FRAME",
                      name: "Row-1",
                      layout: "HORIZONTAL",
                      children: [
                        {
                          type: "TEXT",
                          name: "Cell-1-1",
                          characters: "\u793A\u4F8B 1-1",
                          textStyle: "body.md"
                        },
                        {
                          type: "TEXT",
                          name: "Cell-1-2",
                          characters: "\u793A\u4F8B 1-2",
                          textStyle: "body.md"
                        },
                        {
                          type: "TEXT",
                          name: "Cell-1-3",
                          characters: "\u793A\u4F8B 1-3",
                          textStyle: "body.md"
                        },
                        {
                          type: "TEXT",
                          name: "Cell-1-4",
                          characters: "\u793A\u4F8B 1-4",
                          textStyle: "body.md"
                        },
                        {
                          type: "TEXT",
                          name: "Cell-1-5",
                          characters: "\u793A\u4F8B 1-5",
                          textStyle: "body.md"
                        }
                      ],
                      height: 44,
                      padding: 12,
                      gap: 8,
                      fill: "color.surface.default",
                      layoutAlign: "STRETCH"
                    },
                    {
                      type: "FRAME",
                      name: "Row-2",
                      layout: "HORIZONTAL",
                      children: [
                        {
                          type: "TEXT",
                          name: "Cell-2-1",
                          characters: "\u793A\u4F8B 2-1",
                          textStyle: "body.md"
                        },
                        {
                          type: "TEXT",
                          name: "Cell-2-2",
                          characters: "\u793A\u4F8B 2-2",
                          textStyle: "body.md"
                        },
                        {
                          type: "TEXT",
                          name: "Cell-2-3",
                          characters: "\u793A\u4F8B 2-3",
                          textStyle: "body.md"
                        },
                        {
                          type: "TEXT",
                          name: "Cell-2-4",
                          characters: "\u793A\u4F8B 2-4",
                          textStyle: "body.md"
                        },
                        {
                          type: "TEXT",
                          name: "Cell-2-5",
                          characters: "\u793A\u4F8B 2-5",
                          textStyle: "body.md"
                        }
                      ],
                      height: 44,
                      padding: 12,
                      gap: 8,
                      fill: "color.surface.default",
                      layoutAlign: "STRETCH"
                    },
                    {
                      type: "FRAME",
                      name: "Row-3",
                      layout: "HORIZONTAL",
                      children: [
                        {
                          type: "TEXT",
                          name: "Cell-3-1",
                          characters: "\u793A\u4F8B 3-1",
                          textStyle: "body.md"
                        },
                        {
                          type: "TEXT",
                          name: "Cell-3-2",
                          characters: "\u793A\u4F8B 3-2",
                          textStyle: "body.md"
                        },
                        {
                          type: "TEXT",
                          name: "Cell-3-3",
                          characters: "\u793A\u4F8B 3-3",
                          textStyle: "body.md"
                        },
                        {
                          type: "TEXT",
                          name: "Cell-3-4",
                          characters: "\u793A\u4F8B 3-4",
                          textStyle: "body.md"
                        },
                        {
                          type: "TEXT",
                          name: "Cell-3-5",
                          characters: "\u793A\u4F8B 3-5",
                          textStyle: "body.md"
                        }
                      ],
                      height: 44,
                      padding: 12,
                      gap: 8,
                      fill: "color.surface.default",
                      layoutAlign: "STRETCH"
                    },
                    {
                      type: "FRAME",
                      name: "Row-4",
                      layout: "HORIZONTAL",
                      children: [
                        {
                          type: "TEXT",
                          name: "Cell-4-1",
                          characters: "\u793A\u4F8B 4-1",
                          textStyle: "body.md"
                        },
                        {
                          type: "TEXT",
                          name: "Cell-4-2",
                          characters: "\u793A\u4F8B 4-2",
                          textStyle: "body.md"
                        },
                        {
                          type: "TEXT",
                          name: "Cell-4-3",
                          characters: "\u793A\u4F8B 4-3",
                          textStyle: "body.md"
                        },
                        {
                          type: "TEXT",
                          name: "Cell-4-4",
                          characters: "\u793A\u4F8B 4-4",
                          textStyle: "body.md"
                        },
                        {
                          type: "TEXT",
                          name: "Cell-4-5",
                          characters: "\u793A\u4F8B 4-5",
                          textStyle: "body.md"
                        }
                      ],
                      height: 44,
                      padding: 12,
                      gap: 8,
                      fill: "color.surface.default",
                      layoutAlign: "STRETCH"
                    },
                    {
                      type: "FRAME",
                      name: "Row-5",
                      layout: "HORIZONTAL",
                      children: [
                        {
                          type: "TEXT",
                          name: "Cell-5-1",
                          characters: "\u793A\u4F8B 5-1",
                          textStyle: "body.md"
                        },
                        {
                          type: "TEXT",
                          name: "Cell-5-2",
                          characters: "\u793A\u4F8B 5-2",
                          textStyle: "body.md"
                        },
                        {
                          type: "TEXT",
                          name: "Cell-5-3",
                          characters: "\u793A\u4F8B 5-3",
                          textStyle: "body.md"
                        },
                        {
                          type: "TEXT",
                          name: "Cell-5-4",
                          characters: "\u793A\u4F8B 5-4",
                          textStyle: "body.md"
                        },
                        {
                          type: "TEXT",
                          name: "Cell-5-5",
                          characters: "\u793A\u4F8B 5-5",
                          textStyle: "body.md"
                        }
                      ],
                      height: 44,
                      padding: 12,
                      gap: 8,
                      fill: "color.surface.default",
                      layoutAlign: "STRETCH"
                    }
                  ],
                  gap: 0,
                  fill: "color.surface.default",
                  layoutAlign: "STRETCH"
                }
              ],
              padding: 24,
              gap: 16,
              fill: "color.surface.default",
              layoutAlign: "STRETCH"
            }
          ],
          fill: "color.surface.default",
          gap: 0,
          layoutGrow: 1,
          layoutAlign: "STRETCH"
        }
      ],
      width: 1440,
      height: 900,
      padding: 0,
      gap: 0,
      fill: "color.surface.default"
    }
  };

  // ../spec/figma-plan.c-end.json
  var figma_plan_c_end_default = {
    page: "home-feed",
    width: 390,
    height: 844,
    tokens: {
      "color.surface.default": "#FFFFFF",
      "color.surface.subtle": "#FFF1E6",
      "color.text.primary": "#1F2937",
      "color.text.secondary": "#6B7280",
      "color.action.primary": "#FF5A5F",
      "color.onAction": "#FFFFFF",
      "color.border.subtle": "#FDE2D2",
      "space.2": "8px",
      "space.3": "12px",
      "space.4": "16px",
      "space.6": "24px",
      "space.8": "32px",
      "radius.sm": "8px",
      "radius.md": "16px",
      "radius.lg": "24px"
    },
    textStyles: {
      "heading.1": {
        fontFamily: "Noto Sans SC",
        fontSize: 28,
        fontWeight: 700,
        lineHeight: 36
      },
      "heading.2": {
        fontFamily: "Noto Sans SC",
        fontSize: 22,
        fontWeight: 600,
        lineHeight: 30
      },
      "heading.3": {
        fontFamily: "Noto Sans SC",
        fontSize: 18,
        fontWeight: 600,
        lineHeight: 26
      },
      "body.md": {
        fontFamily: "Noto Sans SC",
        fontSize: 15,
        fontWeight: 400,
        lineHeight: 24
      },
      "label.sm": {
        fontFamily: "Noto Sans SC",
        fontSize: 12,
        fontWeight: 500,
        lineHeight: 16
      }
    },
    components: {
      Button: {
        variants: {
          primary: {
            fill: "color.action.primary",
            text: "color.onAction"
          },
          secondary: {
            fill: "color.surface.default",
            text: "color.text.primary"
          }
        }
      }
    },
    root: {
      type: "FRAME",
      name: "MobileShell",
      layout: "VERTICAL",
      children: [
        {
          type: "FRAME",
          name: "TopBar",
          layout: "HORIZONTAL",
          children: [
            {
              type: "TEXT",
              name: "PageTitle",
              characters: "\u53D1\u73B0",
              textStyle: "heading.1"
            }
          ],
          height: 56,
          padding: 16,
          gap: 8,
          fill: "color.surface.default",
          layoutAlign: "STRETCH"
        },
        {
          type: "ICON",
          name: "bookmark",
          svg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 4h12v16l-6-4-6 4V4z"/></svg>',
          size: 24
        },
        {
          type: "FRAME",
          name: "FeedCard",
          layout: "VERTICAL",
          children: [
            {
              type: "IMAGE",
              name: "Cover",
              src: "assets/feed-1.png",
              width: 358,
              height: 180
            },
            {
              type: "TEXT",
              name: "FeedTitle",
              characters: "\u5468\u672B\u53BB\u54EA\u513F",
              textStyle: "heading.3"
            },
            {
              type: "TEXT",
              name: "FeedBody",
              characters: "\u57CE\u5E02\u5468\u8FB9 5 \u4E2A\u5C0F\u4F17\u76EE\u7684\u5730",
              textStyle: "body.md"
            }
          ],
          padding: 16,
          gap: 12,
          fill: "color.surface.default",
          layoutAlign: "STRETCH"
        },
        {
          type: "FRAME",
          name: "FeedCard",
          layout: "VERTICAL",
          children: [
            {
              type: "IMAGE",
              name: "Cover",
              src: "assets/feed-2.png",
              width: 358,
              height: 180
            },
            {
              type: "TEXT",
              name: "FeedTitle",
              characters: "\u65B0\u5E97\u5F00\u4E1A",
              textStyle: "heading.3"
            },
            {
              type: "TEXT",
              name: "FeedBody",
              characters: "\u624B\u51B2\u5496\u5561\u4E70\u4E00\u9001\u4E00",
              textStyle: "body.md"
            }
          ],
          padding: 16,
          gap: 12,
          fill: "color.surface.default",
          layoutAlign: "STRETCH"
        },
        {
          type: "FRAME",
          name: "BottomNav",
          layout: "HORIZONTAL",
          children: [
            {
              type: "TEXT",
              name: "Tab-1",
              characters: "\u63A8\u8350",
              textStyle: "label.sm"
            },
            {
              type: "TEXT",
              name: "Tab-2",
              characters: "\u5173\u6CE8",
              textStyle: "label.sm"
            },
            {
              type: "TEXT",
              name: "Tab-3",
              characters: "\u9644\u8FD1",
              textStyle: "label.sm"
            },
            {
              type: "TEXT",
              name: "Tab-4",
              characters: "\u6211\u7684",
              textStyle: "label.sm"
            }
          ],
          height: 64,
          padding: 12,
          gap: 8,
          fill: "color.surface.default",
          layoutAlign: "STRETCH"
        }
      ],
      width: 390,
      height: 844,
      padding: 0,
      gap: 0,
      fill: "color.surface.subtle"
    }
  };

  // src/code.ts
  var SAMPLE_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lK3l5QAAAABJRU5ErkJggg==";
  function hexToRgb(hex) {
    const value = hex.replace("#", "");
    return {
      r: Number.parseInt(value.slice(0, 2), 16) / 255,
      g: Number.parseInt(value.slice(2, 4), 16) / 255,
      b: Number.parseInt(value.slice(4, 6), 16) / 255
    };
  }
  function paint(token, variables) {
    const variable = variables[token];
    const color = variable ? "#D1D5DB" : token.startsWith("#") ? token : "#D1D5DB";
    const solid = { type: "SOLID", color: hexToRgb(color) };
    if (!variable) return solid;
    return figma.variables.setBoundVariableForPaint(solid, "color", variable);
  }
  async function loadFont(family, style) {
    try {
      await figma.loadFontAsync({ family, style });
      return { family, style };
    } catch (e) {
      const fallback = { family: "PingFang SC", style: "Regular" };
      await figma.loadFontAsync(fallback);
      return fallback;
    }
  }
  async function buildPlan(plan, pageName) {
    var _a, _b;
    const page = figma.createPage();
    page.name = pageName;
    await figma.setCurrentPageAsync(page);
    const collection = figma.variables.createVariableCollection(`${pageName} Tokens`);
    const modeId = collection.modes[0].modeId;
    const variables = {};
    for (const [name, value] of Object.entries(plan.tokens)) {
      if (!name.startsWith("color.")) continue;
      const variable = figma.variables.createVariable(name, collection, "COLOR");
      variable.setValueForMode(modeId, __spreadProps(__spreadValues({}, hexToRgb(value)), { a: 1 }));
      variables[name] = variable;
    }
    const textStyles = {};
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
    const buttons = [];
    const variants = (_b = (_a = plan.components.Button) == null ? void 0 : _a.variants) != null ? _b : {};
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
      label.characters = "\u6309\u94AE";
      label.fills = [paint(style.text, variables)];
      component.appendChild(label);
      buttons.push(component);
    }
    if (buttons.length > 0) {
      const set = figma.combineAsVariants(buttons, page);
      set.name = "Button";
    }
    const context = { variables, textStyles, buttons };
    const root = await buildNode(plan.root, context);
    page.appendChild(root);
    figma.viewport.scrollAndZoomIntoView([root]);
    return root;
  }
  async function buildNode(node, context) {
    var _a, _b, _c, _d;
    switch (node.type) {
      case "FRAME": {
        const frame = figma.createFrame();
        frame.name = node.name;
        frame.layoutMode = node.layout;
        frame.itemSpacing = (_a = node.gap) != null ? _a : 0;
        const padding = (_b = node.padding) != null ? _b : 0;
        frame.paddingTop = padding;
        frame.paddingBottom = padding;
        frame.paddingLeft = padding;
        frame.paddingRight = padding;
        const hasWidth = node.width != null;
        const hasHeight = node.height != null;
        if (hasWidth && hasHeight) {
          frame.resize(node.width, node.height);
          frame.primaryAxisSizingMode = "FIXED";
          frame.counterAxisSizingMode = "FIXED";
        } else if (hasWidth) {
          frame.resize(node.width, frame.height);
          if (node.layout === "HORIZONTAL") {
            frame.primaryAxisSizingMode = "FIXED";
            frame.counterAxisSizingMode = "AUTO";
          } else {
            frame.primaryAxisSizingMode = "AUTO";
            frame.counterAxisSizingMode = "FIXED";
          }
        } else if (hasHeight) {
          frame.resize(frame.width, node.height);
          if (node.layout === "HORIZONTAL") {
            frame.primaryAxisSizingMode = "AUTO";
            frame.counterAxisSizingMode = "FIXED";
          } else {
            frame.primaryAxisSizingMode = "FIXED";
            frame.counterAxisSizingMode = "AUTO";
          }
        } else {
          frame.primaryAxisSizingMode = "AUTO";
          frame.counterAxisSizingMode = "AUTO";
        }
        if (node.layoutGrow != null) frame.layoutGrow = node.layoutGrow;
        if (node.layoutAlign === "STRETCH") frame.layoutAlign = "STRETCH";
        if (node.fill) frame.fills = [paint(node.fill, context.variables)];
        for (const child of node.children) {
          frame.appendChild(await buildNode(child, context));
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
        return text;
      }
      case "INSTANCE": {
        const variant = (_c = node.variant) != null ? _c : "primary";
        const component = (_d = context.buttons.find((item) => item.name === `Variant=${variant}`)) != null ? _d : context.buttons[0];
        if (!component) throw new Error("Button component not found");
        const instance = component.createInstance();
        instance.name = node.name;
        return instance;
      }
      case "ICON": {
        const icon = figma.createNodeFromSvg(node.svg);
        icon.name = node.name;
        return icon;
      }
      case "IMAGE": {
        const rectangle = figma.createRectangle();
        rectangle.name = node.name;
        rectangle.resize(node.width, node.height);
        const image = figma.createImage(figma.base64Decode(SAMPLE_PNG));
        rectangle.fills = [
          { type: "IMAGE", imageHash: image.hash, scaleMode: "FILL" }
        ];
        return rectangle;
      }
    }
  }
  async function main() {
    await buildPlan(figma_plan_b_end_default, "Spike B");
    await buildPlan(figma_plan_c_end_default, "Spike C");
    figma.closePlugin("Spike pages built");
  }
  main().catch((error) => {
    console.error(error);
    figma.closePlugin(`Spike failed: ${error.message}`);
  });
})();
