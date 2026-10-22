import type {
  Catalog,
  PageSpec,
  Profile,
  ReqId,
  SpecNode,
  UiBrief,
  UiBriefPage,
} from "@prd-ui/contracts";
import {
  ACTION_KEYS,
  CARD_KEYS,
  QUICK_KEYS,
  semanticNodeId,
  type ArchetypeDef,
} from "@prd-ui/design-system";

/** Root shell the compiler emits per page target. */
const ROOT_SHELL = {
  web: "PageShell",
  mobile: "MobileShell",
} as const;

const authFieldMeta: Record<string, { label: string; inputType: "text" | "email" | "password" }> = {
  email: { label: "邮箱", inputType: "email" },
  password: { label: "密码", inputType: "password" },
};

const settingsFieldMeta: Record<string, { label: string; options: string[] }> = {
  notifications: { label: "通知设置", options: ["开启", "关闭"] },
  language: { label: "语言", options: ["简体中文", "English"] },
  timezone: { label: "时区", options: ["Asia/Shanghai", "UTC"] },
};

function btn(label: string, emphasis = "primary", action = label): SpecNode {
  return { type: "Button", props: { label, emphasis, action } };
}

const STANDARD_ICON_ASSETS: Record<string, string> = {
  billing: "icon-plus",
  receipt: "icon-plus",
  order: "icon-plus",
  appointment: "icon-plus",
  "appointment-create": "icon-plus",
  calendar: "icon-plus",
  "customer-search": "icon-search",
  search: "icon-search",
  inventory: "icon-package",
  package: "icon-package",
  home: "icon-home",
  today: "icon-home",
  user: "icon-user",
  customer: "icon-user",
  message: "icon-circle-alert",
  alert: "icon-circle-alert",
  refresh: "icon-refresh-cw",
  retry: "icon-refresh-cw",
  "chevron-left": "icon-chevron-left",
  "chevron-right": "icon-chevron-right",
};

function standardIconId(icon: string): string {
  return STANDARD_ICON_ASSETS[icon] ?? icon;
}

function primaryAction(labels: string[], fallback: string): string {
  return (
    labels.find((label) => /新增|保存|提交|确认|登录/.test(label)) ??
    labels[0] ??
    fallback
  );
}

function text(label: string, textRole = "body.md"): SpecNode {
  return { type: "Text", props: { text: label }, textRole };
}

function fieldFormNode(
  field: string,
  readOnly = true,
  value?: string,
  label?: string
): SpecNode {
  return {
    type: "FormField",
    props: {
      label: label ?? field,
      field,
      readOnly,
      ...(value === undefined ? {} : { value }),
    },
  };
}

/**
 * Render every brief action as a Button, with the first one primary and the
 * rest secondary. Archetypes with a conventional action set use it only when
 * the brief declares no actions.
 */
function actionButtons(page: UiBriefPage, defaults: string[]): SpecNode[] {
  const labels = page.actions && page.actions.length > 0 ? page.actions : defaults;
  return labels.map((label, index) => btn(label, index === 0 ? "primary" : "secondary"));
}

/** Empty state with an illustration only when the brief explicitly supplies one. */
function emptyStateNode(
  page: UiBriefPage,
  title: string,
  description?: string,
  emptyKind?: "idle" | "empty"
): SpecNode {
  const node: SpecNode = {
    type: "EmptyState",
    props:
      description === undefined
        ? { title, ...(emptyKind === undefined ? {} : { emptyKind }) }
        : { title, description, ...(emptyKind === undefined ? {} : { emptyKind }) },
  };
  if (page.emptyAssetRef !== undefined) node.assetRef = page.emptyAssetRef;
  return node;
}

type InteractionView = "calendar" | "list";

function linkedRoutesFor(
  brief: UiBrief,
  page: UiBriefPage
): NonNullable<PageSpec["linkedRoutes"]> {
  const moduleKey = page.id.split("-")[0] ?? page.id;
  const detailPages = brief.ia.pages.filter((entry) => entry.archetype === "detail");
  const detailRoute =
    page.archetype === "detail"
      ? page.route
      : (detailPages.find((entry) => entry.id.includes(moduleKey)) ?? detailPages[0])?.route;
  const formPages = brief.ia.pages.filter((entry) => entry.archetype === "mobile-form");
  const formRoute =
    (formPages.find((entry) => entry.id.includes(moduleKey)) ?? formPages[0])?.route;
  const customerPage = brief.ia.pages.find((entry) => entry.id === "customer-detail");
  const noticePage = brief.ia.pages.find((entry) => (entry.noticeBlocks ?? []).length > 0);
  return {
    ...(formRoute === undefined ? {} : { create: formRoute, form: formRoute }),
    ...(detailRoute === undefined ? {} : { detail: detailRoute }),
    ...(customerPage === undefined ? {} : { customer: customerPage.route }),
    ...(noticePage === undefined ? {} : { notice: noticePage.route }),
  };
}

