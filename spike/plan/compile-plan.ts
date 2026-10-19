import type {
  FigmaPlan,
  PageSpec,
  PlanNode,
  Profile,
  SpecNode,
} from "./types";

interface FrameOptions {
  width?: number;
  height?: number;
  padding?: number;
  paddingX?: number;
  paddingY?: number;
  gap?: number;
  fill?: string;
  alignItems?: "CENTER";
  justifyContent?: "SPACE_BETWEEN";
  layoutGrow?: number;
  layoutAlign?: "STRETCH";
}

interface CompileContext {
  profile: Profile;
  space: (value: unknown, fallback: string) => number;
  text: (name: string, characters: string, textStyle: string) => PlanNode;
  frame: (
    name: string,
    layout: "VERTICAL" | "HORIZONTAL",
    children: PlanNode[],
    options?: FrameOptions
  ) => PlanNode;
}

export function compilePlan(spec: PageSpec, profile: Profile): FigmaPlan {
  const ctx: CompileContext = {
    profile,
    space: (value, fallback) => {
      const key =
        typeof value === "string" && value.startsWith("space.")
          ? value.slice("space.".length)
          : fallback;
      return Number.parseInt(profile.space[key] ?? "0", 10);
    },
    text: (name, characters, textStyle) => ({
      type: "TEXT",
      name,
      characters,
      textStyle,
    }),
    frame: (name, layout, children, options = {}) => ({
      type: "FRAME",
      name,
      layout,
      children,
      ...options,
    }),
  };

  return {
    page: spec.meta.pageId,
    width: spec.meta.target === "web" ? 1440 : 390,
    height: spec.meta.target === "web" ? 900 : 844,
    tokens: {
      ...Object.fromEntries(
        Object.entries(profile.color).map(([key, value]) => [`color.${key}`, value])
      ),
      ...Object.fromEntries(
        Object.entries(profile.space).map(([key, value]) => [`space.${key}`, value])
      ),
      ...Object.fromEntries(
        Object.entries(profile.radius).map(([key, value]) => [`radius.${key}`, value])
      ),
    },
    textStyles: profile.typography,
    components: profile.components,
    root: compileNode(spec.layout, ctx),
  };
}

