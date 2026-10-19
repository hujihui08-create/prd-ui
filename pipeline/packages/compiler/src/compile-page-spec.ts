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

const nav = ["概览", "订单", "客户", "设置"];
const tabs = ["推荐", "关注", "附近", "我的"];

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

  const layout = buildLayout(page, archetype);
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

function buildLayout(page: UiBriefPage, archetype: ArchetypeDef): SpecNode {
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
                  children: [
                    { type: "Stat", props: { label: "今日订单", value: "128" } },
                    { type: "Stat", props: { label: "待处理", value: "12" } },
                    { type: "Stat", props: { label: "已完成", value: "96" } },
                    { type: "Stat", props: { label: "异常", value: "3" } },
                  ],
                },
                {
                  type: "Card",
                  props: { title: "近期订单" },
                  children: [{ type: "List", props: { items: 5 } }],
                },
              ],
            },
          ],
        },
      };
    case "list":
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
                  props: { fields: ["status", "date", "keyword"], action: "新建订单" },
                },
                {
                  type: "DataTable",
                  props: {
                    columns: page.fields ?? ["orderNo", "customer", "amount", "status", "createdAt"],
                    pageSize: 20,
                  },
                },
                { type: "Pagination", props: { pageSize: 20 } },
                {
                  type: "EmptyState",
                  props: { title: "暂无订单", description: "调整筛选条件后重试" },
                  assetRef: "empty-orders",
                },
              ],
            },
          ],
        },
      };
    case "detail":
      return detailLayout(page);
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
              children: (page.fields ?? ["orderNo", "customer", "amount"]).map((field) => ({
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
              children: [
                btn(page.actions?.[0] ?? "保存"),
                btn(page.actions?.[1] ?? "取消", "secondary"),
              ],
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
                  children: (page.fields ?? ["notifications", "language", "timezone"]).map(
                    (field) => {
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
                    }
                  ),
                },
              ],
            },
          ],
          actions: [btn(page.actions?.[0] ?? "保存设置")],
        },
      };
    case "feed":
      return {
        type: "MobileShell",
        props: { title: page.name, tabs },
        reqRef: page.reqRefs[0] as ReqId | undefined,
        slots: {
          feed: [
            {
              type: "FeedCard",
              props: { title: "周末去哪儿", body: "城市周边 5 个小众目的地" },
            },
            { type: "FeedCard", props: { title: "新店开业", body: "手冲咖啡买一送一" } },
            { type: "EmptyState", props: { title: "暂无内容" }, assetRef: "empty-feed" },
          ],
          "bottom-nav": [{ type: "BottomNav", props: { items: tabs } }],
        },
      };
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
          actions: [btn(page.actions?.[0] ?? "登录")],
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
          body: [text("用三步完成设置", "body.md")],
          actions: [btn(page.actions?.[0] ?? "开始"), btn(page.actions?.[1] ?? "稍后", "secondary")],
        },
      };
    default:
      throw new Error(`Unsupported archetype: ${archetype.id}`);
  }
}

function detailLayout(page: UiBriefPage): SpecNode {
  const fields = page.fields ?? [];

  if (page.target === "mobile") {
    return {
      type: "MobileShell",
      props: { title: page.name, tabs },
      reqRef: page.reqRefs[0] as ReqId | undefined,
      slots: {
        summary: [
          {
            type: "Card",
            props: { title: "商品摘要" },
            children: [
              { type: "List", props: { items: Math.max(fields.length, 3) } },
              { type: "Badge", props: { label: "在售", tone: "success" } },
            ],
          },
        ],
        fields: fields.map((field) => fieldFormNode(field)),
        actions: [btn(page.actions?.[0] ?? "立即购买")],
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
          props: { title: "订单摘要" },
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
      actions: [btn(page.actions?.[0] ?? "编辑订单")],
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