function rowGroupFor(pageId: string, parentTitle: string | undefined): string {
  if (pageId === "today") return parentTitle === "待回访" ? "callback" : "appointment";
  if (pageId === "customer-search") return "result";
  if (pageId === "appointment-list") return "appointment";
  return "row";
}

function assignNodeIds(page: UiBriefPage, layout: SpecNode): void {
  const used = new Set<string>();
  const groupCounts = new Map<string, number>();
  const unique = (id: string): string => {
    let candidate = id;
    let index = 2;
    while (used.has(candidate)) candidate = `${id}.${index++}`;
    used.add(candidate);
    return candidate;
  };
  const walk = (node: SpecNode, path: string, parentTitle?: string): void => {
    let id: string | undefined;
    if (path === "root") {
      id = semanticNodeId(page.id, "page", "root");
    } else if (node.type === "Button") {
      const key = ACTION_KEYS[String(node.props?.action ?? "")];
      if (key !== undefined) id = semanticNodeId(page.id, "action", key);
    } else if (node.type === "FormField") {
      const field = String(node.props?.field ?? "");
      if (field !== "") id = semanticNodeId(page.id, "field", field.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase());
    } else if (node.type === "QuickAction") {
      const key = QUICK_KEYS[String(node.props?.label ?? "")];
      if (key !== undefined) id = semanticNodeId(page.id, "quick", key);
    } else if (node.type === "Card") {
      const key = CARD_KEYS[String(node.props?.title ?? "")];
      if (key !== undefined) id = semanticNodeId(page.id, "card", key);
    } else if (node.type === "CalendarGrid") {
      id = semanticNodeId(page.id, "calendar", "grid");
    } else if (node.type === "Section" && node.props?.viewPanel !== undefined) {
      id = semanticNodeId(page.id, "view", String(node.props.viewPanel));
    } else if (node.type === "EmptyState") {
      id = semanticNodeId(page.id, "state", String(node.props?.emptyKind ?? "empty"));
    } else if (node.type === "ListRow") {
      const group = (node.motionGroup ??= semanticNodeId(page.id, "row", rowGroupFor(page.id, parentTitle)));
      const index = groupCounts.get(group) ?? 0;
      groupCounts.set(group, index + 1);
      node.id = unique(`${group}.${index}`);
    }
    if (node.id === undefined && id !== undefined) node.id = unique(id);
    if (node.id === undefined) node.id = unique(`${page.id}.${path.replace(/\//g, ".")}`);
    // Cards carry the row group context through their own title, so `children`
    // must inherit it the same way slot children do (today's 我的预约/待回访).
    const childTitle = String(node.props?.title ?? parentTitle ?? "");
    for (const [slotName, children] of Object.entries(node.slots ?? {})) {
      children.forEach((child, index) => walk(child, `${path}/${slotName}/${index}`, childTitle));
    }
    (node.children ?? []).forEach((child, index) => walk(child, `${path}/children/${index}`, childTitle));
  };
  walk(layout, "root");
}

