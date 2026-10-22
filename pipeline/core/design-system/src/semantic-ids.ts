export type SemanticKind =
  | "page" | "action" | "field" | "row" | "card" | "quick" | "view" | "calendar" | "state";

export function semanticNodeId(pageId: string, kind: SemanticKind, key: string): string {
  return `${pageId}.${kind}.${key}`;
}

export function kebab(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export const ACTION_KEYS: Record<string, string> = {
  已到店确认: "checkin",
  接单并确认到店: "checkin",
  开单: "open-order",
  改期: "reschedule",
  取消: "cancel",
  术后告知: "notice",
  查看告知: "view-notice",
  客户详情: "customer",
  查看预约: "view-appointment",
  回访登记: "callback",
  新增预约: "new-appointment",
  保存: "save",
  保存改期: "save-reschedule",
  选择客户: "pick-customer",
  确认已当面告知: "confirm",
  查看完整详情: "view-detail",
  查看详情: "view-detail",
  "切换日历/列表": "toggle-view",
  清空关键词: "clear",
  搜索: "search",
  保存回访: "save",
};

export const QUICK_KEYS: Record<string, string> = {
  开单: "create-order",
  预约: "new-appointment",
  新增预约: "new-appointment",
  客户搜索: "customer-search",
};

export const CARD_KEYS: Record<string, string> = {
  我的预约: "appointments",
  待回访: "callbacks",
  快捷操作: "quick-actions",
  预约详情摘要: "summary",
  预约摘要: "summary",
  术后告知摘要: "summary",
};
