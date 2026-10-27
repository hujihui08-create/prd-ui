import type { UiBrief } from "@prd-ui/contracts";

export interface StandardAssetInventory {
  icons: string[];
  illustrations: string[];
  images: string[];
  placeholders: string[];
}

const ICON_MAP: Record<string, string> = {
  home: "icon-home",
  today: "icon-home",
  inventory: "icon-package",
  "inventory-list": "icon-package",
  package: "icon-package",
  search: "icon-search",
  plus: "icon-plus",
  add: "icon-plus",
  new: "icon-plus",
  minus: "icon-minus",
  remove: "icon-minus",
  back: "icon-chevron-left",
  next: "icon-chevron-right",
  forward: "icon-chevron-right",
  alert: "icon-circle-alert",
  error: "icon-circle-alert",
  refresh: "icon-refresh-cw",
  retry: "icon-refresh-cw",
  user: "icon-user",
  customer: "icon-user",
};

const ARCHETYPE_ICONS: Record<string, string> = {
  home: "home",
  overview: "home",
  feed: "home",
  "inventory-list": "inventory",
  list: "search",
  "mobile-list": "search",
  auth: "user",
  detail: "user",
  settings: "settings",
};

const ACTION_HINTS: Record<string, string> = {
  新建: "plus",
  新增: "plus",
  搜索: "search",
  查询: "search",
  设置: "settings",
  返回: "back",
  下一步: "next",
  刷新: "refresh",
  重试: "refresh",
  客户: "user",
  顾客: "user",
  预约: "calendar",
  开单: "plus",
};

function addIcon(
  icons: Set<string>,
  placeholders: Set<string>,
  semantic: string
): void {
  const mapped = ICON_MAP[semantic];
  if (mapped === undefined) placeholders.add(semantic);
  else icons.add(mapped);
}

/**
 * Deterministic standard-icon inventory for the Visual Style Agent.
 *
 * The signed brief stays untouched: this is an input-only derivation. Icons
 * without an A-library mapping are surfaced as placeholders instead of being
 * invented as deliverable assets.
 */
export function deriveStandardAssetInventory(
  brief: UiBrief
): StandardAssetInventory {
  const icons = new Set<string>();
  const placeholders = new Set<string>();

  for (const page of brief.ia.pages) {
    const archetypeIcon = ARCHETYPE_ICONS[page.archetype];
    if (archetypeIcon !== undefined) addIcon(icons, placeholders, archetypeIcon);
    for (const action of page.actions ?? []) {
      const hint = Object.entries(ACTION_HINTS).find(([token]) =>
        action.label.includes(token)
      );
      if (hint !== undefined) addIcon(icons, placeholders, hint[1]);
    }
    for (const action of page.content?.quickActions ?? []) {
      addIcon(icons, placeholders, action.icon);
    }
    if (page.emptyAssetRef !== undefined) {
      addIcon(icons, placeholders, page.emptyAssetRef);
    }
  }
  for (const icon of brief.assets.icons) addIcon(icons, placeholders, icon);

  return {
    icons: [...icons].sort(),
    illustrations: [],
    images: [],
    placeholders: [...placeholders].sort(),
  };
}
