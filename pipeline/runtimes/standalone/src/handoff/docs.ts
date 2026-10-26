import type { HandoffAsset, HandoffGate, HandoffSignoff } from "@prd-ui/contracts";

export interface HandoffDocsPage {
  pageId: string;
  name: string;
  route: string;
  archetype: string;
  states: string[];
}

export interface HandoffDocsInput {
  project: string;
  pages: HandoffDocsPage[];
  figma: {
    files: Array<{ pageId: string; fileKey: string }>;
    pages: string[];
  };
  gates: {
    verify: HandoffGate;
    conformance: HandoffGate;
    parity: HandoffGate;
    figmaSign: HandoffGate;
    visualSign: HandoffGate;
  };
  knownGaps: string[];
  assets: HandoffAsset[];
  profile?: string;
  catalog?: string;
  pipelineVersion?: string;
  signoffs?: HandoffSignoff[];
}

const PLACEHOLDER = /TBD|TODO|\{\{/;

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sortedPages(input: HandoffDocsInput): HandoffDocsPage[] {
  return [...input.pages].sort((left, right) => compareStrings(left.pageId, right.pageId));
}

function sortedFiles(input: HandoffDocsInput): Array<{ pageId: string; fileKey: string }> {
  return [...input.figma.files].sort((left, right) => compareStrings(left.pageId, right.pageId));
}

function sortedAssets(input: HandoffDocsInput): HandoffAsset[] {
  return [...input.assets].sort((left, right) => compareStrings(left.path, right.path));
}

function requireText(value: string | undefined, fallback: string): string {
  return value === undefined || value.trim().length === 0 ? fallback : value;
}

/** Fail closed when generated documentation still contains a placeholder. */
export function assertNoPlaceholders(text: string, source: string): void {
  if (PLACEHOLDER.test(text)) {
    throw new Error(`HANDOFF_PLACEHOLDER: ${source} contains TBD/TODO/{{`);
  }
}

function gateResult(gate: HandoffGate): string {
  return gate.passed ? "passed" : "failed";
}

function gateHash(gate: HandoffGate): string {
  return gate.hash.length === 0 ? "未生成" : `\`${gate.hash}\``;
}

export function generateHandoffMd(input: HandoffDocsInput): string {
  const pages = sortedPages(input);
  const files = sortedFiles(input);
  const pageName = (pageId: string): string =>
    pages.find((page) => page.pageId === pageId)?.name ?? pageId;
  const profile = requireText(input.profile, "未记录");
  const catalog = requireText(input.catalog, profile);
  const lines: string[] = [];

  lines.push(`# ${input.project} Handoff`, "");

  lines.push("## 1. 页面清单", "");
  lines.push("| 页面 | 路由 | Archetype | 状态 |");
  lines.push("| --- | --- | --- | --- |");
  for (const page of pages) {
    lines.push(
      `| ${page.name}（\`${page.pageId}\`） | \`${page.route}\` | \`${page.archetype}\` | ${page.states.join(", ")} |`
    );
  }
  lines.push("");

  lines.push("## 2. 本地查看", "");
  lines.push("```bash");
  lines.push("cd handoff");
  lines.push("python3 -m http.server 8080");
  lines.push("# open http://127.0.0.1:8080/html/<pageId>.html");
  lines.push("```", "");
  lines.push("可直接打开的页面：", "");
  for (const page of pages) {
    lines.push(`- \`html/${page.pageId}.html\` — ${page.name}`);
  }
  lines.push("");

  lines.push("## 3. 设计令牌与组件", "");
  lines.push(`- 流水线版本：\`${input.pipelineVersion ?? "0.7.0"}\``);
  lines.push(`- Profile：\`${profile}\``);
  lines.push(`- Catalog：\`${catalog}\``);
  lines.push("- 令牌、文本样式与组件清单：`figma/plans/figma-plan.<pageId>.json`");
  lines.push("- 页面渲染结果与组件类名：`html/<pageId>.html`");
  lines.push("- 设计系统包：`@prd-ui/design-system`");
  lines.push("");

  lines.push("## 4. Figma", "");
  lines.push("| 页面 | fileKey |");
  lines.push("| --- | --- |");
  for (const file of files) {
    lines.push(`| ${pageName(file.pageId)}（\`${file.pageId}\`） | \`${file.fileKey}\` |`);
  }
  lines.push("");
  lines.push(
    `Figma 页面：${input.figma.pages
      .map((pageId) => `${pageName(pageId)}（\`${pageId}\`）`)
      .join("、")}`
  );
  lines.push("");
  lines.push("Figma 文件以 fileKey 引用；本包不包含 `.fig` 二进制。");
  lines.push("");

  lines.push("## 5. 门禁与证据", "");
  lines.push("| 门禁 | 结果 | 证据 hash |");
  lines.push("| --- | --- | --- |");
  lines.push(`| figma:verify（每页 diff + readback） | ${gateResult(input.gates.verify)} | ${gateHash(input.gates.verify)} |`);
  lines.push(`| figma:conformance | ${gateResult(input.gates.conformance)} | ${gateHash(input.gates.conformance)} |`);
  lines.push(`| figma:parity | ${gateResult(input.gates.parity)} | ${gateHash(input.gates.parity)} |`);
  lines.push(`| Figma 人工签核 | ${gateResult(input.gates.figmaSign)} | ${gateHash(input.gates.figmaSign)} |`);
  lines.push(`| Visual 人工签核 | ${gateResult(input.gates.visualSign)} | ${gateHash(input.gates.visualSign)} |`);
  lines.push("");
  if (input.signoffs !== undefined && input.signoffs.length > 0) {
    const signoffs = [...input.signoffs].sort((left, right) =>
      compareStrings(left.type, right.type)
    );
    lines.push("| 签核 | 签核人 | 日期 | 签核 hash |");
    lines.push("| --- | --- | --- | --- |");
    for (const signoff of signoffs) {
      lines.push(
        `| ${signoff.type} | ${signoff.signedBy} | ${signoff.signedAt} | \`${signoff.hash}\` |`
      );
    }
    lines.push("");
  } else {
    lines.push("本包未包含签核记录。", "");
  }
  lines.push("证据位置：", "");
  lines.push("- `figma/plans/`、`figma/readback/`、`figma/evidence/`");
  lines.push("- `baseline/manifest.json` 与 baseline 截图");
  lines.push("- `signoffs/figma-sign.json`、`signoffs/visual-sign.json`");
  lines.push("- `evidence/`（spec-engineer、structure-lint、render-metrics，存在即包含）");
  lines.push("");

  lines.push("## 6. 已知限制", "");
  if (input.knownGaps.length === 0) {
    lines.push("- 无已知限制。");
  } else {
    for (const gap of input.knownGaps) lines.push(`- ${gap}`);
  }
  lines.push("");

  lines.push("## 7. 资产与授权", "");
  if (input.assets.length === 0) {
    lines.push("本交付包无第三方资产。");
  } else {
    lines.push(`本包包含 ${input.assets.length} 个资产文件，授权与字体说明见 \`LICENSES.md\`。`);
  }
  lines.push("");

  const text = lines.join("\n");
  assertNoPlaceholders(text, "HANDOFF.md");
  return text;
}

export function generateLicensesMd(input: HandoffDocsInput): string {
  const assets = sortedAssets(input);
  const lines: string[] = ["# 资产与授权", ""];
  if (assets.length === 0) {
    lines.push("本交付包无第三方资产。");
  } else {
    lines.push("| 资产 | 授权 |");
    lines.push("| --- | --- |");
    for (const asset of assets) {
      lines.push(`| \`${asset.path}\` | ${asset.license} |`);
    }
    lines.push("");
    lines.push("完整授权文本见 `assets/LICENSES.md`（如随资产包提供）。");
    lines.push("包内不分发字体文件；界面引用的图标字体依赖本地安装环境。");
  }
  lines.push("");
  const text = lines.join("\n");
  assertNoPlaceholders(text, "LICENSES.md");
  return text;
}
