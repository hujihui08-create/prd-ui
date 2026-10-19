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

function fieldFormNode(field: string, readOnly = true): SpecNode {
  return { type: "FormField", props: { label: field, readOnly } };
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
                  children: [{ type: "List", props: { items: 5 } }],
                },
              ],
            },
          ],
        },
      };
    case "list": {
      const columns = page.fields ?? ["名称", "状态"];
      const filterFields = page.filterFields ?? page.fields ?? [];
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
                  props: { fields: filterFields, action: actions[0] ?? "新建" },
                },
                {
                  type: "DataTable",
                  props: { columns, pageSize: 20 },
                },
                { type: "Pagination", props: { pageSize: 20 } },
                ...(extraActions.length > 0
                  ? [
                      {
                        type: "Row",
                        props: { gap: "space.2" },
                        children: extraActions.map((action) => btn(action, "secondary")),
                      },
                    ]
                  : []),
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
              children: (page.fields ?? []).map((field) => ({
                type: "FormField",
                props: { label: field, required: true },
                children: [
                  { type: "Input", props: { name: field, placeholder: `请输入${field}` } },
                ],
              })),
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
                      props: { label: meta?.label ?? field },
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
              props: { label: meta?.label ?? field },
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
              { type: "List", props: { items: Math.max(fields.length, 3) } },
              { type: "Badge", props: { label: "在售", tone: "success" } },
            ],
          },
        ],
        fields: fields.map((field) => fieldFormNode(field)),
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
          children: [{ type: "List", props: { items: 4 } }],
        },
      ],
      fields: [
        {
          type: "Section",
          props: { padding: "space.6", gap: "space.3" },
          children: fields.map((field) => fieldFormNode(field)),
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