export function compilePageSpec(input: {
  brief: UiBrief;
  page: UiBriefPage;
  profile: Profile;
  catalog: Catalog;
  archetype: ArchetypeDef;
}): PageSpec {
  const { brief, page, catalog, archetype } = input;

  if (archetype.target !== "any" && archetype.target !== page.target) {
    throw new Error(
      `Archetype ${archetype.id} targets ${archetype.target}, but page ${page.id} targets ${page.target}`
    );
  }

  // A page must compile against a catalog that actually ships its root shell;
  // otherwise the page would validate against a shell the design system does
  // not provide (for example a mobile page using the web-only b-dense catalog).
  const expectedRoot = ROOT_SHELL[page.target];
  if (!catalog.components.some((component) => component.id === expectedRoot)) {
    throw new Error(
      `Catalog "${catalog.meta.library}" for profile "${page.profile}" does not provide root shell "${expectedRoot}" required by ${page.target} page "${page.id}"`
    );
  }

  const fields = page.fields ?? [];
  const views: InteractionView[] | undefined =
    page.views ??
    (page.archetype === "mobile-list" &&
    (fields.includes("time") || fields.includes("date"))
      ? ["calendar", "list"]
      : undefined);
  const formModes: PageSpec["formModes"] =
    page.formModes ??
    (page.archetype === "mobile-form" &&
    (page.actions ?? []).includes("保存") &&
    (page.actions ?? []).includes("保存改期")
      ? [
          { name: "new", label: "新增预约", actions: ["保存"] },
          {
            name: "reschedule",
            label: "改期",
            actions: ["保存改期"],
            customerLocked: true,
          },
        ]
      : undefined);
  const searchIdleTitle =
    page.searchIdleTitle ??
    ((page.filterFields ?? []).some((field) => field === "keyword" || field === "search")
      ? "输入姓名或脱敏手机号搜索客户"
      : undefined);
  const currentStatus = page.mockData?.values?.status;
  const layout = buildLayout(brief, page, archetype, { views, searchIdleTitle });
  assignNodeIds(page, layout);
  const states = Object.fromEntries(
    [...new Set([...archetype.requiredStates, ...page.requiredStates])].map((name) => [
      name,
      { name },
    ])
  );

  return {
    meta: {
      pageId: page.id,
      project: brief.meta.project,
      name: page.name,
      target: page.target,
      profile: page.profile,
      archetype: page.archetype,
      purpose: page.purpose,
      route: page.route,
      roles: page.roles,
      reqRefs: page.reqRefs as PageSpec["meta"]["reqRefs"],
      version: "0.1.0",
    },
    layout,
    states,
    interactions: buildInteractions(page),
    traceability: {
      reqMap: Object.fromEntries(page.reqRefs.map((req) => [req, [page.id]])),
      designDefaults: [],
      unmapped: [],
    },
    ...(page.businessStates === undefined ? {} : { businessStates: page.businessStates }),
    ...(formModes === undefined ? {} : { formModes }),
    ...(views === undefined
      ? {}
      : { views, defaultView: page.defaultView ?? views[0]! }),
    ...(searchIdleTitle === undefined ? {} : { searchIdleTitle }),
    ...(currentStatus === undefined ? {} : { currentStatus }),
    referenceId:
      page.mockData?.values?.orderNo ??
      page.mockData?.values?.appointmentId ??
      page.id,
    linkedRoutes: linkedRoutesFor(brief, page),
  };
}

