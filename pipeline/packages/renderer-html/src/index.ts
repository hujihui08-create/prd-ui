import type { PageSpec, Profile, SpecNode } from "@prd-ui/contracts";

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
  客户: "person",
  工作台: "grid_view",
  我的: "settings",
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
    case "MobileShell": {
      const title = str(props.title);
      const top = slot(node, "top-bar")
        .map((child) => renderNode(child, profile, depth + 1))
        .join("");
      const content = slot(node, "content")
        .map((child) => renderNode(child, profile, depth + 1))
        .join("");
      const nav = slot(node, "bottom-nav")
        .map((child) => renderNode(child, profile, depth + 1))
        .join("");
      const showTabs = props.showTabs !== false;
      const back = bool(props.back);
      const header =
        top ||
        (back
          ? `<header class="page-header"><span class="material-symbols-rounded back-icon">arrow_back_ios_new</span><h1 class="page-title">${esc(title)}</h1></header>`
          : "");
      return `<div class="app ${showTabs ? "has-tabs" : ""}">
  ${header}
  <main class="app-scroll">${content}</main>
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
  <span class="tab-label">${esc(item)}</span>
</a>`
        )
        .join("")}</div>`;
    }
    case "Section": {
      const padding = str(props.padding);
      const gap = str(props.gap);
      return `<section class="section" style="padding:${cssVar(padding)};gap:${cssVar(gap)}">${children}</section>`;
    }
    case "Card": {
      const title = str(props.title);
      const art = illustrationSvg(str(props.illustration));
      return `<section class="card">
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
      return `<button class="quick-action tone-${esc(tone)}" type="button">
  <span class="material-symbols-rounded quick-icon">${iconName(icon)}</span>
  <span class="quick-label">${esc(label)}</span>
</button>`;
    }
    case "ListRow": {
      const title = str(props.title);
      const subtitle = str(props.subtitle);
      const meta = str(props.meta);
      const status = str(props.status);
      const statusTone = str(props.statusTone) || "neutral";
      return `<div class="list-row">
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
  <span class="search-placeholder">${esc(placeholder)}</span>
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
      return `<div class="empty-state">
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
      return `<button class="btn ${esc(emphasis)}" type="button">${esc(label)}</button>`;
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
${typeClasses(profile)}
.material-symbols-rounded{font-family:"Material Symbols Rounded";font-weight:normal;font-style:normal;font-size:24px;line-height:1;letter-spacing:normal;text-transform:none;display:inline-block;white-space:nowrap;direction:ltr;-webkit-font-smoothing:antialiased;font-variation-settings:"FILL" 1,"wght" 500,"GRAD" 0,"opsz" 24;}
.app{width:390px;height:844px;margin:0 auto;background:var(--color-surface-subtle);display:flex;flex-direction:column;position:relative;overflow:hidden;box-shadow:0 0 0 1px rgba(0,0,0,.04),0 24px 64px rgba(0,0,0,.12);}
.app-scroll{flex:1;overflow-y:auto;overflow-x:hidden;padding-bottom:var(--space-4);scrollbar-width:none;}
.app-scroll::-webkit-scrollbar{display:none;}
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
.list-row-main{flex:1;min-width:0;}
.list-row-title{display:flex;align-items:center;gap:6px;min-width:0;}
.row-title{font-size:var(--type-heading-3-size);line-height:var(--type-heading-3-line);font-weight:var(--type-heading-3-weight);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.row-subtitle{margin-top:2px;font-size:var(--type-body-sm-size);line-height:var(--type-body-sm-line);font-weight:var(--type-body-sm-weight);color:var(--color-text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.row-meta{display:flex;align-items:center;gap:2px;white-space:nowrap;font-size:var(--type-body-md-size);line-height:var(--type-body-md-line);font-weight:var(--type-body-md-weight);color:var(--color-text-secondary);}
.row-chevron{font-size:16px;color:var(--color-text-tertiary);}
.badge{display:inline-flex;align-items:center;height:20px;padding:0 6px;border-radius:var(--radius-sm);font-size:var(--type-label-strong-size);line-height:var(--type-label-strong-line);font-weight:var(--type-label-strong-weight);white-space:nowrap;}
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
.filter-row{display:flex;align-items:center;gap:var(--space-2);}
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
body[data-state="empty"] .empty-state{display:flex;}
body[data-state="empty"] .list-row,body[data-state="empty"] .inventory-card{display:none;}
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
.btn.secondary{background:var(--color-action-secondary);color:var(--color-text-primary);}
.btn.ghost{background:transparent;color:var(--color-text-secondary);}
.state-switcher{position:fixed;left:calc(50% + 230px);top:24px;display:flex;flex-direction:column;gap:6px;padding:12px 14px;border-radius:12px;background:#fff;box-shadow:0 4px 20px rgba(17,24,39,.12);font-size:12px;color:#6B7280;}
.state-switcher-label{font-weight:600;color:#111827;}
.state-switcher a{padding:2px 0;}
.state-switcher a:hover{color:#111827;}
@keyframes fade-up{from{opacity:0;transform:translateY(6px);}to{opacity:1;transform:none;}}
@keyframes shimmer{0%{background-position:100% 0;}100%{background-position:-100% 0;}}
@media (prefers-reduced-motion: reduce){*{animation:none !important;transition:none !important;}}
@media (max-width:700px){body{background:var(--color-surface-subtle);}.app{box-shadow:none;height:100vh;min-height:844px;}.state-switcher{display:none;}}`;
}

export function renderDocument(spec: PageSpec, profile: Profile): string {
  const body = renderNode(spec.layout, profile);
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>${esc(spec.meta.name)} · 员工端</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;600;700&family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap" rel="stylesheet" />
  <style>${renderCss(profile)}</style>
</head>
<body data-state="default">
  ${stateSwitcher()}
  ${body}
  <script>
    (() => {
      const params = new URLSearchParams(location.search);
      const state = params.get("state");
      if (state) document.body.dataset.state = state;
    })();
  </script>
</body>
</html>`;
}

export function renderIndex(pages: PageSpec[]): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>员工端 · 高保真切片</title>
  <style>
    :root{font-family:"Noto Sans SC","PingFang SC",system-ui,sans-serif;color:#111827;background:#F5F6F8;}
    body{margin:0;padding:48px;display:flex;flex-direction:column;gap:24px;align-items:center;}
    h1{font-size:24px;line-height:32px;margin:0;}
    p{font-size:14px;line-height:20px;color:#6B7280;margin:0;max-width:640px;text-align:center;}
    .pages{display:flex;gap:16px;flex-wrap:wrap;justify-content:center;}
    a.card{display:flex;flex-direction:column;gap:6px;padding:20px 24px;border-radius:12px;background:#fff;box-shadow:0 2px 12px rgba(17,24,39,.08);min-width:220px;}
    a.card strong{font-size:16px;}
    a.card span{font-size:12px;color:#6B7280;}
  </style>
</head>
<body>
  <h1>员工端 · 高保真切片</h1>
  <p>从 Page Spec + b-mobile profile 渲染的两页移动端原型：今日、库存查询。打开页面后可在右侧切换默认/空/加载/失败状态。</p>
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
