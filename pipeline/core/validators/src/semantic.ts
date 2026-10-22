import type { Finding, PageSpec, UiBriefPage } from "@prd-ui/contracts";
import { finalizeFindings, type FindingDraft, type ValidationContext } from "./types.js";

/** Roles are sets for semantic comparison; declaration order is irrelevant. */
function sameRoles(actual: string[], expected: string[]): boolean {
  const left = [...actual].sort();
  const right = [...expected].sort();
  return left.length === right.length && left.every((role, index) => role === right[index]);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

/**
 * Settings labels are localized by the settings template. This map mirrors the
 * template's display copy so the validator can independently verify the page:
 * a localized label proves the field reached the layout just as a raw key does.
 */
const settingsFieldLabels: Record<string, string> = {
  notifications: "通知设置",
  language: "语言",
  timezone: "时区",
};

/**
 * Collect exact string values from every node's `props`. Node type names and
 * text roles are deliberately excluded: a field named "Button" must not be
 * satisfied by the component type that happens to render it.
 */
function collectPropStrings(value: unknown, found: Set<string>): void {
  if (typeof value === "string") {
    found.add(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectPropStrings(item, found);
    return;
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) collectPropStrings(item, found);
  }
}

function propString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function propStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

interface ListRowFacts {
  title?: string;
  subtitle?: string;
  meta?: string;
  status?: string;
  trailing?: string;
}

interface LayoutFacts {
  strings: Set<string>;
  formFieldIds: Set<string>;
  formFieldLabels: Set<string>;
  tableColumns: Set<string>;
  tableColumnLabels: Set<string>;
  listRows: ListRowFacts[];
  listItemLabels: Set<string>;
  listItemTexts: string[];
  hasSearchBar: boolean;
  hasCalendarGrid: boolean;
  badgeLabels: Set<string>;
  hasCardBadge: boolean;
}

function addString(target: Set<string>, value: unknown): void {
  const text = propString(value);
  if (text !== undefined) target.add(text);
}

/**
 * Structured facts about the layout. Semantic checks accept either an exact
 * prop string or a real component representation (a FormField label/id, a
 * DataTable column, a ListRow field, a summary List label, a SearchBar for a
 * keyword filter, a CalendarGrid for date/time, a badge for status, and so on).
 * This lets the renderer drop duplicate presentation nodes without weakening
 * the brief-to-spec contract.
 */
function collectLayoutFacts(root: PageSpec["layout"] | undefined): LayoutFacts {
  const facts: LayoutFacts = {
    strings: new Set(),
    formFieldIds: new Set(),
    formFieldLabels: new Set(),
    tableColumns: new Set(),
    tableColumnLabels: new Set(),
    listRows: [],
    listItemLabels: new Set(),
    listItemTexts: [],
    hasSearchBar: false,
    hasCalendarGrid: false,
    badgeLabels: new Set(),
    hasCardBadge: false,
  };

  const visit = (node: NonNullable<PageSpec["layout"]>): void => {
    const props = node.props ?? {};
    collectPropStrings(props, facts.strings);

    switch (node.type) {
      case "FormField":
        addString(facts.formFieldIds, props.field);
        addString(facts.formFieldLabels, props.label);
        break;
      case "DataTable":
        for (const column of propStringArray(props.columns)) facts.tableColumns.add(column);
        for (const label of propStringArray(props.columnLabels)) facts.tableColumnLabels.add(label);
        break;
      case "ListRow":
        facts.listRows.push({
          title: propString(props.title),
          subtitle: propString(props.subtitle),
          meta: propString(props.meta),
          status: propString(props.status),
          trailing: propString(props.trailing),
        });
        break;
      case "List":
        if (Array.isArray(props.items)) {
          for (const item of props.items as unknown[]) {
            if (item !== null && typeof item === "object" && !Array.isArray(item)) {
              addString(facts.listItemLabels, (item as Record<string, unknown>).label);
            } else if (typeof item === "string") {
              facts.listItemTexts.push(item);
            }
          }
        }
        break;
      case "SearchBar":
        facts.hasSearchBar = true;
        break;
      case "CalendarGrid":
        facts.hasCalendarGrid = true;
        break;
      case "Badge":
        addString(facts.badgeLabels, props.label);
        break;
      case "Card":
        if (propString(props.badge) !== undefined) facts.hasCardBadge = true;
        break;
      default:
        break;
    }

    for (const child of node.children ?? []) visit(child);
    for (const nodes of Object.values(node.slots ?? {})) {
      for (const child of nodes) visit(child);
    }
  };

  if (root) visit(root);
  return facts;
}

/** A label/id counts when a prop uses it as a `label：value` prefix. */
function prefixedValue(values: Array<string | undefined>, candidates: string[]): boolean {
  for (const value of values) {
    if (value === undefined) continue;
    for (const candidate of candidates) {
      if (value === candidate) return true;
      if (value.includes(`${candidate}：`) || value.includes(`${candidate}:`)) return true;
    }
  }
  return false;
}

function fieldRepresented(
  field: string,
  localized: string | undefined,
  facts: LayoutFacts
): boolean {
  const candidates = localized === undefined ? [field] : [field, localized];
  if (candidates.some((candidate) => facts.strings.has(candidate))) return true;
  if (facts.formFieldIds.has(field)) return true;
  if (localized !== undefined && facts.formFieldLabels.has(localized)) return true;
  if (facts.tableColumns.has(field)) return true;
  if (localized !== undefined && facts.tableColumnLabels.has(localized)) return true;

  const rowValues = facts.listRows.flatMap((row) =>
    [row.title, row.subtitle, row.meta, row.status, row.trailing].filter(
      (value): value is string => value !== undefined
    )
  );
  if (prefixedValue(rowValues, candidates)) return true;
  if (facts.listItemLabels.has(field)) return true;
  if (localized !== undefined && facts.listItemLabels.has(localized)) return true;
  if (prefixedValue(facts.listItemTexts, candidates)) return true;

  const searchLike =
    field === "keyword" || field === "search" || localized === "关键词" || localized === "搜索";
  if (searchLike && facts.hasSearchBar) return true;

  const dateLike =
    field === "date" || field === "time" || localized === "日期" || localized === "时间段";
  if (dateLike && facts.hasCalendarGrid) return true;

  const statusLike = field === "status" || localized === "状态";
  if (
    statusLike &&
    (facts.hasCardBadge ||
      facts.badgeLabels.size > 0 ||
      facts.listRows.some((row) => row.status !== undefined))
  ) {
    return true;
  }

  return false;
}

function filterRepresented(
  field: string,
  localized: string | undefined,
  facts: LayoutFacts
): boolean {
  const candidates = localized === undefined ? [field] : [field, localized];
  if (candidates.some((candidate) => facts.strings.has(candidate))) return true;
  const searchLike =
    field === "keyword" || field === "search" || localized === "关键词" || localized === "搜索";
  return searchLike && facts.hasSearchBar;
}

function actionRepresented(
  action: string,
  facts: LayoutFacts,
  formModes: PageSpec["formModes"]
): boolean {
  if (facts.strings.has(action)) return true;
  if (
    formModes?.some(
      (mode) =>
        mode.name === action || mode.label === action || mode.actions.includes(action)
    ) === true
  ) {
    return true;
  }
  // Search is implicit: the SearchBar is the action affordance.
  return action === "搜索" && facts.hasSearchBar;
}

/**
 * Brief-to-spec semantic checks. These catch a spec that is structurally
 * valid but silently renders content from another page/project.
 *
 * - `SEMANTIC-META`: name, purpose, route, or roles differ from the brief page.
 * - `SEMANTIC-NAV`: the root shell's nav (web) or tabs (mobile) miss a brief item.
 * - `SEMANTIC-FIELD`: a brief field has no exact prop or structured representation
 *   (FormField, DataTable, ListRow, summary List label, SearchBar, CalendarGrid,
 *   badge).
 * - `SEMANTIC-FILTER`: a brief filter field has no exact prop or SearchBar.
 * - `SEMANTIC-ACTION`: a brief action has no exact prop, Button, form mode, or
 *   implicit SearchBar representation.
 * - `SEMANTIC-EMPTY`: the brief empty title does not appear in the layout.
 *
 * Every finding is a blocker. Checks are skipped when the corresponding piece
 * of brief context is absent, keeping direct/unit validation backward
 * compatible; the orchestrator always supplies both.
 */
export function validateSemantic(spec: PageSpec, ctx: ValidationContext): Finding[] {
  const { briefPage, navigation } = ctx;
  if (!briefPage && !navigation) return [];

  const drafts: FindingDraft[] = [];
  const push = (ruleId: string, location: string, evidence: string, issue: string): void => {
    drafts.push({
      ruleId,
      severity: "blocker",
      category: "semantic",
      location,
      evidence,
      issue,
    });
  };

  if (briefPage) {
    checkMeta(spec, briefPage, push);
    checkFieldsAndActions(spec, briefPage, push);
  }

  if (navigation) {
    checkNavigation(spec, navigation, push);
  }

  return finalizeFindings(drafts);
}

type Push = (ruleId: string, location: string, evidence: string, issue: string) => void;

function checkMeta(spec: PageSpec, briefPage: UiBriefPage, push: Push): void {
  const meta = spec.meta;
  const scalarChecks = [
    ["name", meta.name, briefPage.name],
    ["purpose", meta.purpose, briefPage.purpose],
    ["route", meta.route, briefPage.route],
  ] as const;

  for (const [field, actual, expected] of scalarChecks) {
    if (actual !== expected) {
      push(
        "SEMANTIC-META",
        `meta.${field}`,
        String(actual),
        `Page meta ${field} "${actual}" differs from the brief page ${field} "${expected}".`
      );
    }
  }

  const actualRoles = meta.roles ?? [];
  if (!sameRoles(actualRoles, briefPage.roles)) {
    push(
      "SEMANTIC-META",
      "meta.roles",
      JSON.stringify(actualRoles),
      `Page meta roles ${JSON.stringify(actualRoles)} differ from the brief page roles ${JSON.stringify(
        briefPage.roles
      )}.`
    );
  }
}

function checkNavigation(
  spec: PageSpec,
  navigation: NonNullable<ValidationContext["navigation"]>,
  push: Push
): void {
  const root = spec.layout;
  if (!root) return;

  if (root.type === "PageShell") {
    const nav = stringArray(root.props?.nav);
    for (const item of navigation.primary) {
      if (!nav.includes(item)) {
        push(
          "SEMANTIC-NAV",
          "layout.props.nav",
          item,
          `Root PageShell nav is missing primary navigation item "${item}" from the brief.`
        );
      }
    }
    return;
  }

  if (root.type === "MobileShell") {
    // Full-screen mobile pages (auth/onboarding) intentionally render no tabs.
    // Secondary mobile pages can opt out explicitly with `showTabs: false`.
    if (spec.meta.archetype === "auth" || spec.meta.archetype === "onboarding") return;
    if (root.props?.showTabs === false) return;
    const expectedTabs = navigation.tabs ?? navigation.primary;
    if (!Array.isArray(root.props?.tabs)) {
      push(
        "SEMANTIC-NAV",
        "layout.props.tabs",
        expectedTabs.join(", ") || "(none)",
        `Root MobileShell has no tabs; expected ${JSON.stringify(expectedTabs)} from the brief.`
      );
      return;
    }
    const tabs = stringArray(root.props.tabs);
    for (const item of expectedTabs) {
      if (!tabs.includes(item)) {
        push(
          "SEMANTIC-NAV",
          "layout.props.tabs",
          item,
          `Root MobileShell tabs are missing navigation tab "${item}" from the brief.`
        );
      }
    }
  }
}

function checkFieldsAndActions(spec: PageSpec, briefPage: UiBriefPage, push: Push): void {
  const facts = collectLayoutFacts(spec.layout);

  for (const field of briefPage.fields ?? []) {
    const localized =
      briefPage.fieldLabels?.[field] ??
      (briefPage.archetype === "settings" ? settingsFieldLabels[field] : undefined);
    if (!fieldRepresented(field, localized, facts)) {
      push(
        "SEMANTIC-FIELD",
        "layout",
        field,
        `Brief field "${field}" has no exact prop or structured representation in the page layout.`
      );
    }
  }

  for (const field of briefPage.filterFields ?? []) {
    const localized = briefPage.fieldLabels?.[field];
    if (!filterRepresented(field, localized, facts)) {
      push(
        "SEMANTIC-FILTER",
        "layout",
        field,
        `Brief filter field "${field}" has no exact prop or SearchBar representation in the page layout.`
      );
    }
  }

  // Actions must be visibly rendered. Interactions only describe behaviour; a
  // trigger that never reaches the layout leaves the user without the control.
  for (const action of briefPage.actions ?? []) {
    if (!actionRepresented(action, facts, spec.formModes)) {
      push(
        "SEMANTIC-ACTION",
        "layout",
        action,
        `Brief action "${action}" has no Button, form mode, or implicit SearchBar representation in the page layout.`
      );
    }
  }

  if (briefPage.emptyTitle !== undefined && !facts.strings.has(briefPage.emptyTitle)) {
    push(
      "SEMANTIC-EMPTY",
      "layout",
      briefPage.emptyTitle,
      `Brief empty title "${briefPage.emptyTitle}" does not appear in the page layout.`
    );
  }
}
