import type { PageSpec, Profile, SpecNode } from "@prd-ui/contracts";
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
}

let renderPageNames: Record<string, string> = {};
let renderPageRoutes: Record<string, string> = {};
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
  库存查询: "inventory_2",
  客户: "person",
  客户搜索: "search",
  预约列表: "calendar_month",
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

function statePanels(): string {
  return `
  <div class="state-panel loading" aria-hidden="true">
    <div class="skeleton short"></div>
    <div class="skeleton card"></div>
    <div class="skeleton card"></div>
  </div>
  <div class="state-panel error" aria-hidden="true">
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
    ${statePanels()}
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
      const nav = slot(node, "bottom-nav")
        .map((child) => renderNode(child, profile, depth + 1))
        .join("");
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
      const showTabs = props.showTabs !== false && nav.length > 0;
      const back = bool(props.back);
      const header =
        top ||
        (back
          ? `<header class="page-header"><span class="material-symbols-rounded back-icon">arrow_back_ios_new</span><h1 class="page-title">${esc(title)}</h1></header>`
          : titleSlot.length === 0
            ? `<header class="page-header"><h1 class="page-title">${esc(title)}</h1></header>`
            : "");
      return `<div class="app ${showTabs ? "has-tabs" : ""}" ${shellInteractionAttrs()}${motion.attrs}${inlineStyle("", motion.style)}>
  ${header}
  <main class="app-scroll">${titleSlot}${illustration}${body}${summary}${feed}${fields}${content}</main>
  ${actions.length > 0 ? `<div class="app-actions">${actions}</div>` : ""}
  ${showTabs ? `<nav class="tabbar">${nav}</nav>` : ""}
  ${statePanels()}
</div>`;
    }
    case "TopBar": {
      const storeName = str(props.storeName);
      const hasMessage = bool(props.hasMessage);
      return `<header class="topbar">
  <div class="topbar-store">${esc(storeName)}<span class="material-symbols-rounded topbar-chevron">expand_more</span></div>
  ${hasMessage ? `<span class="material-symbols-rounded topbar-bell">notifications</span>` : ""}
</header>`;
    }
    case "TabBar": {
      const items = stringArray(props.items);
      const active = str(props.active);
      return `<div class="tabbar-inner">${items
        .map(
          (item) => `<a class="tab ${item === active ? "active" : ""}" href="#">
  <span class="material-symbols-rounded tab-icon">${tabIcons[item] ?? "circle"}</span>
  <span class="tab-label">${esc(pageLabel(item))}</span>
</a>`
        )
        .join("")}</div>`;
    }
    case "BottomNav": {
      const items = stringArray(props.items);
      return `<div class="tabbar-inner">${items
        .map(
          (item) => `<a class="tab ${item === renderPageId ? "active" : ""}" href="#">
  <span class="material-symbols-rounded tab-icon">${tabIcons[item] ?? "circle"}</span>
  <span class="tab-label">${esc(pageLabel(item))}</span>
</a>`
        )
        .join("")}</div>`;
    }
    case "Stat": {
      return `<div class="stat">
  <span class="stat-label">${esc(props.label)}</span>
  <strong class="stat-value">${esc(props.value)}</strong>
</div>`;
    }
    case "List": {
      if (Array.isArray(props.items)) {
        return `<div class="list-text">${(props.items as unknown[])
          .map((item) => `<div class="list-text-row">${esc(item)}</div>`)
          .join("")}</div>`;
      }
      const count = Math.min(Math.max(Number(props.items) || 3, 1), 6);
      return `<div class="list-placeholder">${Array.from(
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
      return `<input class="input" name="${esc(name)}" type="${esc(inputType)}" placeholder="${esc(placeholder)}"${value ? ` value="${esc(value)}"` : ""} />`;
    }
    case "Select": {
      const options = stringArray(props.options);
      return `<select class="select">${options
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
      const art = illustrationSvg(str(props.illustration));
      const motion = motionAttrs(node, renderMotionContext);
      return `<section class="card"${motion.attrs}${inlineStyle("", motion.style)}>
  <div class="card-head">
    <h2 class="card-title">${esc(title)}</h2>
    ${art}
  </div>
  <div class="card-body">${children}</div>
</section>`;
    }
    case "Row": {
      const gap = str(props.gap);
      const variant = str(props.variant);
      return `<div class="row ${variant === "filter" ? "filter-row" : ""}" style="gap:${cssVar(gap)}">${children}</div>`;
    }
    case "Stack":
      return `<div class="stack">${children}</div>`;
    case "Grid":
      return `<div class="grid">${children}</div>`;
    case "Text":
      return `<span class="${typoClass(node.textRole)}">${esc(props.text)}</span>`;
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
      const dayItems = days.map((entry) => {
        if (typeof entry === "string") return { label: entry, date: "", today: false };
        const record = entry as Record<string, unknown>;
        return {
          label: str(record.label),
          date: str(record.date),
          today: bool(record.today),
        };
      });
      const rowCount = Math.max(hours.length, 1);
      const header = `<div class="calendar-corner"></div>${dayItems
        .map(
          (day) =>
            `<div class="calendar-day${day.today ? " today" : ""}"><span>${esc(day.label)}</span><span class="calendar-date">${esc(day.date)}</span></div>`
        )
        .join("")}`;
      const cells = hours
        .map((hour, hourIndex) => {
          const row = dayItems
            .map(
              (day, dayIndex) =>
                `<div class="calendar-cell" data-slot-date="${esc(day.date)}" data-slot-time="${esc(hour)}" style="grid-column:${dayIndex + 2};grid-row:${hourIndex + 2}"></div>`
            )
            .join("");
          return `<div class="calendar-hour" style="grid-column:1;grid-row:${hourIndex + 2}">${esc(hour)}</div>${row}`;
        })
        .join("");
      const blockHtml = blocks
        .map((entry) => {
          const record = entry as Record<string, unknown>;
          const day =
            typeof record.day === "number"
              ? Math.max(0, Math.min(Math.max(dayItems.length - 1, 0), record.day))
              : 0;
          const start = typeof record.start === "number" ? record.start : 9;
          const duration = typeof record.duration === "number" ? record.duration : 1;
          const rowStart = Math.max(0, Math.min(rowCount - 1, start - 9)) + 2;
          const span = Math.max(1, Math.min(duration, rowCount - (rowStart - 2)));
          const tone = str(record.tone) || "neutral";
          const payload = {
            title: str(record.title),
            subtitle: str(record.subtitle),
            status: str(record.status),
            date: dayItems[day]?.date ?? "",
            time: `${String(start).padStart(2, "0")}:00`,
          };
          return `<div class="calendar-block tone-${esc(tone)}" data-block="${esc(JSON.stringify(payload))}" style="grid-column:${day + 2};grid-row:${rowStart} / span ${span}" title="${esc(record.title)} ${esc(record.subtitle)}">
  <span class="calendar-block-title">${esc(record.title)}</span>
  <span class="calendar-block-subtitle">${esc(record.subtitle)}</span>
</div>`;
        })
        .join("");
      const viewPanel = str(props.viewPanel);
      const motion = motionAttrs(node, renderMotionContext);
      return `<div class="calendar"${viewPanel ? ` data-view-panel="${esc(viewPanel)}"` : ""}${motion.attrs}${inlineStyle("", motion.style)}><div class="calendar-scroll"><div class="calendar-grid" style="grid-template-rows:36px repeat(${rowCount},44px)">${header}${cells}${blockHtml}</div></div></div>`;
    }
    case "ListRow": {
      const title = str(props.title);
      const subtitle = str(props.subtitle);
      const meta = str(props.meta);
      const status = str(props.status);
      const statusTone = str(props.statusTone) || "neutral";
      const searchText = str(props.searchText);
      const motion = motionAttrs(node, renderMotionContext);
      return `<div class="list-row"${searchText ? ` data-search-text="${esc(searchText)}"` : ""}${motion.attrs}${inlineStyle("", motion.style)}>
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
      return `<span class="badge tone-${esc(tone)}">${esc(label)}</span>`;
    }
    case "SearchBar": {
      const placeholder = str(props.placeholder);
      return `<div class="searchbar">
  <span class="material-symbols-rounded search-icon">search</span>
  <input class="search-input" data-search-input placeholder="${esc(placeholder)}" />
</div>`;
    }
    case "CollapsedFilter": {
      const label = str(props.label);
      const value = str(props.value);
      return `<button class="filter" type="button">
  <span class="filter-label">${esc(label)}</span>
  <span class="filter-value">${esc(value)}</span>
  <span class="material-symbols-rounded filter-chevron">expand_more</span>
</button>`;
    }
    case "Switch": {
      const label = str(props.label);
      const value = str(props.value);
      const state = str(props.state) || "off";
      return `<div class="switch-row">
  <span class="switch-label">${esc(label)}</span>
  <span class="switch ${state === "on" ? "on" : "off"}"><span class="switch-thumb"></span></span>
  <span class="switch-value">${esc(value)}</span>
</div>`;
    }
    case "SummaryRow":
      return `<div class="summary">${esc(props.text)}</div>`;
    case "InventoryCard": {
      const attributes = Array.isArray(props.attributes)
        ? (props.attributes as Array<{ label?: unknown; value?: unknown }>)
        : [];
      const badge = str(props.badge);
      const badgeTone = str(props.badgeTone) || "neutral";
      const inTransit = str(props.inTransit);
      return `<article class="inventory-card">
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
      return `<div class="empty-state"${emptyKind ? ` data-empty-kind="${esc(emptyKind)}"` : ""}>
  ${icon ? `<span class="material-symbols-rounded empty-icon">${iconName(icon)}</span>` : ""}
  <div class="empty-title">${esc(title)}</div>
  ${description ? `<div class="empty-desc">${esc(description)}</div>` : ""}
  ${children ? `<div class="empty-actions">${children}</div>` : ""}
</div>`;
    }
    case "Skeleton":
      return `<div class="skeleton card"></div>`;
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
.app-actions .btn{flex:1;white-space:nowrap;}
.topbar{height:48px;flex:0 0 48px;padding:0 var(--space-4);display:flex;align-items:center;justify-content:space-between;background:var(--color-surface-subtle);position:relative;z-index:5;}
.topbar-store{font-size:var(--type-heading-2-size);line-height:var(--type-heading-2-line);font-weight:var(--type-heading-2-weight);display:flex;align-items:center;gap:2px;}
.topbar-chevron{font-size:20px;color:var(--color-text-secondary);}
.topbar-bell{font-size:24px;color:var(--color-text-primary);}
.page-header{height:48px;flex:0 0 48px;padding:0 var(--space-4);display:flex;align-items:center;gap:var(--space-2);background:var(--color-surface-subtle);}
.back-icon{font-size:20px;}
.page-title{margin:0;font-size:var(--type-heading-2-size);line-height:var(--type-heading-2-line);font-weight:var(--type-heading-2-weight);}
.tabbar{flex:0 0 64px;height:64px;background:var(--color-surface-default);border-top:1px solid var(--color-border-subtle);}
.tabbar-inner{height:100%;display:flex;align-items:center;justify-content:space-around;padding-bottom:env(safe-area-inset-bottom,0);}
.tab{display:flex;flex-direction:column;align-items:center;gap:2px;color:var(--color-text-tertiary);min-width:56px;}
.tab.active{color:var(--color-action-primary);}
.tab-icon{font-size:22px;}
.tab-label{font-size:var(--type-label-sm-size);line-height:var(--type-label-sm-line);font-weight:var(--type-label-sm-weight);}
.section{display:flex;flex-direction:column;}
.row{display:flex;align-items:stretch;}
.stack{display:flex;flex-direction:column;}
.grid{display:grid;grid-template-columns:repeat(4,1fr);}
.card{background:var(--color-surface-default);border-radius:var(--radius-lg);padding:var(--space-4);box-shadow:0 1px 2px rgba(17,24,39,.04);}
.card-head{display:flex;align-items:center;justify-content:space-between;gap:var(--space-3);}
.card-illustration{width:80px;height:56px;flex:0 0 80px;display:block;}
.card-title{margin:0;font-size:var(--type-heading-2-size);line-height:var(--type-heading-2-line);font-weight:var(--type-heading-2-weight);}
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
.filter-row{display:flex;align-items:center;gap:var(--space-2);flex-wrap:wrap;}
.filter-row .btn{flex:0 0 auto;white-space:nowrap;}
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
.calendar{background:var(--color-surface-default);border-radius:var(--radius-lg);box-shadow:0 1px 2px rgba(17,24,39,.04);overflow:hidden;}
.calendar-scroll{overflow-x:auto;overflow-y:hidden;}
.calendar-grid{display:grid;grid-template-columns:44px repeat(7,minmax(44px,1fr));min-width:360px;position:relative;}
.calendar-corner{grid-column:1;grid-row:1;background:var(--color-surface-subtle);border-bottom:1px solid var(--color-border-subtle);}
.calendar-day{grid-row:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;font-size:var(--type-label-sm-size);line-height:var(--type-label-sm-line);color:var(--color-text-secondary);background:var(--color-surface-subtle);border-left:1px solid var(--color-border-subtle);border-bottom:1px solid var(--color-border-subtle);}
.calendar-day.today{background:color-mix(in srgb,var(--color-status-info) 10%,white);color:var(--color-status-info);font-weight:600;}
.calendar-date{font-size:10px;line-height:12px;color:var(--color-text-tertiary);}
.calendar-day.today .calendar-date{color:var(--color-status-info);}
.calendar-hour{grid-column:1;font-size:9px;line-height:11px;color:var(--color-text-tertiary);display:flex;justify-content:flex-end;padding:2px 4px 0 0;}
.calendar-cell{border-top:1px solid var(--color-border-subtle);border-left:1px solid var(--color-border-subtle);}
.calendar-block{margin:1px;padding:3px 4px;border-radius:var(--radius-sm);overflow:hidden;z-index:1;background:var(--color-surface-subtle);border-left:3px solid var(--color-border-strong);font-size:9px;line-height:11px;}
.calendar-block-title{display:block;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.calendar-block-subtitle{display:block;color:var(--color-text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
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
body[data-state="empty"] .list-row,body[data-state="empty"] .inventory-card,body[data-state="empty"] .calendar{display:none;}
body[data-state="empty"] .typo-heading-3{display:none;}
body[data-state="empty"] .summary{display:none;}
.state-panel{display:none;position:absolute;left:0;right:0;top:48px;bottom:0;z-index:30;background:var(--color-surface-subtle);padding:var(--space-4);flex-direction:column;gap:var(--space-3);}
.app.has-tabs .state-panel{bottom:64px;}
body[data-state="loading"] .state-panel.loading{display:flex;}
body[data-state="error"] .state-panel.error{display:flex;align-items:center;justify-content:center;}
.skeleton{border-radius:var(--radius-lg);background:linear-gradient(90deg,#E7E9ED 25%,#FCFCFD 37%,#E7E9ED 63%);background-size:400% 100%;animation:shimmer 1.4s ease infinite;}
.skeleton.short{height:48px;}
.skeleton.card{height:140px;}
.error-box{display:flex;flex-direction:column;align-items:center;gap:6px;text-align:center;}
.error-icon{font-size:40px;color:var(--color-text-tertiary);}
.error-title{font-size:var(--type-heading-3-size);line-height:var(--type-heading-3-line);font-weight:var(--type-heading-3-weight);}
.error-desc{font-size:var(--type-body-sm-size);line-height:var(--type-body-sm-line);color:var(--color-text-secondary);}
.btn{height:36px;padding:0 var(--space-4);border:0;border-radius:var(--radius-md);font-size:var(--type-body-md-size);line-height:var(--type-body-md-line);font-weight:var(--type-body-md-weight);}
.btn.primary{background:var(--color-action-primary);color:var(--color-text-onAction);}
.btn.secondary{background:#fff;border:1px solid #CBD5E1;color:var(--color-text-primary);}
.btn.ghost{background:transparent;color:var(--color-text-secondary);}
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
.list-text-row{padding:10px 0;border-bottom:1px solid #F1F5F9;font-size:14px;color:#334155;}
.list-text-row:last-child{border-bottom:0;}
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
.mode-tabs{display:flex;gap:8px;padding:12px 16px 0;}
.mode-tabs button{height:32px;border:1px solid var(--color-border-strong);border-radius:6px;background:#fff;font:inherit;font-size:13px;}
.mode-tabs button.active{background:var(--color-action-primary);color:#fff;border-color:var(--color-action-primary);}
.appointment-id{font-size:12px;color:var(--color-text-tertiary);padding:4px 16px;}
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

  function applyBusinessStates() {
    const states = config.businessStates;
    if (!states) return;
    let status = config.currentStatus ?? states[0]?.name;
    const currentState = () => states.find((state) => state.name === status);
    const allowed = () => currentState()?.actions ?? [];
    const bar = document.querySelector(".app-actions");
    const noteHost = document.querySelector(".app-scroll");
    const apply = () => {
      let visibleInBar = 0;
      for (const button of qsa("[data-action]")) {
        const isAllowed = allowed().includes(button.dataset.action);
        button.hidden = !isAllowed;
        if (isAllowed && bar && bar.contains(button)) visibleInBar += 1;
      }
      if (bar) bar.hidden = visibleInBar === 0;
      const badge = document.querySelector(".app-scroll .badge");
      if (badge) badge.textContent = status;
      const statusField = document.querySelector('[data-field="status"] .form-value, [data-field="status"] .form-readonly');
      if (statusField) statusField.textContent = status;
      for (const row of qsa(".app-scroll .list-text-row")) {
        if ((row.textContent ?? "").indexOf("状态:") === 0) row.textContent = "状态: " + status;
      }
      if (status === "已确认") {
        const confirmedBy = document.querySelector('[data-field="confirmedBy"] .form-value');
        const confirmedAt = document.querySelector('[data-field="confirmedAt"] .form-value');
        const byValue = confirmedBy && (confirmedBy.textContent ?? "").trim() !== "—"
          ? confirmedBy.textContent
          : "当前员工";
        const atValue = confirmedAt && (confirmedAt.textContent ?? "").trim() !== "—"
          ? confirmedAt.textContent
          : new Date().toLocaleString("zh-CN", { hour12: false });
        if (confirmedBy && (confirmedBy.textContent ?? "").trim() === "—") {
          confirmedBy.textContent = byValue;
        }
        if (confirmedAt && (confirmedAt.textContent ?? "").trim() === "—") {
          confirmedAt.textContent = atValue;
        }
        for (const row of qsa(".app-scroll .list-text-row")) {
          const text = row.textContent ?? "";
          if (text.indexOf("确认人:") === 0 && text.indexOf("—") >= 0) row.textContent = "确认人: " + byValue;
          if (text.indexOf("确认时间:") === 0 && text.indexOf("—") >= 0) row.textContent = "确认时间: " + atValue;
        }
      }
      let note = document.querySelector(".state-note");
      if (currentState()?.note) {
        if (!note && noteHost) {
          note = document.createElement("div");
          note.className = "state-note";
          noteHost.append(note);
        }
        if (note) note.textContent = currentState().note;
      } else if (note) {
        note.remove();
      }
    };
    for (const button of qsa("[data-action]")) {
      button.addEventListener("click", () => {
        const action = button.dataset.action;
        if (action === "改期" && config.linkedRoutes.form) {
          location.href = config.linkedRoutes.form + "?mode=reschedule&appointmentId=" + encodeURIComponent(config.referenceId);
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
    let current = modes.find((mode) => mode.name === params.get("mode")) ?? modes[0];
    const submit = document.querySelector(".app-actions [data-action]");
    const customer = document.querySelector('[data-field="customer"] input');
    const host = document.querySelector(".app-scroll");
    const tabs = document.createElement("div");
    tabs.className = "mode-tabs";
    if (modes.length > 1 && host) {
      for (const mode of modes) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = mode.label;
        button.addEventListener("click", () => {
          current = mode;
          const appointmentId = params.get("appointmentId") ?? config.referenceId;
          history.replaceState(null, "", "?mode=" + mode.name + "&appointmentId=" + encodeURIComponent(appointmentId));
          apply();
        });
        tabs.append(button);
      }
      host.prepend(tabs);
    }
    const appointmentId = params.get("appointmentId") ?? config.referenceId;
    const prefill = params.get("date") && params.get("time") ? params.get("date") + " " + params.get("time") : "";
    const startInput = document.querySelector('input[name="startTime"]');
    if (startInput && prefill) startInput.value = prefill;
    const apply = () => {
      for (const button of Array.from(tabs.children)) {
        button.classList.toggle("active", button.textContent === current.label);
      }
      if (submit) {
        submit.textContent = current.actions[0] ?? submit.textContent;
        submit.dataset.action = current.actions[0] ?? submit.dataset.action;
      }
      if (customer) customer.disabled = current.customerLocked === true;
      let id = document.querySelector(".appointment-id");
      if (current.name === "reschedule") {
        if (!id && host) {
          id = document.createElement("div");
          id.className = "appointment-id";
          host.prepend(id);
        }
        if (id) id.textContent = "预约 " + appointmentId;
      } else if (id) {
        id.remove();
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
    const target =
      config.pageId === "customer-search"
        ? config.linkedRoutes.customer
        : config.pageId === "appointment-list"
          ? config.linkedRoutes.detail
          : undefined;
    if (!target) return;
    for (const row of qsa(".app-scroll .list-row")) {
      row.dataset.rowLink = "true";
      row.addEventListener("click", () => {
        location.href = target;
      });
    }
    for (const button of qsa('[data-action="查看详情"]')) {
      button.addEventListener("click", () => {
        location.href = target;
      });
    }
  }

  function applyViews() {
    if (!config.views) return;
    const panels = qsa("[data-view-panel]");
    let current = config.defaultView ?? config.views[0];
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
        close.addEventListener("click", () => drawer.remove());
        card.append(detail, close);
        drawer.append(card);
        drawer.addEventListener("click", (event) => {
          if (event.target === drawer) drawer.remove();
        });
        document.body.append(drawer);
      });
    }
    for (const button of qsa('[data-action="查看完整详情"]')) {
      button.addEventListener("click", () => {
        if (config.linkedRoutes.detail) location.href = config.linkedRoutes.detail;
        else showHint("当前切片没有预约详情页");
      });
    }
    apply();
  }

  applyBusinessStates();
  applyFormModes();
  applySearch();
  applyRowLinks();
  applyViews();
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
  const config = {
    archetype: spec.meta.archetype,
    pageId: spec.meta.pageId,
    businessStates: spec.businessStates ?? null,
    formModes: spec.formModes ?? null,
    views: spec.views ?? null,
    defaultView: spec.defaultView ?? null,
    searchIdleTitle: spec.searchIdleTitle ?? null,
    currentStatus: spec.currentStatus ?? null,
    referenceId: spec.referenceId ?? spec.meta.pageId,
    linkedRoutes,
  };
  const hasInteraction =
    spec.meta.target === "mobile" &&
    (spec.businessStates !== undefined ||
      spec.formModes !== undefined ||
      spec.views !== undefined ||
      spec.searchIdleTitle !== undefined);
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
<body data-state="default">
  ${stateSwitcher()}
  ${body}
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
