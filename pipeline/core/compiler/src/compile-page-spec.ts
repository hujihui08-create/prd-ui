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

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function isoAddDays(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const base = new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1);
  base.setDate(base.getDate() + days);
  return `${base.getFullYear()}-${pad2(base.getMonth() + 1)}-${pad2(base.getDate())}`;
}

function mondayOf(date: string): string {
  const base = new Date(`${date}T00:00:00`);
  const offset = (base.getDay() + 6) % 7;
  base.setDate(base.getDate() - offset);
  return `${base.getFullYear()}-${pad2(base.getMonth() + 1)}-${pad2(base.getDate())}`;
}

/** Business status tone shared by list rows, calendar blocks, and badges. */
function statusTone(status: string): string {
  if (/已到店|已完成|已确认|成功|在售/.test(status)) return "success";
  if (/已登记|待确认|未确认|待到店|待处理|进行|加载/.test(status)) return "warning";
  if (/爽约|已取消|失败|异常|缺货/.test(status)) return "danger";
  return "neutral";
}

const WEEKDAY_LABELS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const WEEKDAY_DIGITS = "一二三四五六日";

/** Map a `周X` token (for example `11-05 周三`) to a 0-6 column index. */
function weekdayColumn(value: string | undefined): number | undefined {
  const match = /周([一二三四五六日])/.exec(value ?? "");
  if (match === null) return undefined;
  const index = WEEKDAY_DIGITS.indexOf(match[1]!);
  return index === -1 ? undefined : index;
}

/**
 * Resolve a `MM-DD 周X` label to a concrete ISO date. The brief year may not
 * match the weekday (for example 2026-11-05 is Thursday, not 周三), so pick
 * the nearest year where the date actually falls on the stated weekday.
 */
