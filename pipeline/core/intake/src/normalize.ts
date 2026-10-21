import type {
  NormalizedPrd,
  NormalizedPrdPlaceholder,
  NormalizedPrdSection,
  NormalizedPrdTable,
  NormalizedPrdTerm,
} from "@prd-ui/contracts";

export interface NormalizePrdInput {
  prdText: string;
  project: string;
  sourcePath: string;
  sourceHash: string;
  generatedAt: string;
}

export type RequiredSectionKey =
  | "business_scope"
  | "roles_permissions"
  | "page_inventory"
  | "state_matrix"
  | "field_tables"
  | "acceptance_examples"
  | "flows"
  | "navigation";

const REQUIRED_SECTION_KEYWORDS: Record<RequiredSectionKey, string[]> = {
  business_scope: ["业务范围", "范围", "scope", "in scope", "out of scope"],
  roles_permissions: ["角色", "权限", "role", "permission"],
  page_inventory: ["页面清单", "页面列表", "页面", "page inventory", "pages"],
  state_matrix: ["状态矩阵", "状态", "state matrix", "states"],
  field_tables: ["字段表", "字段", "field table", "fields"],
  acceptance_examples: ["验收示例", "验收", "acceptance", "examples"],
  flows: ["主流程", "流程", "flow", "flows"],
  navigation: ["导航", "navigation", "tab", "tabs"],
};

function lineText(lines: string[], start: number, end: number): string {
  return lines.slice(start, end).join("\n").trim();
}

function sectionId(index: number): string {
  return `sec-${String(index).padStart(3, "0")}`;
}

function headingLevel(line: string): number | undefined {
  const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
  return match?.[1]?.length;
}

function headingTitle(line: string): string {
  return /^(?:#{1,6})\s+(.+?)\s*$/.exec(line)?.[1] ?? line.trim();
}

function buildSections(lines: string[], title: string): NormalizedPrdSection[] {
  const headings: Array<{ index: number; level: number; heading: string }> = [];
  lines.forEach((line, index) => {
    const level = headingLevel(line);
    if (level !== undefined) {
      headings.push({ index, level, heading: headingTitle(line) });
    }
  });

  if (headings.length === 0) {
    return [
      {
        id: sectionId(1),
        heading: title,
        level: 1,
        lineStart: 1,
        lineEnd: Math.max(lines.length, 1),
        text: lines.join("\n").trim(),
      },
    ];
  }

  const sections: NormalizedPrdSection[] = [];
  const firstHeading = headings[0]!;
  if (firstHeading.index > 0) {
    const preamble = lineText(lines, 0, firstHeading.index);
    if (preamble.length > 0) {
      sections.push({
        id: sectionId(0),
        heading: "Preamble",
        level: 1,
        lineStart: 1,
        lineEnd: firstHeading.index,
        text: preamble,
      });
    }
  }

  headings.forEach((entry, index) => {
    const next = headings[index + 1];
    const end = next === undefined ? lines.length : next.index;
    sections.push({
      id: sectionId(index + 1),
      heading: entry.heading,
      level: entry.level,
      lineStart: entry.index + 1,
      lineEnd: end,
      text: lineText(lines, entry.index, end),
    });
  });

  return sections;
}

function findSection(
  sections: NormalizedPrdSection[],
  lineNumber: number
): NormalizedPrdSection | undefined {
  return sections.find(
    (section) => lineNumber >= section.lineStart && lineNumber <= section.lineEnd
  );
}

function collectPlaceholders(
  lines: string[],
  sections: NormalizedPrdSection[]
): NormalizedPrdPlaceholder[] {
  const placeholders: NormalizedPrdPlaceholder[] = [];
  const seen = new Set<string>();
  const push = (placeholder: NormalizedPrdPlaceholder): void => {
    const key = `${placeholder.kind}:${placeholder.location}:${placeholder.text}`;
    if (seen.has(key)) return;
    seen.add(key);
    placeholders.push(placeholder);
  };

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const section = findSection(sections, lineNumber);
    const location = `${section?.id ?? "doc"}:${lineNumber}`;
    const isHeading = /^#{1,6}\s+/.test(line);
    const nonBlocking =
      /不阻塞|non-blocking|not blocking/i.test(line) ||
      /不阻塞|non-blocking|not blocking/i.test(section?.heading ?? "") ||
      // A section title such as "待确认事项" is an index, not an unresolved value.
      (isHeading && /待确认/.test(line));
    const blocking = nonBlocking ? false : undefined;
    for (const match of line.matchAll(/【[^】]*】/g)) {
      push({
        kind: "bracket",
        location,
        text: match[0],
        ...(blocking === undefined ? {} : { blocking }),
      });
    }
    if (/\bTBD\b/i.test(line)) {
      push({
        kind: "tbd",
        location,
        text: line.trim(),
        ...(blocking === undefined ? {} : { blocking }),
      });
    }
    if (/\bTODO\b/i.test(line)) {
      push({
        kind: "todo",
        location,
        text: line.trim(),
        ...(blocking === undefined ? {} : { blocking }),
      });
    }
    if (/待确认|待补充|待定/.test(line)) {
      push({
        kind: "todo",
        location,
        text: line.trim(),
        ...(blocking === undefined ? {} : { blocking }),
      });
    }
    if (/\.\.\.|…/.test(line)) {
      push({
        kind: "ellipsis",
        location,
        text: line.trim(),
        ...(blocking === undefined ? {} : { blocking }),
      });
    }
  });

  for (const section of sections) {
    const body = section.text.replace(/^#{1,6}\s+.*$/m, "").trim();
    const hasChild = sections.some(
      (other) =>
        other.id !== section.id &&
        other.lineStart > section.lineStart &&
        other.lineStart <= section.lineEnd + 1 &&
        other.level > section.level
    );
    if (body.length === 0 && !hasChild) {
      push({
        kind: "empty-section",
        location: section.id,
        text: section.heading,
      });
    }
  }

  return placeholders;
}

