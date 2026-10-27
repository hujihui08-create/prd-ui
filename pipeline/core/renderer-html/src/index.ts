import {
  derivedNodeId,
  type PageSpec,
  type Profile,
  type SpecNode,
} from "@prd-ui/contracts";
import {
  createMotionContext,
  motionAttrs,
  renderMotionCss,
  type MotionContext,
} from "./motion.js";

export { createMotionContext, motionAttrs, renderMotionCss };
export type { MotionContext } from "./motion.js";

export interface RenderOptions {
  /** page id -> display name, used for navigation labels. */
  pageNames?: Record<string, string>;
  /** page id -> route, used to resolve linked routes to static HTML files. */
  pageRoutes?: Record<string, string>;
  /** page id -> archetype, used to validate runtime picker return targets. */
  pageArchetypes?: Record<string, string>;
}

let renderPageNames: Record<string, string> = {};
let renderPageRoutes: Record<string, string> = {};
let renderPageArchetypes: Record<string, string> = {};
let renderMotionContext: MotionContext | undefined;
let renderSpec: PageSpec | undefined;
let renderProject = "PRD UI";
let renderPageId = "";

/** Append motion custom properties to an existing inline style declaration list. */
function inlineStyle(base: string, motionStyle: string): string {
  const declarations = [base, motionStyle].filter((part) => part.length > 0);
  return declarations.length === 0 ? "" : ` style="${declarations.join(";")}"`;
}

function routeHref(route: string | undefined): string | undefined {
  if (route === undefined) return undefined;
  const match = Object.entries(renderPageRoutes).find(([, value]) => value === route);
  return match === undefined ? undefined : `${match[0]}.html`;
}

function shellInteractionAttrs(): string {
  if (renderSpec === undefined) return "";
  const spec = renderSpec;
  const attrs = [
    `data-page-archetype="${esc(spec.meta.archetype)}"`,
    `data-page-id="${esc(spec.meta.pageId)}"`,
  ];
  if (spec.currentStatus !== undefined) {
    attrs.push(`data-current-status="${esc(spec.currentStatus)}"`);
  }
  if (spec.businessStates !== undefined) {
    attrs.push(`data-business-states="${esc(JSON.stringify(spec.businessStates))}"`);
  }
  if (spec.formModes !== undefined) {
    attrs.push(`data-form-modes="${esc(JSON.stringify(spec.formModes))}"`);
  }
  if (spec.views !== undefined) {
    attrs.push(`data-views="${esc(JSON.stringify(spec.views))}"`);
    attrs.push(`data-default-view="${esc(spec.defaultView ?? spec.views[0] ?? "")}"`);
  }
  if (spec.customerPicker !== undefined) {
    attrs.push(`data-picker-search="${esc(spec.customerPicker)}"`);
  }
  if (spec.pickerReturnTo !== undefined) {
    attrs.push(`data-picker-return="${esc(spec.pickerReturnTo)}"`);
  }
  if (spec.calendarWeekStart !== undefined) {
    attrs.push(`data-calendar-week-start="${esc(spec.calendarWeekStart)}"`);
  }
  return attrs.join(" ");
}

function pageLabel(id: string): string {
  return (
    renderPageNames[id] ??
    id.replace(/[-_]/g, " ").replace(/\b[a-z]/g, (char) => char.toUpperCase())
  );
}

function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function bool(value: unknown): boolean {
  return value === true;
}

/**
 * Curated read-only notes use the `只读说明「…」` form; only that captured text
 * is shown to users. Other PRD/internal notes are intentionally hidden.
 */
export function readOnlyNote(note: string | undefined): string | undefined {
  const match = /只读说明「(.+?)」/.exec(note ?? "");
  return match?.[1];
}

export const PICKER_STORAGE_PREFIX = "prd-ui:picker:";
export const FORM_ORIGIN_PREFIX = "prd-ui:form:origin:";

export function formDraftKey(pageId: string): string {
  return PICKER_STORAGE_PREFIX + pageId;
}

export function pickerReturnKey(): string {
  return PICKER_STORAGE_PREFIX + "return";
}

export function formOriginKey(pageId: string): string {
  return FORM_ORIGIN_PREFIX + pageId;
}

/**
 * The page that opened a mobile form. A picker page is never an origin, and a
 * cross-origin referrer is ignored. Direct opens fall back to the index.
 */
export function formOrigin(
  referrer: string | undefined,
  currentHref: string,
  fallback = "index.html"
): string {
  if (referrer === undefined || referrer.length === 0) return fallback;
  if (referrer.includes("mode=picker")) return fallback;
  try {
    const referrerUrl = new URL(referrer, currentHref);
    const currentUrl = new URL(currentHref);
    return referrerUrl.origin === currentUrl.origin ? referrer : fallback;
  } catch {
    return fallback;
  }
}