function compileNode(node: SpecNode, ctx: CompileContext): PlanNode {
  switch (node.type) {
    case "PageShell": {
      const nav = (node.props?.nav as string[] | undefined) ?? [
        "概览",
        "订单",
        "客户",
        "设置",
      ];
      return ctx.frame(
        "PageShell",
        "HORIZONTAL",
        [
          ctx.frame(
            "Sidebar",
            "VERTICAL",
            [
              ctx.text("Brand", "ACME", "heading.2"),
              ...nav.map((label, index) =>
                ctx.text(`Nav-${index + 1}`, label, "body.md")
              ),
            ],
            {
              width: 240,
              padding: ctx.space("space.4", "4"),
              gap: ctx.space("space.2", "2"),
              fill: "color.surface.subtle",
              layoutAlign: "STRETCH",
            }
          ),
          ctx.frame(
            "Content",
            "VERTICAL",
            [
              ctx.frame(
                "Header",
                "HORIZONTAL",
                [
                  ctx.text(
                    "PageTitle",
                    String(node.props?.title ?? "页面"),
                    "heading.2"
                  ),
                ],
                {
                  height: 64,
                  paddingX: ctx.space("space.6", "6"),
                  paddingY: 0,
                  gap: ctx.space("space.2", "2"),
                  fill: "color.surface.default",
                  alignItems: "CENTER",
                  layoutAlign: "STRETCH",
                }
              ),
              ...(node.children ?? []).map((child) => compileNode(child, ctx)),
            ],
            { fill: "color.surface.default", gap: 0, layoutGrow: 1, layoutAlign: "STRETCH" }
          ),
        ],
        {
          width: 1440,
          height: 900,
          padding: 0,
          gap: 0,
          fill: "color.surface.default",
        }
      );
    }

    case "Section":
      return ctx.frame(
        "Section",
        "VERTICAL",
        (node.children ?? []).map((child) => compileNode(child, ctx)),
        {
          padding: ctx.space(node.props?.padding, "6"),
          gap: ctx.space(node.props?.gap, "4"),
          fill: "color.surface.default",
          layoutAlign: "STRETCH",
        }
      );

    case "FilterBar":
      return ctx.frame(
        "FilterBar",
        "HORIZONTAL",
        [
          ctx.frame(
            "Search",
            "HORIZONTAL",
            [
              ctx.text(
                "SearchLabel",
                String(node.props?.placeholder ?? "搜索"),
                "body.md"
              ),
            ],
            {
              width: 320,
              height: 36,
              paddingX: ctx.space("space.3", "3"),
              paddingY: 8,
              gap: ctx.space("space.2", "2"),
              fill: "color.surface.subtle",
              alignItems: "CENTER",
            }
          ),
          {
            type: "INSTANCE",
            name: "CreateButton",
            component: "Button",
            variant: "primary",
            props: { label: String(node.props?.action ?? "新建") },
          },
        ],
        {
          height: 56,
          padding: 0,
          gap: ctx.space("space.3", "3"),
          fill: "color.surface.default",
          alignItems: "CENTER",
          layoutAlign: "STRETCH",
        }
      );

    case "DataTable": {
      const columns =
        (node.props?.columns as string[] | undefined) ?? ["列 1", "列 2", "列 3"];
      const rows = Number(node.props?.rows ?? 3);
      const header = ctx.frame(
        "HeaderRow",
        "HORIZONTAL",
        columns.map((column, index) =>
          ctx.text(`Header-${index + 1}`, column, "label.sm")
        ),
        {
          height: 40,
          padding: ctx.space("space.3", "3"),
          gap: ctx.space("space.2", "2"),
          fill: "color.surface.subtle",
          alignItems: "CENTER",
          layoutAlign: "STRETCH",
        }
      );
      const body = Array.from({ length: rows }, (_, rowIndex) =>
        ctx.frame(
          `Row-${rowIndex + 1}`,
          "HORIZONTAL",
          columns.map((column) =>
            ctx.text(
              `Cell-${rowIndex + 1}-${column}`,
              `示例 ${rowIndex + 1}-${column}`,
              "body.md"
            )
          ),
          {
            height: 44,
            padding: ctx.space("space.3", "3"),
            gap: ctx.space("space.2", "2"),
            fill: "color.surface.default",
            alignItems: "CENTER",
            layoutAlign: "STRETCH",
          }
        )
      );
      return ctx.frame("DataTable", "VERTICAL", [header, ...body], {
        gap: 0,
        fill: "color.surface.default",
        layoutAlign: "STRETCH",
      });
    }

    case "MobileShell": {
      const tabs = (node.props?.tabs as string[] | undefined) ?? [
        "推荐",
        "关注",
        "我的",
      ];
      return ctx.frame(
        "MobileShell",
        "VERTICAL",
        [
          ctx.frame(
            "TopBar",
            "HORIZONTAL",
            [
              ctx.text(
                "PageTitle",
                String(node.props?.title ?? "首页"),
                "heading.1"
              ),
            ],
            {
              height: 56,
              paddingX: ctx.space("space.4", "4"),
              paddingY: 0,
              gap: ctx.space("space.2", "2"),
              fill: "color.surface.subtle",
              alignItems: "CENTER",
              layoutAlign: "STRETCH",
            }
          ),
          ctx.frame(
            "FeedContent",
            "VERTICAL",
            (node.children ?? []).map((child) => compileNode(child, ctx)),
            {
              padding: ctx.space("space.4", "4"),
              gap: ctx.space("space.4", "4"),
              fill: "color.surface.subtle",
              layoutAlign: "STRETCH",
            }
          ),
          ctx.frame(
            "BottomNav",
            "HORIZONTAL",
            tabs.map((tab, index) =>
              ctx.text(`Tab-${index + 1}`, tab, "label.sm")
            ),
            {
              height: 64,
              paddingX: ctx.space("space.3", "3"),
              paddingY: 0,
              gap: ctx.space("space.2", "2"),
              fill: "color.surface.default",
              alignItems: "CENTER",
              justifyContent: "SPACE_BETWEEN",
              layoutAlign: "STRETCH",
            }
          ),
        ],
        {
          width: 390,
          height: 844,
          padding: 0,
          gap: 0,
          fill: "color.surface.subtle",
        }
      );
    }

    case "ICON":
      return {
        type: "ICON",
        name: String(node.props?.name ?? "icon"),
        svg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 4h12v16l-6-4-6 4V4z"/></svg>',
        size: Number(node.props?.size ?? 24),
      };

    case "FeedCard":
      return ctx.frame(
        "FeedCard",
        "VERTICAL",
        [
          {
            type: "IMAGE",
            name: "Cover",
            src: String(node.props?.image ?? "assets/placeholder.png"),
            width: 358,
            height: 180,
          },
          ctx.frame(
            "FeedText",
            "VERTICAL",
            [
              ctx.text(
                "FeedTitle",
                String(node.props?.title ?? "标题"),
                "heading.3"
              ),
              ctx.text(
                "FeedBody",
                String(node.props?.body ?? "正文"),
                "body.md"
              ),
            ],
            {
              padding: ctx.space("space.4", "4"),
              gap: ctx.space("space.3", "3"),
              fill: "color.surface.default",
              layoutAlign: "STRETCH",
            }
          ),
        ],
        {
          padding: 0,
          gap: 0,
          fill: "color.surface.default",
          layoutAlign: "STRETCH",
        }
      );

    default:
      return ctx.frame(`Unknown-${node.type}`, "VERTICAL", []);
  }
}