function parseTableCells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function isTableSeparator(line: string): boolean {
  return /^\s*\|?[\s:-]+\|[\s|:-]*$/.test(line);
}

function collectTables(
  lines: string[],
  sections: NormalizedPrdSection[]
): NormalizedPrdTable[] {
  const tables: NormalizedPrdTable[] = [];
  let index = 0;
  while (index < lines.length) {
    if (!lines[index]!.trim().startsWith("|")) {
      index += 1;
      continue;
    }
    const start = index;
    const block: string[] = [];
    while (index < lines.length && lines[index]!.trim().startsWith("|")) {
      block.push(lines[index]!);
      index += 1;
    }
    if (block.length < 2) continue;
    const headers = parseTableCells(block[0]!);
    const dataRows = block
      .slice(1)
      .filter((line) => !isTableSeparator(line))
      .map(parseTableCells);
    if (headers.length === 0 || dataRows.length === 0) continue;
    const section = findSection(sections, start + 1);
    tables.push({
      id: `tbl-${String(tables.length + 1).padStart(3, "0")}`,
      sectionId: section?.id ?? "doc",
      headers,
      rows: dataRows,
      lineStart: start + 1,
    });
  }
  return tables;
}

function collectTerms(lines: string[]): NormalizedPrdTerm[] {
  const counts = new Map<string, { count: number; variants: Set<string> }>();
  const text = lines.join("\n");
  const candidates: string[] = [];
  for (const match of text.matchAll(/`([^`\n]{2,40})`/g)) {
    if (match[1] !== undefined) candidates.push(match[1].trim());
  }
  for (const match of text.matchAll(/\b[A-Za-z][A-Za-z0-9_-]{2,}\b/g)) {
    candidates.push(match[0]);
  }
  for (const candidate of candidates) {
    const term = candidate.toLowerCase();
    const current = counts.get(term) ?? { count: 0, variants: new Set<string>() };
    current.count += 1;
    current.variants.add(candidate);
    counts.set(term, current);
  }
  return [...counts.entries()]
    .filter(([, value]) => value.count >= 2)
    .map(([term, value]) => ({
      term,
      count: value.count,
      variants: [...value.variants].sort(),
    }))
    .sort((a, b) => a.term.localeCompare(b.term));
}

export function normalizePrd(input: NormalizePrdInput): NormalizedPrd {
  if (input.prdText.length > 200_000) {
    throw new Error("PRD_INPUT_INVALID: PRD exceeds the 200 KB intake limit");
  }
  const normalizedText = input.prdText.replace(/\r\n?/g, "\n");
  const lines = normalizedText.split("\n");
  const title =
    lines.find((line) => /^#\s+/.test(line)) !== undefined
      ? headingTitle(lines.find((line) => /^#\s+/.test(line))!)
      : (lines.find((line) => line.trim().length > 0)?.trim() ?? "Untitled PRD");

  const sections = buildSections(lines, title);
  return {
    schemaVersion: "1.0",
    project: input.project,
    sourcePath: input.sourcePath,
    sourceHash: input.sourceHash,
    title,
    sections,
    placeholders: collectPlaceholders(lines, sections),
    tables: collectTables(lines, sections),
    terms: collectTerms(lines),
    generatedAt: input.generatedAt,
  };
}

function normalizedHeading(heading: string): string {
  return heading.toLowerCase();
}

/** Map canonical required sections to the headings that satisfy them. */
export function findRequiredSections(
  prd: NormalizedPrd
): Record<RequiredSectionKey, NormalizedPrdSection[]> {
  const result = {} as Record<RequiredSectionKey, NormalizedPrdSection[]>;
  for (const [key, keywords] of Object.entries(REQUIRED_SECTION_KEYWORDS) as Array<
    [RequiredSectionKey, string[]]
  >) {
    result[key] = prd.sections.filter((section) => {
      const heading = normalizedHeading(section.heading);
      return keywords.some((keyword) => heading.includes(keyword.toLowerCase()));
    });
  }
  return result;
}

export function sectionLocation(section: NormalizedPrdSection): string {
  return `${section.id} (${section.heading})`;
}