function buildLayout(
  brief: UiBrief,
  page: UiBriefPage,
  archetype: ArchetypeDef,
  interaction: { views?: InteractionView[]; searchIdleTitle?: string }
): SpecNode {
  const nav = brief.ia.navigation.primary;
  const tabs = brief.ia.navigation.tabs ?? nav;

  switch (archetype.id) {
    case "overview":
      return {
        type: "PageShell",
        props: { title: page.name, nav },
        reqRef: page.reqRefs[0] as ReqId | undefined,
        slots: {
          content: [
            {
              type: "Section",
              props: { padding: "space.6", gap: "space.4" },
              children: [
                {
                  type: "Grid",
                  props: { columns: 4, gap: "space.4" },
                  children: (page.stats ?? [{ label: "指标", value: "—" }]).map((stat) => ({
                    type: "Stat",
                    props: { label: stat.label, value: stat.value },
                  })),
                },
                {
                  type: "Card",
                  props: { title: `${page.name}近期数据` },
                  children: [
                    {
                      type: "List",
                      props: { items: page.mockData?.listItems ?? 5 },
                    },
                  ],
                },
              ],
            },
          ],
        },
      };
    case "list": {
      const columns = page.fields ?? ["名称", "状态"];
      const filterFields = page.filterFields ?? page.fields ?? [];
      const labelFor = (field: string): string =>
        page.fieldLabels?.[field] ?? field;
      const emptyTitle = page.emptyTitle ?? `暂无${page.name}`;
      const actions = page.actions ?? [];
      const extraActions = actions.slice(1);

      return {
        type: "PageShell",
        props: { title: page.name, nav },
        reqRef: page.reqRefs[0] as ReqId | undefined,
        slots: {
          content: [
            {
              type: "Section",
              props: { padding: "space.6", gap: "space.4" },
              children: [
                {
                  type: "FilterBar",
                  props: {
                    fields: filterFields.map(labelFor),
                    action: actions[0] ?? "新建",
                  },
                },
                ...(extraActions.length > 0
                  ? [
                      {
                        type: "Row",
                        props: { gap: "space.2" },
                        children: extraActions.map((action) => btn(action, "secondary")),
                      },
                    ]
                  : []),
                {
                  type: "DataTable",
                  props: {
                    columns,
                    columnLabels: columns.map(labelFor),
                    pageSize: 20,
                    ...(page.mockData?.rows === undefined
                      ? {}
                      : { rows: page.mockData.rows }),
                  },
                },
                { type: "Pagination", props: { pageSize: 20 } },
                emptyStateNode(page, emptyTitle, "调整筛选条件后重试"),
              ],
            },
          ],
        },
      };
    }
    case "detail":
      return detailLayout(page, nav, tabs);
    case "form":
      return {
        type: "PageShell",
        props: { title: page.name, nav },
        reqRef: page.reqRefs[0] as ReqId | undefined,
        slots: {
          fields: [
            {
              type: "Section",
              props: { padding: "space.6", gap: "space.4" },
              children: (page.fields ?? []).map((field) => {
                const label = page.fieldLabels?.[field] ?? field;
                return {
                  type: "FormField",
                  props: { label, required: true },
                  children: [
                    { type: "Input", props: { name: field, placeholder: `请输入${label}` } },
                  ],
                };
              }),
            },
          ],
          actions: [
            {
              type: "Section",
              props: { padding: "space.4", gap: "space.2" },
              children: actionButtons(page, ["保存", "取消"]),
            },
          ],
        },
      };
    case "settings":
      return {
        type: "PageShell",
        props: { title: page.name, nav },
        reqRef: page.reqRefs[0] as ReqId | undefined,
        slots: {
          groups: [
            {
              type: "Section",
              props: { padding: "space.6", gap: "space.4" },
              children: [
                {
                  type: "Card",
                  props: { title: "偏好设置" },
                  children: (page.fields ?? []).map((field) => {
                    const meta = settingsFieldMeta[field];
                    return {
                      type: "FormField",
                      props: {
                        label: page.fieldLabels?.[field] ?? meta?.label ?? field,
                      },
                      children: [
                        {
                          type: "Select",
                          props: { options: meta?.options ?? ["开启", "关闭"] },
                        },
                      ],
                    };
                  }),
                },
              ],
            },
          ],
          actions: actionButtons(page, ["保存"]),
        },
      };
    case "feed": {
      return {
        type: "MobileShell",
        props: { title: page.name, tabs },
        reqRef: page.reqRefs[0] as ReqId | undefined,
        slots: {
          feed: [
            ...(page.feedItems ?? [{ title: "示例内容", body: "请配置 feedItems" }]).map(
              (item) => ({
                type: "FeedCard",
                props: { title: item.title, body: item.body },
              })
            ),
            emptyStateNode(page, page.emptyTitle ?? "暂无内容"),
          ],
          "bottom-nav": [{ type: "BottomNav", props: { items: tabs } }],
        },
      };
    }
    case "home": {
      const content = page.content ?? {};
      const quickActions =
        content.quickActions && content.quickActions.length > 0
          ? content.quickActions
          : [
              { label: "开单", icon: "receipt" },
              { label: "预约", icon: "calendar" },
            ];
      const appointments = content.appointments ?? [];
      const callbacks = content.callbacks ?? [];
      const storeName = content.storeName ?? "星光店";
      const hasMessage = content.hasMessage ?? true;
      const activeTab = tabs[0] ?? page.name;

      return {
        type: "MobileShell",
        props: {
          title: page.name,
          tabs,
          showTabs: true,
          storeName,
          hasMessage,
          activeTab,
        },
        reqRef: page.reqRefs[0] as ReqId | undefined,
        slots: {
          "top-bar": [{ type: "TopBar", props: { storeName, hasMessage } }],
          content: [
            {
              type: "Section",
              props: { padding: "space.4", gap: "space.3" },
              children: [
                {
                  type: "Card",
                  props: { title: "快捷操作" },
                  children: [
                    {
                      type: "Row",
                      props: { gap: "space.2" },
                      children: quickActions.map((action) => ({
                        type: "QuickAction",
                        props: {
                          label: action.label,
                          icon: standardIconId(action.icon),
                          tone: action.tone ?? "neutral",
                        },
                      })),
                    },
                  ],
                },
                {
                  type: "Card",
                  props: { title: "我的预约" },
                  children: [
                    ...appointments.map((appointment) => ({
                      type: "ListRow",
                      props: {
                        title: appointment.customer,
                        subtitle: appointment.item,
                        meta: appointment.time,
                        status: appointment.status,
                        statusTone: appointment.statusTone ?? "info",
                      },
                    })),
                    {
                      type: "EmptyState",
                      props: {
                        title: content.appointmentsEmptyTitle ?? "今天没有预约",
                        description: "客户直接上门？",
                        icon: "event_busy",
                      },
                      children: [
                        {
                          type: "Button",
                          props: { label: "当场开单", emphasis: "secondary" },
                        },
                      ],
                    },
                  ],
                },
                {
                  type: "Card",
                  props: { title: "待回访" },
                  children: [
                    ...callbacks.map((callback) => ({
                      type: "ListRow",
                      props: {
                        title: callback.customer,
                        subtitle: callback.item,
                        meta: callback.daysAgo,
                      },
                    })),
                    {
                      type: "EmptyState",
                      props: {
                        title: content.callbacksEmptyTitle ?? "暂无待回访",
                        description: "近 30 天服务过、尚未回访的记录会出现在这里",
                        icon: "call",
                      },
                    },
                  ],
                },
              ],
            },
          ],
          "bottom-nav": [
            { type: "TabBar", props: { items: tabs, active: activeTab } },
          ],
        },
      };
    }
    case "inventory-list": {
      const content = page.content ?? {};
      const products = content.products ?? [];
      const activeTab = tabs.includes(page.name)
        ? page.name
        : (tabs[1] ?? tabs[0] ?? "");

      return {
        type: "MobileShell",
        props: {
          title: page.name,
          tabs,
          showTabs: true,
          back: false,
          activeTab,
        },
        reqRef: page.reqRefs[0] as ReqId | undefined,
        slots: {
          content: [
            {
              type: "Section",
              props: { padding: "space.4", gap: "space.2" },
              children: [
                {
                  type: "SearchBar",
                  props: { placeholder: "搜索产品名称 / 规格" },
                },
                {
                  type: "Row",
                  props: { gap: "space.2", variant: "filter" },
                  children: [
                    {
                      type: "CollapsedFilter",
                      props: {
                        label: "产品分类",
                        value: "全部",
                        options: ["全部", "面膜类", "原液类", "仪器类", "精华类"],
                      },
                    },
                    {
                      type: "Switch",
                      props: { label: "仅看预警", value: "关", state: "off" },
                    },
                  ],
                },
                {
                  type: "SummaryRow",
                  props: { text: content.inventorySummary ?? "共 128 个产品" },
                },
                ...products.map((product) => ({
                  type: "InventoryCard",
                  props: {
                    name: product.name,
                    spec: product.spec ?? "",
                    badge: product.badge ?? "",
                    badgeTone: product.badgeTone ?? "neutral",
                    attributes: product.attributes ?? [],
                    currentLabel: "当前库存",
                    currentStock: product.currentStock ?? "0",
                    availableLabel: "可用库存",
                    availableStock: product.availableStock ?? "0",
                    inTransit: product.inTransit ?? "",
                  },
                })),
                {
                  type: "EmptyState",
                  props: {
                    title:
                      page.emptyTitle ??
                      content.inventoryEmptyTitle ??
                      "没有匹配的产品",
                    description: "试试清空筛选或更换关键词",
                    icon: "search_off",
                  },
                  children: [
                    {
                      type: "Button",
                      props: { label: "清空筛选", emphasis: "secondary" },
                    },
                  ],
                },
              ],
            },
          ],
          "bottom-nav": [
            { type: "TabBar", props: { items: tabs, active: activeTab } },
          ],
        },
      };
    }
    case "mobile-list": {
      const fields = page.fields ?? [];
      const labelFor = (field: string): string => page.fieldLabels?.[field] ?? field;
      const rows = page.mockData?.rows ?? [];
      const statusTone = (status: string): string => {
        if (/已到店|已完成|已确认|成功/.test(status)) return "success";
        if (/已登记|待确认|待到店|待处理/.test(status)) return "warning";
        if (/爽约|已取消|失败|异常/.test(status)) return "danger";
        return "neutral";
      };
      const filterFields = page.filterFields ?? ["status"];
      const searchField = filterFields.find(
        (field) => field === "keyword" || field === "search"
      );
      const listFilters = filterFields.filter((field) => field !== searchField);
      const filters = listFilters.map((field) => ({
        type: "CollapsedFilter" as const,
        props: {
          label: labelFor(field),
          value: "全部",
          options:
            field === "status"
              ? ["全部", "已登记", "已到店", "爽约", "已取消"]
              : ["全部", "今天", "本周"],
        },
      }));
      const actions = page.actions ?? [];
      const primary = primaryAction(actions, "新增");
      const secondaryActions = actions.filter((label) => label !== primary);
      const textOf = (row: Record<string, string>, key: string): string | undefined =>
        row[key] ?? undefined;
      const labelValue = (field: string, value: string): string =>
        fields.includes(field) ? `${labelFor(field)}：${value}` : value;
      const parseTime = (value: string | undefined): { start: number; duration: number } => {
        const match = /(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})/.exec(value ?? "");
        if (match === null) return { start: 9, duration: 1 };
        const startHour = Number(match[1]);
        const endHour = Number(match[3]);
        return {
          start: Math.min(20, Math.max(9, startHour)),
          duration: Math.max(1, Math.min(3, endHour - startHour || 1)),
        };
      };
      const calendarDays = ["一", "二", "三", "四", "五", "六", "日"].map(
        (label, index) => ({
          label: `周${label}`,
          date: String(index + 3).padStart(2, "0"),
          today: index === 2,
        })
      );
      const calendarHours = Array.from(
        { length: 12 },
        (_, index) => `${String(9 + index).padStart(2, "0")}:00`
      );
      const showCalendar =
        fields.includes("time") && rows.some((row) => row.time !== undefined);
      const calendarBlocks = rows.map((row, index) => {
        const { start, duration } = parseTime(textOf(row, "time"));
        return {
          day: index % 7,
          start,
          duration,
          title: textOf(row, "customer") ?? textOf(row, "title") ?? "—",
          subtitle: textOf(row, "project") ?? "",
          status: textOf(row, "status") ?? "",
          tone: statusTone(textOf(row, "status") ?? ""),
        };
      });
      const rowProps = (row: Record<string, string>): Record<string, unknown> => {
        const titleField = fields.includes("customer")
          ? "customer"
          : fields.includes("name")
            ? "name"
            : undefined;
        const titleValue =
          textOf(row, titleField ?? "") ??
          textOf(row, "customer") ??
          textOf(row, "name") ??
          textOf(row, "title") ??
          textOf(row, fields[0] ?? "") ??
          "—";
        const subtitleParts: string[] = [];
        const projectValue = textOf(row, "project") ?? textOf(row, "subtitle");
        if (projectValue !== undefined) {
          subtitleParts.push(labelValue("project", projectValue));
        } else {
          if (fields.includes("phone") && row.phone !== undefined) {
            subtitleParts.push(labelValue("phone", row.phone));
          }
          if (fields.includes("store") && row.store !== undefined) {
            subtitleParts.push(labelValue("store", row.store));
          }
        }
        if (fields.includes("delegation")) {
          subtitleParts.push(
            labelValue("delegation", textOf(row, "delegation") ?? "—")
          );
        }
        const metaValue = textOf(row, "time") ?? textOf(row, "createdAt");
        return {
          title: titleField === undefined ? titleValue : labelValue(titleField, titleValue),
          subtitle: subtitleParts.join(" · "),
          searchText: Object.values(row).join(" "),
          ...(metaValue === undefined || !fields.includes("time")
            ? {}
            : { meta: labelValue("time", metaValue) }),
          ...(row.status === undefined
            ? {}
            : { status: row.status, statusTone: statusTone(row.status) }),
          ...(fields.includes("therapist")
            ? { trailing: labelValue("therapist", textOf(row, "therapist") ?? "待分配") }
            : {}),
        };
      };
      const emptyNode = emptyStateNode(
        page,
        page.emptyTitle ?? `暂无${page.name}`,
        "调整筛选条件后重试",
        searchField === undefined ? undefined : "empty"
      );
      if (searchField !== undefined) {
        emptyNode.children = [btn("清空关键词", "secondary")];
      }
      return {
        type: "MobileShell",
        props: { title: page.name, back: true, showTabs: false },
        reqRef: page.reqRefs[0] as ReqId | undefined,
        slots: {
          content: [
            {
              type: "Section",
              props: { padding: "space.4", gap: "space.2" },
              children: [
                ...(searchField === undefined
                  ? []
                  : [
                      {
                        type: "SearchBar",
                        props: { placeholder: `搜索${labelFor(searchField)}` },
                      },
                      {
                        type: "Text",
                        props: { text: labelFor(searchField) },
                        textRole: "label.sm",
                      },
                    ]),
                ...(filters.length === 0
                  ? []
                  : [
                      {
                        type: "Row",
                        props: { gap: "space.2", variant: "filter" },
                        children: filters,
                      },
                    ]),
                {
                  type: "Row",
                  props: { gap: "space.2", variant: "caption" },
                  children: fields.map((field) => ({
                    type: "Text",
                    props: { text: labelFor(field) },
                    textRole: "label.sm",
                  })),
                },
                ...(searchField !== undefined && interaction.searchIdleTitle !== undefined
                  ? [
                      {
                        type: "EmptyState" as const,
                        props: {
                          title: interaction.searchIdleTitle,
                          description: "输入关键词后显示匹配结果",
                          emptyKind: "idle",
                        },
                      },
                    ]
                  : []),
                ...(secondaryActions.length > 0
                  ? [
                      {
                        type: "Row",
                        props: { gap: "space.2", variant: "filter" },
                        children: secondaryActions.map((label) => {
                          const button = btn(label, "secondary");
                          if (
                            interaction.views !== undefined &&
                            /日历.*列表/.test(label)
                          ) {
                            return {
                              ...button,
                              props: { ...button.props, viewToggle: true },
                            };
                          }
                          return button;
                        }),
                      },
                    ]
                  : []),
                ...(showCalendar
                  ? [
                      {
                        type: "Section" as const,
                        props:
                          interaction.views === undefined
                            ? { padding: "space.1", gap: "space.2" }
                            : {
                                padding: "space.1",
                                gap: "space.2",
                                viewPanel: "calendar",
                              },
                        children: [
                          text("日历", "heading.3"),
                          {
                            type: "CalendarGrid" as const,
                            props: {
                              days: calendarDays,
                              hours: calendarHours,
                              blocks: calendarBlocks,
                              ...(interaction.views === undefined
                                ? {}
                                : { viewPanel: "calendar" }),
                            },
                          },
                          text("列表", "heading.3"),
                        ],
                      },
                    ]
                  : []),
                ...(interaction.views === undefined
                  ? rows.map((row) => ({
                      type: "ListRow" as const,
                      props: rowProps(row),
                    }))
                  : [
                      {
                        type: "Section" as const,
                        props: {
                          padding: "space.1",
                          gap: "space.2",
                          viewPanel: "list",
                        },
                        children: rows.map((row) => ({
                          type: "ListRow" as const,
                          props: rowProps(row),
                        })),
                      },
                    ]),
                emptyNode,
              ],
            },
          ],
          actions: [btn(primary, "primary")],
        },
      };
    }
    case "mobile-form": {
      const fields = page.fields ?? [];
      const labelFor = (field: string): string => page.fieldLabels?.[field] ?? field;
      const actions = page.actions ?? ["保存"];
      const primary = primaryAction(actions, "保存");
      const alternateActions = actions.filter(
        (label) => label !== primary && /保存|提交|确认/.test(label)
      );
      const otherActions = actions.filter(
        (label) => label !== primary && !alternateActions.includes(label)
      );
      const optionsFor = (field: string): string[] | undefined => {
        if (field === "source") return ["到店", "电话", "微信", "企微"];
        if (field === "status") return ["已登记", "已到店", "爽约", "已取消"];
        if (field === "result") return ["已联系", "未接", "拒绝", "稍后再联系"];
        return undefined;
      };
      return {
        type: "MobileShell",
        props: { title: page.name, back: true, showTabs: false },
        reqRef: page.reqRefs[0] as ReqId | undefined,
        slots: {
          content: [
            {
              type: "Section",
              props: { padding: "space.4", gap: "space.3" },
              children: fields.map((field) => {
                const label = labelFor(field);
                const options = optionsFor(field);
                return {
                  type: "FormField",
                  props: { label, required: true, field },
                  children: [
                    options === undefined
                      ? {
                          type: "Input",
                          props: { name: field, placeholder: `请输入${label}` },
                        }
                      : {
                          type: "Select",
                          props: { options, placeholder: `请选择${label}` },
                        },
                  ],
                };
              }),
            },
            ...alternateActions.map((label) => ({
              type: "Row" as const,
              props: { gap: "space.2" },
              children: [
                { type: "Text" as const, props: { text: "另一模式" }, textRole: "label.sm" },
                { type: "Text" as const, props: { text: label }, textRole: "label.strong" },
              ],
            })),
            ...(otherActions.length === 0
              ? []
              : [
                  {
                    type: "Row" as const,
                    props: { gap: "space.2", variant: "filter" },
                    children: otherActions.map((label) => btn(label, "ghost")),
                  },
                ]),
          ],
          actions: [btn(primary, "primary")],
        },
      };
    }
    case "auth":
      return {
        type: "MobileShell",
        props: { title: page.name },
        reqRef: page.reqRefs[0] as ReqId | undefined,
        slots: {
          title: [text(page.name, "heading.1")],
          fields: (page.fields ?? ["email", "password"]).map((field) => {
            const meta = authFieldMeta[field];
            return {
              type: "FormField",
              props: {
                label: meta?.label ?? page.fieldLabels?.[field] ?? field,
              },
              children: [
                {
                  type: "Input",
                  props: {
                    name: field,
                    inputType: meta?.inputType ?? "text",
                  },
                },
              ],
            };
          }),
          actions: actionButtons(page, ["登录"]),
        },
      };
    case "onboarding":
      return {
        type: "MobileShell",
        props: { title: page.name },
        reqRef: page.reqRefs[0] as ReqId | undefined,
        slots: {
          illustration: [
            { type: "Image", props: { assetRef: "onboarding-1", ratio: "4:3" } },
          ],
          title: [text(page.name, "heading.1")],
          body: [text(page.purpose, "body.md")],
          actions: actionButtons(page, ["开始", "稍后"]),
        },
      };
    default:
      throw new Error(`Unsupported archetype: ${archetype.id}`);
  }
}

