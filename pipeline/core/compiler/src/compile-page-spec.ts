import type {
  Catalog,
  PageSpec,
  Profile,
  ReqId,
  SpecNode,
  UiBrief,
  UiBriefPage,
} from "@prd-ui/contracts";
import type { ArchetypeDef } from "@prd-ui/design-system";

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

function btn(label: string, emphasis = "primary"): SpecNode {
  return { type: "Button", props: { label, emphasis } };
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
function emptyStateNode(page: UiBriefPage, title: string, description?: string): SpecNode {
  const node: SpecNode = {
    type: "EmptyState",
    props: description === undefined ? { title } : { title, description },
  };
  if (page.emptyAssetRef !== undefined) node.assetRef = page.emptyAssetRef;
  return node;
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

  const layout = buildLayout(brief, page, archetype);
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
  };
}

function buildLayout(brief: UiBrief, page: UiBriefPage, archetype: ArchetypeDef): SpecNode {
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
                        label: meta?.label ?? page.fieldLabels?.[field] ?? field,
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
                          icon: action.icon,
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
  const actions = actionButtons(page, ["编辑"]);
  const summaryItems =
    page.mockData?.values === undefined
      ? page.mockData?.listItems
      : Object.entries(page.mockData.values).map(
          ([key, value]) => `${page.fieldLabels?.[key] ?? key}: ${value}`
        );
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
                  items: summaryItems ?? Math.max(fields.length, 3),
                },
              },
              ...(statusBadge === undefined ? [] : [statusBadge]),
            ],
          },
        ],
        fields: fields.map((field) =>
          fieldFormNode(
            field,
            true,
            page.mockData?.values?.[field],
            page.fieldLabels?.[field]
          )
        ),
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
      ],
      fields: [
        {
          type: "Section",
          props: { padding: "space.6", gap: "space.3" },
          children: fields.map((field) =>
            fieldFormNode(
              field,
              true,
              page.mockData?.values?.[field],
              page.fieldLabels?.[field]
            )
          ),
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
