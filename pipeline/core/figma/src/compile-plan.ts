import type {
  Catalog,
  FigmaPlan,
  FigmaPlanNode,
  PageSpec,
  Profile,
  SpecNode,
} from "@prd-ui/contracts";
import {
  KNOWN_PARTIAL_TYPES,
  applyCoverage,
  buildCoverage,
  skipReason,
} from "./coverage.js";
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
  pageNames: Record<string, string>;
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

/**
 * Direct `.app-scroll > *` margins from renderer-html. A Figma auto-layout
 * frame has no CSS margins, so the compiler carries them as a derived
 * `SlotBlock` wrapper (paddingTop/paddingX/paddingBottom). Rows and Sections
 * are not listed: `.app-scroll > .row` supplies its own horizontal padding and
 * nested Sections keep theirs, and neither has a vertical margin.
 */
interface AppScrollInsets {
  marginTop: number;
  marginBottom: number;
  insetX: number;
}

function appScrollInsets(profile: Profile, node: SpecNode): AppScrollInsets {
  switch (node.type) {
    case "Card":
    case "Image":
      // `.app-scroll>.card{margin:var(--space-4)}` and
      // `.image-placeholder{margin:var(--space-4)}`.
      return {
        marginTop: spacePx(profile, "4"),
        marginBottom: spacePx(profile, "4"),
        insetX: spacePx(profile, "4"),
      };
    default:
      return { marginTop: 0, marginBottom: 0, insetX: 0 };
  }
}

interface RenderOptions {
  inFooter?: boolean;
  inFilterRow?: boolean;
  directAppScroll?: boolean;
  /** Direct child of a horizontal Row; text inputs grow like `flex:1`. */
  inHorizontalRow?: boolean;
}