function resolveDatedWeekday(
  value: string | undefined,
  baseYear: number
): string | undefined {
  const match = /^(\d{1,2})-(\d{1,2})\s*周([一二三四五六日])/.exec(
    value ?? ""
  );
  if (match === null) return undefined;
  const month = Number(match[1]);
  const day = Number(match[2]);
  const weekday = WEEKDAY_DIGITS.indexOf(match[3]!);
  if (weekday === -1) return undefined;
  for (const delta of [0, -1, 1, -2, 2]) {
    const year = baseYear + delta;
    const date = new Date(year, month - 1, day);
    if (
      date.getFullYear() === year &&
      date.getMonth() === month - 1 &&
      date.getDate() === day &&
      (date.getDay() + 6) % 7 === weekday
    ) {
      return `${year}-${pad2(month)}-${pad2(day)}`;
    }
  }
  return `${baseYear}-${pad2(month)}-${pad2(day)}`;
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
  const listPages = brief.ia.pages.filter(
    (entry) => entry.archetype === "mobile-list" && entry.id !== "customer-search"
  );
  const listPage =
    listPages.find((entry) => entry.id.includes(moduleKey)) ??
    (page.id === "today"
      ? listPages.find((entry) => entry.id.includes("appointment"))
      : undefined) ??
    listPages[0];
  return {
    ...(formRoute === undefined ? {} : { create: formRoute, form: formRoute }),
    ...(detailRoute === undefined ? {} : { detail: detailRoute }),
    ...(customerPage === undefined ? {} : { customer: customerPage.route }),
    ...(noticePage === undefined ? {} : { notice: noticePage.route }),
    ...(listPage === undefined ? {} : { list: listPage.route }),
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
    // Walk the actions slot first so canonical `<page>.action.<key>` ids land on
    // the primary CTA rather than a repeated ghost in fields/content; slot order
    // is otherwise preserved for deterministic assignment.
    const slotEntries = Object.entries(node.slots ?? {});
    const orderedSlotEntries = [
      ...slotEntries.filter(([slotName]) => slotName === "actions"),
      ...slotEntries.filter(([slotName]) => slotName !== "actions"),
    ];
    for (const [slotName, children] of orderedSlotEntries) {
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
  const customerSearch = brief.ia.pages.find((entry) => entry.id === "customer-search");
  const firstForm = brief.ia.pages.find((entry) => entry.archetype === "mobile-form");
  const pickerReturnTo =
    page.pickerReturnTo ?? (page.id === customerSearch?.id ? firstForm?.id : undefined);
  const customerPicker =
    page.customerPicker ??
    (page.archetype === "mobile-form" && (page.fields ?? []).includes("customer")
      ? customerSearch?.id
      : undefined);

  const resolvedRowDate = resolveDatedWeekday(
    page.mockData?.rows?.[0]?.date,
    Number(brief.meta.date.slice(0, 4))
  );
  const calendarWeekStart =
    page.calendarWeekStart ??
    (page.archetype === "mobile-list" &&
    ((page.fields ?? []).includes("date") || (page.fields ?? []).includes("time"))
      ? mondayOf(resolvedRowDate ?? brief.meta.date)
      : undefined);
  const currentStatus = page.mockData?.values?.status;
  const layout = buildLayout(brief, page, archetype, {
    views,
    searchIdleTitle,
    ...(calendarWeekStart === undefined ? {} : { calendarWeekStart }),
    ...(resolvedRowDate === undefined ? {} : { selectedDate: resolvedRowDate }),
  });
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
    ...(page.emptyTitle === undefined ? {} : { emptyTitle: page.emptyTitle }),
    ...(page.noticeBlocks === undefined
      ? {}
      : { noticeBlocks: page.noticeBlocks }),
    ...(pickerReturnTo === undefined ? {} : { pickerReturnTo }),
    ...(customerPicker === undefined ? {} : { customerPicker }),
    ...(calendarWeekStart === undefined ? {} : { calendarWeekStart }),
    ...(currentStatus === undefined ? {} : { currentStatus }),
    ...(page.mockData?.values?.orderNo !== undefined
      ? { referenceId: page.mockData.values.orderNo }
      : page.mockData?.values?.appointmentId !== undefined
        ? { referenceId: page.mockData.values.appointmentId }
        : {}),
    linkedRoutes: linkedRoutesFor(brief, page),
  };
}

function buildLayout(
  brief: UiBrief,
  page: UiBriefPage,
  archetype: ArchetypeDef,
  interaction: {
    views?: InteractionView[];
    searchIdleTitle?: string;
    calendarWeekStart?: string;
    selectedDate?: string;
  }
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
      const listRoute = linkedRoutesFor(brief, page).list;
      // The page itself always owns a tab; the brief's tabs append to it so a
      // single-tab brief cannot render an empty TabBar.
      const homeTabs = [...new Set([page.id, ...(brief.ia.navigation.tabs ?? nav)])];
      const activeTab = page.id;

      return {
        type: "MobileShell",
        props: {
          title: page.name,
          tabs: homeTabs,
          showTabs: homeTabs.length > 1,
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
                  props: {
                    title: "我的预约",
                    ...(listRoute === undefined
                      ? {}
                      : { actionLabel: "查看全部", actionRoute: listRoute }),
                  },
                  children: [
                    ...appointments.map((appointment) => ({
                      type: "ListRow",
                      props: {
                        title: appointment.customer,
                        subtitle: appointment.item,
                        meta: appointment.time,
                        status: appointment.status,
                        statusTone: statusTone(appointment.status ?? ""),
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
            { type: "TabBar", props: { items: homeTabs, active: activeTab } },
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
      const filterFields = page.filterFields ?? ["status"];
      const searchField = filterFields.find(
        (field) => field === "keyword" || field === "search"
      );
      const listFilters = filterFields.filter((field) => field !== searchField);
      const activeDateLabel = rows[0]?.date ?? "全部";
      const rowDateLabels = [...new Set(rows.map((row) => row.date).filter(Boolean))];
      const filters = listFilters.map((field) => ({
        type: "CollapsedFilter" as const,
        props: {
          label: labelFor(field),
          value: field === "date" ? activeDateLabel : "全部",
          options:
            field === "status"
              ? ["全部", "已登记", "已到店", "爽约", "已取消"]
              : ["全部", ...(rowDateLabels.length > 0 ? rowDateLabels : ["今天", "本周"])],
        },
      }));
      const actions = page.actions ?? [];
      const primary = primaryAction(actions, "新增");
      const secondaryActions = actions.filter(
        (label) =>
          label !== primary &&
          label !== "查看完整详情" &&
          !(searchField !== undefined && label === "查看详情")
      );
      const textOf = (row: Record<string, string>, key: string): string | undefined =>
        row[key] ?? undefined;
      const parseTime = (value: string | undefined): { start: number; duration: number } => {
        const match = /(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})/.exec(value ?? "");
        if (match === null) return { start: 9, duration: 1 };
        const startMinutes = Number(match[1]) * 60 + Number(match[2]);
        const endMinutes = Number(match[3]) * 60 + Number(match[4]);
        return {
          start: Math.min(20 * 60, Math.max(9 * 60, startMinutes)) / 60,
          duration: Math.max(
            0.5,
            Math.min(3, (endMinutes - startMinutes) / 60 || 1)
          ),
        };
      };
      const weekStart = interaction.calendarWeekStart ?? mondayOf(brief.meta.date);
      const weekEnd = isoAddDays(weekStart, 6);
      const selectedDate =
        interaction.selectedDate ??
        (brief.meta.date >= weekStart && brief.meta.date <= weekEnd
          ? brief.meta.date
          : undefined);
      const calendarDays = WEEKDAY_LABELS.map((label, index) => {
        const date = isoAddDays(weekStart, index);
        return {
          label,
          date,
          today: date === brief.meta.date,
          selected: date === selectedDate,
        };
      });
      const calendarHours = Array.from(
        { length: 12 },
        (_, index) => `${String(9 + index).padStart(2, "0")}:00`
      );
      const showCalendar =
        fields.includes("time") && rows.some((row) => row.time !== undefined);
      const calendarBlocks = rows.map((row, index) => {
        const { start, duration } = parseTime(textOf(row, "time"));
        const status = textOf(row, "status") ?? "";
        return {
          day: weekdayColumn(textOf(row, "date")) ?? index % 7,
          start,
          duration,
          title: textOf(row, "customer") ?? textOf(row, "title") ?? "—",
          subtitle: textOf(row, "project") ?? "",
          status,
          tone: statusTone(status),
        };
      });
      const legend = ["已登记", "已到店", "爽约", "已取消"].map((label) => ({
        type: "Badge" as const,
        props: { label, tone: statusTone(label) },
      }));
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
        const appointmentList = page.id === "appointment-list";
        const projectValue = textOf(row, "project") ?? textOf(row, "subtitle");
        const subtitleParts: string[] = [];
        if (projectValue !== undefined) {
          // Appointment rows keep one project · therapist line; the time lives
          // in the right meta column. Delegation/store stay out of the row to
          // avoid clipping on a 390px viewport.
          subtitleParts.push(projectValue);
          if (fields.includes("therapist")) {
            subtitleParts.push(textOf(row, "therapist") ?? "待分配");
          }
          if (!appointmentList && fields.includes("store") && row.store !== undefined) {
            subtitleParts.push(row.store);
          }
        } else {
          if (fields.includes("phone") && row.phone !== undefined) {
            subtitleParts.push(row.phone);
          }
          if (fields.includes("store") && row.store !== undefined) {
            subtitleParts.push(row.store);
          }
        }
        if (!appointmentList && fields.includes("delegation")) {
          subtitleParts.push(textOf(row, "delegation") ?? "—");
        }
        const metaValue = textOf(row, "time") ?? textOf(row, "createdAt");
        return {
          title: titleValue,
          subtitle: subtitleParts.join(" · "),
          searchText: Object.values(row).join(" "),
          ...(metaValue === undefined || !fields.includes("time")
            ? {}
            : { meta: metaValue }),
          ...(row.status === undefined
            ? {}
            : { status: row.status, statusTone: statusTone(row.status) }),
          ...(fields.includes("therapist") && projectValue === undefined
            ? { trailing: textOf(row, "therapist") ?? "待分配" }
            : {}),
        };
      };
      const inlineEmpty = (): SpecNode => {
        const node = emptyStateNode(
          page,
          page.emptyTitle ?? `暂无${page.name}`,
          activeDateLabel === undefined
            ? "调整筛选条件后重试"
            : `${activeDateLabel} · 调整筛选条件后重试`,
          searchField === undefined ? undefined : "empty"
        );
        node.children =
          searchField === undefined
            ? [btn("清空筛选", "secondary")]
            : [btn("清空关键词", "secondary")];
        if (searchField === undefined) {
          node.props = { ...node.props, variant: "inline" };
        }
        return node;
      };
      const emptyNode = inlineEmpty();
      // Group the list view by the row date so the list keeps the same date
      // anchor as the calendar; a date-less row stays ungrouped.
      const listNodes: SpecNode[] = (() => {
        const groups = new Map<string, Array<Record<string, string>>>();
        for (const row of rows) {
          const key = row.date ?? "";
          const group = groups.get(key) ?? [];
          group.push(row);
          groups.set(key, group);
        }
        return [...groups.entries()].flatMap(([date, group]) => [
          ...(date === "" ? [] : [text(date, "label.strong")]),
          ...group.map((row) => ({
            type: "ListRow" as const,
            props: rowProps(row),
          })),
        ]);
      })();
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
                        props: {
                          placeholder:
                            searchField === "keyword" || searchField === "search"
                              ? "搜索客户"
                              : `搜索${labelFor(searchField)}`,
                        },
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
                          {
                            type: "Row" as const,
                            props: { gap: "space.2" },
                            children: [
                              text("日历", "heading.3"),
                              ...(rows[0]?.date === undefined
                                ? []
                                : [text(activeDateLabel, "label.strong")]),
                            ],
                          },
                          {
                            type: "Row" as const,
                            props: { gap: "space.1", variant: "legend" },
                            children: legend,
                          },
                          ...(searchField === undefined ? [inlineEmpty()] : []),
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
                        ],
                      },
                    ]
                  : []),
                ...(interaction.views === undefined
                  ? listNodes
                  : [
                      {
                        type: "Section" as const,
                        props: {
                          padding: "space.1",
                          gap: "space.2",
                          viewPanel: "list",
                        },
                        children: [
                          ...listNodes,
                          ...(searchField === undefined ? [inlineEmpty()] : []),
                          ...(searchField === undefined
                            ? [
                                {
                                  type: "Skeleton" as const,
                                  props: { variant: "list" },
                                },
                              ]
                            : []),
                        ],
                      },
                    ]),
                ...(interaction.views === undefined ? [emptyNode] : []),
              ],
            },
          ],
          ...(interaction.searchIdleTitle === undefined
            ? { actions: [btn(primary, "primary")] }
            : {}),
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
      const hasCustomerField = fields.includes("customer");
      const otherActions = actions.filter(
        (label) =>
          label !== primary &&
          !alternateActions.includes(label) &&
          !(hasCustomerField && label === "选择客户")
      );
      const optionsFor = (field: string): string[] | undefined => {
        if (field === "source") return ["到店", "电话", "微信", "企微"];
        if (field === "status") return ["已登记", "已到店", "爽约", "已取消"];
        if (field === "result") return ["已联系", "未接", "拒绝", "稍后再联系"];
        return undefined;
      };
      const inputTypeFor = (field: string): string | undefined =>
        field === "startTime" || field === "endTime" ? "datetime-local" : undefined;
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
                const inputType = inputTypeFor(field);
                const placeholder =
                  inputType === "datetime-local" ? `请选择${label}` : `请输入${label}`;
                const input = {
                  type: "Input" as const,
                  props: {
                    name: field,
                    placeholder,
                    required: true,
                    ...(inputType === undefined ? {} : { inputType }),
                  },
                };
                return {
                  type: "FormField",
                  props: { label, required: true, field },
                  children: [
                    hasCustomerField && field === "customer"
                      ? {
                          type: "Row" as const,
                          props: { gap: "space.2" },
                          children: [
                            input,
                            {
                              type: "Button" as const,
                              props: {
                                label: "选择",
                                emphasis: "ghost",
                                action: "选择客户",
                              },
                            },
                          ],
                        }
                      : options === undefined
                        ? input
                        : {
                            type: "Select" as const,
                            props: { options, placeholder: `请选择${label}` },
                          },
                  ],
                };
              }),
            },
            ...(page.formModes === undefined
              ? alternateActions.map((label) => ({
                  type: "Row" as const,
                  props: { gap: "space.2" },
                  children: [
                    { type: "Text" as const, props: { text: "另一模式" }, textRole: "label.sm" },
                    { type: "Text" as const, props: { text: label }, textRole: "label.strong" },
                  ],
                }))
              : []),
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
  const values = page.mockData?.values;
  const serviceCompletedValue = values?.serviceCompleted;
  const serviceCompleted =
    serviceCompletedValue === undefined ||
    !/^(否|false|no|未完成)$/i.test(String(serviceCompletedValue).trim());
  const checkinPrimary = primaryLabels.some((label) => /到店确认|确认到店/.test(label));
  const secondaryLabels = actionLabels
    .filter((label) => !primaryLabels.includes(label))
    // The footer already owns the check-in CTA; a second ghost CTA is ambiguous.
    .filter((label) => !(checkinPrimary && /到店确认|确认到店/.test(label)))
    // The notice action is only valid after the service is completed.
    .filter((label) => label !== "术后告知" || serviceCompleted);
  const actions = primaryLabels.map((label, index) =>
    btn(label, index === 0 ? "primary" : "secondary")
  );
  const orderedSecondaryLabels = [
    ...secondaryLabels.filter((label) => label !== "取消"),
    ...secondaryLabels.filter((label) => label === "取消"),
  ];
  const secondaryActions = orderedSecondaryLabels.map((label) =>
    btn(label, label === "取消" ? "danger" : "ghost")
  );
  const noticeBlocks = page.noticeBlocks ?? [];
  const hasNoticeBlocks = noticeBlocks.length > 0;
  const visibleFields = fields.filter(
    (field) =>
      !(hasNoticeBlocks && (field === "notices" || field === "noticeBlocks"))
  );
  const status = values?.status;
  const valueEntries =
    values === undefined
      ? undefined
      : Object.entries(values).filter(
          ([key]) =>
            !(hasNoticeBlocks && (key === "notices" || key === "noticeBlocks"))
        );
  // The status badge owns the state; drop the duplicate body row when other
  // rows remain. Pages with a lone status value keep it so the summary card is
  // not empty.
  const entriesWithoutStatus = valueEntries?.filter(([key]) => key !== "status");
  const summaryEntries =
    entriesWithoutStatus !== undefined && entriesWithoutStatus.length > 0
      ? entriesWithoutStatus
      : valueEntries;
  const summaryItems =
    summaryEntries === undefined
      ? page.mockData?.listItems
      : summaryEntries.length > 0
        ? summaryEntries.map(([key, value]) => ({
            label: page.fieldLabels?.[key] ?? key,
            value,
          }))
        : undefined;
  // A field rendered in the summary List must not also become a read-only
  // FormField; fields without a summary value keep the FormField so every
  // brief field still has exactly one visible representation.
  const missingFields = visibleFields.filter((field) => values?.[field] === undefined);
  const noticeCards = noticeBlocks.map((block) => ({
    type: "Card" as const,
    props: { title: block.title },
    children: [
      { type: "List" as const, props: { items: block.items } },
    ],
  }));
  const summaryCard: SpecNode = {
    type: "Card",
    props: {
      title: summaryTitle,
      ...(status === undefined ? {} : { badge: status, badgeTone: statusTone(status) }),
    },
    children: [
      {
        type: "List",
        props: {
          items: summaryItems ?? Math.max(visibleFields.length, 3),
        },
      },
    ],
  };
  const noticeSection: SpecNode[] = hasNoticeBlocks
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
          ],
        },
        ...noticeCards,
      ]
    : [];

  if (page.target === "mobile") {
    const fieldNodes: SpecNode[] = [
      ...missingFields.map((field) =>
        fieldFormNode(field, true, values?.[field], page.fieldLabels?.[field])
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
    ];
    // The `fields` slot is required by the detail archetype and must stay
    // non-empty even when every field lives in the summary card. A layout
    // primitive keeps every catalog's slot allow-list satisfied.
    if (fieldNodes.length === 0) {
      fieldNodes.push({ type: "Row", props: { gap: "space.1" } });
    }
    return {
      type: "MobileShell",
      props: { title: page.name, tabs, back: true },
      reqRef: page.reqRefs[0] as ReqId | undefined,
      slots: {
        summary: [summaryCard, ...noticeSection],
        fields: fieldNodes,
        actions,
      },
    };
  }

  return {
    type: "PageShell",
    props: { title: page.name, nav },
    reqRef: page.reqRefs[0] as ReqId | undefined,
    slots: {
      summary: [summaryCard, ...noticeSection],
      fields: [
        {
          type: "Section",
          props: { padding: "space.6", gap: "space.3" },
          children: [
            ...missingFields.map((field) =>
              fieldFormNode(field, true, values?.[field], page.fieldLabels?.[field])
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
