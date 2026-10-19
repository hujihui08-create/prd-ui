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
 * Brief-to-spec semantic checks. These catch a spec that is structurally
 * valid but silently renders content from another page/project.
 *
 * - `SEMANTIC-META`: name, purpose, route, or roles differ from the brief page.
 * - `SEMANTIC-NAV`: the root shell's nav (web) or tabs (mobile) miss a brief item.
 * - `SEMANTIC-FIELD`: a brief field does not appear anywhere in the layout JSON.
 * - `SEMANTIC-ACTION`: a brief action appears neither in the layout nor in an
 *   interaction trigger.
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
    // Full-screen mobile pages (auth/onboarding) intentionally render no tabs,
    // so only a declared tabs prop is cross-checked against the brief.
    if (!Array.isArray(root.props?.tabs)) return;
    const tabs = stringArray(root.props.tabs);
    for (const item of navigation.tabs ?? navigation.primary) {
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
  const layout = JSON.stringify(spec.layout ?? {});
  const interactions = spec.interactions ?? [];

  // The settings template maps known field keys to localized display labels
  // ("notifications" -> "通知设置") and therefore never serializes the raw key.
  // Literal matching cannot apply there; every other archetype renders fields
  // verbatim (columns, labels, or input names).
  if (briefPage.archetype !== "settings") {
    for (const field of briefPage.fields ?? []) {
      if (!layout.includes(field)) {
        push(
          "SEMANTIC-FIELD",
          "layout",
          field,
          `Brief field "${field}" does not appear in the page layout.`
        );
      }
    }
  }

  for (const action of briefPage.actions ?? []) {
    const rendered = layout.includes(action);
    const triggered = interactions.some((interaction) => interaction.trigger === action);
    if (!rendered && !triggered) {
      push(
        "SEMANTIC-ACTION",
        "layout",
        action,
        `Brief action "${action}" does not appear in the page layout or in interactions.`
      );
    }
  }

  if (briefPage.emptyTitle !== undefined && !layout.includes(briefPage.emptyTitle)) {
    push(
      "SEMANTIC-EMPTY",
      "layout",
      briefPage.emptyTitle,
      `Brief empty title "${briefPage.emptyTitle}" does not appear in the page layout.`
    );
  }
}