function renderChildren(
  nodes: SpecNode[],
  ctx: Ctx,
  path: string,
  options: RenderOptions = {}
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
  options: RenderOptions = {}
): FigmaPlanNode | null {
  if (skipReason(node, ctx.defaultView)) return null;
  const props = node.props ?? {};
  const specId = node.id ?? `${ctx.page.meta.pageId}.${path}`;
  const inFooter = options.inFooter === true;
  const inFilterRow = options.inFilterRow === true;
  const directAppScroll = options.directAppScroll === true;
  const inHorizontalRow = options.inHorizontalRow === true;
  // `.app-scroll > .row` gets horizontal padding from the renderer CSS. Only a
  // row that is a direct MobileShell slot child is in that position; nested
  // rows keep their own (zero) padding.
  const directRowPadding = directAppScroll
    ? { paddingX: spacePx(ctx.profile, "4") }
    : {};

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
          // A view panel keeps its vertical padding but drops horizontal padding,
          // matching renderer-html's `[data-view-panel]` rule.
          ...(typeof props.viewPanel === "string"
            ? { paddingX: 0, paddingY: spacePx(ctx.profile, str(props.padding)) }
            : { padding: spacePx(ctx.profile, str(props.padding)) }),
          gap: spacePx(ctx.profile, str(props.gap)),
        }
      );
    case "Card":
      return renderCard(node, ctx, specId, path);
    case "Row": {
      const isFilterRow = str(props.variant) === "filter";
      return frame(specId, "Row", "HORIZONTAL", renderChildren(childrenOf(node), ctx, `${path}.children`, {
        inFooter,
        inFilterRow: isFilterRow,
        inHorizontalRow: true,
      }), {
        gap: spacePx(ctx.profile, str(props.gap)),
        alignItems: "CENTER",
        ...directRowPadding,
      });
    }
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
    case "Button": {
      const emphasis = str(props.emphasis) || "primary";
      // `.filter-row .btn.ghost` is the bordered chip; plain ghost is a text button.
      const variant = emphasis === "ghost" && inFilterRow ? "ghost-chip" : emphasis;
      return instance(specId, str(props.label), variant, {
        ...(inFooter ? { height: 44, layoutGrow: 1 } : {}),
      });
    }
    case "Badge":
      return renderBadge(props, ctx, specId);
    case "SearchBar":
      return renderSearchBar(props, ctx, specId);
    case "CollapsedFilter":
      return renderCollapsedFilter(props, ctx, specId);
    case "FormField":
      return renderFormField(node, ctx, specId, path);
    case "Input":
      return renderInput(props, ctx, specId, inHorizontalRow);
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
    case "Switch": {
      const state = str(props.state) || "off";
      const children = [
        text(`${specId}.label`, "Label", str(props.label), ctx.profile, "body.md", {
          origin: "derived",
        }),
        frame(`${specId}.track`, "Track", "NONE", [], {
          width: 36,
          height: 20,
          radius: 10,
          fill:
            state === "on"
              ? colorToken("status.success")
              : colorToken("border.strong"),
          origin: "derived",
        }),
        text(`${specId}.value`, "Value", str(props.value), ctx.profile, "label.sm", {
          origin: "derived",
        }),
      ];
      return frame(specId, "Switch", "HORIZONTAL", children, {
        gap: 6,
        alignItems: "CENTER",
      });
    }
    case "InventoryCard": {
      const attributes = Array.isArray(props.attributes)
        ? (props.attributes as Array<{ label?: unknown; value?: unknown }>)
        : [];
      const head = frame(
        `${specId}.head`,
        "Head",
        "HORIZONTAL",
        [
          text(`${specId}.name`, "Name", str(props.name), ctx.profile, "heading.3", {
            origin: "derived",
          }),
          ...(str(props.spec) === ""
            ? []
            : [
                text(`${specId}.spec`, "Spec", str(props.spec), ctx.profile, "body.sm", {
                  origin: "derived",
                }),
              ]),
        ],
        { gap: 2, alignItems: "CENTER", origin: "derived" }
      );
      const attrRows = attributes.map((attribute, index) =>
        text(
          `${specId}.attr.${index}`,
          "Attr",
          `${str(attribute.label)} ${str(attribute.value)}`,
          ctx.profile,
          "body.sm",
          { origin: "derived" }
        )
      );
      const numbers = frame(
        `${specId}.numbers`,
        "Numbers",
        "VERTICAL",
        [
          text(
            `${specId}.current`,
            "Current",
            `${str(props.currentLabel)} ${str(props.currentStock)}`,
            ctx.profile,
            "body.sm",
            { origin: "derived" }
          ),
          text(
            `${specId}.available`,
            "Available",
            `${str(props.availableLabel)} ${str(props.availableStock)}`,
            ctx.profile,
            "body.sm",
            { origin: "derived" }
          ),
          ...(str(props.inTransit) === ""
            ? []
            : [
                text(
                  `${specId}.transit`,
                  "InTransit",
                  str(props.inTransit),
                  ctx.profile,
                  "body.sm",
                  { origin: "derived" }
                ),
              ]),
        ],
        { gap: 2, origin: "derived" }
      );
      return frame(
        specId,
        "InventoryCard",
        "VERTICAL",
        [head, ...attrRows, numbers],
        {
          fill: colorToken("surface.default"),
          radius: radiusPx(ctx.profile, "lg"),
          padding: spacePx(ctx.profile, "4"),
          gap: spacePx(ctx.profile, "2"),
        }
      );
    }
    case "Image":
      return frame(specId, "Image", "VERTICAL", [], {
        height: 180,
        fill: colorToken("surface.subtle"),
        radius: radiusPx(ctx.profile, "lg"),
      });
    default: {
      // Fail closed: a type the compiler does not know is never silently a plain
      // frame. Known-but-unmapped types keep their generic frame but degrade.
      const known = KNOWN_PARTIAL_TYPES.has(node.type);
      return frame(
        specId,
        known ? node.type : `Unmapped:${node.type}`,
        "VERTICAL",
        renderChildren(childrenOf(node), ctx, `${path}.children`),
        {
          gap: 0,
          ...(known
            ? { mapping: "degraded" as const, reason: `PARTIAL_MAPPING:${node.type}` }
            : { mapping: "unmapped" as const, reason: `UNMAPPED_COMPONENT:${node.type}` }),
        }
      );
    }
  }
}

