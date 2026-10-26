import type {
  Catalog,
  FigmaPlan,
  FigmaPlanNode,
  PageSpec,
  Profile,
  SpecNode,
} from "@prd-ui/contracts";
import {
  MOBILE_HEIGHT,
  MOBILE_WIDTH,
  WEB_HEIGHT,
  WEB_WIDTH,
  badgeFill,
  badgeText,
  buttonMapping,
  colorToken,
  frame,
  glyph,
  instance,
  planButtonComponents,
  planTextStyles,
  planTokens,
  radiusPx,
  spacePx,
  statusColor,
  text,
  textStyleName,
} from "./styles.js";

interface Ctx {
  page: PageSpec;
  profile: Profile;
  catalog: Catalog;
  defaultView: string | undefined;
  inFooter: boolean;
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function bool(value: unknown): boolean {
  return value === true;
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function childrenOf(node: SpecNode): SpecNode[] {
  return node.children ?? [];
}

function shouldSkip(node: SpecNode, ctx: Ctx): boolean {
  if (node.type === "Skeleton" || node.type === "ErrorState") return true;
  if (node.type === "EmptyState" && node.props?.emptyKind !== "idle") return true;
  if (
    node.type === "Section" &&
    typeof node.props?.viewPanel === "string" &&
    node.props.viewPanel !== ctx.defaultView
  ) {
    return true;
  }
  return false;
}

function renderChildren(
  nodes: SpecNode[],
  ctx: Ctx,
  path: string,
  options: { inFooter?: boolean } = {}
): FigmaPlanNode[] {
  return nodes.flatMap((node, index) => {
    const result = renderNode(node, ctx, `${path}.${index}`, options);
    return result === null ? [] : [result];
  });
}

function renderNode(
  node: SpecNode,
  ctx: Ctx,
  path: string,
  options: { inFooter?: boolean } = {}
): FigmaPlanNode | null {
  if (shouldSkip(node, ctx)) return null;
  const props = node.props ?? {};
  const specId = node.id ?? `${ctx.page.meta.pageId}.${path}`;
  const inFooter = options.inFooter === true;

  switch (node.type) {
    case "MobileShell":
      return renderMobileShell(node, ctx, specId);
    case "TopBar":
      return renderTopBar(props, ctx, specId);
    case "TabBar":
      return renderTabBar(props, ctx, specId);
    case "Section":
      return frame(
        specId,
        "Section",
        "VERTICAL",
        renderChildren(childrenOf(node), ctx, `${path}.children`),
        {
          padding: props.viewPanel === undefined ? spacePx(ctx.profile, str(props.padding)) : 0,
          gap: spacePx(ctx.profile, str(props.gap)),
        }
      );
    case "Card":
      return renderCard(node, ctx, specId, path);
    case "Row":
      return frame(specId, "Row", "HORIZONTAL", renderChildren(childrenOf(node), ctx, `${path}.children`), {
        gap: spacePx(ctx.profile, str(props.gap)),
        alignItems: "CENTER",
      });
    case "Stack":
      return frame(specId, "Stack", "VERTICAL", renderChildren(childrenOf(node), ctx, `${path}.children`), {
        gap: 0,
      });
    case "Grid":
      return frame(specId, "Grid", "VERTICAL", renderChildren(childrenOf(node), ctx, `${path}.children`), {
        gap: spacePx(ctx.profile, "2"),
      });
    case "Text":
      return text(specId, "Text", str(props.text), ctx.profile, node.textRole ?? "body.md");
    case "QuickAction":
      return renderQuickAction(props, ctx, specId);
    case "Button":
      return instance(specId, str(props.label), str(props.emphasis) || "primary", {
        height: inFooter ? 44 : 36,
        ...(inFooter ? { layoutGrow: 1 } : {}),
      });
    case "Badge":
      return renderBadge(props, ctx, specId);
    case "SearchBar":
      return renderSearchBar(props, ctx, specId);
    case "CollapsedFilter":
      return renderCollapsedFilter(props, ctx, specId);
    case "FormField":
      return renderFormField(node, ctx, specId, path);
    case "Input":
      return renderInput(props, ctx, specId);
    case "Select":
      return renderSelect(props, ctx, specId);
    case "ListRow":
      return renderListRow(props, ctx, specId);
    case "List":
      return renderList(props, ctx, specId, path);
    case "CalendarGrid":
      return renderCalendar(props, ctx, specId);
    case "EmptyState":
      return renderEmptyState(node, ctx, specId, path);
    case "SummaryRow":
      return text(specId, "Summary", str(props.text), ctx.profile, "label.sm");
    case "InventoryCard":
      return frame(specId, "InventoryCard", "VERTICAL", [], {
        fill: colorToken("surface.default"),
        radius: radiusPx(ctx.profile, "lg"),
        padding: spacePx(ctx.profile, "4"),
      });
    case "Image":
      return frame(specId, "Image", "VERTICAL", [], {
        height: 180,
        fill: colorToken("surface.subtle"),
        radius: radiusPx(ctx.profile, "lg"),
      });
    default:
      return frame(
        specId,
        node.type,
        "VERTICAL",
        renderChildren(childrenOf(node), ctx, `${path}.children`),
        { gap: 0 }
      );
  }
}

function renderMobileShell(node: SpecNode, ctx: Ctx, specId: string): FigmaPlanNode {
  const props = node.props ?? {};
  const width = ctx.page.meta.target === "web" ? WEB_WIDTH : MOBILE_WIDTH;
  const height = ctx.page.meta.target === "web" ? WEB_HEIGHT : MOBILE_HEIGHT;
  const top = node.slots?.["top-bar"] ?? [];
  const content = node.slots?.content ?? [];
  const actions = node.slots?.actions ?? [];
  const nav = node.slots?.["bottom-nav"] ?? [];
  const hasTop = top.length > 0;
  const showTabs = props.showTabs !== false && array(props.tabs).length > 1;

  const header: FigmaPlanNode = hasTop
    ? (renderNode(top[0]!, ctx, "top-bar") ?? frame(`${specId}.top`, "TopBar", "HORIZONTAL", []))
    : frame(`${specId}.header`, "PageHeader", "HORIZONTAL", [
        ...(bool(props.back)
          ? [glyph(`${specId}.header.back`, "Back", "arrow_back_ios_new", 20, colorToken("text.primary"))]
          : []),
        text(`${specId}.header.title`, "Title", str(props.title), ctx.profile, "heading.2"),
      ], {
        height: 48,
        paddingX: spacePx(ctx.profile, "4"),
        gap: spacePx(ctx.profile, "2"),
        fill: colorToken("surface.subtle"),
        alignItems: "CENTER",
      });

  const contentFrame = frame(
    `${specId}.content`,
    "Content",
    "VERTICAL",
    renderChildren(content, ctx, "content"),
    {
      layoutGrow: 1,
      fill: colorToken("surface.subtle"),
      gap: 0,
      clip: true,
    }
  );

  const footer =
    actions.length === 0
      ? null
      : (() => {
          const first = actions[0];
          const actionNodes =
            first !== undefined && first.type === "Section"
              ? childrenOf(first)
              : actions;
          return frame(
            `${specId}.actions`,
            "Actions",
            "HORIZONTAL",
            renderChildren(actionNodes, ctx, "actions", { inFooter: true }),
            {
              padding: spacePx(ctx.profile, "3"),
              paddingX: spacePx(ctx.profile, "4"),
              gap: spacePx(ctx.profile, "2"),
              fill: colorToken("surface.default"),
              stroke: colorToken("border.subtle"),
              strokeWidth: 1,
              alignItems: "CENTER",
            }
          );
        })();

  const tabbar =
    showTabs && nav.length > 0
      ? renderNode(nav[0]!, ctx, "bottom-nav")
      : null;

  return frame(
    specId,
    ctx.page.meta.name,
    "VERTICAL",
    [
      header,
      contentFrame,
      ...(footer === null ? [] : [footer]),
      ...(tabbar === null ? [] : [tabbar]),
    ],
    {
      width,
      height,
      fill: colorToken("surface.subtle"),
      clip: true,
    }
  );
}

function renderTopBar(props: Record<string, unknown>, ctx: Ctx, specId: string): FigmaPlanNode {
  const store = str(props.storeName) || "星光店";
  const left = frame(`${specId}.left`, "Store", "HORIZONTAL", [
    text(`${specId}.store`, "StoreName", store, ctx.profile, "heading.2"),
    glyph(`${specId}.chevron`, "Chevron", "expand_more", 20, colorToken("text.secondary")),
  ], {
    gap: 2,
    alignItems: "CENTER",
    justifyContent: "START",
  });
  const right = bool(props.hasMessage)
    ? [glyph(`${specId}.bell`, "Bell", "notifications", 24, colorToken("text.primary"))]
    : [];
  return frame(specId, "TopBar", "HORIZONTAL", [left, ...right], {
    height: 48,
    paddingX: spacePx(ctx.profile, "4"),
    fill: colorToken("surface.subtle"),
    alignItems: "CENTER",
    justifyContent: "SPACE_BETWEEN",
  });
}

function tabGlyph(label: string): string {
  if (label.includes("今日")) return "home";
  if (label.includes("预约")) return "calendar_month";
  if (label.includes("客户")) return "person";
  if (label.includes("库存")) return "inventory_2";
  return "circle";
}

function renderTabBar(props: Record<string, unknown>, ctx: Ctx, specId: string): FigmaPlanNode {
  const items = array(props.items).map((item) => String(item));
  const active = str(props.active);
  return frame(
    specId,
    "TabBar",
    "HORIZONTAL",
    items.map((label, index) =>
      frame(`${specId}.tab.${index}`, `Tab:${label}`, "VERTICAL", [
        glyph(
          `${specId}.tab.${index}.icon`,
          "Icon",
          tabGlyph(label),
          22,
          label === active ? colorToken("action.primary") : colorToken("text.tertiary")
        ),
        text(
          `${specId}.tab.${index}.label`,
          "Label",
          label,
          ctx.profile,
          "label.sm",
          { color: label === active ? colorToken("action.primary") : colorToken("text.tertiary") }
        ),
      ], {
        layoutGrow: 1,
        gap: 2,
        alignItems: "CENTER",
        justifyContent: "CENTER",
      })
    ),
    {
      height: 64,
      fill: colorToken("surface.default"),
      stroke: colorToken("border.subtle"),
      strokeWidth: 1,
      alignItems: "CENTER",
    }
  );
}

function renderCard(node: SpecNode, ctx: Ctx, specId: string, path: string): FigmaPlanNode {
  const props = node.props ?? {};
  const title = str(props.title);
  const badge = str(props.badge);
  const badgeTone = str(props.badgeTone) || "neutral";
  const action = str(props.actionLabel);
  const head: FigmaPlanNode[] = [
    text(`${specId}.title`, "Title", title, ctx.profile, "heading.2"),
    ...(badge === ""
      ? []
      : [renderBadge({ label: badge, tone: badgeTone }, ctx, `${specId}.badge`)]),
    ...(action === ""
      ? []
      : [
          text(`${specId}.action`, "Action", `${action} ›`, ctx.profile, "label.sm", {
            color: colorToken("text.secondary"),
          }),
        ]),
  ];
  const body = frame(
    `${specId}.body`,
    "Body",
    "VERTICAL",
    renderChildren(childrenOf(node), ctx, `${path}.children`),
    { gap: 0 }
  );
  return frame(specId, "Card", "VERTICAL", [
    frame(`${specId}.head`, "Head", "HORIZONTAL", head, {
      gap: spacePx(ctx.profile, "2"),
      alignItems: "CENTER",
      justifyContent: "SPACE_BETWEEN",
    }),
    body,
  ], {
    padding: spacePx(ctx.profile, "4"),
    gap: spacePx(ctx.profile, "2"),
    fill: colorToken("surface.default"),
    radius: radiusPx(ctx.profile, "lg"),
    shadow: true,
  });
}

function quickGlyph(icon: string): string {
  if (icon.includes("search")) return "search";
  if (icon.includes("plus")) return "add";
  if (icon.includes("home")) return "home";
  if (icon.includes("user")) return "person";
  return "add";
}

function renderQuickAction(props: Record<string, unknown>, ctx: Ctx, specId: string): FigmaPlanNode {
  const tone = str(props.tone);
  const fill =
    tone === "customer" ? colorToken("accent.customer") : tone === "inventory" ? colorToken("accent.inventory") : colorToken("surface.subtle");
  const iconColor =
    tone === "customer" ? colorToken("accent.customer") : tone === "inventory" ? colorToken("accent.inventory") : colorToken("action.primary");
  return frame(specId, "QuickAction", "HORIZONTAL", [
    glyph(`${specId}.icon`, "Icon", quickGlyph(str(props.icon)), 24, iconColor),
    text(`${specId}.label`, "Label", str(props.label), ctx.profile, "body.md"),
  ], {
    height: 56,
    layoutGrow: 1,
    fill,
    fillAlpha: tone === "customer" || tone === "inventory" ? 0.1 : 1,
    radius: radiusPx(ctx.profile, "md"),
    gap: spacePx(ctx.profile, "2"),
    alignItems: "CENTER",
    justifyContent: "CENTER",
  });
}

function renderBadge(props: Record<string, unknown>, ctx: Ctx, specId: string): FigmaPlanNode {
  const tone = str(props.tone) || "neutral";
  return frame(specId, "Badge", "HORIZONTAL", [
    text(`${specId}.label`, "Label", str(props.label), ctx.profile, "label.strong", {
      color: badgeText(tone),
    }),
  ], {
    height: 20,
    paddingX: 6,
    radius: radiusPx(ctx.profile, "sm"),
    fill: badgeFill(tone),
    fillAlpha: tone === "neutral" ? 1 : 0.12,
    alignItems: "CENTER",
    justifyContent: "CENTER",
  });
}

function renderSearchBar(props: Record<string, unknown>, ctx: Ctx, specId: string): FigmaPlanNode {
  return frame(specId, "SearchBar", "HORIZONTAL", [
    glyph(`${specId}.icon`, "Search", "search", 20, colorToken("text.tertiary")),
    text(`${specId}.placeholder`, "Placeholder", str(props.placeholder), ctx.profile, "label.sm", {
      color: colorToken("text.tertiary"),
    }),
  ], {
    height: 36,
    paddingX: spacePx(ctx.profile, "3"),
    gap: spacePx(ctx.profile, "2"),
    fill: colorToken("surface.default"),
    radius: radiusPx(ctx.profile, "md"),
    alignItems: "CENTER",
  });
}

function renderCollapsedFilter(props: Record<string, unknown>, ctx: Ctx, specId: string): FigmaPlanNode {
  return frame(specId, "CollapsedFilter", "HORIZONTAL", [
    text(`${specId}.label`, "Label", str(props.label), ctx.profile, "label.sm", {
      color: colorToken("text.tertiary"),
    }),
    text(`${specId}.value`, "Value", str(props.value), ctx.profile, "body.md"),
    glyph(`${specId}.chevron`, "Chevron", "expand_more", 16, colorToken("text.tertiary")),
  ], {
    height: 30,
    paddingX: spacePx(ctx.profile, "2"),
    gap: spacePx(ctx.profile, "1"),
    fill: colorToken("surface.default"),
    stroke: colorToken("border.subtle"),
    strokeWidth: 1,
    radius: radiusPx(ctx.profile, "md"),
    alignItems: "CENTER",
  });
}

function renderFormField(node: SpecNode, ctx: Ctx, specId: string, path: string): FigmaPlanNode {
  const props = node.props ?? {};
  const label = str(props.label);
  const required = bool(props.required);
  return frame(specId, "FormField", "VERTICAL", [
    text(`${specId}.label`, "Label", `${label}${required ? " *" : ""}`, ctx.profile, "label.sm", {
      color: colorToken("text.secondary"),
    }),
    ...renderChildren(childrenOf(node), ctx, `${path}.children`),
  ], {
    gap: 6,
  });
}

function renderInput(props: Record<string, unknown>, ctx: Ctx, specId: string): FigmaPlanNode {
  return frame(specId, "Input", "HORIZONTAL", [
    text(`${specId}.placeholder`, "Placeholder", str(props.placeholder), ctx.profile, "body.md", {
      color: colorToken("text.tertiary"),
    }),
  ], {
    height: 36,
    paddingX: 10,
    fill: colorToken("surface.default"),
    stroke: colorToken("border.strong"),
    strokeWidth: 1,
    radius: radiusPx(ctx.profile, "md"),
    alignItems: "CENTER",
  });
}

function renderSelect(props: Record<string, unknown>, ctx: Ctx, specId: string): FigmaPlanNode {
  const options = array(props.options).map((item) => String(item));
  const label = str(props.placeholder) || options[0] || "";
  return frame(specId, "Select", "HORIZONTAL", [
    text(`${specId}.value`, "Value", label, ctx.profile, "body.md"),
    glyph(`${specId}.chevron`, "Chevron", "expand_more", 16, colorToken("text.tertiary")),
  ], {
    height: 36,
    paddingX: 10,
    fill: colorToken("surface.default"),
    stroke: colorToken("border.strong"),
    strokeWidth: 1,
    radius: radiusPx(ctx.profile, "md"),
    alignItems: "CENTER",
    justifyContent: "SPACE_BETWEEN",
  });
}

function renderListRow(props: Record<string, unknown>, ctx: Ctx, specId: string): FigmaPlanNode {
  const status = str(props.status);
  const statusTone = str(props.statusTone) || "neutral";
  const titleRow = frame(`${specId}.titleRow`, "TitleRow", "HORIZONTAL", [
    text(`${specId}.title`, "Title", str(props.title), ctx.profile, "heading.3"),
    ...(status === ""
      ? []
      : [renderBadge({ label: status, tone: statusTone }, ctx, `${specId}.badge`)]),
  ], {
    gap: 6,
    alignItems: "CENTER",
  });
  const meta = str(props.meta);
  return frame(specId, "ListRow", "HORIZONTAL", [
    frame(`${specId}.main`, "Main", "VERTICAL", [
      titleRow,
      ...(str(props.subtitle) === ""
        ? []
        : [
            text(`${specId}.subtitle`, "Subtitle", str(props.subtitle), ctx.profile, "body.sm", {
              color: colorToken("text.secondary"),
            }),
          ]),
    ], {
      layoutGrow: 1,
      gap: 2,
    }),
    ...(meta === ""
      ? []
      : [
          frame(`${specId}.meta`, "Meta", "HORIZONTAL", [
            text(`${specId}.metaText`, "Meta", meta, ctx.profile, "body.md", {
              color: colorToken("text.secondary"),
            }),
            glyph(`${specId}.chevron`, "Chevron", "chevron_right", 16, colorToken("text.tertiary")),
          ], { gap: 2, alignItems: "CENTER" }),
        ]),
  ], {
    paddingY: 10,
    gap: spacePx(ctx.profile, "3"),
    alignItems: "CENTER",
  });
}

function renderList(props: Record<string, unknown>, ctx: Ctx, specId: string, path: string): FigmaPlanNode {
  const items = props.items;
  if (!Array.isArray(items)) {
    const count = Math.min(Math.max(Number(items) || 3, 1), 6);
    return frame(
      specId,
      "List",
      "VERTICAL",
      Array.from({ length: count }, (_, index) =>
        text(`${specId}.placeholder.${index}`, "Placeholder", "—", ctx.profile, "body.md", {
          color: colorToken("text.tertiary"),
        })
      ),
      { gap: 0 }
    );
  }
  const children = items.map((item, index) => {
    if (item !== null && typeof item === "object" && !Array.isArray(item)) {
      const record = item as Record<string, unknown>;
      return frame(`${specId}.row.${index}`, "Row", "HORIZONTAL", [
        frame(`${specId}.row.${index}.label`, "Label", "HORIZONTAL", [
          text(`${specId}.row.${index}.labelText`, "Label", str(record.label), ctx.profile, "label.sm", {
            color: colorToken("text.tertiary"),
          }),
        ], { width: 72 }),
        text(`${specId}.row.${index}.value`, "Value", str(record.value), ctx.profile, "body.md", {
          layoutGrow: 1,
        }),
      ], {
        paddingY: 10,
        gap: spacePx(ctx.profile, "3"),
        alignItems: "CENTER",
      });
    }
    return text(`${specId}.row.${index}`, "Item", String(item), ctx.profile, "body.md");
  });
  void path;
  return frame(specId, "List", "VERTICAL", children, { gap: 0 });
}

const DAY_WIDTH = 46;
const TIME_WIDTH = 36;
const ROW_HEIGHT = 44;
const HEADER_HEIGHT = 36;

function renderCalendar(props: Record<string, unknown>, ctx: Ctx, specId: string): FigmaPlanNode {
  const days = array(props.days);
  const hours = array(props.hours).map((hour) => String(hour));
  const blocks = array(props.blocks);
  const width = TIME_WIDTH + DAY_WIDTH * 7;
  const height = HEADER_HEIGHT + ROW_HEIGHT * Math.max(hours.length, 1);
  const children: FigmaPlanNode[] = [];

  days.forEach((entry, dayIndex) => {
    const record = entry !== null && typeof entry === "object" ? (entry as Record<string, unknown>) : {};
    const label = typeof entry === "string" ? entry : str(record.label);
    const date = typeof entry === "string" ? "" : str(record.date);
    const selected = typeof entry !== "string" && bool(record.selected);
    children.push({
      type: "ABSOLUTE",
      specId: `${specId}.day.${dayIndex}`,
      name: `Day:${label}`,
      x: TIME_WIDTH + dayIndex * DAY_WIDTH,
      y: 0,
      width: DAY_WIDTH,
      height: HEADER_HEIGHT,
      child: frame(`${specId}.day.${dayIndex}.frame`, "Day", "VERTICAL", [
        text(`${specId}.day.${dayIndex}.label`, "Label", label, ctx.profile, "label.sm", {
          color: selected ? colorToken("status.info") : colorToken("text.secondary"),
        }),
        ...(date === ""
          ? []
          : [
              text(`${specId}.day.${dayIndex}.date`, "Date", date.slice(5), ctx.profile, "label.sm", {
                color: selected ? colorToken("status.info") : colorToken("text.tertiary"),
              }),
            ]),
      ], {
        fill: selected ? colorToken("status.info") : colorToken("surface.subtle"),
        fillAlpha: selected ? 0.14 : 1,
        gap: 1,
        alignItems: "CENTER",
        justifyContent: "CENTER",
      }),
    });
  });

  hours.forEach((hour, rowIndex) => {
    children.push({
      type: "ABSOLUTE",
      specId: `${specId}.hour.${rowIndex}`,
      name: `Hour:${hour}`,
      x: 0,
      y: HEADER_HEIGHT + rowIndex * ROW_HEIGHT,
      width: TIME_WIDTH,
      height: ROW_HEIGHT,
      child: frame(`${specId}.hour.${rowIndex}.frame`, "Hour", "VERTICAL", [
        text(`${specId}.hour.${rowIndex}.label`, "Label", hour, ctx.profile, "label.sm", {
          color: colorToken("text.tertiary"),
          align: "RIGHT",
        }),
      ], {
        paddingX: 4,
        alignItems: "END",
        justifyContent: "START",
      }),
    });
    for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
      children.push({
        type: "ABSOLUTE",
        specId: `${specId}.cell.${rowIndex}.${dayIndex}`,
        name: "Cell",
        x: TIME_WIDTH + dayIndex * DAY_WIDTH,
        y: HEADER_HEIGHT + rowIndex * ROW_HEIGHT,
        width: DAY_WIDTH,
        height: ROW_HEIGHT,
        child: frame(`${specId}.cell.${rowIndex}.${dayIndex}.frame`, "Cell", "NONE", [], {
          fill: colorToken("surface.default"),
          stroke: colorToken("border.subtle"),
          strokeWidth: 0.5,
        }),
      });
    }
  });

  blocks.forEach((entry, index) => {
    const record = entry !== null && typeof entry === "object" ? (entry as Record<string, unknown>) : {};
    const day = Math.max(0, Math.min(6, num(record.day) ?? 0));
    const start = num(record.start) ?? 9;
    const duration = num(record.duration) ?? 1;
    const startHour = Math.floor(start);
    const minuteOffset = Math.round((start - startHour) * ROW_HEIGHT);
    const tone = str(record.tone) || "neutral";
    const title = str(record.title);
    const subtitle = str(record.subtitle);
    const timeLabel = `${String(startHour).padStart(2, "0")}:${String(Math.round((start - startHour) * 60)).padStart(2, "0")}`;
    children.push({
      type: "ABSOLUTE",
      specId: `${specId}.block.${index}`,
      name: `Block:${title}`,
      x: TIME_WIDTH + day * DAY_WIDTH + 1,
      y: HEADER_HEIGHT + Math.max(0, startHour - 9) * ROW_HEIGHT + minuteOffset,
      width: DAY_WIDTH - 2,
      height: Math.max(22, Math.round(duration * ROW_HEIGHT)),
      child: frame(`${specId}.block.${index}.frame`, "Block", "VERTICAL", [
        text(`${specId}.block.${index}.title`, "Title", title, ctx.profile, "label.strong"),
        ...(subtitle === ""
          ? []
          : [text(`${specId}.block.${index}.subtitle`, "Subtitle", subtitle, ctx.profile, "label.sm", {
              color: colorToken("text.secondary"),
            })]),
        text(`${specId}.block.${index}.time`, "Time", timeLabel, ctx.profile, "label.sm", {
          color: colorToken("text.tertiary"),
        }),
      ], {
        padding: 2,
        gap: 0,
        fill: statusColor(tone),
        fillAlpha: 0.1,
        radius: radiusPx(ctx.profile, "sm"),
      }),
    });
  });

  return frame(specId, "CalendarGrid", "NONE", children, {
    width,
    height,
    fill: colorToken("surface.default"),
    radius: radiusPx(ctx.profile, "lg"),
    clip: true,
  });
}

function renderEmptyState(node: SpecNode, ctx: Ctx, specId: string, path: string): FigmaPlanNode {
  const props = node.props ?? {};
  return frame(specId, "EmptyState", "VERTICAL", [
    glyph(`${specId}.icon`, "Icon", str(props.icon) || "inbox", 40, colorToken("text.tertiary")),
    text(`${specId}.title`, "Title", str(props.title), ctx.profile, "body.md", {
      color: colorToken("text.secondary"),
      align: "CENTER",
    }),
    ...(str(props.description) === ""
      ? []
      : [
          text(`${specId}.desc`, "Description", str(props.description), ctx.profile, "label.sm", {
            color: colorToken("text.tertiary"),
            align: "CENTER",
          }),
        ]),
    ...renderChildren(childrenOf(node), ctx, `${path}.children`),
  ], {
    padding: spacePx(ctx.profile, "6"),
    gap: 4,
    alignItems: "CENTER",
  });
}

function countStats(root: FigmaPlanNode): FigmaPlan["stats"] {
  const stats = { frames: 0, texts: 0, instances: 0, icons: 0, images: 0 };
  const walk = (node: FigmaPlanNode): void => {
    if (node.type === "FRAME") stats.frames += 1;
    if (node.type === "TEXT") stats.texts += 1;
    if (node.type === "INSTANCE") stats.instances += 1;
    if (node.type === "GLYPH" || node.type === "VECTOR") stats.icons += 1;
    if (node.type === "IMAGE") stats.images += 1;
    if (node.child !== undefined) walk(node.child);
    for (const child of node.children ?? []) walk(child);
  };
  walk(root);
  return stats;
}

export function compileFigmaPlan(
  page: PageSpec,
  profile: Profile,
  catalog: Catalog
): FigmaPlan {
  void buttonMapping(catalog);
  const defaultView = page.defaultView ?? page.views?.[0];
  const ctx: Ctx = { page, profile, catalog, defaultView, inFooter: false };
  const root = renderNode(page.layout, ctx, "root") ?? frame(
    `${page.meta.pageId}.root`,
    page.meta.name,
    "VERTICAL",
    []
  );
  return {
    schemaVersion: "1.0",
    project: page.meta.project,
    pageId: page.meta.pageId,
    pageName: page.meta.name,
    width: page.meta.target === "web" ? WEB_WIDTH : MOBILE_WIDTH,
    height: page.meta.target === "web" ? WEB_HEIGHT : MOBILE_HEIGHT,
    background: colorToken("surface.subtle"),
    tokens: planTokens(profile),
    textStyles: planTextStyles(profile),
    components: planButtonComponents(profile),
    root,
    stats: countStats(root),
  };
}

export function compileFigmaPlans(
  pages: PageSpec[],
  profileFor: (page: PageSpec) => Profile,
  catalogFor: (page: PageSpec) => Catalog
): FigmaPlan[] {
  return pages.map((page) => compileFigmaPlan(page, profileFor(page), catalogFor(page)));
}

export function textStyleToken(profile: Profile, role: string): string {
  return textStyleName(profile, role);
}