/** Every pending picker key (draft and return) under the prefix. */
export function pickerStorageKeys(keys: string[]): string[] {
  return keys.filter((key) => key.startsWith(PICKER_STORAGE_PREFIX));
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function cssVar(token: string): string {
  return `var(--${token.replace(/\./g, "-")})`;
}

function typoClass(role: string | undefined): string {
  return `typo-${(role ?? "body.md").replace(/\./g, "-")}`;
}

const iconMap: Record<string, string> = {
  receipt: "receipt_long",
  calendar: "calendar_month",
  bell: "notifications",
  search: "search",
  "chevron-down": "expand_more",
  home: "home",
  customer: "person",
  workbench: "grid_view",
  profile: "settings",
  inventory: "inventory_2",
  settings: "settings",
  user: "person",
  alert: "warning",
  error: "error",
  success: "check_circle",
  "icon-home": "home",
  "icon-package": "inventory_2",
  "icon-search": "search",
  "icon-plus": "add",
  "icon-minus": "remove",
  "icon-chevron-left": "arrow_back_ios_new",
  "icon-chevron-right": "arrow_forward_ios",
  "icon-circle-alert": "warning",
  "icon-refresh-cw": "refresh",
  "icon-user": "person",
  "orders-overview": "dashboard",
  "orders-list": "format_list_bulleted",
  "order-detail": "receipt_long",
  "order-form": "add_box",
  "home-feed": "home",
  "item-detail": "shopping_bag",
  auth: "login",
};

function iconName(name: string): string {
  return iconMap[name] ?? name;
}

function illustrationSvg(name: string): string {
  if (name === "quick-actions") {
    return `<svg class="card-illustration" viewBox="0 0 80 56" fill="none" aria-hidden="true">
  <ellipse cx="40" cy="28" rx="36" ry="25" fill="var(--color-action-secondary)"/>
  <rect x="16" y="12" width="27" height="32" rx="4" fill="var(--color-surface-default)" stroke="var(--color-border-subtle)" stroke-width="1.5"/>
  <rect x="21" y="17" width="17" height="4" rx="2" fill="var(--color-action-primary)"/>
  <rect x="21" y="25" width="13" height="2" rx="1" fill="var(--color-border-strong)"/>
  <rect x="21" y="30" width="17" height="2" rx="1" fill="var(--color-border-subtle)"/>
  <circle cx="51" cy="35" r="8" fill="var(--color-status-success)"/>
  <path d="M47.5 35l2.4 2.4 4.6-4.8" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <rect x="48" y="11" width="18" height="16" rx="3" fill="var(--color-accent-customer)"/>
  <rect x="52" y="16" width="10" height="2" rx="1" fill="white" opacity=".9"/>
  <circle cx="53" cy="22" r="1.4" fill="white"/>
  <circle cx="57" cy="22" r="1.4" fill="white" opacity=".7"/>
  <path d="M10 46h60" stroke="var(--color-border-strong)" stroke-width="2" stroke-linecap="round"/>
</svg>`;
  }
  if (name === "appointments") {
    return `<svg class="card-illustration" viewBox="0 0 80 56" fill="none" aria-hidden="true">
  <ellipse cx="40" cy="28" rx="36" ry="25" fill="var(--color-action-secondary)"/>
  <rect x="16" y="13" width="48" height="34" rx="6" fill="var(--color-surface-default)" stroke="var(--color-border-subtle)" stroke-width="1.5"/>
  <path d="M16 21a6 6 0 016-6h36a6 6 0 016 6v4H16z" fill="var(--color-action-primary)"/>
  <rect x="24" y="8" width="3" height="8" rx="1.5" fill="var(--color-text-primary)"/>
  <rect x="53" y="8" width="3" height="8" rx="1.5" fill="var(--color-text-primary)"/>
  <circle cx="26" cy="32" r="2" fill="var(--color-accent-customer)"/>
  <circle cx="35" cy="32" r="2" fill="var(--color-border-strong)"/>
  <circle cx="44" cy="32" r="2" fill="var(--color-border-strong)"/>
  <circle cx="26" cy="39" r="2" fill="var(--color-border-strong)"/>
  <circle cx="35" cy="39" r="2" fill="var(--color-accent-inventory)"/>
  <circle cx="55" cy="42" r="8" fill="var(--color-status-success)"/>
  <path d="M51.5 42l2.4 2.4 4.6-4.8" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
  }
  if (name === "callbacks") {
    return `<svg class="card-illustration" viewBox="0 0 80 56" fill="none" aria-hidden="true">
  <ellipse cx="40" cy="28" rx="36" ry="25" fill="var(--color-action-secondary)"/>
  <rect x="23" y="8" width="24" height="38" rx="6" fill="var(--color-surface-default)" stroke="var(--color-border-subtle)" stroke-width="1.5"/>
  <rect x="27" y="14" width="16" height="22" rx="3" fill="var(--color-action-secondary)"/>
  <circle cx="35" cy="41" r="2" fill="var(--color-border-strong)"/>
  <path d="M52 11h14a5 5 0 015 5v6a5 5 0 01-5 5h-6l-5 5v-5h-3a5 5 0 01-5-5v-6a5 5 0 015-5z" fill="var(--color-accent-customer)"/>
  <circle cx="55" cy="19" r="1.3" fill="white"/>
  <circle cx="59" cy="19" r="1.3" fill="white"/>
  <circle cx="63" cy="19" r="1.3" fill="white"/>
  <path d="M10 46h60" stroke="var(--color-border-strong)" stroke-width="2" stroke-linecap="round"/>
</svg>`;
  }
  return "";
}

const tabIcons: Record<string, string> = {
  今日: "home",
  today: "home",
  库存查询: "inventory_2",
  客户: "person",
  客户搜索: "search",
  预约列表: "calendar_month",
  "appointment-list": "calendar_month",
  回访登记: "call",
  工作台: "grid_view",
  我的: "settings",
  "orders-overview": "dashboard",
  "orders-list": "format_list_bulleted",
  settings: "settings",
  "home-feed": "home",
  "order-detail": "receipt_long",
  "order-form": "add_box",
  auth: "login",
  "item-detail": "shopping_bag",
};

function slot(node: SpecNode, name: string): SpecNode[] {
  return node.slots?.[name] ?? [];
}

function stateSwitcher(): string {
  return `<nav class="state-switcher" aria-label="预览状态">
  <span class="state-switcher-label">状态</span>
  <a href="?state=default">默认</a>
  <a href="?state=empty">空</a>
  <a href="?state=loading">加载</a>
  <a href="?state=error">失败</a>
</nav>`;
}

function loadingPanel(): string {
  return `
  <div class="state-panel loading" aria-hidden="true">
    <div class="skeleton short"></div>
    <div class="skeleton card"></div>
    <div class="skeleton card"></div>
    <div class="loading-calendar">
      <div class="loading-filter-row">
        <span>状态 全部</span><span>日期 11-05 周三</span>
      </div>
      <div class="loading-legend">
        <span>已登记</span><span>已到店</span><span>爽约</span><span>已取消</span>
      </div>
      <div class="loading-grid">${Array.from({ length: 56 }, () => "<i></i>").join("")}</div>
    </div>
  </div>`;
}

function errorPanel(variant: "inline" | "overlay"): string {
  const className = variant === "inline" ? "state-panel error inline" : "state-panel error";
  return `
  <div class="${className}" aria-hidden="true">
    <div class="error-box">
      <span class="material-symbols-rounded error-icon">cloud_off</span>
      <div class="error-title">加载失败</div>
      <div class="error-desc">网络不稳定，请稍后重试</div>
      <button class="btn primary" type="button">重试</button>
    </div>
  </div>`;
}

function renderNode(node: SpecNode, profile: Profile, depth = 0): string {
  const props = node.props ?? {};
  const children = (node.children ?? []).map((child) => renderNode(child, profile, depth + 1)).join("");

  switch (node.type) {
    case "PageShell": {
      const title = str(props.title);
      const nav = stringArray(props.nav);
      const motion = motionAttrs(node, renderMotionContext, depth === 0);
      const blocks = ["summary", "content", "groups", "fields", "actions"]
        .map((name) => {
          const children = slot(node, name);
          if (children.length === 0) return "";
          const rendered = children
            .map((child) => renderNode(child, profile, depth + 1))
            .join("");
          return `<div class="page-slot page-slot-${name}">${rendered}</div>`;
        })
        .join("");
      return `<div class="page-shell" ${shellInteractionAttrs()}${motion.attrs}${inlineStyle("", motion.style)}>
  <aside class="page-sidebar">
    <div class="page-brand">${esc(renderProject)}</div>
    <nav class="page-nav">${nav
      .map(
        (id) =>
          `<a class="page-nav-item${id === renderPageId ? " active" : ""}" href="#">${esc(pageLabel(id))}</a>`
      )
      .join("")}</nav>
  </aside>
  <div class="page-main">
    <header class="page-header-web"><h1>${esc(title)}</h1></header>
    <main class="page-body">${blocks}</main>
    ${loadingPanel()}
    ${errorPanel("overlay")}
  </div>
</div>`;
    }
    case "MobileShell": {
      const title = str(props.title);
      const motion = motionAttrs(node, renderMotionContext, depth === 0);
      const top = slot(node, "top-bar")
        .map((child) => renderNode(child, profile, depth + 1))
        .join("");
      const content = slot(node, "content")
        .map((child) => renderNode(child, profile, depth + 1))
        .join("");
      const navNodes = slot(node, "bottom-nav");
      const nav = navNodes
        .map((child) => renderNode(child, profile, depth + 1))
        .join("");
      const tabCount = navNodes.reduce(
        (count, child) => count + stringArray(child.props?.items).length,
        0
      );
      const titleSlot = slot(node, "title")
        .map((child) => renderNode(child, profile, depth + 1))
        .join("");
      const illustration = slot(node, "illustration")
        .map((child) => renderNode(child, profile, depth + 1))
        .join("");
      const body = slot(node, "body")
        .map((child) => renderNode(child, profile, depth + 1))
        .join("");
      const summary = slot(node, "summary")
        .map((child) => renderNode(child, profile, depth + 1))
        .join("");
      const feed = slot(node, "feed")
        .map((child) => renderNode(child, profile, depth + 1))
        .join("");
      const fields = slot(node, "fields")
        .map((child) => renderNode(child, profile, depth + 1))
        .join("");
      const actions = slot(node, "actions")
        .map((child) => renderNode(child, profile, depth + 1))
        .join("");
      // A single tab cannot fill a bottom bar; omit the bar entirely.
      const showTabs = props.showTabs !== false && tabCount > 1;
      const back = bool(props.back);
      const listArchetype = renderSpec?.meta.archetype === "mobile-list";
      const inlineLoading =
        listArchetype || renderSpec?.meta.archetype === "detail";
      // The plan's TabBar frame corresponds to the styled `<nav class="tabbar">`
      // wrapper, not the inner flex row.
      const navAttrs = navNodes[0]
        ? motionAttrs(navNodes[0], renderMotionContext)
        : { attrs: "", style: "" };
      const header =
        top ||
        (back
          ? `<header class="page-header"><span class="material-symbols-rounded back-icon">arrow_back_ios_new</span><h1 class="page-title">${esc(title)}</h1></header>`
          : titleSlot.length === 0
            ? `<header class="page-header"><h1 class="page-title">${esc(title)}</h1></header>`
            : "");
      return `<div class="app ${showTabs ? "has-tabs" : ""}" ${shellInteractionAttrs()}${motion.attrs}${inlineStyle("", motion.style)}>
  ${header}
  <main class="app-scroll">${titleSlot}${illustration}${body}${summary}${feed}${fields}${content}${listArchetype ? errorPanel("inline") : ""}</main>
  ${actions.length > 0 ? `<div class="app-actions">${actions}</div>` : ""}
  ${showTabs ? `<nav class="tabbar"${navAttrs.attrs}${inlineStyle("", navAttrs.style)}>${nav}</nav>` : ""}
  ${inlineLoading ? "" : loadingPanel()}
  ${listArchetype ? "" : errorPanel("overlay")}
</div>`;
    }
    case "TopBar": {
      const storeName = str(props.storeName);
      const hasMessage = bool(props.hasMessage);
      const motion = motionAttrs(node, renderMotionContext);
      return `<header class="topbar"${motion.attrs}${inlineStyle("", motion.style)}>
  <div class="topbar-store">${esc(storeName)}<span class="material-symbols-rounded topbar-chevron">expand_more</span></div>
  ${hasMessage ? `<span class="material-symbols-rounded topbar-bell">notifications</span>` : ""}
</header>`;
    }
    case "TabBar": {
      const items = stringArray(props.items);
      const active = str(props.active);
      const tabBarId = node.id;
      return `<div class="tabbar-inner">${items
        .map((item, index) => {
          const tabId =
            tabBarId === undefined
              ? ""
              : ` data-node-id="${esc(derivedNodeId(tabBarId, "tab", index))}"`;
          return `<a class="tab ${item === active ? "active" : ""}" href="#"${tabId}>
  <span class="material-symbols-rounded tab-icon">${tabIcons[item] ?? "circle"}</span>
  <span class="tab-label">${esc(pageLabel(item))}</span>
</a>`;
        })
        .join("")}</div>`;
    }
    case "BottomNav": {
      const items = stringArray(props.items);
      const bottomNavId = node.id;
      return `<div class="tabbar-inner">${items
        .map((item, index) => {
          const tabId =
            bottomNavId === undefined
              ? ""
              : ` data-node-id="${esc(derivedNodeId(bottomNavId, "tab", index))}"`;
          return `<a class="tab ${item === renderPageId ? "active" : ""}" href="#"${tabId}>
  <span class="material-symbols-rounded tab-icon">${tabIcons[item] ?? "circle"}</span>
  <span class="tab-label">${esc(pageLabel(item))}</span>
</a>`;
        })
        .join("")}</div>`;
    }
    case "Stat": {
      return `<div class="stat">
  <span class="stat-label">${esc(props.label)}</span>
  <strong class="stat-value">${esc(props.value)}</strong>
</div>`;
    }
    case "List": {
      const listMotion = motionAttrs(node, renderMotionContext);
      if (Array.isArray(props.items)) {
        const parentId = node.id;
        return `<div class="list-text"${listMotion.attrs}${inlineStyle("", listMotion.style)}>${(props.items as unknown[])
          .map((item, index) => {
            const rowId =
              parentId === undefined
                ? ""
                : ` data-node-id="${esc(derivedNodeId(parentId, "row", index))}"`;
            if (item !== null && typeof item === "object" && !Array.isArray(item)) {
              const record = item as Record<string, unknown>;
              const label = str(record.label);
              const value = str(record.value);
              return `<div class="list-text-row summary-row"${rowId}><span class="list-text-label">${esc(label)}</span><b class="list-text-value">${esc(value)}</b></div>`;
            }
            return `<div class="list-text-row"${rowId}>${esc(item)}</div>`;
          })
          .join("")}</div>`;
      }
      const count = Math.min(Math.max(Number(props.items) || 3, 1), 6);
      return `<div class="list-placeholder"${listMotion.attrs}${inlineStyle("", listMotion.style)}>${Array.from(
        { length: count },
        () =>
          `<div class="list-placeholder-row"><span class="skeleton-line wide"></span><span class="skeleton-line"></span><span class="skeleton-line short"></span></div>`
      ).join("")}</div>`;
    }
    case "DataTable": {
      const columns = stringArray(props.columns);
      const columnLabels = stringArray(props.columnLabels);
      const rows = Array.isArray(props.rows)
        ? (props.rows as Array<Record<string, unknown>>)
        : [];
      return `<div class="table-wrap"><table class="data-table">
  <thead><tr>${columns
    .map((column, index) => `<th>${esc(columnLabels[index] ?? column)}</th>`)
    .join("")}</tr></thead>
  <tbody>${
    rows.length > 0
      ? rows
          .map(
            (row) =>
              `<tr>${columns
                .map((column) => `<td>${esc(row[column] ?? "")}</td>`)
                .join("")}</tr>`
          )
          .join("")
      : Array.from(
          { length: 4 },
          () =>
            `<tr>${columns.map(() => `<td><span class="skeleton-line"></span></td>`).join("")}</tr>`
        ).join("")
  }</tbody>
</table></div>`;
    }
    case "FilterBar": {
      const fields = stringArray(props.fields);
      const action = str(props.action);
      return `<div class="filter-bar">
  <div class="filter-chips">${fields
    .map(
      (field) =>
        `<span class="filter-chip"><span class="filter-label">${esc(field)}</span><span class="filter-value">全部</span><span class="material-symbols-rounded filter-chevron">expand_more</span></span>`
    )
    .join("")}</div>
  ${action ? `<button class="btn secondary" type="button">${esc(action)}</button>` : ""}
</div>`;
    }
    case "Pagination":
      return `<div class="pagination">
  <span class="page-arrow">‹</span>
  <span class="page-number active">1</span>
  <span class="page-number">2</span>
  <span class="page-number">3</span>
  <span class="page-arrow">›</span>
</div>`;
    case "FormField": {
      const label = str(props.label);
      const required = bool(props.required);
      const readOnly = bool(props.readOnly);
      const value = str(props.value);
      const field = str(props.field);
      const hasChildren = children.length > 0;
      const motion = motionAttrs(node, renderMotionContext);
      return `<label class="form-field"${field ? ` data-field="${esc(field)}"` : ""}${motion.attrs}${inlineStyle("", motion.style)}>
  <span class="form-label">${esc(label)}${required ? `<span class="required">*</span>` : ""}</span>
  ${hasChildren ? children : `<span class="${value ? "form-value" : "form-readonly"}">${value || (readOnly ? "—" : "")}</span>`}
</label>`;
    }
    case "Input": {
      const name = str(props.name);
      const placeholder = str(props.placeholder);
      const inputType = str(props.inputType) || "text";
      const value = str(props.value);
      const required = bool(props.required);
      const motion = motionAttrs(node, renderMotionContext);
      const control = `<input class="input"${motion.attrs}${inlineStyle("", motion.style)} name="${esc(name)}" type="${esc(inputType)}" placeholder="${esc(placeholder)}"${required ? ' required aria-required="true"' : ""}${value ? ` value="${esc(value)}"` : ""} />`;
      if (inputType === "datetime-local") {
        return `<span class="datetime-control">${control}<span class="datetime-display" aria-hidden="true">${esc(placeholder)}</span></span>`;
      }
      return control;
    }
    case "Select": {
      const options = stringArray(props.options);
      const motion = motionAttrs(node, renderMotionContext);
      return `<select class="select"${motion.attrs}${inlineStyle("", motion.style)}>${options
        .map((option) => `<option>${esc(option)}</option>`)
        .join("")}</select>`;
    }
    case "FeedCard":
      return `<article class="feed-card">
  <h2 class="feed-title">${esc(props.title)}</h2>
  <p class="feed-body">${esc(props.body)}</p>
</article>`;
    case "Image":
      return `<div class="image-placeholder"><span class="material-symbols-rounded">image</span><span>${esc(props.assetRef ?? "image")}</span></div>`;
    case "Section": {
      const padding = str(props.padding);
      const gap = str(props.gap);
      const viewPanel = str(props.viewPanel);
      const motion = motionAttrs(node, renderMotionContext);
      return `<section class="section"${viewPanel ? ` data-view-panel="${esc(viewPanel)}"` : ""}${motion.attrs}${inlineStyle(`padding:${cssVar(padding)};gap:${cssVar(gap)}`, motion.style)}>${children}</section>`;
    }
    case "Card": {
      const title = str(props.title);
      const badge = str(props.badge);
      const badgeTone = str(props.badgeTone) || "neutral";
      const art = illustrationSvg(str(props.illustration));
      const actionLabel = str(props.actionLabel);
      const actionHref = routeHref(str(props.actionRoute));
      const action =
        actionLabel !== "" && actionHref !== undefined
          ? `<a class="card-action" href="${esc(actionHref)}">${esc(actionLabel)}<span class="card-action-chevron" aria-hidden="true">›</span></a>`
          : "";
      const motion = motionAttrs(node, renderMotionContext);
      return `<section class="card"${motion.attrs}${inlineStyle("", motion.style)}>
  <div class="card-head">
    <h2 class="card-title">${esc(title)}${badge ? `<span class="badge tone-${esc(badgeTone)}">${esc(badge)}</span>` : ""}</h2>
    ${action}
    ${art}
  </div>
  <div class="card-body">${children}</div>
</section>`;
    }
    case "Row": {
      const gap = str(props.gap);
      const variant = str(props.variant);
      const variantClass = variant === "filter" ? " filter-row" : "";
      const motion = motionAttrs(node, renderMotionContext);
      return `<div class="row${variantClass}"${motion.attrs}${inlineStyle(`gap:${cssVar(gap)}`, motion.style)}>${children}</div>`;
    }
    case "Stack": {
      const motion = motionAttrs(node, renderMotionContext);
      return `<div class="stack"${motion.attrs}${inlineStyle("", motion.style)}>${children}</div>`;
    }
    case "Grid": {
      const motion = motionAttrs(node, renderMotionContext);
      return `<div class="grid"${motion.attrs}${inlineStyle("", motion.style)}>${children}</div>`;
    }
    case "Text": {
      const motion = motionAttrs(node, renderMotionContext);
      return `<span class="${typoClass(node.textRole)}"${motion.attrs}${inlineStyle("", motion.style)}>${esc(props.text)}</span>`;
    }
    case "Icon":
      return `<span class="material-symbols-rounded icon" aria-hidden="true">${iconName(str(props.name))}</span>`;
    case "QuickAction": {
      const label = str(props.label);
      const icon = str(props.icon);
      const tone = str(props.tone) || "neutral";
      const motion = motionAttrs(node, renderMotionContext);
      return `<button class="quick-action tone-${esc(tone)}" type="button"${motion.attrs}${inlineStyle("", motion.style)}>
  <span class="material-symbols-rounded quick-icon">${iconName(icon)}</span>
  <span class="quick-label">${esc(label)}</span>
</button>`;
    }
    case "CalendarGrid": {
      const days = Array.isArray(props.days) ? props.days : [];
      const hours = stringArray(props.hours);
      const blocks = Array.isArray(props.blocks) ? props.blocks : [];
      const calendarId = node.id;
      const nodeIdAttr = (
        kind: string,
        ...segments: Array<string | number>
      ): string =>
        calendarId === undefined
          ? ""
          : ` data-node-id="${esc(derivedNodeId(calendarId, kind, ...segments))}"`;
      const dayItems = days.map((entry) => {
        if (typeof entry === "string") {
          return { label: entry, date: "", today: false, selected: false };
        }
        const record = entry as Record<string, unknown>;
        return {
          label: str(record.label),
          date: str(record.date),
          today: bool(record.today),
          selected: bool(record.selected),
        };
      });
      const rowCount = Math.max(hours.length, 1);
      const header = `<div class="calendar-corner"></div>${dayItems
        .map((day, dayIndex) => {
          const classes = ["calendar-day", day.selected ? "selected" : "", day.today ? "today" : ""]
            .filter(Boolean)
            .join(" ");
          const shortDate = day.date.length === 10 ? day.date.slice(5) : day.date;
          return `<div class="${classes}"${day.selected ? ' data-selected="true"' : ""}${nodeIdAttr("day", dayIndex)}><span>${esc(day.label)}</span><span class="calendar-date"><span class="calendar-date-full">${esc(day.date)}</span><span class="calendar-date-short">${esc(shortDate)}</span></span></div>`;
        })
        .join("")}`;
      const cells = hours
        .map((hour, hourIndex) => {
          const row = dayItems
            .map(
              (day, dayIndex) =>
                `<div class="calendar-cell${day.selected ? " selected" : ""}"${nodeIdAttr("cell", hourIndex, dayIndex)} data-slot-date="${esc(day.date)}" data-slot-time="${esc(hour)}" style="grid-column:${dayIndex + 2};grid-row:${hourIndex + 2}"></div>`
            )
            .join("");
          return `<div class="calendar-hour"${nodeIdAttr("hour", hourIndex)} style="grid-column:1;grid-row:${hourIndex + 2}">${esc(hour)}</div>${row}`;
        })
        .join("");
      const blockHtml = blocks
        .map((entry, index) => {
          const record = entry as Record<string, unknown>;
          const day =
            typeof record.day === "number"
              ? Math.max(0, Math.min(Math.max(dayItems.length - 1, 0), record.day))
              : 0;
          const start = typeof record.start === "number" ? record.start : 9;
          const duration = typeof record.duration === "number" ? record.duration : 1;
          const startHour = Math.floor(start);
          const startMinute = Math.round((start - startHour) * 60);
          const rowIndex = Math.max(0, Math.min(rowCount - 1, startHour - 9));
          const rowStart = rowIndex + 2;
          const span = Math.max(
            1,
            Math.min(Math.ceil(duration), rowCount - rowIndex)
          );
          const minuteOffset = Math.round((start - startHour) * 44);
          const blockHeight = Math.max(22, Math.round(duration * 44));
          const tone = str(record.tone) || "neutral";
          const payload = {
            title: str(record.title),
            subtitle: str(record.subtitle),
            status: str(record.status),
            date: dayItems[day]?.date ?? "",
            time: `${String(startHour).padStart(2, "0")}:${String(startMinute).padStart(2, "0")}`,
          };
          return `<div class="calendar-block tone-${esc(tone)}"${nodeIdAttr("block", index)} data-block="${esc(JSON.stringify(payload))}" role="button" tabindex="0" aria-label="${esc(record.title)} ${esc(record.subtitle)}" style="grid-column:${day + 2};grid-row:${rowStart} / span ${span};margin-top:${minuteOffset}px;height:${blockHeight}px;align-self:start;" title="${esc(record.title)} ${esc(record.subtitle)}">
  <span class="calendar-block-title">${esc(record.title)}</span>
  <span class="calendar-block-subtitle">${esc(record.subtitle)}</span>
  <span class="calendar-block-time">${esc(payload.time)}</span>
</div>`;
        })
        .join("");
      const viewPanel = str(props.viewPanel);
      const motion = motionAttrs(node, renderMotionContext);
      return `<div class="calendar"${viewPanel ? ` data-view-panel="${esc(viewPanel)}"` : ""}${motion.attrs}${inlineStyle("", motion.style)}>
  <div class="calendar-hint" aria-hidden="true">左右滑动查看整周 ›</div>
  <div class="calendar-viewport">
    <div class="calendar-scroll" tabindex="0" aria-label="预约周历，可左右滑动查看整周"><div class="calendar-grid" style="grid-template-rows:36px repeat(${rowCount},44px)">${header}${cells}${blockHtml}</div></div>
    <span class="calendar-fade" aria-hidden="true"></span>
  </div>
</div>`;
    }
    case "ListRow": {
      const title = str(props.title);
      const subtitle = str(props.subtitle);
      const meta = str(props.meta);
      const status = str(props.status);
      const statusTone = str(props.statusTone) || "neutral";
      const searchText = str(props.searchText);
      const motion = motionAttrs(node, renderMotionContext);
      const linkable =
        renderPageId === "customer-search" || renderPageId === "appointment-list";
      return `<div class="list-row"${linkable ? ' role="button" tabindex="0"' : ""}${searchText ? ` data-search-text="${esc(searchText)}"` : ""}${motion.attrs}${inlineStyle("", motion.style)}>
  <div class="list-row-main">
    <div class="list-row-title">
      <span class="row-title">${esc(title)}</span>
      ${status ? `<span class="badge tone-${esc(statusTone)}">${esc(status)}</span>` : ""}
    </div>
    ${subtitle ? `<div class="row-subtitle">${esc(subtitle)}</div>` : ""}
  </div>
  ${meta ? `<div class="row-meta">${esc(meta)}<span class="row-chevron">›</span></div>` : ""}
</div>`;
    }
    case "Badge": {
      const label = str(props.label);
      const tone = str(props.tone) || "neutral";
      const motion = motionAttrs(node, renderMotionContext);
      return `<span class="badge tone-${esc(tone)}"${motion.attrs}${inlineStyle("", motion.style)}>${esc(label)}</span>`;
    }
    case "SearchBar": {
      const placeholder = str(props.placeholder);
      const motion = motionAttrs(node, renderMotionContext);
      return `<div class="searchbar"${motion.attrs}${inlineStyle("", motion.style)}>
  <span class="material-symbols-rounded search-icon">search</span>
  <input class="search-input" data-search-input placeholder="${esc(placeholder)}" />
</div>`;
    }
    case "CollapsedFilter": {
      const label = str(props.label);
      const value = str(props.value);
      const motion = motionAttrs(node, renderMotionContext);
      return `<button class="filter" type="button"${motion.attrs}${inlineStyle("", motion.style)}>
  <span class="filter-label">${esc(label)}</span>
  <span class="filter-value">${esc(value)}</span>
  <span class="material-symbols-rounded filter-chevron">expand_more</span>
</button>`;
    }
    case "Switch": {
      const label = str(props.label);
      const value = str(props.value);
      const state = str(props.state) || "off";
      const motion = motionAttrs(node, renderMotionContext);
      return `<div class="switch-row"${motion.attrs}${inlineStyle("", motion.style)}>
  <span class="switch-label">${esc(label)}</span>
  <span class="switch ${state === "on" ? "on" : "off"}"><span class="switch-thumb"></span></span>
  <span class="switch-value">${esc(value)}</span>
</div>`;
    }
    case "SummaryRow": {
      const motion = motionAttrs(node, renderMotionContext);
      return `<div class="summary"${motion.attrs}${inlineStyle("", motion.style)}>${esc(props.text)}</div>`;
    }
    case "InventoryCard": {
      const attributes = Array.isArray(props.attributes)
        ? (props.attributes as Array<{ label?: unknown; value?: unknown }>)
        : [];
      const badge = str(props.badge);
      const badgeTone = str(props.badgeTone) || "neutral";
      const inTransit = str(props.inTransit);
      const motion = motionAttrs(node, renderMotionContext);
      return `<article class="inventory-card"${motion.attrs}${inlineStyle("", motion.style)}>
  <div class="inventory-head">
    <div class="inventory-name">${esc(props.name)}${
      str(props.spec) ? `<span class="inventory-spec">${esc(props.spec)}</span>` : ""
    }</div>
    ${badge ? `<span class="badge tone-${esc(badgeTone)}">${esc(badge)}</span>` : ""}
  </div>
  <div class="inventory-attrs">${attributes
    .map(
      (attribute) =>
        `<div class="attr"><span class="attr-label">${esc(attribute.label)}：</span><span class="attr-value">${esc(attribute.value)}</span></div>`
    )
    .join("")}</div>
  <div class="inventory-numbers">
    <div class="num-row">
      <span class="num-label">${esc(props.currentLabel)}：</span>
      <span class="num-value">${esc(props.currentStock)}</span>
    </div>
    <div class="num-row">
      <span class="num-label">${esc(props.availableLabel)}：</span>
      <span class="num-value">${esc(props.availableStock)}</span>
      ${inTransit ? `<span class="in-transit">${esc(inTransit)}</span>` : ""}
    </div>
  </div>
</article>`;
    }
    case "EmptyState": {
      const title = str(props.title);
      const description = str(props.description);
      const icon = str(props.icon);
      const emptyKind = str(props.emptyKind);
      const variant = str(props.variant);
      const motion = motionAttrs(node, renderMotionContext);
      return `<div class="empty-state${variant ? ` empty-${esc(variant)}` : ""}"${emptyKind ? ` data-empty-kind="${esc(emptyKind)}"` : ""}${motion.attrs}${inlineStyle("", motion.style)}>
  ${icon ? `<span class="material-symbols-rounded empty-icon">${iconName(icon)}</span>` : ""}
  <div class="empty-title">${esc(title)}</div>
  ${description ? `<div class="empty-desc">${esc(description)}</div>` : ""}
  ${children ? `<div class="empty-actions">${children}</div>` : ""}
</div>`;
    }
    case "Skeleton": {
      const variant = str(props.variant) || "card";
      if (variant === "list") {
        return `<div class="list-skeleton" aria-hidden="true">${Array.from(
          { length: 12 },
          () =>
            `<div class="skeleton-list-row"><span></span><span></span><span></span></div>`
        ).join("")}</div>`;
      }
      return `<div class="skeleton card"></div>`;
    }
    case "ErrorState": {
      const title = str(props.title);
      const description = str(props.description);
      const action = str(props.action) || "重试";
      return `<div class="error-box">
  <span class="material-symbols-rounded error-icon">cloud_off</span>
  <div class="error-title">${esc(title)}</div>
  ${description ? `<div class="error-desc">${esc(description)}</div>` : ""}
  <button class="btn primary" type="button">${esc(action)}</button>
</div>`;
    }
    case "Button": {
      const label = str(props.label);
      const emphasis = str(props.emphasis) || "primary";
      const action = str(props.action);
      const viewToggle = bool(props.viewToggle);
      const motion = motionAttrs(node, renderMotionContext);
      return `<button class="btn ${esc(emphasis)}" type="button"${action ? ` data-action="${esc(action)}"` : ""}${viewToggle ? " data-view-toggle" : ""}${motion.attrs}${inlineStyle("", motion.style)}>${esc(label)}</button>`;
    }
    default:
      return children;
  }
}

function typeVariables(profile: Profile): string {
  return Object.entries(profile.typography)
    .map(([name, value]) => {
      const slug = name.replace(/\./g, "-");
      return `--type-${slug}-size:${value.fontSize}px;--type-${slug}-line:${value.lineHeight}px;--type-${slug}-weight:${value.fontWeight};`;
    })
    .join("\n  ");
}

function typeClasses(profile: Profile): string {
  return Object.entries(profile.typography)
    .map(([name]) => {
      const slug = name.replace(/\./g, "-");
      return `.typo-${slug}{font-size:var(--type-${slug}-size);line-height:var(--type-${slug}-line);font-weight:var(--type-${slug}-weight);}`;
    })
    .join("\n");
}

export function renderCss(profile: Profile): string {
  const colorVars = Object.entries(profile.color)
    .map(([name, value]) => `--color-${name.replace(/\./g, "-")}:${value};`)
    .join("\n  ");
  const spaceVars = Object.entries(profile.space)
    .map(([name, value]) => `--space-${name}:${value};`)
    .join("\n  ");
  const radiusVars = Object.entries(profile.radius)
    .map(([name, value]) => `--radius-${name}:${value};`)
    .join("\n  ");
  const motionVars = Object.entries(profile.motion)
    .map(([name, value]) => `--motion-${name}:${value};`)
    .join("\n  ");

  return `:root{
  ${colorVars}
  ${spaceVars}
  ${radiusVars}
  ${motionVars}
  ${typeVariables(profile)}
  font-family:"Noto Sans SC","PingFang SC",system-ui,-apple-system,sans-serif;
  color:var(--color-text-primary);
  background:#e9ebef;
  -webkit-font-smoothing:antialiased;
}
*{box-sizing:border-box;}
html,body{margin:0;padding:0;}
body{min-height:100vh;}
a{color:inherit;text-decoration:none;}
button{font:inherit;color:inherit;}
[hidden]{display:none!important;}
${typeClasses(profile)}
.material-symbols-rounded{font-family:"Material Symbols Rounded";font-weight:normal;font-style:normal;font-size:24px;line-height:1;letter-spacing:normal;text-transform:none;display:inline-block;white-space:nowrap;direction:ltr;-webkit-font-smoothing:antialiased;font-variation-settings:"FILL" 1,"wght" 500,"GRAD" 0,"opsz" 24;}
.app{width:390px;height:844px;margin:0 auto;background:var(--color-surface-subtle);display:flex;flex-direction:column;position:relative;overflow:hidden;box-shadow:0 0 0 1px rgba(0,0,0,.04),0 24px 64px rgba(0,0,0,.12);}
.app-scroll{flex:1;overflow-y:auto;overflow-x:hidden;padding-bottom:var(--space-4);scrollbar-width:none;}
.app-scroll::-webkit-scrollbar{display:none;}
.app-actions{flex:0 0 auto;padding:var(--space-3) var(--space-4);background:var(--color-surface-default);border-top:1px solid var(--color-border-subtle);display:flex;gap:var(--space-2);}
.app-actions .section{display:flex;gap:var(--space-2);width:100%;flex-wrap:nowrap;}
.app-actions .btn{flex:1;white-space:nowrap;height:44px;}
.app-scroll .section[data-view-panel]{padding-left:0 !important;padding-right:0 !important;}
.topbar{height:48px;flex:0 0 48px;padding:0 var(--space-4);display:flex;align-items:center;justify-content:space-between;background:var(--color-surface-subtle);position:relative;z-index:5;}
.topbar-store{font-size:var(--type-heading-2-size);line-height:var(--type-heading-2-line);font-weight:var(--type-heading-2-weight);display:flex;align-items:center;gap:2px;}
.topbar-chevron{font-size:20px;color:var(--color-text-secondary);}
.topbar-bell{font-size:24px;color:var(--color-text-primary);}
.page-header{height:48px;flex:0 0 48px;padding:0 var(--space-4);display:flex;align-items:center;gap:var(--space-2);background:var(--color-surface-subtle);}
.back-icon{font-size:20px;cursor:pointer;}
.page-title{margin:0;font-size:var(--type-heading-2-size);line-height:var(--type-heading-2-line);font-weight:var(--type-heading-2-weight);}
.tabbar{flex:0 0 64px;height:64px;background:var(--color-surface-default);border-top:1px solid var(--color-border-subtle);}
.tabbar-inner{height:100%;display:flex;align-items:center;justify-content:space-around;padding-bottom:env(safe-area-inset-bottom,0);}
.tab{display:flex;flex-direction:column;align-items:center;gap:2px;color:var(--color-text-tertiary);min-width:56px;}
.tab.active{color:var(--color-action-primary);}
.tab-icon{font-size:22px;}
.tab-label{font-size:var(--type-label-sm-size);line-height:var(--type-label-sm-line);font-weight:var(--type-label-sm-weight);}
.section{display:flex;flex-direction:column;min-width:0;}
.row{display:flex;align-items:stretch;}
.stack{display:flex;flex-direction:column;}
.grid{display:grid;grid-template-columns:repeat(4,1fr);}
.card{background:var(--color-surface-default);border-radius:var(--radius-lg);padding:var(--space-4);box-shadow:0 1px 2px rgba(17,24,39,.04);}
.card-head{display:flex;align-items:center;justify-content:space-between;gap:var(--space-3);}
.card-illustration{width:80px;height:56px;flex:0 0 80px;display:block;}
.card-title{margin:0;font-size:var(--type-heading-2-size);line-height:var(--type-heading-2-line);font-weight:var(--type-heading-2-weight);display:flex;align-items:center;}
.card-title .badge{margin-left:8px;}
.card-action{margin-left:auto;display:inline-flex;align-items:center;gap:2px;font-size:var(--type-label-sm-size);line-height:var(--type-label-sm-line);font-weight:var(--type-body-md-weight);color:var(--color-text-secondary);white-space:nowrap;}
.card-action-chevron{font-size:16px;color:var(--color-text-tertiary);}
.card-body{margin-top:var(--space-2);display:flex;flex-direction:column;gap:0;}
.card-body>.list-row:not(:last-child){border-bottom:1px solid var(--color-border-subtle);}
.quick-action{flex:1;height:56px;border:0;border-radius:var(--radius-md);background:var(--color-surface-subtle);display:flex;align-items:center;justify-content:center;gap:var(--space-2);transition:transform var(--motion-fast) ease,background var(--motion-normal) ease;}
.quick-action:active{transform:scale(.98);}
.quick-action.tone-customer{background:color-mix(in srgb,var(--color-accent-customer) 10%,white);}
.quick-action.tone-inventory{background:color-mix(in srgb,var(--color-accent-inventory) 12%,white);}
.quick-icon{font-size:24px;color:var(--color-action-primary);}
.quick-action.tone-customer .quick-icon{color:var(--color-accent-customer);}
.quick-action.tone-inventory .quick-icon{color:var(--color-accent-inventory);}
.quick-label{font-size:var(--type-body-md-size);line-height:var(--type-body-md-line);font-weight:var(--type-body-md-weight);}
.list-row{display:flex;align-items:center;justify-content:space-between;gap:var(--space-3);padding:10px 0;}
.list-row[data-row-link]{cursor:pointer;}
.list-row[data-row-link]{transition:background var(--motion-fast) ease;}
.list-row[data-row-link]:hover,.list-row[data-row-link]:active{background:var(--color-surface-subtle);}
.list-row-main{flex:1;min-width:0;}
.list-row-title{display:flex;align-items:center;gap:6px;min-width:0;}
.row-title{font-size:var(--type-heading-3-size);line-height:var(--type-heading-3-line);font-weight:var(--type-heading-3-weight);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.row-subtitle{margin-top:2px;font-size:var(--type-body-sm-size);line-height:var(--type-body-sm-line);font-weight:var(--type-body-sm-weight);color:var(--color-text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.row-meta{display:flex;align-items:center;gap:2px;white-space:nowrap;font-size:var(--type-body-md-size);line-height:var(--type-body-md-line);font-weight:var(--type-body-md-weight);color:var(--color-text-secondary);}
.row-chevron{font-size:16px;color:var(--color-text-tertiary);}
.badge{display:inline-flex;align-self:flex-start;align-items:center;height:20px;padding:0 6px;border-radius:var(--radius-sm);font-size:var(--type-label-strong-size);line-height:var(--type-label-strong-line);font-weight:var(--type-label-strong-weight);white-space:nowrap;}
.badge.tone-neutral{background:var(--color-surface-subtle);color:var(--color-text-secondary);}
.badge.tone-success{background:color-mix(in srgb,var(--color-status-success) 12%,white);color:var(--color-status-success);}
.badge.tone-warning{background:color-mix(in srgb,var(--color-status-warning) 12%,white);color:var(--color-status-warning);}
.badge.tone-danger{background:color-mix(in srgb,var(--color-status-danger) 12%,white);color:var(--color-status-danger);}
.badge.tone-info{background:color-mix(in srgb,var(--color-status-info) 12%,white);color:var(--color-status-info);}
.badge.tone-customer{background:color-mix(in srgb,var(--color-accent-customer) 12%,white);color:var(--color-accent-customer);}
.badge.tone-inventory{background:color-mix(in srgb,var(--color-accent-inventory) 12%,white);color:var(--color-accent-inventory);}
.searchbar{height:36px;border-radius:var(--radius-md);background:var(--color-surface-default);display:flex;align-items:center;gap:var(--space-2);padding:0 var(--space-3);color:var(--color-text-tertiary);}
.search-icon{font-size:20px;}
.search-placeholder{font-size:var(--type-body-sm-size);line-height:var(--type-body-sm-line);}
.search-input{flex:1;min-width:0;border:0;background:transparent;font:inherit;font-size:var(--type-body-sm-size);color:var(--color-text-primary);outline:none;}
.searchbar:focus-within{box-shadow:0 0 0 2px var(--color-action-primary);}
.search-input:focus-visible{outline:none;}
.filter-row{display:flex;align-items:center;gap:var(--space-2);flex-wrap:wrap;}
.filter-row .btn{flex:0 0 auto;white-space:nowrap;}
.filter-row .btn.danger{margin-left:auto;}
.filter-row .btn.ghost{border:1px solid var(--color-border-strong);background:#fff;color:var(--color-text-primary);height:32px;padding:0 12px;border-radius:8px;font-size:13px;}
.filter{height:30px;border:1px solid var(--color-border-subtle);border-radius:var(--radius-md);background:var(--color-surface-default);display:inline-flex;align-items:center;gap:4px;padding:0 8px;}
.filter-label{font-size:var(--type-label-sm-size);line-height:var(--type-label-sm-line);color:var(--color-text-tertiary);}
.filter-value{font-size:var(--type-body-md-size);line-height:var(--type-body-md-line);font-weight:var(--type-body-md-weight);}
.filter-chevron{font-size:16px;color:var(--color-text-tertiary);}
.switch-row{display:flex;align-items:center;gap:6px;margin-left:auto;}
.switch-label{font-size:var(--type-body-md-size);line-height:var(--type-body-md-line);}
.switch{width:36px;height:20px;border-radius:var(--radius-full);position:relative;display:inline-block;transition:background var(--motion-fast) ease;}
.switch.off{background:var(--color-border-strong);}
.switch.on{background:var(--color-status-success);}
.switch-thumb{position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;transition:transform var(--motion-fast) ease;}
.switch.on .switch-thumb{transform:translateX(16px);}
.switch-value{font-size:var(--type-label-sm-size);line-height:var(--type-label-sm-line);color:var(--color-text-tertiary);}
.summary{font-size:var(--type-label-sm-size);line-height:var(--type-label-sm-line);color:var(--color-text-tertiary);padding:0 2px;}
.calendar{position:relative;min-width:0;background:var(--color-surface-default);border-radius:var(--radius-lg);box-shadow:0 1px 2px rgba(17,24,39,.04);overflow:hidden;}
.calendar-viewport{position:relative;min-width:0;}
.calendar-scroll{min-width:0;overflow-x:auto;overflow-y:hidden;scrollbar-width:none;}
.calendar-scroll::-webkit-scrollbar{display:none;}
.calendar-hint{display:none;justify-content:flex-end;align-items:center;gap:4px;padding:8px 12px 0;font-size:10px;line-height:14px;color:var(--color-text-tertiary);}
.calendar-fade{position:absolute;top:0;right:0;bottom:0;width:24px;background:linear-gradient(90deg,transparent,var(--color-surface-default));pointer-events:none;opacity:0;}
.calendar[data-scrollable="true"] .calendar-hint{display:flex;}
.calendar[data-scrollable="true"] .calendar-fade{opacity:1;}
.calendar[data-scroll-end="true"] .calendar-hint{display:none;}
.calendar[data-scroll-end="true"] .calendar-fade{opacity:0;}
@media (max-width:719px){
  .calendar:not([data-scrollable="false"]):not([data-scroll-end="true"]) .calendar-hint{display:flex;}
  .calendar:not([data-scrollable="false"]):not([data-scroll-end="true"]) .calendar-fade{opacity:1;}
}
.calendar-grid{display:grid;grid-template-columns:44px repeat(7,minmax(88px,1fr));min-width:720px;position:relative;}
.app .calendar-grid{grid-template-columns:36px repeat(7,minmax(0,1fr));min-width:0;}
.app .calendar-date-full{display:none;}
.app .calendar-date-short{display:inline;}
.calendar-corner{grid-column:1;grid-row:1;background:var(--color-surface-subtle);border-bottom:1px solid var(--color-border-subtle);}
.calendar-day{grid-row:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;font-size:var(--type-label-sm-size);line-height:var(--type-label-sm-line);color:var(--color-text-secondary);background:var(--color-surface-subtle);border-left:1px solid var(--color-border-subtle);border-bottom:1px solid var(--color-border-subtle);}
.calendar-day.today{background:color-mix(in srgb,var(--color-status-info) 10%,white);color:var(--color-status-info);font-weight:600;}
.calendar-day.selected{background:color-mix(in srgb,var(--color-status-info) 14%,var(--color-surface-subtle));color:var(--color-status-info);font-weight:600;box-shadow:inset 0 -2px 0 var(--color-status-info);}
.calendar-date{font-size:11px;line-height:13px;color:var(--color-text-tertiary);white-space:nowrap;}
.calendar-date-short{display:none;}
.calendar-day.today .calendar-date{color:var(--color-status-info);}
.calendar-day.selected .calendar-date{color:var(--color-status-info);}
.calendar-hour{grid-column:1;font-size:11px;line-height:13px;color:var(--color-text-tertiary);display:flex;justify-content:flex-end;padding:2px 4px 0 0;}
.calendar-cell{border-top:1px solid var(--color-border-subtle);border-left:1px solid var(--color-border-subtle);}
.calendar-cell.selected{background:color-mix(in srgb,var(--color-status-info) 4%,white);}
.calendar-block{margin:0;padding:2px;border-radius:var(--radius-sm);overflow:hidden;z-index:1;background:var(--color-surface-subtle);border-left:2px solid var(--color-border-strong);font-size:12px;line-height:14px;}
.calendar-block-title{display:block;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.calendar-block-subtitle{display:block;color:var(--color-text-secondary);font-size:10px;line-height:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.calendar-block-time{display:block;color:var(--color-text-tertiary);font-size:10px;line-height:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.calendar-block.tone-success{background:color-mix(in srgb,var(--color-status-success) 10%,white);border-left-color:var(--color-status-success);}
.calendar-block.tone-warning{background:color-mix(in srgb,var(--color-status-warning) 12%,white);border-left-color:var(--color-status-warning);}
.calendar-block.tone-danger{background:color-mix(in srgb,var(--color-status-danger) 10%,white);border-left-color:var(--color-status-danger);}
.calendar-block.tone-info{background:color-mix(in srgb,var(--color-status-info) 10%,white);border-left-color:var(--color-status-info);}
.inventory-card{background:var(--color-surface-default);border-radius:var(--radius-lg);padding:var(--space-4);display:flex;flex-direction:column;gap:var(--space-2);box-shadow:0 1px 2px rgba(17,24,39,.04);animation:fade-up var(--motion-slow) ease both;}
.inventory-head{display:flex;align-items:flex-start;justify-content:space-between;gap:var(--space-2);}
.inventory-name{font-size:var(--type-heading-3-size);line-height:var(--type-heading-3-line);font-weight:var(--type-heading-3-weight);}
.inventory-spec{font-size:var(--type-body-sm-size);font-weight:var(--type-body-sm-weight);color:var(--color-text-secondary);margin-left:2px;}
.inventory-attrs{display:flex;flex-direction:column;gap:2px;}
.attr{font-size:var(--type-body-sm-size);line-height:var(--type-body-sm-line);}
.attr-label{color:var(--color-text-tertiary);}
.attr-value{color:var(--color-text-secondary);font-weight:var(--type-body-md-weight);}
.inventory-numbers{border-top:1px solid var(--color-border-subtle);padding-top:var(--space-2);display:flex;flex-direction:column;gap:2px;}
.num-row{display:flex;align-items:baseline;gap:2px;}
.num-label{font-size:var(--type-body-sm-size);line-height:var(--type-body-sm-line);color:var(--color-text-tertiary);}
.num-value{font-size:var(--type-heading-3-size);line-height:var(--type-heading-3-line);font-weight:var(--type-heading-3-weight);}
.in-transit{margin-left:auto;font-size:var(--type-label-sm-size);line-height:var(--type-label-sm-line);color:var(--color-text-tertiary);}
.empty-state{display:none;flex-direction:column;align-items:center;justify-content:center;padding:var(--space-6) var(--space-4);text-align:center;gap:4px;}
.empty-icon{font-size:40px;color:var(--color-text-tertiary);margin-bottom:4px;}
.empty-title{font-size:var(--type-body-md-size);line-height:var(--type-body-md-line);font-weight:var(--type-body-md-weight);color:var(--color-text-secondary);}
.empty-desc{font-size:var(--type-label-sm-size);line-height:var(--type-label-sm-line);color:var(--color-text-tertiary);}
.empty-actions{margin-top:var(--space-2);}
.empty-state[data-empty-kind]{display:flex;}
body[data-state="empty"] .empty-state{display:flex;}
body[data-state="empty"] .empty-state.empty-inline{width:100%;padding:var(--space-4);margin-bottom:var(--space-4);border-top:1px solid var(--color-border-subtle);border-bottom:1px solid var(--color-border-subtle);background:var(--color-surface-subtle);box-shadow:none;border-radius:0;}
body[data-state="empty"] .list-row,body[data-state="empty"] .inventory-card{display:none;}
body[data-state="empty"] .calendar-block{display:none;}
body[data-state="empty"] .calendar-grid{opacity:.55;}
body[data-state="empty"] .summary{display:none;}
.state-panel{display:none;position:absolute;left:0;right:0;top:48px;bottom:0;z-index:30;background:var(--color-surface-subtle);padding:var(--space-4);flex-direction:column;gap:var(--space-3);}
.app.has-tabs .state-panel{bottom:64px;}
body[data-state="loading"] .state-panel.loading{display:flex;}
body[data-state="error"] .state-panel.error{display:flex;align-items:center;justify-content:center;}
.state-panel.error.inline{position:static;display:none;background:transparent;padding:var(--space-4);}
body[data-state="error"] .state-panel.error.inline{display:flex;}
.app[data-page-archetype="mobile-list"] .state-panel.error.inline .error-box{width:100%;background:var(--color-surface-default);border-radius:var(--radius-lg);padding:var(--space-6) var(--space-4);box-shadow:0 1px 2px rgba(17,24,39,.04);}
body[data-state="error"] .app[data-page-archetype="mobile-list"] .calendar,
body[data-state="error"] .app[data-page-archetype="mobile-list"] [data-view-panel="list"],
body[data-state="error"] .app[data-page-archetype="mobile-list"] .empty-state{display:none;}
.skeleton{border-radius:var(--radius-lg);background:linear-gradient(90deg,#E7E9ED 25%,#FCFCFD 37%,#E7E9ED 63%);background-size:400% 100%;animation:shimmer 1.4s ease infinite;}
.skeleton.short{height:48px;}
.skeleton.card{height:140px;}
.loading-calendar{display:none;flex-direction:column;gap:12px;}
.app[data-page-archetype="mobile-list"] .state-panel.loading > .skeleton{display:none;}
.app[data-page-archetype="mobile-list"] .state-panel.loading .loading-calendar{display:flex;}
.loading-filter-row,.loading-legend{display:flex;gap:8px;}
.loading-filter-row span,.loading-legend span{height:24px;border-radius:6px;background:#E7E9ED;color:#6B7280;font-size:11px;display:inline-flex;align-items:center;justify-content:center;padding:0 8px;}
.loading-legend span{height:20px;font-size:10px;}
.loading-grid{display:grid;grid-template-columns:36px repeat(7,1fr);grid-auto-rows:16px;gap:2px;}
.loading-grid i{display:block;border-radius:2px;background:#E7E9ED;}
body[data-state="loading"] .calendar-block{display:none;}
body[data-state="loading"] .calendar-cell{background:linear-gradient(90deg,#E7E9ED 25%,#FCFCFD 37%,#E7E9ED 63%);background-size:400% 100%;animation:shimmer 1.4s ease infinite;border-color:var(--color-border-strong);}
body[data-state="loading"] .app[data-page-archetype="detail"] .badge,
body[data-state="loading"] .app[data-page-archetype="detail"] .app-scroll .filter-row,
body[data-state="loading"] .app[data-page-archetype="detail"] .app-actions{visibility:hidden;}
body[data-state="loading"] .calendar-hint,
body[data-state="loading"] .calendar-fade{display:none;}
body[data-state="loading"] .list-row{display:none;}
.list-skeleton{display:none;flex-direction:column;}
body[data-state="loading"] .list-skeleton{display:flex;}
.skeleton-list-row{height:56px;display:flex;flex-direction:column;justify-content:center;gap:6px;padding:0 2px;border-bottom:1px solid var(--color-border-subtle);}
.skeleton-list-row span{display:block;height:12px;border-radius:4px;background:linear-gradient(90deg,#E7E9ED 25%,#FCFCFD 37%,#E7E9ED 63%);background-size:400% 100%;animation:shimmer 1.4s ease infinite;}
.skeleton-list-row span:nth-child(1){width:36%;}
.skeleton-list-row span:nth-child(2){width:58%;}
.skeleton-list-row span:nth-child(3){width:24%;}
body[data-state="loading"] .app-scroll .list-text-value{color:transparent;position:relative;}
body[data-state="loading"] .app-scroll .list-text-value::after{content:"";position:absolute;left:0;top:50%;transform:translateY(-50%);width:70%;height:12px;border-radius:4px;background:linear-gradient(90deg,#E7E9ED 25%,#FCFCFD 37%,#E7E9ED 63%);background-size:400% 100%;animation:shimmer 1.4s ease infinite;}
body[data-state="loading"] .app-actions .btn{pointer-events:none;opacity:.6;}
.visually-hidden{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0;}
.error-box{display:flex;flex-direction:column;align-items:center;gap:6px;text-align:center;}
.error-icon{font-size:40px;color:var(--color-text-tertiary);}
.error-title{font-size:var(--type-heading-3-size);line-height:var(--type-heading-3-line);font-weight:var(--type-heading-3-weight);}
.error-desc{font-size:var(--type-body-sm-size);line-height:var(--type-body-sm-line);color:var(--color-text-secondary);}
.btn{height:36px;padding:0 var(--space-4);border:0;border-radius:var(--radius-md);font-size:var(--type-body-md-size);line-height:var(--type-body-md-line);font-weight:var(--type-body-md-weight);}
.btn.primary{background:var(--color-action-primary);color:var(--color-text-onAction);}
.btn.secondary{background:#fff;border:1px solid #CBD5E1;color:var(--color-text-primary);}
.btn.ghost{background:transparent;color:var(--color-text-secondary);}
.btn.danger{background:#fff;color:var(--color-status-danger);border:1px solid color-mix(in srgb,var(--color-status-danger) 40%,white);}
.btn:disabled,.input:disabled,.select:disabled{opacity:.5;cursor:not-allowed;}
:where(a,button,.btn,.tab,.input,.select,.search-input,.calendar-scroll,.list-row[role="button"],[data-block]):focus-visible{outline:2px solid var(--color-action-primary);outline-offset:2px;}
.btn:disabled{background:var(--color-surface-subtle);color:var(--color-text-tertiary);}
body[data-state="disabled"] .app-scroll input,
body[data-state="disabled"] .app-scroll select,
body[data-state="disabled"] .app-scroll textarea{background:var(--color-surface-subtle);color:var(--color-text-tertiary);border-color:var(--color-border-subtle);}
body[data-state="disabled"] .app-scroll input[type="datetime-local"]::-webkit-calendar-picker-indicator,
.input[type="datetime-local"]:disabled::-webkit-calendar-picker-indicator{opacity:0;}
body[data-state="disabled"] .app-actions .btn.primary{opacity:1;background:#E5E7EB;color:#6B7280;border:1px solid #D1D5DB;}
.readonly-banner{margin:12px 16px;padding:12px;border:1px solid color-mix(in srgb,var(--color-status-warning) 30%,white);border-radius:var(--radius-lg);background:color-mix(in srgb,var(--color-status-warning) 10%,white);color:var(--color-text-secondary);font-size:var(--type-label-sm-size);line-height:var(--type-label-sm-line);}
.app-scroll > .row{padding-left:var(--space-4);padding-right:var(--space-4);}
.list-row > .row-chevron{flex:0 0 auto;margin-left:4px;align-self:center;}
body[data-page-kind="form"] .form-field[data-field=customer] .input:disabled{background:var(--color-surface-subtle);border-color:var(--color-border-subtle);color:var(--color-text-tertiary);opacity:1;}
.page-shell{display:flex;min-height:100vh;background:#F5F6F8;}
.page-sidebar{width:232px;flex:0 0 232px;background:#0F172A;color:#CBD5E1;padding:24px 16px;position:sticky;top:0;height:100vh;display:flex;flex-direction:column;gap:24px;}
.page-brand{font-size:16px;font-weight:600;color:#F8FAFC;letter-spacing:.02em;}
.page-nav{display:flex;flex-direction:column;gap:2px;}
.page-nav-item{padding:9px 12px;border-radius:8px;color:#CBD5E1;font-size:14px;}
.page-nav-item:hover{background:rgba(255,255,255,.06);color:#fff;}
.page-nav-item.active{background:#2563EB;color:#fff;}
.page-main{flex:1;min-width:0;position:relative;}
.page-header-web{height:64px;padding:0 32px;display:flex;align-items:center;border-bottom:1px solid #E5E7EB;background:#fff;}
.page-header-web h1{margin:0;font-size:20px;line-height:28px;font-weight:600;color:#111827;}
.page-body{padding:24px 32px 48px;display:flex;flex-direction:column;gap:20px;max-width:1280px;}
.page-slot{display:flex;flex-direction:column;gap:16px;}
.page-slot-actions{flex-direction:row;align-items:center;flex-wrap:wrap;gap:8px;}
.page-slot-actions .btn{width:auto;}
.page-slot-actions .section{flex-direction:row;align-items:center;flex-wrap:wrap;gap:8px;}
.page-shell .state-panel{left:0;right:0;top:64px;bottom:0;}
.stat{background:#fff;border:1px solid #E5E7EB;border-radius:12px;padding:16px;display:flex;flex-direction:column;gap:4px;min-width:0;}
.stat-label{font-size:13px;line-height:18px;color:#64748B;}
.stat-value{font-size:24px;line-height:32px;font-weight:600;color:#0F172A;}
.list-placeholder{display:flex;flex-direction:column;gap:10px;padding:4px 0;}
.list-text{display:flex;flex-direction:column;gap:0;padding:4px 0;}
.list-text-row{padding:10px 0;border-bottom:1px solid var(--color-border-subtle);font-size:var(--type-body-md-size);line-height:var(--type-body-md-line);color:var(--color-text-primary);}
.list-text-row:last-child{border-bottom:0;}
.list-text-row.summary-row{display:flex;align-items:baseline;gap:var(--space-3);}
.list-text-label{flex:0 0 72px;color:var(--color-text-tertiary);}
.list-text-value{flex:1;min-width:0;font-weight:var(--type-body-md-weight);word-break:break-word;}
.list-placeholder-row{display:grid;grid-template-columns:2fr 1fr 60px;gap:12px;align-items:center;padding:10px 0;border-bottom:1px solid #F1F5F9;}
.skeleton-line{display:block;height:10px;border-radius:6px;background:#E7E9ED;}
.skeleton-line.wide{width:80%;}
.skeleton-line.short{width:60%;}
.table-wrap{overflow:auto;background:#fff;border:1px solid #E5E7EB;border-radius:12px;}
.data-table{width:100%;border-collapse:collapse;font-size:13px;}
.data-table th{text-align:left;padding:12px 16px;background:#F8FAFC;color:#475569;font-weight:600;border-bottom:1px solid #E5E7EB;white-space:nowrap;}
.data-table td{padding:14px 16px;border-bottom:1px solid #F1F5F9;}
.data-table tr:last-child td{border-bottom:0;}
.filter-bar{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;}
.filter-chips{display:flex;gap:8px;flex-wrap:wrap;}
.filter-chip{height:32px;border:1px solid #E5E7EB;border-radius:8px;background:#fff;display:inline-flex;align-items:center;gap:6px;padding:0 10px;}
.filter-label{font-size:12px;color:#64748B;}
.filter-value{font-size:13px;color:#0F172A;}
.filter-chevron{font-size:16px;color:#94A3B8;}
.pagination{display:flex;align-items:center;gap:4px;justify-content:flex-end;}
.page-number,.page-arrow{min-width:28px;height:28px;display:inline-flex;align-items:center;justify-content:center;border-radius:6px;font-size:13px;color:#475569;}
.page-number.active{background:#2563EB;color:#fff;}
.form-field{display:flex;flex-direction:column;gap:6px;}
.form-label{font-size:13px;line-height:18px;color:#475569;font-weight:500;}
.required{color:#DC2626;margin-left:2px;}
.form-readonly{display:block;min-height:20px;padding:8px 10px;border-radius:6px;background:#F8FAFC;color:#94A3B8;font-size:14px;}
.form-value{display:block;min-height:20px;padding:8px 10px;border-radius:6px;background:#F8FAFC;color:#0F172A;font-size:14px;}
.input,.select{height:36px;border:1px solid #CBD5E1;border-radius:8px;background:#fff;padding:0 10px;font:inherit;font-size:14px;color:#0F172A;width:100%;}
.input:focus,.select:focus{outline:2px solid #BFDBFE;border-color:#2563EB;}
.datetime-control{position:relative;display:block;}
.datetime-display{position:absolute;inset:1px 34px 1px 10px;display:flex;align-items:center;background:#fff;color:#94A3B8;font-size:14px;pointer-events:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.datetime-display.filled{color:#0F172A;}
.datetime-control:focus-within .datetime-display{display:none;}
.datetime-control:has(.input:disabled) .datetime-display{background:var(--color-surface-subtle);color:var(--color-text-tertiary);opacity:1;}
.datetime-control .input:disabled{opacity:1;}
.form-field .row{align-items:center;}
.form-field .row .input{flex:1;min-width:0;}
.form-field .row .btn{flex:0 0 auto;}
.app-scroll>.form-field{margin:0 var(--space-4) var(--space-3);}
.app-scroll>.btn{margin:var(--space-4);}
.app-scroll>.card{margin:var(--space-4);}
.app-scroll>.feed-card{margin:var(--space-4);}
.app-scroll>.typo-heading-1{display:block;margin:var(--space-8) var(--space-4) var(--space-4);}
.feed-card{background:#fff;border-radius:12px;padding:16px;box-shadow:0 1px 2px rgba(17,24,39,.04);}
.feed-title{margin:0 0 6px;font-size:16px;line-height:24px;color:#0F172A;}
.feed-body{margin:0;font-size:13px;line-height:20px;color:#64748B;}
.image-placeholder{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;min-height:180px;margin:var(--space-4);border:1px dashed #CBD5E1;border-radius:12px;background:#F8FAFC;color:#94A3B8;font-size:12px;}
body[data-state="empty"] .data-table,body[data-state="empty"] .table-wrap,body[data-state="empty"] .list-placeholder,body[data-state="empty"] .list-text,body[data-state="empty"] .feed-card{display:none;}
@media (max-width:900px){.page-sidebar{width:180px;flex-basis:180px;}.page-body{padding:16px;}.page-header-web{padding:0 16px;}}
.state-switcher{position:fixed;right:24px;bottom:24px;z-index:100;display:flex;flex-direction:column;gap:6px;padding:12px 14px;border-radius:12px;background:#fff;box-shadow:0 4px 20px rgba(17,24,39,.12);font-size:12px;color:#6B7280;}
.state-switcher-label{font-weight:600;color:#111827;}
.state-switcher a{padding:2px 0;}
.state-switcher a:hover{color:#111827;}
.reschedule-context{display:flex;flex-direction:column;gap:2px;margin:0 var(--space-4) var(--space-2);padding:10px 12px;border-radius:var(--radius-md);background:color-mix(in srgb,var(--color-status-info) 8%,white);border:1px solid color-mix(in srgb,var(--color-status-info) 22%,white);font-size:var(--type-label-sm-size);line-height:var(--type-label-sm-line);color:var(--color-text-secondary);}
.reschedule-context strong{font-size:var(--type-body-sm-size);color:var(--color-text-primary);}
.reschedule-id{font-size:10px;color:var(--color-text-tertiary);}
.state-note{padding:12px 16px;font-size:13px;color:var(--color-text-secondary);}
.detail-drawer{position:fixed;inset:0;z-index:200;background:rgba(15,23,42,.35);display:flex;align-items:flex-end;}
.detail-drawer-card{width:100%;background:#fff;border-radius:12px 12px 0 0;padding:16px;display:flex;flex-direction:column;gap:8px;}
.detail-drawer-card p{margin:0;font-size:14px;color:var(--color-text-primary);}
@keyframes fade-up{from{opacity:0;transform:translateY(6px);}to{opacity:1;transform:none;}}
@keyframes shimmer{0%{background-position:100% 0;}100%{background-position:-100% 0;}}
@media (prefers-reduced-motion: reduce){*{animation:none !important;transition:none !important;}}
@media (max-width:700px){body{background:var(--color-surface-subtle);}.app{box-shadow:none;height:100vh;min-height:844px;}.state-switcher{display:none;}}`;
}

function renderInteractionScript(): string {
  return `<script>
(() => {
  const raw = document.getElementById("interaction-config")?.textContent;
  if (!raw) return;
  const config = JSON.parse(raw);
  const qsa = (selector) => Array.from(document.querySelectorAll(selector));
  const showHint = (message) => window.alert(message);
  if (new URLSearchParams(location.search).get("state") === "loading") {
    const busyHost = document.querySelector(".app-scroll");
    if (busyHost) {
      busyHost.setAttribute("aria-busy", "true");
      const status = document.createElement("span");
      status.className = "visually-hidden";
      status.setAttribute("role", "status");
      status.textContent = "正在加载";
      busyHost.prepend(status);
    }
  }

  function applyBusinessStates() {
    const states = config.businessStates;
    if (!states) return;
    let status =
      new URLSearchParams(location.search).get("status") ??
      config.currentStatus ??
      states[0]?.name;
    const currentState = () => states.find((state) => state.name === status);
    const allowed = () => currentState()?.actions ?? [];
    const toneFor = (value) => {
      if (/已到店|已完成|已确认|成功|在售/.test(value)) return "success";
      if (/已登记|待确认|未确认|待到店|待处理|进行|加载/.test(value)) return "warning";
      if (/爽约|已取消|失败|异常|缺货/.test(value)) return "danger";
      return "neutral";
    };
    const bar = document.querySelector(".app-actions");
    const noteHost = document.querySelector(".app-scroll");
    const rowLabel = (row) => row.querySelector(".list-text-label")?.textContent ?? "";
    const rowValue = (row) => row.querySelector(".list-text-value");
    const pad2 = (value) => String(value).padStart(2, "0");
    const formatDateTime = (date) =>
      date.getFullYear() + "-" + pad2(date.getMonth() + 1) + "-" + pad2(date.getDate()) +
      " " + pad2(date.getHours()) + ":" + pad2(date.getMinutes());
    const summaryValue = (label) => {
      for (const row of qsa(".app-scroll .list-text-row")) {
        if (rowLabel(row) !== label) continue;
        return (rowValue(row)?.textContent ?? "").trim();
      }
      return "";
    };
    const serviceCompleted = (() => {
      for (const row of qsa(".app-scroll .list-text-row")) {
        if (rowLabel(row) !== "服务完成") continue;
        const value = (rowValue(row)?.textContent ?? "").trim();
        return !/^(否|false|no|未完成)$/i.test(value);
      }
      return true;
    })();
    const apply = () => {
      let visibleInBar = 0;
      const allowedActions = serviceCompleted
        ? allowed()
        : allowed().filter((action) => action !== "术后告知");
      for (const button of qsa("[data-action]")) {
        const isAllowed = allowedActions.includes(button.dataset.action);
        button.hidden = !isAllowed;
        if (isAllowed && bar && bar.contains(button)) visibleInBar += 1;
      }
      const visibleBarActions = bar
        ? qsa("[data-action]").filter(
            (button) => bar.contains(button) && !button.hidden
          )
        : [];
      if (visibleBarActions.length === 1) {
        const only = visibleBarActions[0];
        only.classList.remove("secondary", "ghost");
        only.classList.add("primary");
      }
      if (bar) bar.hidden = visibleInBar === 0;
      const badge = document.querySelector(".app-scroll .badge");
      if (badge) {
        badge.textContent = status;
        badge.className = "badge tone-" + toneFor(status);
      }
      const statusField = document.querySelector('[data-field="status"] .form-value, [data-field="status"] .form-readonly');
      if (statusField) statusField.textContent = status;
      for (const row of qsa(".app-scroll .list-text-row")) {
        if (rowLabel(row) === "状态") {
          const value = rowValue(row);
          if (value) value.textContent = status;
        } else if ((row.textContent ?? "").indexOf("状态:") === 0) {
          row.textContent = "状态: " + status;
        }
      }
      if (status === "已确认") {
        const confirmedBy = document.querySelector('[data-field="confirmedBy"] .form-value');
        const confirmedAt = document.querySelector('[data-field="confirmedAt"] .form-value');
        const summaryText = (label) => {
          for (const row of qsa(".app-scroll .list-text-row")) {
            if (rowLabel(row) !== label) continue;
            const value = rowValue(row);
            if (value) return (value.textContent ?? "").trim();
          }
          return "";
        };
        const bySummary = summaryText("确认人");
        const atSummary = summaryText("确认时间");
        const byValue =
          confirmedBy && (confirmedBy.textContent ?? "").trim() !== "—"
            ? confirmedBy.textContent
            : bySummary !== "" && bySummary !== "—"
              ? bySummary
              : "当前员工";
        const atValue =
          confirmedAt && (confirmedAt.textContent ?? "").trim() !== "—"
            ? confirmedAt.textContent
            : atSummary !== "" && atSummary !== "—"
              ? atSummary
              : formatDateTime(new Date());
        if (confirmedBy && (confirmedBy.textContent ?? "").trim() === "—") {
          confirmedBy.textContent = byValue;
        }
        if (confirmedAt && (confirmedAt.textContent ?? "").trim() === "—") {
          confirmedAt.textContent = atValue;
        }
        for (const row of qsa(".app-scroll .list-text-row")) {
          const label = rowLabel(row);
          if (label === "确认人" || label === "确认时间") {
            const value = rowValue(row);
            if (value && (value.textContent ?? "").trim() === "—") {
              value.textContent = label === "确认人" ? byValue : atValue;
            }
            continue;
          }
          const text = row.textContent ?? "";
          if (text.indexOf("确认人:") === 0 && text.indexOf("—") >= 0) row.textContent = "确认人: " + byValue;
          if (text.indexOf("确认时间:") === 0 && text.indexOf("—") >= 0) row.textContent = "确认时间: " + atValue;
        }
      }
      let note = document.querySelector(".state-note");
      // Only curated read-only notes ("只读说明「…」") render, and only when
      // the state has no bottom-bar action.
      const noteText = visibleInBar === 0 ? config.stateNotes?.[status] : undefined;
      if (noteText) {
        if (!note && noteHost) {
          note = document.createElement("div");
          note.className = "state-note";
          noteHost.append(note);
        }
        if (note) note.textContent = noteText;
      } else if (note) {
        note.remove();
      }
    };
    for (const button of qsa("[data-action]")) {
      button.addEventListener("click", () => {
        const action = button.dataset.action;
        if (action === "改期" && config.linkedRoutes.form) {
          const recordKey = config.referenceId ?? config.pageId;
          const record = {
            customer: summaryValue("客户"),
            project: summaryValue("项目"),
            time: summaryValue("时间段"),
            therapist: summaryValue("护理师"),
          };
          if (record.customer !== "" || record.time !== "") {
            sessionStorage.setItem(
              "prd-ui:appointment:" + recordKey,
              JSON.stringify(record)
            );
          }
          location.href =
            config.linkedRoutes.form +
            "?mode=reschedule" +
            (config.referenceId
              ? "&appointmentId=" + encodeURIComponent(config.referenceId)
              : "&recordId=" + encodeURIComponent(recordKey));
          return;
        }
        if (action === "术后告知") {
          if (config.linkedRoutes.notice) location.href = config.linkedRoutes.notice;
          else showHint("当前切片没有告知页");
          return;
        }
        if (action === "客户详情") {
          if (config.linkedRoutes.customer) location.href = config.linkedRoutes.customer;
          else showHint("当前切片没有客户详情页");
          return;
        }
        if (action === "开单") {
          showHint("开单流程不在本切片");
          return;
        }
        if (action === "已到店确认" || action === "接单并确认到店") {
          status = (states.find((state) => state.name.indexOf("到店") >= 0) ?? states[1] ?? currentState())?.name ?? status;
        } else if (action === "取消") {
          if (!window.confirm("确认取消本单？")) return;
          status = (states.find((state) => state.name.indexOf("取消") >= 0) ?? states[states.length - 1])?.name ?? status;
        } else if (action === "确认已当面告知") {
          status = (states.find((state) => state.name.indexOf("已确认") >= 0) ?? states[states.length - 1])?.name ?? status;
        }
        apply();
      });
    }
    apply();
  }

  function applyFormModes() {
    const modes = config.formModes;
    if (!modes) return;
    const params = new URLSearchParams(location.search);
    const current = modes.find((mode) => mode.name === params.get("mode")) ?? modes[0];
    const submit = document.querySelector(".app-actions [data-action]");
    const customer = document.querySelector('[data-field=customer] input');
    const host = document.querySelector(".app-scroll");
    const rawAppointmentId = params.get("appointmentId") ?? config.referenceId;
    const appointmentId =
      rawAppointmentId && rawAppointmentId !== "null" && rawAppointmentId !== "undefined"
        ? rawAppointmentId
        : null;
    const pageTitle = document.querySelector(".page-title");
    if (pageTitle) {
      pageTitle.textContent =
        current.name === "reschedule" ? "改期预约" : "新增预约";
    }
    const dateParam = params.get("date");
    const timeParam = params.get("time");
    const startInput = document.querySelector('input[name="startTime"]');
    const endInput = document.querySelector('input[name="endTime"]');
    if (dateParam && timeParam) {
      const start = new Date(dateParam + "T" + timeParam + ":00");
      if (!Number.isNaN(start.getTime())) {
        if (startInput) startInput.value = dateParam + "T" + timeParam;
        if (endInput) {
          const end = new Date(start.getTime() + 60 * 60 * 1000);
          const pad = (value) => String(value).padStart(2, "0");
          endInput.value =
            end.getFullYear() +
            "-" +
            pad(end.getMonth() + 1) +
            "-" +
            pad(end.getDate()) +
            "T" +
            pad(end.getHours()) +
            ":" +
            pad(end.getMinutes());
        }
      }
    }
    const recordKey =
      params.get("recordId") ?? params.get("appointmentId") ?? config.referenceId;
    let rescheduleRecord = null;
    if (current.name === "reschedule" && recordKey && !(dateParam && timeParam)) {
      const rawRecord = sessionStorage.getItem("prd-ui:appointment:" + recordKey);
      if (rawRecord) {
        try {
          const record = JSON.parse(rawRecord);
          rescheduleRecord = record;
          const pad = (value) => String(value).padStart(2, "0");
          const timeText = typeof record.time === "string" ? record.time : "";
          const dateMatch = /(\\d{1,2})-(\\d{1,2})\\s*周([一二三四五六日])/.exec(timeText);
          const timeMatch =
            /(\\d{1,2}):(\\d{2})\\s*[-–]\\s*(\\d{1,2}):(\\d{2})/.exec(timeText);
          let isoDate = null;
          if (dateMatch) {
            const weekday = "一二三四五六日".indexOf(dateMatch[3]);
            const month = Number(dateMatch[1]);
            const day = Number(dateMatch[2]);
            const baseYear = new Date().getFullYear();
            for (const delta of [0, -1, 1, -2, 2]) {
              const year = baseYear + delta;
              const candidate = new Date(year, month - 1, day);
              if (
                candidate.getFullYear() === year &&
                candidate.getMonth() === month - 1 &&
                candidate.getDate() === day &&
                (candidate.getDay() + 6) % 7 === weekday
              ) {
                isoDate = year + "-" + pad(month) + "-" + pad(day);
                break;
              }
            }
          }
          if (typeof record.customer === "string" && customer) {
            customer.value = record.customer;
          }
          const project = document.querySelector('input[name="project"]');
          if (typeof record.project === "string" && project) {
            project.value = record.project;
          }
          const therapist = document.querySelector('input[name="therapist"]');
          if (typeof record.therapist === "string" && therapist) {
            therapist.value = record.therapist;
          }
          if (isoDate && timeMatch) {
            if (startInput) {
              startInput.value =
                isoDate + "T" + pad(Number(timeMatch[1])) + ":" + timeMatch[2];
            }
            if (endInput) {
              endInput.value =
                isoDate + "T" + pad(Number(timeMatch[3])) + ":" + timeMatch[4];
            }
          }
        } catch {
          // A malformed record is ignored; the locked form still renders.
        }
      }
    }
    const customerPickerButton = document.querySelector(
      '[data-field=customer] [data-action="选择客户"]'
    );
    const apply = () => {
      if (submit) {
        submit.textContent = current.actions[0] ?? submit.textContent;
        submit.dataset.action = current.actions[0] ?? submit.dataset.action;
        if (current.name === "reschedule" && rescheduleRecord === null) {
          submit.disabled = true;
        } else {
          submit.disabled = false;
        }
      }
      if (customer) customer.disabled = current.customerLocked === true;
      if (customerPickerButton) {
        customerPickerButton.disabled = current.customerLocked === true;
      }
      let banner = document.querySelector(".reschedule-context");
      if (current.name === "reschedule" && host) {
        if (!banner) {
          banner = document.createElement("div");
          banner.className = "reschedule-context";
          host.prepend(banner);
        }
        const title = document.createElement("strong");
        title.textContent = "正在改期";
        const summary = document.createElement("span");
        const parts = [
          rescheduleRecord === null ? "" : rescheduleRecord.customer,
          rescheduleRecord === null ? "" : rescheduleRecord.project,
          rescheduleRecord === null ? "" : rescheduleRecord.time,
          rescheduleRecord === null ? "" : rescheduleRecord.therapist,
        ].filter((part) => typeof part === "string" && part.length > 0);
        summary.textContent =
          parts.length > 0 ? parts.join(" · ") : "请从预约详情进入改期";
        banner.replaceChildren(title, summary);
        if (appointmentId) {
          const id = document.createElement("span");
          id.className = "reschedule-id";
          id.textContent = "预约 " + appointmentId;
          banner.append(id);
        }
      } else if (banner) {
        banner.remove();
      }
    };
    apply();
  }

  function applySearch() {
    const input = document.querySelector("[data-search-input]");
    if (!input) return;
    const rows = qsa("[data-search-text]");
    const idle = document.querySelector('[data-empty-kind="idle"]');
    const empty = document.querySelector('[data-empty-kind="empty"]');
    const apply = () => {
      const query = input.value.trim().toLowerCase();
      let visible = 0;
      for (const row of rows) {
        const text = (row.dataset.searchText ?? "").toLowerCase();
        const match = query.length > 0 && text.indexOf(query) >= 0;
        row.hidden = !match;
        if (match) visible += 1;
      }
      if (idle) idle.hidden = query.length > 0;
      if (empty) empty.hidden = query.length === 0 || visible > 0;
    };
    input.addEventListener("input", apply);
    const clear = document.querySelector('[data-action="清空关键词"]');
    if (clear) {
      clear.addEventListener("click", () => {
        input.value = "";
        apply();
        input.focus();
      });
    }
    apply();
  }

  function applyRowLinks() {
    // In picker mode a row click selects a customer instead of navigating.
    if (new URLSearchParams(location.search).get("mode") === "picker") return;
    const target =
      config.pageId === "customer-search"
        ? config.linkedRoutes.customer
        : config.pageId === "appointment-list"
          ? config.linkedRoutes.detail
          : undefined;
    if (!target) return;
    for (const row of qsa(".app-scroll .list-row")) {
      row.dataset.rowLink = "true";
      if (!row.querySelector(".row-chevron")) {
        const chevron = document.createElement("span");
        chevron.className = "row-chevron";
        chevron.textContent = "›";
        row.append(chevron);
      }
      row.addEventListener("click", () => {
        location.href = target;
      });
      row.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          row.click();
        }
      });
    }
  }

  function applyViews() {
    if (!config.views) return;
    const panels = qsa("[data-view-panel]");
    let current =
      new URLSearchParams(location.search).get("view") ??
      config.defaultView ??
      config.views[0];
    const toggle = document.querySelector("[data-view-toggle]");
    const apply = () => {
      for (const panel of panels) {
        panel.hidden = panel.dataset.viewPanel !== current;
      }
    };
    if (toggle) {
      toggle.addEventListener("click", () => {
        current = current === "calendar" ? "list" : "calendar";
        apply();
      });
    }
    for (const cell of qsa("[data-slot-date]")) {
      cell.addEventListener("click", () => {
        if (!config.linkedRoutes.create) {
          showHint("当前切片没有新增预约页");
          return;
        }
        location.href = config.linkedRoutes.create + "?mode=new&date=" + encodeURIComponent(cell.dataset.slotDate ?? "") + "&time=" + encodeURIComponent(cell.dataset.slotTime ?? "");
      });
    }
    for (const block of qsa("[data-block]")) {
      block.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          block.click();
        }
      });
      block.addEventListener("click", () => {
        let data = {};
        try {
          data = JSON.parse(block.dataset.block ?? "{}");
        } catch {
          return;
        }
        const labels = { title: "客户", subtitle: "项目", status: "状态", date: "日期", time: "时间" };
        const drawer = document.createElement("div");
        drawer.className = "detail-drawer";
        drawer.setAttribute("role", "dialog");
        drawer.setAttribute("aria-modal", "true");
        const card = document.createElement("div");
        card.className = "detail-drawer-card";
        for (const key of Object.keys(labels)) {
          if (!data[key]) continue;
          const line = document.createElement("p");
          line.textContent = labels[key] + "：" + data[key];
          card.append(line);
        }
        const detail = document.createElement("button");
        detail.type = "button";
        detail.className = "btn primary";
        detail.textContent = "查看完整详情";
        detail.addEventListener("click", () => {
          if (config.linkedRoutes.detail) location.href = config.linkedRoutes.detail;
          else showHint("当前切片没有预约详情页");
        });
        const close = document.createElement("button");
        close.type = "button";
        close.className = "btn secondary";
        close.textContent = "关闭";
        const closeDrawer = () => {
          drawer.remove();
          block.focus();
        };
        close.addEventListener("click", closeDrawer);
        drawer.addEventListener("keydown", (event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            closeDrawer();
          }
        });
        card.append(detail, close);
        drawer.append(card);
        drawer.addEventListener("click", (event) => {
          if (event.target === drawer) closeDrawer();
        });
        document.body.append(drawer);
        detail.focus();
      });
    }
    apply();
  }

  function applyPicker() {
    const params = new URLSearchParams(location.search);
    const pickerSearch = config.customerPicker;
    const pickerReturn = config.pickerReturnTo;
    const pickerPrefix = ${JSON.stringify(PICKER_STORAGE_PREFIX)};
    const originPrefix = ${JSON.stringify(FORM_ORIGIN_PREFIX)};
    const draftKey = pickerPrefix + config.pageId;
    const returnKey = pickerPrefix + "return";
    const originKey = originPrefix + config.pageId;
    if (document.body.dataset.pageKind === "form" && !sessionStorage.getItem(originKey)) {
      // Per-form origin: a picker is never an origin, cross-origin referrers
      // are ignored, and a direct open falls back to the index page.
      const referrer = document.referrer;
      let origin = "index.html";
      if (referrer && referrer.indexOf("mode=picker") < 0) {
        try {
          if (new URL(referrer, location.href).origin === location.origin) {
            origin = referrer;
          }
        } catch {
          // keep the index fallback
        }
      }
      sessionStorage.setItem(originKey, origin);
    }
    if (params.get("mode") === "picker") {
      const title = document.querySelector(".page-title");
      if (title) title.textContent = "选择客户";
    }
    if (pickerSearch && document.body.dataset.pageKind === "form") {
      const button = document.querySelector('[data-action="选择客户"]');
      if (button) {
        button.addEventListener("click", () => {
          const draft = {};
          for (const input of qsa(".app-scroll input, .app-scroll select")) {
            const key =
              input.name ||
              input.id ||
              input.closest("[data-field]")?.dataset.field;
            if (key) draft[key] = input.value;
          }
          sessionStorage.setItem(draftKey, JSON.stringify(draft));
          // The return flag survives a picker cancel/back, so the form can
          // restore the draft on reload even without a selected customer.
          sessionStorage.setItem(returnKey, config.pageId);
          location.href = pickerSearch + ".html?mode=picker&returnTo=" + config.pageId;
        });
      }
    }
    if (params.get("mode") === "picker" && pickerReturn) {
      for (const row of qsa("[data-search-text]")) {
        row.addEventListener("click", () => {
          // Only return to a page that is actually a mobile form; otherwise
          // fall back to the compiler-derived return target.
          const requestedReturn = params.get("returnTo");
          const allowed =
            requestedReturn !== null &&
            config.pageArchetypes?.[requestedReturn] === "mobile-form";
          const target = allowed ? requestedReturn : pickerReturn;
          if (!target) return;
          const selectedName = (row.dataset.searchText ?? "").split(" ")[0] ?? "";
          const targetDraftKey = pickerPrefix + target;
          const targetDraftRaw = sessionStorage.getItem(targetDraftKey);
          if (targetDraftRaw) {
            try {
              const draft = JSON.parse(targetDraftRaw);
              draft.customer = selectedName;
              sessionStorage.setItem(targetDraftKey, JSON.stringify(draft));
            } catch {
              // keep the draft as-is
            }
          }
          // The picker:return flag was set when the picker opened; leave it
          // for the form load. There is no global selected key.
          location.href = target + ".html";
        });
      }
    }
    if (document.body.dataset.pageKind === "form") {
      const hasPrefill = Boolean(params.get("date") && params.get("time"));
      const isPickerReturn = sessionStorage.getItem(returnKey) === config.pageId;
      if (hasPrefill) {
        // Calendar/list prefill always wins over a stale picker draft.
        sessionStorage.removeItem(draftKey);
        sessionStorage.removeItem(returnKey);
      } else if (isPickerReturn) {
        const draftRaw = sessionStorage.getItem(draftKey);
        if (draftRaw) {
          try {
            const draft = JSON.parse(draftRaw);
            for (const [name, value] of Object.entries(draft)) {
              const input =
                document.querySelector('[name="' + name + '"]') ||
                document.querySelector(
                  '[data-field="' + name + '"] input, [data-field="' + name + '"] select'
                );
              if (input) input.value = value;
            }
          } catch {
            sessionStorage.removeItem(draftKey);
          }
        }
        // The draft and return flag stay until save, form back, or a
        // calendar prefill; a reload restores the same draft again.
      }
      // Saving the form ends its own picker draft and origin.
      for (const button of qsa(".app-actions [data-action]")) {
        button.addEventListener("click", () => {
          sessionStorage.removeItem(draftKey);
          sessionStorage.removeItem(returnKey);
          sessionStorage.removeItem(originKey);
        });
      }
    }
  }

  function applyReadonlyState() {
    const state =
      new URLSearchParams(location.search).get("state") ??
      document.body.dataset.state;
    if (state !== "disabled") return;
    for (const control of qsa(
      ".app-scroll input, .app-scroll select, .app-scroll textarea"
    )) {
      control.disabled = true;
    }
    for (const button of qsa(".app-actions .btn, .app-scroll .btn")) {
      button.disabled = true;
    }
    if (document.body.dataset.pageKind === "form") {
      const host = document.querySelector(".app-scroll");
      if (host && !host.querySelector(".readonly-banner")) {
        const banner = document.createElement("div");
        banner.className = "readonly-banner";
        banner.textContent = "当前为只读状态，无法编辑或保存";
        host.prepend(banner);
      }
    }
  }

  function applyFilterActions() {
    for (const button of qsa('[data-action="清空筛选"]')) {
      button.addEventListener("click", () => {
        location.href = location.pathname;
      });
    }
  }

  function formatDateTime(value) {
    const match = /^(\\d{4})-(\\d{2})-(\\d{2})T(\\d{2}):(\\d{2})/.exec(value);
    return match === null
      ? value
      : match[1] + "-" + match[2] + "-" + match[3] + " " + match[4] + ":" + match[5];
  }

  function applyDateTimeDisplay() {
    for (const control of qsa(".datetime-control")) {
      const input = control.querySelector("input");
      const display = control.querySelector(".datetime-display");
      if (!input || !display) continue;
      const sync = () => {
        display.textContent = input.value ? formatDateTime(input.value) : input.placeholder;
        display.classList.toggle("filled", input.value !== "");
      };
      input.addEventListener("input", sync);
      input.addEventListener("change", sync);
      sync();
    }
  }

  function applyCalendarScroll() {
    const sync = (calendar) => {
      const scroll = calendar.querySelector(".calendar-scroll");
      if (!scroll) return;
      const overflow = scroll.scrollWidth > scroll.clientWidth + 1;
      const atEnd =
        !overflow || scroll.scrollLeft + scroll.clientWidth >= scroll.scrollWidth - 1;
      calendar.dataset.scrollable = overflow ? "true" : "false";
      calendar.dataset.scrollEnd = atEnd ? "true" : "false";
    };
    const calendars = qsa(".calendar");
    for (const calendar of calendars) {
      const scroll = calendar.querySelector(".calendar-scroll");
      if (!scroll) continue;
      scroll.addEventListener("scroll", () => sync(calendar), { passive: true });
      sync(calendar);
    }
    window.addEventListener(
      "resize",
      () => calendars.forEach((calendar) => sync(calendar)),
      { passive: true }
    );
  }

  applyBusinessStates();
  applyFormModes();
  applyDateTimeDisplay();
  applySearch();
  applyRowLinks();
  applyViews();
  applyCalendarScroll();
  applyPicker();
  applyReadonlyState();
  applyFilterActions();
})();
</script>`;
}

export function renderDocument(
  spec: PageSpec,
  profile: Profile,
  options: RenderOptions = {}
): string {
  renderPageNames = options.pageNames ?? {};
  renderPageRoutes = options.pageRoutes ?? {};
  renderPageArchetypes = options.pageArchetypes ?? {};
  renderSpec = spec;
  renderMotionContext = createMotionContext(spec);
  renderProject = spec.meta.project;
  renderPageId = spec.meta.pageId;
  const body = renderNode(spec.layout, profile);
  const linkedRoutes: Record<string, string> = {};
  for (const [key, route] of Object.entries(spec.linkedRoutes ?? {})) {
    const href = routeHref(route);
    if (href !== undefined) linkedRoutes[key] = href;
  }
  const formModeLabels =
    spec.formModes === undefined
      ? null
      : Object.fromEntries(
          spec.formModes.map((mode) => [
            mode.name,
            mode.name === "new" ? "新增预约" : mode.name === "reschedule" ? "改期" : mode.label,
          ])
        );
  const stateNotes: Record<string, string> = {};
  for (const state of spec.businessStates ?? []) {
    const note = readOnlyNote(state.note);
    if (note !== undefined) stateNotes[state.name] = note;
  }
  const config = {
    archetype: spec.meta.archetype,
    pageId: spec.meta.pageId,
    businessStates: spec.businessStates ?? null,
    formModes: spec.formModes ?? null,
    formModeLabels,
    stateNotes: Object.keys(stateNotes).length > 0 ? stateNotes : null,
    views: spec.views ?? null,
    defaultView: spec.defaultView ?? null,
    searchIdleTitle: spec.searchIdleTitle ?? null,
    currentStatus: spec.currentStatus ?? null,
    customerPicker: spec.customerPicker ?? null,
    pickerReturnTo: spec.pickerReturnTo ?? null,
    pageArchetypes: renderPageArchetypes,
    referenceId: spec.referenceId ?? null,
    linkedRoutes,
  };
  const hasInteraction =
    spec.meta.target === "mobile" &&
    (spec.businessStates !== undefined ||
      spec.formModes !== undefined ||
      spec.views !== undefined ||
      spec.searchIdleTitle !== undefined ||
      spec.customerPicker !== undefined ||
      spec.pickerReturnTo !== undefined);
  const pageKind = spec.meta.archetype === "mobile-form" ? "form" : spec.meta.archetype;
  const hasBackControl =
    spec.layout.type === "MobileShell" && spec.layout.props?.back === true;
  const backScript = hasBackControl
    ? `  <script>
    (() => {
      const back = document.querySelector(".back-icon");
      if (!back) return;
      const pickerPrefix = ${JSON.stringify(PICKER_STORAGE_PREFIX)};
      const originPrefix = ${JSON.stringify(FORM_ORIGIN_PREFIX)};
      const formDraftKey = ${JSON.stringify(formDraftKey(spec.meta.pageId))};
      const pickerReturnKey = ${JSON.stringify(pickerReturnKey())};
      const formOriginKey = ${JSON.stringify(formOriginKey(spec.meta.pageId))};
      back.addEventListener("click", () => {
        const pageKind = document.body.dataset.pageKind;
        if (pageKind === "form") {
          // Form back returns to its recorded origin, never to the picker.
          const origin = sessionStorage.getItem(formOriginKey) || "index.html";
          sessionStorage.removeItem(formDraftKey);
          sessionStorage.removeItem(pickerReturnKey);
          sessionStorage.removeItem(formOriginKey);
          location.href = origin;
          return;
        }
        if (pageKind === "detail") {
          // Detail back cancels every pending picker draft and form origin.
          for (const key of Object.keys(sessionStorage)) {
            if (key.indexOf(pickerPrefix) === 0) sessionStorage.removeItem(key);
          }
          for (const key of Object.keys(sessionStorage)) {
            if (key.indexOf(originPrefix) === 0) sessionStorage.removeItem(key);
          }
        }
        if (history.length > 1) history.back();
        else location.href = "index.html";
      });
    })();
  </script>`
    : "";
  const interactionMarkup = hasInteraction
    ? `  <script id="interaction-config" type="application/json">${JSON.stringify(config).replace(/</g, "\\u003c")}</script>
  ${renderInteractionScript()}`
    : "";
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>${esc(spec.meta.name)} · ${esc(spec.meta.project)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;600;700&family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap" rel="stylesheet" />
  <style>${renderCss(profile)}${renderMotionCss()}</style>
</head>
<body data-state="default" data-page-kind="${esc(pageKind)}">
  ${stateSwitcher()}
  ${body}
${backScript}
${interactionMarkup}
  <script>
    (() => {
      document.documentElement.dataset.motionFallback = ${JSON.stringify(spec.motion?.reducedMotion.fallback ?? "none")};
      const params = new URLSearchParams(location.search);
      const state = params.get("state");
      if (state) document.body.dataset.state = state;
    })();
  </script>
</body>
</html>`;
}

export function renderIndex(pages: PageSpec[]): string {
  const project = pages[0]?.meta.project ?? "PRD UI";
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(project)} · 页面索引</title>
  <style>
    :root{font-family:"Noto Sans SC","PingFang SC",system-ui,sans-serif;color:#111827;background:#F5F6F8;}
    body{margin:0;padding:48px;display:flex;flex-direction:column;gap:24px;align-items:center;}
    h1{font-size:24px;line-height:32px;margin:0;}
    p{font-size:14px;line-height:20px;color:#6B7280;margin:0;max-width:640px;text-align:center;}
    .pages{display:flex;gap:16px;flex-wrap:wrap;justify-content:center;}
    a.card{display:flex;flex-direction:column;gap:6px;padding:20px 24px;border-radius:12px;background:#fff;box-shadow:0 2px 12px rgba(17,24,39,.08);min-width:220px;color:#111827;text-decoration:none;}
    a.card:hover{box-shadow:0 4px 18px rgba(17,24,39,.14);}
    a.card strong{font-size:16px;color:#0F172A;}
    a.card span{font-size:12px;color:#6B7280;}
  </style>
</head>
<body>
  <h1>${esc(project)} · ${pages.length} 个页面</h1>
  <p>从 Page Spec 渲染的页面索引。点击进入页面预览；移动端页面可在右侧切换默认/空/加载/失败状态。</p>
  <div class="pages">
    ${pages
      .map(
        (page) =>
          `<a class="card" href="${esc(page.meta.pageId)}.html"><strong>${esc(page.meta.name)}</strong><span>${esc(page.meta.route)} · ${esc(page.meta.archetype)}</span></a>`
      )
      .join("")}
  </div>
</body>
</html>`;
}