function detailLayout(page: UiBriefPage, nav: string[], tabs: string[]): SpecNode {
  const fields = page.fields ?? [];
  const summaryTitle = page.summaryTitle ?? `${page.name}摘要`;
  const actionLabels = page.actions?.length ? page.actions : ["编辑"];
  const primaryLabel = actionLabels[0]!;
  const openOrderLabel = actionLabels.find((label) => label.includes("开单"));
  const primaryLabels = [
    primaryLabel,
    ...(openOrderLabel !== undefined && openOrderLabel !== primaryLabel
      ? [openOrderLabel]
      : []),
  ];
  const secondaryLabels = actionLabels.filter(
    (label) => !primaryLabels.includes(label)
  );
  const actions = primaryLabels.map((label, index) =>
    btn(label, index === 0 ? "primary" : "secondary")
  );
  const secondaryActions = secondaryLabels.map((label) => btn(label, "ghost"));
  const noticeBlocks = page.noticeBlocks ?? [];
  const hasNoticeBlocks = noticeBlocks.length > 0;
  const visibleFields = fields.filter(
    (field) =>
      !(hasNoticeBlocks && (field === "notices" || field === "noticeBlocks"))
  );
  const summaryItems =
    page.mockData?.values === undefined
      ? page.mockData?.listItems
      : Object.entries(page.mockData.values)
          .filter(
            ([key]) =>
              !(hasNoticeBlocks && (key === "notices" || key === "noticeBlocks"))
          )
          .map(
            ([key, value]) => `${page.fieldLabels?.[key] ?? key}: ${value}`
          );
  const noticeCards = noticeBlocks.map((block) => ({
    type: "Card" as const,
    props: { title: block.title },
    children: [
      { type: "List" as const, props: { items: block.items } },
    ],
  }));
  const status = page.mockData?.values?.status;
  const statusTone =
    status === undefined
      ? "neutral"
      : /在售|已完成|成功/.test(status)
        ? "success"
        : /待处理|进行|加载/.test(status)
          ? "warning"
          : /异常|失败|缺货/.test(status)
            ? "danger"
            : "neutral";
  const statusBadge =
    status === undefined
      ? undefined
      : { type: "Badge" as const, props: { label: status, tone: statusTone } };

  if (page.target === "mobile") {
    return {
      type: "MobileShell",
      props: { title: page.name, tabs },
      reqRef: page.reqRefs[0] as ReqId | undefined,
      slots: {
        summary: [
          {
            type: "Card",
            props: { title: summaryTitle },
            children: [
              {
                type: "List",
                props: {
                  items: summaryItems ?? Math.max(visibleFields.length, 3),
                },
              },
              ...(statusBadge === undefined ? [] : [statusBadge]),
            ],
          },
          ...(hasNoticeBlocks
            ? [
                {
                  type: "Row" as const,
                  props: { gap: "space.2" },
                  children: [
                    {
                      type: "Text" as const,
                      props: { text: "告知内容" },
                      textRole: "heading.3",
                    },
                    {
                      type: "Text" as const,
                      props: {
                        text:
                          page.fieldLabels?.["noticeBlocks"] ?? "noticeBlocks",
                      },
                      textRole: "label.sm",
                    },
                  ],
                },
                ...noticeCards,
              ]
            : []),
        ],
        fields: [
          ...visibleFields.map((field) =>
            fieldFormNode(
              field,
              true,
              page.mockData?.values?.[field],
              page.fieldLabels?.[field]
            )
          ),
          ...(secondaryActions.length === 0
            ? []
            : [
                {
                  type: "Row" as const,
                  props: { gap: "space.2", variant: "filter" },
                  children: secondaryActions,
                },
              ]),
          ...(page.emptyTitle === undefined
            ? []
            : [emptyStateNode(page, page.emptyTitle)]),
        ],
        actions,
      },
    };
  }

  return {
    type: "PageShell",
    props: { title: page.name, nav },
    reqRef: page.reqRefs[0] as ReqId | undefined,
    slots: {
      summary: [
        {
          type: "Card",
            props: { title: summaryTitle },
            children: [
              {
                type: "List",
                props: { items: summaryItems ?? 4 },
              },
              ...(statusBadge === undefined ? [] : [statusBadge]),
            ],
          },
          ...(hasNoticeBlocks
            ? [
                {
                  type: "Row" as const,
                  props: { gap: "space.2" },
                  children: [
                    {
                      type: "Text" as const,
                      props: { text: "告知内容" },
                      textRole: "heading.3",
                    },
                    {
                      type: "Text" as const,
                      props: {
                        text:
                          page.fieldLabels?.["noticeBlocks"] ?? "noticeBlocks",
                      },
                      textRole: "label.sm",
                    },
                  ],
                },
                ...noticeCards,
              ]
            : []),
        ],
        fields: [
          {
            type: "Section",
            props: { padding: "space.6", gap: "space.3" },
            children: [
              ...visibleFields.map((field) =>
              fieldFormNode(
                field,
                true,
                page.mockData?.values?.[field],
                page.fieldLabels?.[field]
              )
            ),
            ...(secondaryActions.length === 0
              ? []
              : [
                  {
                    type: "Row" as const,
                    props: { gap: "space.2" },
                    children: secondaryActions,
                  },
                ]),
            ...(page.emptyTitle === undefined
              ? []
              : [emptyStateNode(page, page.emptyTitle)]),
          ],
        },
      ],
      actions,
    },
  };
}

function buildInteractions(page: UiBriefPage): PageSpec["interactions"] {
  const reqRef = page.reqRefs[0] as ReqId | undefined;
  return (page.actions ?? []).map((action) => ({
    trigger: action,
    action: "navigate",
    reqRef,
  }));
}
