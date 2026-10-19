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

function layoutStrings(root: PageSpec["layout"] | undefined): Set<string> {
  const found = new Set<string>();
  const visit = (node: NonNullable<PageSpec["layout"]>): void => {
    collectPropStrings(node.props, found);
    for (const child of node.children ?? []) visit(child);
    for (const nodes of Object.values(node.slots ?? {})) {
      for (const child of nodes) visit(child);
    }
  };
  if (root) visit(root);
  return found;
}

/**
 * Brief-to-spec semantic checks. These catch a spec that is structurally
 * valid but silently renders content from another page/project.
 *
 * - `SEMANTIC-META`: name, purpose, route, or roles differ from the brief page.
 * - `SEMANTIC-NAV`: the root shell's nav (web) or tabs (mobile) miss a brief item.
 * - `SEMANTIC-FIELD`: a brief field does not appear as an exact layout prop value
 *   (settings fields may appear as their localized label).
 * - `SEMANTIC-FILTER`: a brief filter field does not appear as an exact layout
 *   prop value.
 * - `SEMANTIC-ACTION`: a brief action does not appear as an exact layout prop value.
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
    // Every other mobile archetype must carry the brief's tabs; an omitted
    // `tabs` prop is a missing navigation, not a pass.
    if (spec.meta.archetype === "auth" || spec.meta.archetype === "onboarding") return;
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
  const strings = layoutStrings(spec.layout);

  for (const field of briefPage.fields ?? []) {
    const localized = briefPage.archetype === "settings" ? settingsFieldLabels[field] : undefined;
    if (!strings.has(field) && !(localized !== undefined && strings.has(localized))) {
      push(
        "SEMANTIC-FIELD",
        "layout",
        field,
        `Brief field "${field}" does not appear as an exact value in the page layout.`
      );
    }
  }

  for (const field of briefPage.filterFields ?? []) {
    if (!strings.has(field)) {
      push(
        "SEMANTIC-FILTER",
        "layout",
        field,
        `Brief filter field "${field}" does not appear as an exact value in the page layout.`
      );
    }
  }

  // Actions must be visibly rendered. Interactions only describe behaviour; a
  // trigger that never reaches the layout leaves the user without the control.
  for (const action of briefPage.actions ?? []) {
    if (!strings.has(action)) {
      push(
        "SEMANTIC-ACTION",
        "layout",
        action,
        `Brief action "${action}" does not appear as an exact value in the page layout.`
      );
    }
  }

  if (briefPage.emptyTitle !== undefined && !strings.has(briefPage.emptyTitle)) {
    push(
      "SEMANTIC-EMPTY",
      "layout",
      briefPage.emptyTitle,
      `Brief empty title "${briefPage.emptyTitle}" does not appear in the page layout.`
    );
  }
}