function renderMobileShell(node: SpecNode, ctx: Ctx, specId: string): FigmaPlanNode {
  const props = node.props ?? {};
  const width = ctx.page.meta.target === "web" ? WEB_WIDTH : MOBILE_WIDTH;
  const height = ctx.page.meta.target === "web" ? WEB_HEIGHT : MOBILE_HEIGHT;
  const top = node.slots?.["top-bar"] ?? [];
  // Mirror renderer-html's MobileShell slot order; detail/notice archetypes put
  // their body in summary/fields, not content.
  const contentSlots = ["title", "illustration", "body", "summary", "feed", "fields", "content"] as const;
  // Render the direct `.app-scroll` children in slot order, then model their CSS
  // margins. `.app-scroll>.card{margin:16px}` is not a flex gap, so a card gets
  // a derived SlotBlock wrapper with paddingTop/paddingX/paddingBottom; a
  // following direct Row gets paddingTop for the collapsed margin gap. Without
  // the wrapper the card is 390px wide and its list 358px instead of 358/326.
  const entries = contentSlots.flatMap((name) =>
    (node.slots?.[name] ?? []).flatMap((child, index) => {
      const rendered = renderNode(child, ctx, `${name}.${index}`, { directAppScroll: true });
      return rendered === null ? [] : [{ spec: child, rendered }];
    })
  );
  const content = entries.map((entry, index) => {
    const insets = appScrollInsets(ctx.profile, entry.spec);
    const previous = index === 0 ? undefined : entries[index - 1];
    const spacing =
      previous === undefined
        ? insets.marginTop
        : Math.max(appScrollInsets(ctx.profile, previous.spec).marginBottom, insets.marginTop);
    const isLast = index === entries.length - 1;
    const paddingTop = spacing > 0 ? spacing : undefined;
    const paddingX = insets.insetX > 0 ? insets.insetX : undefined;
    const paddingBottom =
      isLast && insets.marginBottom > 0 ? insets.marginBottom : undefined;
    if (paddingTop === undefined && paddingX === undefined && paddingBottom === undefined) {
      return entry.rendered;
    }
    return frame(
      `${entry.rendered.specId}.slot`,
      "SlotBlock",
      "VERTICAL",
      [entry.rendered],
      {
        ...(paddingTop === undefined ? {} : { paddingTop }),
        ...(paddingX === undefined ? {} : { paddingX }),
        ...(paddingBottom === undefined ? {} : { paddingBottom }),
      }
    );
  });
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
    content,
    {
      layoutGrow: 1,
      fill: colorToken("surface.subtle"),
      gap: 0,
      clip: true,
      // `.app-scroll{padding-bottom:var(--space-4)}`.
      paddingBottom: spacePx(ctx.profile, "4"),
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
          // `.app-actions` is `padding:12px 16px` plus a 1px top border. The
          // border is a separate divider frame: a partially stroked Figma frame
          // reserves its 1px stroke on every side for auto layout, which would
          // shrink the button row to 356px and shift it 1px right/down.
          const actionRow = frame(
            `${specId}.actions.row`,
            "ActionsRow",
            "HORIZONTAL",
            renderChildren(actionNodes, ctx, "actions", { inFooter: true }),
            {
              paddingY: spacePx(ctx.profile, "3"),
              paddingX: spacePx(ctx.profile, "4"),
              gap: spacePx(ctx.profile, "2"),
              alignItems: "CENTER",
            }
          );
          return frame(
            `${specId}.actions`,
            "Actions",
            "VERTICAL",
            [
              frame(`${specId}.actions.divider`, "ActionsDivider", "HORIZONTAL", [], {
                height: 1,
                fill: colorToken("border.subtle"),
              }),
              actionRow,
            ],
            {
              fill: colorToken("surface.default"),
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

function tabGlyph(id: string): string {
  const glyphs: Record<string, string> = {
    today: "home",
    今日: "home",
    "appointment-list": "calendar_month",
    预约列表: "calendar_month",
    "customer-search": "search",
    客户搜索: "search",
    customer: "person",
    客户: "person",
    callback: "call",
    回访登记: "call",
    workbench: "grid_view",
    mine: "settings",
    settings: "settings",
    "home-feed": "home",
    "orders-overview": "dashboard",
    "orders-list": "format_list_bulleted",
    "order-detail": "receipt_long",
    "order-form": "add_box",
    auth: "login",
    "item-detail": "shopping_bag",
  };
  return glyphs[id] ?? "circle";
}

function renderTabBar(props: Record<string, unknown>, ctx: Ctx, specId: string): FigmaPlanNode {
  const items = array(props.items).map((item) => String(item));
  const active = str(props.active);
  return frame(
    specId,
    "TabBar",
    "HORIZONTAL",
    items.map((id, index) => {
      const label = ctx.pageNames[id] ?? id;
      return frame(`${specId}.tab.${index}`, `Tab:${label}`, "VERTICAL", [
        glyph(
          `${specId}.tab.${index}.icon`,
          "Icon",
          tabGlyph(id),
          22,
          id === active ? colorToken("action.primary") : colorToken("text.tertiary")
        ),
        text(
          `${specId}.tab.${index}.label`,
          "Label",
          label,
          ctx.profile,
          "label.sm",
          { color: id === active ? colorToken("action.primary") : colorToken("text.tertiary") }
        ),
      ], {
        layoutGrow: 1,
        gap: 2,
        alignItems: "CENTER",
        justifyContent: "CENTER",
      });
    }),
    {
      height: 64,
      fill: colorToken("surface.default"),
      borderTop: colorToken("border.subtle"),
      borderTopWidth: 1,
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
    // `.card-body { margin-top: 8px }` is the head→body rhythm. The card itself
    // has no gap, so the derived body frame carries the offset for Figma.
    { gap: 0, paddingTop: spacePx(ctx.profile, "2") }
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
    // `.card` has no gap; `.card-body` supplies the 8px head→body rhythm with a
    // margin, which is not a flex gap on the card itself.
    gap: 0,
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
    // `<button class="quick-action">` sets no padding, so the UA button padding
    // (1px block / 6px inline in Chrome) is the computed value.
    paddingY: 1,
    paddingX: 6,
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
    text(`${specId}.label`, "Label", `${label}${required ? "*" : ""}`, ctx.profile, "body.md", {
      color: colorToken("text.secondary"),
    }),
    ...renderChildren(childrenOf(node), ctx, `${path}.children`),
  ], {
    gap: 6,
  });
}

function renderInput(
  props: Record<string, unknown>,
  ctx: Ctx,
  specId: string,
  inHorizontalRow: boolean
): FigmaPlanNode {
  return frame(specId, "Input", "HORIZONTAL", [
    text(`${specId}.placeholder`, "Placeholder", str(props.placeholder), ctx.profile, "input.md", {
      color: colorToken("text.tertiary"),
    }),
  ], {
    height: 36,
    paddingX: 10,
    fill: colorToken("surface.default"),
    stroke: colorToken("border.control"),
    strokeWidth: 1,
    radius: 8,
    alignItems: "CENTER",
    // `.form-field .row .input{flex:1;min-width:0}`: the input fills the row
    // while the sibling picker button hugs (`.form-field .row .btn{flex:0 0 auto}`).
    ...(inHorizontalRow ? { layoutGrow: 1 } : {}),
  });
}

function renderSelect(props: Record<string, unknown>, ctx: Ctx, specId: string): FigmaPlanNode {
  const options = array(props.options).map((item) => String(item));
  // A native <select> shows the first option; the placeholder is only a hint.
  const label = str(props.value) || options[0] || str(props.placeholder);
  return frame(specId, "Select", "HORIZONTAL", [
    text(`${specId}.value`, "Value", label, ctx.profile, "input.md", {
      color: colorToken("text.primary"),
    }),
    glyph(`${specId}.chevron`, "Chevron", "expand_more", 16, colorToken("text.tertiary")),
  ], {
    height: 36,
    paddingX: 10,
    fill: colorToken("surface.default"),
    stroke: colorToken("border.control"),
    strokeWidth: 1,
    radius: 8,
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
    borderBottom: colorToken("border.subtle"),
    borderBottomWidth: 1,
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
      { gap: 10, paddingY: 4 }
    );
  }
  const children = items.map((item, index) => {
    if (item !== null && typeof item === "object" && !Array.isArray(item)) {
      const record = item as Record<string, unknown>;
      return frame(`${specId}.row.${index}`, "Row", "HORIZONTAL", [
        frame(`${specId}.row.${index}.label`, "Label", "HORIZONTAL", [
          text(`${specId}.row.${index}.labelText`, "Label", str(record.label), ctx.profile, "body.sm", {
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
        // `.list-text-row:last-child` suppresses the divider on the final row.
        ...(index === items.length - 1
          ? {}
          : { borderBottom: colorToken("border.subtle"), borderBottomWidth: 1 }),
      });
    }
    // `.list-text-row{padding:10px 0;border-bottom:1px ...}`: a plain string
    // item is a padded, divided row, not a bare text line.
    return frame(
      `${specId}.row.${index}`,
      "Row",
      "HORIZONTAL",
      [
        text(`${specId}.row.${index}.text`, "Item", String(item), ctx.profile, "body.regular"),
      ],
      {
        paddingY: 10,
        alignItems: "CENTER",
        ...(index === items.length - 1
          ? {}
          : { borderBottom: colorToken("border.subtle"), borderBottomWidth: 1 }),
      }
    );
  });
  void path;
  return frame(specId, "List", "VERTICAL", children, { gap: 0, paddingY: 4 });
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
        text(`${specId}.day.${dayIndex}.label`, "Label", label, ctx.profile, selected ? "label.bold" : "label.sm", {
          color: selected ? colorToken("status.info") : colorToken("text.secondary"),
        }),
        ...(date === ""
          ? []
          : [
              text(`${specId}.day.${dayIndex}.date`, "Date", date.slice(5), ctx.profile, "date", {
                color: selected ? colorToken("status.info") : colorToken("text.tertiary"),
              }),
            ]),
      ], {
        width: DAY_WIDTH,
        height: HEADER_HEIGHT,
        fill: selected ? colorToken("status.info") : colorToken("surface.subtle"),
        fillAlpha: selected ? 0.14 : 1,
        gap: 1,
        alignItems: "CENTER",
        justifyContent: "CENTER",
        // `.calendar-day` has a 1px border on its left and bottom edges; the
        // selected underline replaces the bottom border with a 2px accent (the
        // renderer paints it as an inset box-shadow, which the comparator's
        // underline fallback accepts).
        borderLeft: colorToken("border.subtle"),
        borderLeftWidth: 1,
        borderBottom: colorToken("border.subtle"),
        borderBottomWidth: 1,
        ...(selected
          ? { borderBottom: colorToken("status.info"), borderBottomWidth: 2 }
          : {}),
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
        text(`${specId}.hour.${rowIndex}.label`, "Label", hour, ctx.profile, "date", {
          color: colorToken("text.tertiary"),
          align: "RIGHT",
        }),
      ], {
        width: TIME_WIDTH,
        height: ROW_HEIGHT,
        // `.calendar-hour` is `padding:2px 4px 0 0`.
        paddingTop: 2,
        paddingRight: 4,
        alignItems: "END",
        justifyContent: "START",
      }),
    });
    for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
      const day = days[dayIndex];
      const selected =
        day !== null && typeof day === "object" && bool((day as Record<string, unknown>).selected);
      children.push({
        type: "ABSOLUTE",
        specId: `${specId}.cell.${rowIndex}.${dayIndex}`,
        name: "Cell",
        x: TIME_WIDTH + dayIndex * DAY_WIDTH,
        y: HEADER_HEIGHT + rowIndex * ROW_HEIGHT,
        width: DAY_WIDTH,
        height: ROW_HEIGHT,
        child: frame(`${specId}.cell.${rowIndex}.${dayIndex}.frame`, "Cell", "NONE", [], {
          width: DAY_WIDTH,
          height: ROW_HEIGHT,
          // `.calendar-cell` is transparent with top/left 1px rules; a selected
          // column only adds a 4% info tint.
          ...(selected ? { fill: colorToken("status.info"), fillAlpha: 0.04 } : {}),
          borderTop: colorToken("border.subtle"),
          borderTopWidth: 1,
          borderLeft: colorToken("border.subtle"),
          borderLeftWidth: 1,
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
      // The block fills the whole day column; its grid cell starts at the
      // column edge and the CSS left border is inside the box.
      x: TIME_WIDTH + day * DAY_WIDTH,
      y: HEADER_HEIGHT + Math.max(0, startHour - 9) * ROW_HEIGHT + minuteOffset,
      width: DAY_WIDTH,
      height: Math.max(22, Math.round(duration * ROW_HEIGHT)),
      child: frame(`${specId}.block.${index}.frame`, "Block", "VERTICAL", [
        text(`${specId}.block.${index}.title`, "Title", title, ctx.profile, "label.bold"),
        ...(subtitle === ""
          ? []
          : [text(`${specId}.block.${index}.subtitle`, "Subtitle", subtitle, ctx.profile, "caption", {
              color: colorToken("text.secondary"),
            })]),
        text(`${specId}.block.${index}.time`, "Time", timeLabel, ctx.profile, "caption", {
          color: colorToken("text.tertiary"),
        }),
      ], {
        width: DAY_WIDTH,
        height: Math.max(22, Math.round(duration * ROW_HEIGHT)),
        padding: 2,
        gap: 0,
        fill: statusColor(tone),
        fillAlpha: 0.1,
        radius: radiusPx(ctx.profile, "sm"),
        borderLeft: statusColor(tone),
        borderLeftWidth: 2,
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
  const icon = str(props.icon);
  return frame(specId, "EmptyState", "VERTICAL", [
    // renderer-html only draws an icon when the spec provides one.
    ...(icon === "" ? [] : [glyph(`${specId}.icon`, "Icon", icon, 40, colorToken("text.tertiary"))]),
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
    // `.empty-state` is `padding: space-6 space-4` (24px block / 16px inline).
    paddingY: spacePx(ctx.profile, "6"),
    paddingX: spacePx(ctx.profile, "4"),
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
  catalog: Catalog,
  pageNames: Record<string, string> = {}
): FigmaPlan {
  void buttonMapping(catalog);
  const defaultView = page.defaultView ?? page.views?.[0];
  const ctx: Ctx = { page, profile, catalog, defaultView, inFooter: false, pageNames };
  const root = renderNode(page.layout, ctx, "root") ?? frame(
    `${page.meta.pageId}.root`,
    page.meta.name,
    "VERTICAL",
    []
  );
  const plan: FigmaPlan = {
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
  const coverage = buildCoverage(page, plan);
  applyCoverage(plan, coverage);
  return plan;
}

export function compileFigmaPlans(
  pages: PageSpec[],
  profileFor: (page: PageSpec) => Profile,
  catalogFor: (page: PageSpec) => Catalog
): FigmaPlan[] {
  const pageNames = Object.fromEntries(
    pages.map((page) => [page.meta.pageId, page.meta.name])
  );
  return pages.map((page) =>
    compileFigmaPlan(page, profileFor(page), catalogFor(page), pageNames)
  );
}

export function textStyleToken(profile: Profile, role: string): string {
  return textStyleName(profile, role);
}
