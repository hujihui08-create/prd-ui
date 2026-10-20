export type ArchetypeTarget = "web" | "mobile" | "any";

export interface ArchetypeDef {
  id: string;
  target: ArchetypeTarget;
  requiredSlots: string[];
  allowedComponents: string[];
  requiredStates: string[];
}

/**
 * Archetype baselines for the compiler templates.
 *
 * `allowedComponents` lists catalog components that may appear inside the page
 * body. It is template-scoped: components not emitted by an archetype's
 * compiler template (for example Sidebar/Header, which PageShell subsumes via
 * its `nav` prop) are deliberately omitted even though they exist in the
 * catalog. Layout primitives (Text/Grid/Row/Stack/Icon) are not catalog
 * components and are intentionally excluded; the root shell (PageShell for
 * web, MobileShell for mobile) is validated separately by the layout
 * validator because the compiler emits it as the page root.
 */
export const archetypes: ArchetypeDef[] = [
  {
    id: "overview",
    target: "web",
    requiredSlots: ["content"],
    allowedComponents: ["Section", "Stat", "Card", "List", "ListItem", "Badge", "Skeleton", "ErrorState"],
    requiredStates: ["default", "loading", "error"],
  },
  {
    id: "list",
    target: "web",
    requiredSlots: ["content"],
    allowedComponents: [
      "Section",
      "FilterBar",
      "DataTable",
      "Pagination",
      "Button",
      "EmptyState",
      "Skeleton",
      "ErrorState",
    ],
    requiredStates: ["default", "empty", "loading", "error"],
  },
  {
    id: "detail",
    target: "any",
    requiredSlots: ["summary", "fields", "actions"],
    allowedComponents: ["Section", "Card", "List", "ListItem", "Badge", "Button", "FormField", "Skeleton", "ErrorState"],
    requiredStates: ["default", "loading", "error"],
  },
  {
    id: "form",
    target: "web",
    requiredSlots: ["fields", "actions"],
    allowedComponents: ["Section", "FormField", "Input", "Select", "Button", "ErrorState"],
    requiredStates: ["default", "loading", "error", "disabled"],
  },
  {
    id: "settings",
    target: "web",
    requiredSlots: ["groups", "actions"],
    allowedComponents: ["Section", "Card", "FormField", "Input", "Select", "Button", "ErrorState"],
    requiredStates: ["default", "loading", "error"],
  },
  {
    id: "feed",
    target: "mobile",
    requiredSlots: ["feed", "bottom-nav"],
    allowedComponents: ["TopBar", "FeedCard", "Image", "Card", "BottomNav", "Skeleton", "EmptyState", "ErrorState"],
    requiredStates: ["default", "empty", "loading", "error"],
  },
  {
    id: "home",
    target: "mobile",
    requiredSlots: ["content", "bottom-nav"],
    allowedComponents: [
      "TopBar",
      "TabBar",
      "Section",
      "Card",
      "QuickAction",
      "ListRow",
      "Badge",
      "EmptyState",
      "Skeleton",
      "ErrorState",
      "Button",
    ],
    requiredStates: ["default", "empty", "loading", "error"],
  },
  {
    id: "inventory-list",
    target: "mobile",
    requiredSlots: ["content"],
    allowedComponents: [
      "Section",
      "SearchBar",
      "CollapsedFilter",
      "Switch",
      "SummaryRow",
      "InventoryCard",
      "Badge",
      "EmptyState",
      "Skeleton",
      "ErrorState",
      "Button",
      "TabBar",
    ],
    requiredStates: ["default", "empty", "loading", "error"],
  },
  {
    id: "auth",
    target: "mobile",
    requiredSlots: ["title", "fields", "actions"],
    allowedComponents: ["FormField", "Input", "Button", "ErrorState"],
    requiredStates: ["default", "loading", "error", "disabled"],
  },
  {
    id: "onboarding",
    target: "mobile",
    requiredSlots: ["illustration", "title", "body", "actions"],
    allowedComponents: ["Image", "Button", "StepIndicator", "Skeleton", "ErrorState"],
    requiredStates: ["default", "loading", "error"],
  },
];
