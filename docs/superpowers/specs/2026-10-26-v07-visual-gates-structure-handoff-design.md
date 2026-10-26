# v0.7 Phase 3B：视觉门禁、结构优化、分块生成与 Handoff 设计

- 日期：2026-10-26
- 状态：**Approved（用户确认范围与设计，未实施）**
- 输入：[v0.7 设计输入](2026-10-26-v07-visual-gates-structure-block-input.md)、[v0.6 门禁证据交接](../handoffs/2026-10-26-v06-figma-gate-evidence.md)、[版本路线](../plans/2026-10-23-version-roadmap.md)
- 关联：[v0.6 设计](2026-10-23-v06-figma-studio-asset-compiler-design.md)、[v0.5 设计](2026-10-23-v05-visual-a11y-closure-design.md)

## 0. 结论

v0.7 把「结构 diff 全绿、视觉全错」变成不可能，并把验证结果打包成可独立实现的交付物。

1. **Part A 视觉保真门禁**：fail-closed 映射（A1）、plan↔HTML 计算样式 conformance（A2）、Figma PNG↔HTML baseline parity（A3）、readback/diff 样式扩展（A4）。
2. **Part B 结构优化**：spec 级结构 lint（B1）、Playwright 渲染测量（B2）、两次 spec 的结构 diff（B3）。
3. **Part C 分块生成实验**：先做确定性分块/组装/门禁（C1/C2），再用 M1 在 today 与 appointment-list 两页做块级生成试点（C3），用指标决定推广或回退（C4）。
4. **Handoff Packager**：把 HTML、Page Spec、Figma 计划/证据、截图、资产、授权与签核打成目录 + manifest，开发可离线独立实现。

范围口径：**A/B/C + Handoff Packager**。C 采用「先 Spec 层，再 M1 试点」，不直接把整页生成替换成块级生成。Handoff 产出目录 + `handoff.manifest.json`，`--zip` 可选。

## 1. 现状与缺口

### 1.1 已完成

- v0.5 已签核；v0.6 自动化部分完成，真实 Figma 门禁 8/8 scratch + 8/8 delivery 结构 diff 全绿。
- `core/figma` 已有 plan 编译器与 readback diff；`runtimes/figma` 插件可在 Figma 桌面版构建原生图层、变量、文本样式、Button 实例。
- `runtimes/standalone` 已有 Playwright 截图、visual baseline、静态服务器、visual review/sign。
- `spec:engineer` 已写稳定语义节点 id；Phase 1 语义校验器可在 spec 阶段运行。
- `agent:run` 的 M1 已具备重试、预算、签核、失败隔离。

### 1.2 缺口

| 缺口 | 现状 | v0.7 处理 |
|---|---|---|
| plan 静默降级 | `compile-plan.ts` 的 `default` 把未知节点变成空 frame | A1 fail-closed + coverage |
| plan↔HTML 无校验 | `figma:verify` 只比 plan↔readback | A2 conformance |
| Figma 整页视觉无校验 | 结构 diff 看不见组合/节奏/颜色 | A3 parity |
| readback 样式字段不足 | 无四边 border、radius、fontWeight、textColor 等 | A4 扩展 |
| 结构问题只能人工看图 | 无空槽位/页高/重复块规则 | B1 结构 lint |
| 无渲染测量 | 页高、溢出、折叠位置未知 | B2 render:measure |
| 结构变化不可审阅 | 只能人重新看图 | B3 structure diff |
| 长页面只能整页生成 | 无块契约、无块级重试 | C 分块实验 |
| 交付物不能独立实现 | 只有分散的 run/HTML/证据 | Handoff Packager |

### 1.3 前置条件（Gate 0）

- v0.6 仍需人工并排视觉检查与签核；未签核前可以实施代码与确定性门禁，但不能宣称 v0.7 出口完成。
- v0.5 visual baseline 因 2026-10-26 的 CSS 改动而过期。v0.7 第一批必须重新生成 8 页 baseline 并由人签核；parity 只接受已签核 baseline。

## 2. 范围与非目标

### 2.1 范围

- `core/contracts`：coverage、conformance、parity、readback 扩展、structure lint、render metrics、structure diff、block、handoff 契约。
- `core/figma`：coverage 生成、conformance 纯比较器、parity 阈值判定。
- `core/validators`：结构 lint 与测量复核规则。
- `core/compiler`：结构 diff、块切分与组装。
- `core/handoff`：Handoff 校验与 manifest 组装（纯逻辑）。
- `runtimes/standalone`：`figma:conformance`、`figma:parity`、`figma:serve`、`figma:sign`、`render:measure`、`structure:check`、`structure:diff`、`block:verify`、`block:experiment`、`handoff:pack`。
- `runtimes/figma`：插件导出 PNG、自动 POST readback/PNG。
- `runtimes/dsh` / `core/agents`：M1 块级内容生成角色与 schema（复用 `prd-ui-agents` profile）。
- 8 页真实门禁：coverage、conformance、parity、verify 全绿并落盘。
- 三类缺陷注入验收：按钮样式、文案、行分隔线。
- today + appointment-list 两页块级 M1 试点与实验报告。
- 8 页完整 Handoff 包。

### 2.2 非目标

- 全量组件库、设计系统依赖、客户资产接入。
- Figma loading/empty/error/business 状态帧；v0.7 仍只覆盖 default frame。
- 完整 Material Symbols 矢量集；仍用 glyph text。
- Figma 全自动 headless 构建；插件仍由人在 Figma 桌面版运行。
- 自动收敛/自动改页面；B2 只测量。
- CI 集成；v0.7 先本地门禁。
- 生产代码直出、原型连线、Smart Animate。
- 分块生成直接替换整页生成；只有实验达标才在 v0.8 推广。

## 3. 设计原则

1. **冻结验证，不冻结资产**：组件、变体、页面结构按项目生成；门禁、证据格式、签核链固定。
2. **Fail-closed**：编译器表达不了的东西必须报错；缺证据、infra 失败、跳过原因缺失都不得判 pass。
3. **双轨验证**：结构（verify/coverage/structure）与视觉（conformance/parity）任何一轨都不能单独作为签核依据。
4. **单一事实来源**：能从 HTML/CSSOM 或 profile 派生，就不手写常量；合成节点 id 由 contracts 统一生成。
5. **证据可复现**：每个门禁产出 JSON，签核绑定 hash；同输入重跑结果一致。

## 4. 门禁链与证据

固定顺序：

```text
spec:engineer（Phase 1 + structure lint）
  → block:verify（启用分块时）
  → render:html
  → render:measure → structure:check --metrics
  → figma:plan（coverage）
  → Figma build（插件导出 PNG + readback）
  → figma:verify
  → figma:conformance（plan ↔ HTML）
  → figma:parity（Figma PNG ↔ baseline）
  → figma:sign
  → visual:review / visual:sign
  → handoff:pack
```

规则：

- 每一步写 JSON 证据；后一步读取前一步的 hash。
- `figma:sign` 绑定 `planHash`、`readbackHash`、`conformanceHash`、`parityHash`、`baselineHash`；任一变化即失效。
- `handoff:pack` 只在 `verify`、`conformance`、`parity`、`figma:sign`、`visual:sign` 全部通过且 hash 匹配时出包。
- infra 失败（浏览器启动失败、Figma 导不出、文件缺失）一律非零退出，不产生“通过”证据。

证据落盘：

```text
pipeline/artifacts/<project>/figma/
  plans/                     figma-plan.<page>.json + plan-coverage.json
  readback/                  figma-readback.<page>.json
  diff/                      figma-diff.<page>.json
  conformance/               style-manifest.json + conformance.json
  parity/                    figma.<page>.png + parity.json + diff/*.png
  signoff/                   figma-sign.json
pipeline/artifacts/<project>/render/
  metrics/render-metrics.json
  structure/structure-lint.json
  structure/structure-measured.json
pipeline/artifacts/<project>/blocks/
  block-manifest.<page>.json
  block-experiment.json
  block-experiment.md
pipeline/artifacts/<project>/handoff/
  HANDOFF.md
  LICENSES.md
  handoff.manifest.json
```

## 5. Part A — 视觉保真门禁

### 5.1 A1 Fail-closed 映射与 coverage

**目标**：未知组件、未知属性、无法表达的样式在 `figma:plan` 阶段显式失败，而不是变成空 frame。

plan 节点扩展（`FigmaPlanNode`，全部 optional 以兼容旧 plan）：

- `origin?: "spec" | "derived"`：来自 PageSpec 节点，还是编译器合成的结构节点。
- `mapping?: "mapped" | "degraded" | "unmapped"`：映射状态。
- `reason?: string`：degraded/unmapped 的原因，如 `UNMAPPED_COMPONENT:Chart`、`UNMAPPED_PROP:columns`。

`FigmaPlan` 增加：

```ts
coverage: {
  nodes: Array<{
    specId: string;
    specType: string;
    path: string;
    status: "mapped" | "degraded" | "unmapped" | "skipped";
    reason?: string;
  }>;
  summary: {
    spec: number;
    derived: number;
    mapped: number;
    degraded: number;
    unmapped: number;
    skipped: number;
  };
};
```

编译规则：

1. **未知 SpecNode 类型**：不再走 `default` 空 frame。生成一个 FRAME 节点，`name` 为 `Unmapped:<type>`，`mapping: "unmapped"`，`reason: "UNMAPPED_COMPONENT:<type>"`，保留可渲染的子节点，coverage 记 `unmapped`。
2. **已知类型、未知属性**：每个节点类型维护 `consumedProps` 白名单（编译器和 renderer 共同消费的 props，含决定 `shouldSkip` 的 `searchText`、`emptyKind`、`viewPanel` 等）与 `ignoredProps` 显式忽略表（纯交互/语义字段）。未在白名单且不在忽略表的 prop key 记为 `degraded`，reason 为 `UNMAPPED_PROP:<key>`。
3. **已知类型、无法表达的样式组合**：例如不支持的 shadow/border 组合，记 `degraded`，reason 为 `UNMAPPED_STYLE:<detail>`。
4. **跳过必须有 reason**：Skeleton、ErrorState、非 idle EmptyState、搜索行、非默认 viewPanel 等跳过节点进入 coverage，status 为 `skipped`，reason 对应 `SKIPPED_STATE`、`SKIPPED_SEARCH_RESULT`、`SKIPPED_VIEW_PANEL` 等。
5. **禁止静默空 frame**：任何空 children 的 FRAME 必须来自显式空状态（如 EmptyState）或在 coverage 中有对应说明。
6. **spec 节点必须有稳定 id**：`spec:engineer` 已为每个 SpecNode 写 id；plan 编译遇到缺 id 的节点时生成 `SPEC_NODE_ID_MISSING` blocker，不退回路径 id。A2 依赖 id 做 plan↔HTML 配对。

`figma:plan` 额外输出 `plan-coverage.json`：

```json
{
  "schemaVersion": "1.0",
  "project": "employee-app-phase2",
  "pages": [
    {
      "pageId": "today",
      "file": "figma-plan.today.json",
      "summary": {
        "spec": 42,
        "derived": 18,
        "mapped": 55,
        "degraded": 3,
        "unmapped": 0,
        "skipped": 2
      },
      "nodes": [
        {
          "specId": "today.quick.create-order",
          "specType": "Button",
          "path": "layout.slots.content[0].children[0]",
          "status": "mapped"
        }
      ]
    }
  ]
}
```

计数口径：`spec + derived` 是 coverage 节点总数；`mapped + degraded + unmapped + skipped` 是同一批节点的状态计数，两者相等。`derived` 节点也可以有 `mapped`/`degraded` 状态。

`figma:verify`：

- coverage 缺失 → blocker `COVERAGE_MISSING`。
- 任一 `unmapped` → blocker `UNMAPPED_COMPONENT`，带 `specId`。
- `degraded` → major `UNMAPPED_STYLE` / `UNMAPPED_PROP`，带 `specId` 和 reason。
- `skipped` 不产生 finding，但保留在报告中。

验收：构造含未知组件的 spec，`figma:plan` 产出 unmapped coverage，`figma:verify` 失败并指出 specId。

### 5.2 A2 Conformance（plan ↔ HTML 计算样式）

**目标**：在不打开 Figma 的情况下，让 plan 与 HTML 的视觉漂移变红。

#### 5.2.1 合成节点 id 约定

plan 编译器和 HTML renderer 必须使用同一套合成节点 id，否则 List 行、Tab、日历单元这些节点无法配对。

在 `core/contracts` 增加 `derivedNodeId(parentId, kind, index?)`：

```ts
derivedNodeId("today.list.appointments", "row", 0)
// => "today.list.appointments.row.0"
derivedNodeId("today.tabbar", "tab", 1)
// => "today.tabbar.tab.1"
```

material 合成节点集合（必须两侧都带 `data-node-id`）：

- List 的对象行与占位行（`row`）
- TabBar / BottomNav 的 tab（`tab`）
- CalendarGrid 的日期单元与色块（`cell` / `block`）
- DataTable 的 body 行（`row`）
- Stat、QuickAction 等重复项（沿用现有 id 约定）

非 material 的中间包裹节点（如 `TitleRow`、`Main`、`Meta`）标记 `origin: "derived"`，不要求 HTML 侧有对应节点。

#### 5.2.2 style manifest

`figma:conformance --spec-run <dir> --html <dir> --plans <dir> --out <dir>` 在 `runtimes/standalone` 运行：

1. 启动静态服务器，Playwright 打开每个页面 default 状态。
2. 固定 viewport（mobile 390×844，web 1440×900）、`deviceScaleFactor: 1`、禁用动画/过渡、等待字体加载。
3. 遍历 `[data-node-id]`，抽取计算样式：
   - `rect`：width、height
   - `padding`：top/right/bottom/left
   - `gap`：row-gap / column-gap
   - `border`：四边 width + color
   - `radius`：border-radius
   - `background`：background-color + alpha
   - `font`：font-size、font-weight、color、line-height、font-family
4. 输出 `style-manifest.json`。

#### 5.2.3 比较规则

`core/figma/src/conformance.ts` 是纯函数，输入 plan、style manifest、profile，输出报告。

按 plan 节点解析期望值：

- 颜色：plan 的 token 引用通过 `plan.tokens` 解析为 hex，再归一化为 RGBA。
- 缺省值按 Figma 行为：`padding`/`gap`/`radius`/`border` 缺省为 0，`fill` 缺省为 transparent。
- 文本：由 `textStyle` 解析字号/字重/行高，`color` 解析文本颜色。
- INSTANCE：由 `plan.components.Button.variants[variant]` 解析 height、radius、paddingX、fill、stroke、strokeAlpha、字号/字重/颜色。
- 固定尺寸：plan 显式声明的 width/height 参与比较；未声明则由 Figma Auto Layout 决定，不做比较。

属性矩阵：

| plan 节点 | 比较属性 |
|---|---|
| FRAME | padding、gap、radius、四边 border、fill + alpha、显式 width/height |
| TEXT | font-size、font-weight、color、line-height |
| INSTANCE | height、radius、paddingX/paddingY、fill、stroke、文本样式、label |
| GLYPH / IMAGE / VECTOR | 显式 size/width/height、color/fill |

节点存在性：

- `origin: "spec"` 且 `mapping` 为 `mapped`/`degraded` 的节点：HTML 与 plan 必须都存在。
- `origin: "derived"` 的 material 节点：按 id 配对，缺失即 blocker。
- `origin: "derived"` 的非 material 节点：不要求配对。
- `skipped` 节点：按 coverage reason 排除。
- HTML 存在 `data-node-id` 但 plan 无对应节点：blocker `CONFORMANCE_EXTRA_NODE`（除非在 renderer-only allowlist）。

容差：

- 尺寸、padding、gap、radius、border width：整数像素精确比较。
- 文本渲染导致的 ±1px 只允许出现在高度/宽度等布局几何上，且必须记录 `tolerance: 1`；字号、字重、行高不允许容差。
- 颜色：归一化后精确比较；alpha 允许 ±0.01。
- 字重：精确比较。

输出 `conformance.json`：

```json
{
  "schemaVersion": "1.0",
  "project": "employee-app-phase2",
  "generatedAt": "2026-10-26T00:00:00.000Z",
  "pages": [
    {
      "pageId": "today",
      "passed": true,
      "checked": 42,
      "skipped": 3,
      "findings": [
        {
          "code": "CONFORMANCE_STYLE_MISMATCH",
          "severity": "blocker",
          "specId": "today.card.appointments",
          "property": "borderBottom",
          "expected": "1px #E2E8F0",
          "actual": "0px",
          "message": "List row divider is missing in the plan."
        }
      ]
    }
  ],
  "summary": { "blockers": 0, "majors": 0, "pages": 8 }
}
```

CLI 退出码：0 无 blocker；1 有 blocker；2 用法或 infra 错误。

验收：

- 当前 8 页通过。
- 把 `ghost-chip` 高度改回 36，或删掉列表行底边，`figma:conformance` 必须失败。
- 换一个新项目（组件不同）不需要改测试代码即可运行。

### 5.3 A3 Parity（Figma PNG ↔ HTML baseline）

**目标**：结构全绿时仍能发现整页视觉错误。

#### 5.3.1 插件导出

`runtimes/figma/src/plugin.ts` 在 build 完成后：

1. 对页面根 frame 调用 `exportAsync({ format: "PNG", constraint: { type: "SCALE", value: 1 } })`。
2. 通过本地 server `POST /save/figma.<pageId>.png` 落盘。
3. 同时 `POST /save/figma-readback.<pageId>.json` 自动保存 readback（剪贴板保留为 fallback）。

`figma:serve --plans <dir> --out <dir> [--port 9600]`：

- `GET /plans/<file>` 返回 plan。
- `POST /save/<name>` 写入 out；只允许 `.json`、`.png`；文件名白名单 `figma-*` / `figma.*`；拒绝路径穿越。
- 带 CORS 头，供插件 UI 使用。
- 该命令替代 v0.6 的 `/tmp` 临时脚本，属于仓库内可复现设施。

#### 5.3.2 baseline

- 只使用 `visual:baseline` 生成的 default 状态、390×844、`deviceScaleFactor: 1`、已签核截图。
- baseline 必须由人运行并提交；`figma:parity` 只读。
- baseline 过期（manifest hash 与签核不符）→ parity 直接失败 `BASELINE_STALE`。

#### 5.3.3 比较

`figma:parity --figma <dir> --baseline <dir> --spec-run <dir> --out <dir> [--max-pixel-diff 0.005] [--min-ssim 0.98]`：

- 按 pageId 配对 `figma.<pageId>.png` 与 baseline 对应截图。
- 尺寸必须一致；不一致 → blocker `PARITY_SIZE_MISMATCH`。
- 像素差：逐像素比较 RGB，任一通道差 > 8 记为差异像素；`pixelDiffRatio = 差异像素 / 总像素`。
- SSIM：灰度图、8×8 窗口、均值。
- 通过条件：`pixelDiffRatio <= maxPixelDiff` 且 `ssim >= minSsim`。
- 输出 `parity.json`，包含每页分数、阈值、baseline/figma 文件 hash、diff 图路径；diff 图用红色标出差异像素。

阈值：

- 初始值 0.5% / 0.98。
- 8 页首轮运行后校准一次，把实测分数与最终阈值写入 `parity.config.json`，由人签核；之后不得静默放宽。
- 字体/抗锯齿噪声通过固定 viewport、等待字体、禁用动画、scale=1 消除；仍不达标时记录为已知限制，不以放宽阈值掩盖结构性错误。

验收：

- 当前 delivery 8 页通过。
- 人为去掉按钮边框，或把 tab 文案改成英文，parity 必须失败。
- 同输入两次运行分数一致。

### 5.4 A4 readback / diff 扩展

readback 节点增加可选字段：

- `cornerRadius?: number`
- `borderTop/borderBottom/borderLeft?: { width: number; color: string }`
- `fillDetails?: Array<{ color: string; alpha: number }>`（保留 `fills: string[]` 兼容旧证据）
- `fontWeight?: number`
- `textColor?: string`
- `lineHeight?: number`

插件 readback 读取上述字段；`diffFigma` 在 plan 声明了对应值时检查：

- 新增 finding codes：`FIGMA_BORDER_MISMATCH`、`FIGMA_RADIUS_MISMATCH`、`FIGMA_FILL_MISMATCH`、`FIGMA_FONT_WEIGHT_MISMATCH`、`FIGMA_TEXT_COLOR_MISMATCH`、`FIGMA_LINE_HEIGHT_MISMATCH`。
- readback 缺少新字段时记 minor `READBACK_STYLE_UNSUPPORTED`，不静默通过。
- A4 仍然只保证 plan↔readback，不能替代 A2。

### 5.5 Figma 签核

`pnpm figma:sign --figma <dir> --signoff-figma <file> [--json]`：

- 读取 `plans/`、`readback/`、`conformance/`、`parity/` 与已签核 baseline manifest。
- 用规范化 JSON（键排序、去掉 `generatedAt`/`builtAt` 等时间戳）计算五个 hash：`planHash`、`readbackHash`、`conformanceHash`、`parityHash`、`baselineHash`。
- signoff markdown 沿用现有 `<!-- signoff { ... } -->` 格式，必须包含 `signer`、`date`、五个 hash；缺失或不匹配即拒绝。
- 写 `signoff/figma-sign.json`：

```json
{
  "schemaVersion": "1.0",
  "project": "employee-app-phase2",
  "signer": "胡冀徽",
  "date": "2026-10-26",
  "planHash": "sha256:...",
  "readbackHash": "sha256:...",
  "conformanceHash": "sha256:...",
  "parityHash": "sha256:...",
  "baselineHash": "sha256:..."
}
```

- 任一页 `figma:verify`、`conformance`、`parity` 未通过 → 拒绝签核。
- 只有 `figma-sign.json` 存在且 hash 与当前证据一致时，Handoff 才允许出包。

## 6. Part B — 结构优化

### 6.1 B1 结构 lint（spec 级，确定性）

新增 `core/validators/src/structure.ts`，随 `spec:engineer` gate 运行。

规则：

| 规则 | 检查 | v0.7 严重度 |
|---|---|---|
| `STRUCTURE-EMPTY-SLOT` | 任何 slot 为空数组（required slot 已由 `LAYOUT-SLOT` blocker 覆盖） | warning |
| `STRUCTURE-REPEATED-SECTION` | 相同 Section 签名（规范化标题 + 子节点类型序列）出现超过阈值 | warning |
| `STRUCTURE-PAGE-HEIGHT` | 预估页高超过预算 | warning |
| `STRUCTURE-HEADING-SKIP` | heading 层级跳级（如 heading.1 → heading.3） | warning |
| `STRUCTURE-ORPHAN-ACTION` | Button 不在 actions/filter-row/footer/card-actions 内 | warning |
| `STRUCTURE-REPEATED-ROWS` | 3 个以上同构 ListRow 未用 List 表达 | warning |
| `STRUCTURE-SPACING-SCALE` | gap/padding 引用的 token 不在 profile 标尺 | warning |

阈值与默认值：

- 重复 Section：同一签名最多 2 个；`maxRepeatedSections` 可覆盖。
- 页高预算：mobile 2100px、web 2400px；`pageHeightBudget` 可覆盖。
- 页高预估器：按节点类型、profile space/typography、文本长度、列表项数做确定性估算；估算函数单独测试，误差不作为 blocker。
- 配置入口：`ProjectConfig.structure?` 可选；`ValidationContext.structure?` 传入；缺省用上述常量。

输出：`spec:engineer` 写 `findings/structure-lint.json`，含规则、位置、证据、阈值、配置。v0.7 不改变 gate 通过与否；稳定后可逐条升级为 blocker。

验收：构造空槽位、超预算页高、重复块三个样例，lint 必须分别报出。

### 6.2 B2 render-measure

`pnpm render:measure --spec-run <dir> --html <dir> --out <dir> [--json]`（standalone + Playwright）：

- 固定 viewport、时间、禁用动画、等待字体。
- 每页测量：
  - `documentHeight`
  - `.app-scroll` 的 clientHeight / scrollHeight / overflowY
  - 首屏内 `[data-node-id]` 节点数
  - 折叠位置：第一个完全越过 viewport 底部的节点
  - 横向溢出：最宽元素及其 specId / width
  - 固定 footer/CTA 是否存在、高度、是否遮挡内容
  - 内容底部到 footer 的距离
- 输出 `render-metrics.json`：

```json
{
  "schemaVersion": "1.0",
  "project": "employee-app-phase2",
  "pages": [
    {
      "pageId": "today",
      "viewport": { "width": 390, "height": 844 },
      "documentHeight": 1712,
      "scrollContainer": { "selector": ".app-scroll", "clientHeight": 716, "scrollHeight": 1712, "overflowY": "auto" },
      "firstScreenNodes": 18,
      "foldSpecId": "today.card.callbacks",
      "widest": { "specId": "today.calendar", "width": 390, "overflowX": false },
      "fixedFooter": { "present": true, "height": 64, "overlapsContent": false },
      "contentBottomGap": 16
    }
  ]
}
```

`structure:check --spec-run <dir> --metrics <file> --out <file>`：用实测值复核页高、溢出、折叠、固定 footer 遮挡，输出 `structure-measured.json`。v0.7 只报告，不自动改页面。

### 6.3 B3 structure diff

`pnpm structure:diff --before <spec-run> --after <spec-run> [--page <id>] --out <file>`：

- 在 `core/compiler` 实现页面树 diff。
- 匹配优先级：`node.id` → slot/path。
- 报告：节点新增/删除/移动、类型变化、slot 变化、标题/文案变化、子节点数量变化。
- 输出 `structure-diff.json`：

```json
{
  "schemaVersion": "1.0",
  "before": "run-...",
  "after": "run-...",
  "pages": [
    {
      "pageId": "today",
      "added": [],
      "removed": [],
      "changed": [
        { "specId": "today.card.appointments", "kind": "prop", "property": "title", "before": "今日预约", "after": "今日预约（新）" }
      ]
    }
  ]
}
```

结构 diff 是评审辅助，不设门禁；输入无效或页面缺失时非零退出。

## 7. Part C — 分块生成实验

### 7.1 C1 块边界与契约

**块边界**：

- 块 = 页面主内容槽下直属的 `Section` 或 `Card`。
- 页面壳（`MobileShell` / `PageShell`）、TopBar、TabBar、BottomNav、固定 actions/footer/CTA 永远属于组装层，不属于任何块。
- 嵌套 Section/Card 留在父块内部，不单独成块。
- 主内容槽由 archetype 声明（如 `content`、`summary`、`fields`、`sections`）；shell 槽（`top-bar`、`tab-bar`、`actions`、`footer`）不是块来源。

`BlockSpec`：

```ts
interface BlockSpec {
  schemaVersion: "1.0";
  blockId: string;              // 稳定：<pageId>.<slot>.<index>
  pageId: string;
  slot: string;
  index: number;
  role: string;                 // section type 或 card 标题 slug
  allowedComponents: string[];  // catalog 子集
  tokenProfile: string;
  targetHeight?: { min: number; max: number };
  requiredStates: string[];     // default/empty/loading/error 中适用者
  root: SpecNode;               // 块根，不允许 MobileShell/PageShell
  hash: string;                 // 规范化 root 的 sha256
}

interface BlockManifest {
  schemaVersion: "1.0";
  project: string;
  pageId: string;
  shell: { rootType: string; slots: string[] };
  blocks: BlockSpec[];
  skipped: Array<{ path: string; reason: string }>;
}
```

规则：

- 块内禁止跨块绝对定位；现有 `LAYOUT-ABSOLUTE` 继续生效。
- 块不拥有页面壳、header/footer/tab bar、固定 CTA。
- `blockId` 是 manifest 键，不替换现有节点 id：baseline 块的根与子节点沿用已签核 PageSpec 的稳定 id（motion bindings 依赖它们）。M1 新生成的节点必须带 `<blockId>.` 前缀，保证组装后唯一；组装层负责全局查重。
- assembly 层统一设置块间距与垂直节奏，间距只从 profile 取。

### 7.2 C2 确定性分块与组装

`core/compiler/src/blocks.ts`：

- `splitBlocks(spec, archetype): { shell, blocks, skipped }`
- `assembleBlocks(spec, manifest, blocks): PageSpec`
- `verifyBlockManifest(manifest, spec): Finding[]`

`spec:engineer` 为每页写 `artifacts/block-manifest/<pageId>.json`（不改变 gate 结果）。

`pnpm block:verify --spec-run <dir> --out <file>` 校验：

- 块契约：类型、slot、allowedComponents、tokenProfile、requiredStates。
- 块内：无 shell 节点、无绝对定位、id 前缀正确。
- 组装：id 唯一、顺序与 manifest 一致、块数量正确、无重复块签名。
- round-trip：split → assemble 必须与原始 layout 规范化后等价（对象键排序、数组顺序保持、忽略 `meta.version` 等非结构字段）；不等价即 blocker `BLOCK_ROUNDTRIP_MISMATCH`，并给出第一个差异路径。

先对 8 页跑通 split → assemble → Phase 1 → render → measure，确认无接缝回归，再进入 M1 试点。

### 7.3 C3 M1 块级试点

范围：只做 `today` 与 `appointment-list` 两页。

`pnpm block:experiment`：

```bash
pnpm block:experiment \
  --project samples/projects/employee-app-phase2/project.yaml \
  --baseline <spec-run> \
  --pages today,appointment-list \
  --fixtures samples/agents/blocks \
  --runs /tmp/block-experiment
```

或真实模型：

```bash
set -a; . ./.env; set +a
DSH_HOME="$PWD/dsh/home" pnpm block:experiment \
  --project samples/projects/employee-app-phase2/project.yaml \
  --baseline <spec-run> \
  --pages today,appointment-list \
  --runtime dsh --profile prd-ui-agents \
  --max-cost-cny 3 \
  --runs /tmp/block-experiment-dsh
```

流程：

1. 读取 baseline PageSpec，split 成 blocks。
2. 每个块调用块内容生成器：
   - `--fixtures`：从 `samples/agents/blocks/<pageId>/<blockId>.json` 读取，用于无 key 的确定性测试。
   - `--runtime dsh`：复用 `prd-ui-agents` profile，一次模型调用生成一个块的 `BlockContentDraft`（children/props，不含 shell），`--json -` + `final.text`，带一次 schema repair。
3. 块级校验：catalog、slot、props、required states、block 前缀、结构 lint（块内）。
4. 块级失败只重试该块，最多 2 次；组装失败整页重试，最多 1 次；infra 失败非零退出，不判 pass。
5. 组装后运行 Phase 1 校验器、`render:html`、`render:measure`、`figma:plan`、`figma:conformance`。
6. parity 可选：只有存在已签核 baseline 与 Figma PNG 时才运行；推广结论要求 parity 通过。

预算：真实 dsh 运行上限 ¥3；超过即停止并标记 `BUDGET_EXCEEDED`，不产生通过结论。

### 7.4 C4 指标与结论

`block-experiment.json` 每页记录：

- `seams`：块边界间距偏差、双 padding、重复标题数量；目标 0。
- `blockRetries` / `pageRetries`。
- `tokenDrift`：硬编码样式计数（复用 token validator 的 raw value 检查）。
- `pageHeight`：baseline vs 实验的实测高度与偏差百分比。
- `conformance` / `parity`：是否通过。
- `costCny` / `durationMs`。
- `status`：`passed` / `failed` / `budget_exceeded`。

推广条件（全部满足）：

1. 接缝缺陷 0。
2. 页高偏差 ≤ 5%。
3. token 漂移不高于 baseline。
4. conformance 通过；有 baseline 时 parity 也通过。
5. 成本 ≤ ¥3。

不满足则结论为 `rollback`：保留整页生成与 Part B，C 只作为实验记录，不进入 v0.8。

`block-experiment.md` 用中文写结论、数字表、失败原因与证据路径。

## 8. Handoff Packager

### 8.1 包结构

`pnpm handoff:pack --spec-run <dir> --html <dir> --figma <dir> --visual-run <dir> [--assets <dir>] --out <dir> [--zip]`：

`--visual-run` 是已签核的 visual review run 目录（含 `visual-sign.json`、`state.json`、baseline manifest 与 signoff）；不接受单独一个 markdown 文件，避免无法校验 findings/baseline hash。

```text
handoff/
  HANDOFF.md
  LICENSES.md
  handoff.manifest.json
  spec/
    page-spec/<pageId>.json
    block-manifest/<pageId>.json
  html/
    <pageId>.html
    assets/...
  figma/
    plans/figma-plan.<pageId>.json
    plans/plan-coverage.json
    readback/figma-readback.<pageId>.json
    evidence/figma-diff.<pageId>.json
    evidence/conformance.json
    evidence/parity.json
    evidence/parity.config.json
    evidence/figma-sign.json
  screenshots/
    html/<pageId>.png
    figma/<pageId>.png
    parity-diff/<pageId>.png
  assets/
    <asset files>
  baseline/
    baseline-manifest.json
    screenshots/<caseId>.png
  signoffs/
    figma-sign.json
    figma.md
    visual-sign.json
    visual.md
  evidence/
    spec-engineer-gate.json
    structure-lint.json
    render-metrics.json
```

### 8.2 校验（fail-closed）

`handoff:pack` 在写包前检查：

- spec run 完成，每页有 PageSpec；block manifest 若存在则 `block:verify` 通过。
- 每页有 HTML、plan、readback、diff。
- `figma:verify` 每页 `passed`；`conformance` 与 `parity` 汇总无 blocker。
- `figma-sign.json` 存在，且五个 hash 与当前证据一致。
- `visual-run` 的 `state.json` 为 `passed`，`visual-sign.json` 有效，`manifestHash` / `findingsHash` 与当前 baseline/review 一致。
- 每个 spec 引用的资产都有文件和 license 记录；无资产时 `LICENSES.md` 明确写“无第三方资产”。
- 生成的 `HANDOFF.md` 不含 `TBD`、`TODO`、`{{` 占位符。
- 任一不满足 → 非零退出，写明缺失项；不生成“半包”。

### 8.3 manifest 与文档

`handoff.manifest.json`：

```json
{
  "schemaVersion": "1.0",
  "project": "employee-app-phase2",
  "generatedAt": "2026-10-26T00:00:00.000Z",
  "pipelineVersion": "0.7.0",
  "profile": "b-mobile",
  "catalog": "b-mobile",
  "figma": {
    "files": [
      { "pageId": "today", "fileKey": "iL99qSPGhmh08BB9LketgF" },
      { "pageId": "customer-search", "fileKey": "ne1JYKpfjDivRr0nK5jm4S" }
    ],
    "pages": ["today", "customer-search"]
  },
  "gates": {
    "verify": { "passed": true, "hash": "sha256:..." },
    "conformance": { "passed": true, "hash": "sha256:..." },
    "parity": { "passed": true, "hash": "sha256:..." },
    "figmaSign": { "passed": true, "hash": "sha256:..." },
    "visualSign": { "passed": true, "hash": "sha256:..." }
  },
  "signoffs": [
    { "type": "figma", "signedBy": "胡冀徽", "signedAt": "2026-10-26", "hash": "sha256:..." },
    { "type": "visual", "signedBy": "胡冀徽", "signedAt": "2026-10-26", "hash": "sha256:..." }
  ],
  "files": [{ "path": "html/today.html", "sha256": "sha256:...", "bytes": 12345 }],
  "knownGaps": [
    "Figma loading/empty/error/business state frames are not included",
    "Material Symbols glyphs depend on the local installed font",
    "Figma files are referenced by fileKey; no .fig binary is bundled"
  ],
  "archive": { "path": "handoff.zip", "sha256": "sha256:...", "bytes": 456789 }
}
```

`HANDOFF.md`（中文、确定性生成）：

1. 项目概览与页面清单（路由、用途、archetype、状态）。
2. 如何本地查看 HTML（`python3 -m http.server` + 页面路径）。
3. 设计令牌、组件映射、profile/catalog 版本。
4. Figma 文件与页面（fileKey、页面名）。
5. 门禁结果与证据位置。
6. 已知限制（状态帧、字体、图标矢量）。
7. 资产与授权。

`LICENSES.md`：聚合资产包 license 记录、字体/图标说明；缺 license 即失败。

### 8.4 zip

`--zip` 使用 `fflate` 生成 `handoff.zip`，包含目录下全部文件；zip 生成后重新计算文件 hash 写入 manifest 的 `archive` 字段（`{ path, sha256, bytes }`），再输出摘要。目录始终保留。

## 9. 契约与包边界

| 包 | 新增/修改 | 职责 |
|---|---|---|
| `core/contracts` | 修改 `figma.ts`；新增 `conformance.ts`、`structure.ts`、`metrics.ts`、`block.ts`、`handoff.ts` | Zod schema 与类型；合成节点 id helper |
| `core/figma` | 修改 `compile-plan.ts`、`diff.ts`；新增 `conformance.ts`、`coverage.ts`、`parity.ts` | plan 编译/coverage、conformance 纯比较、parity 阈值判定 |
| `core/validators` | 新增 `structure.ts`；修改 `types.ts` | 结构 lint、测量复核、项目阈值 |
| `core/compiler` | 新增 `blocks.ts`、`structure-diff.ts` | 块切分/组装、结构 diff |
| `core/handoff` | 新增包 | Handoff 校验、manifest 组装（纯逻辑） |
| `runtimes/standalone` | 新增 10 个 CLI；修改 `figma-cli.ts` | 文件系统、Playwright、PNG、zip、进程退出 |
| `runtimes/figma` | 修改 `plugin.ts`、`ui.html` | PNG 导出、自动保存、build 模式 |
| `core/agents` | 新增块内容 schema/role | `BlockContentDraft`、块级 prompt |
| `runtimes/dsh` | 复用 `prd-ui-agents` | 块级一次调用 + 一次 schema repair |

边界：

- `core/` 不导入 `@deepseek-ai/*`、Playwright、pngjs、fflate。
- Playwright、PNG 解码、zip 只在 runtime。
- `figma:serve` 属于 runtime/standalone；插件只负责 export + POST。
- Handoff 的核心校验不读文件系统；CLI 负责扫描、hash、复制。
- `runtimes/standalone` 新增 `fflate` 依赖用于可选 zip；`core/` 不使用它。

## 10. 批次与交付顺序

| 批次 | 内容 | 出口 |
|---|---|---|
| 0 | v0.6 人工签核；重生成并签核 8 页 visual baseline | 可复现的视觉基准；v0.6 关闭 |
| 1 | A1 coverage/fail-closed、A2 conformance、B1 结构 lint、合成 id 约定 | 8 页 conformance 全绿；未知组件在 plan 阶段失败；结构 lint 三类样例命中 |
| 2 | A4 readback 扩展、A3 插件导出 + `figma:serve` + parity、B2 render:measure、`figma:sign` | verify + conformance + parity 三绿并签核；三类注入缺陷分别被抓；同输入 parity 可复现 |
| 3 | B3 structure diff | 两次 spec 的结构变化可审阅 |
| 4 | C1/C2 确定性分块；C3 M1 两页试点；C4 实验报告 | 8 页 split→assemble 无回归；两页试点有数字与推广/回退结论 |
| 5 | `core/handoff` + `handoff:pack` | 8 页完整包；manifest 可校验、离线可读、LICENSES 完整 |

每个批次：`pnpm test`、`pnpm typecheck`、证据落盘、提交。批次 0 是人工门禁，未完成不阻塞批次 1 的代码，但阻塞批次 2 的 parity 与批次 5 的 Handoff。

## 11. 测试与验收

### 11.1 离线测试（`pnpm test`）

- contracts schema：coverage、conformance、parity、readback 扩展、structure、metrics、block、handoff。
- `core/figma`：未知节点 → unmapped；跳过 reason；consumedProps 判定；conformance 比较器（颜色归一化、缺省值、±1px、按钮变体、缺失节点）。
- `core/validators`：每条结构规则的命中/不命中；阈值覆盖；页高估算器。
- `core/compiler`：结构 diff 增删/移动/类型变化；块切分/组装/round-trip。
- `core/handoff`：完整输入通过；缺页面/缺门禁/hash 不符/缺 license/占位符分别失败。
- `core/agents`：块内容 schema 与拒收。

Playwright、PNG、zip 不进入默认离线测试；用 CLI smoke 与 fixture 测试。

### 11.2 门禁 smoke

新增 `pnpm v07:smoke`（standalone）：

1. 对 8 页运行 `figma:conformance`。
2. 对 8 页运行 `figma:parity`（需要 baseline）。
3. 对 8 页运行 `structure:check --metrics`。
4. 汇总 JSON；任一 blocker 非零退出。

### 11.3 缺陷注入验收

在临时副本上构造：

1. `ghost-chip` 高度 36（按钮样式）→ conformance 失败。
2. tab 文案改英文（文本内容）→ parity 失败。
3. 删除列表行底边（行分隔线）→ conformance 失败。
4. 未知组件（如 Chart）→ figma:plan/verify 失败并给 specId。

### 11.4 新项目可用性

用一个组件/内容不同的新项目跑 A2/A3：

- 不改测试代码；
- 只依赖 profile/catalog 与 HTML `data-node-id`；
- 允许项目配置覆盖阈值；
- 记录首次运行的噪声与所需配置。

### 11.5 v0.7 出口标准

1. 8 页样例：`figma:verify`、`figma:conformance`、`figma:parity` 全绿，证据落盘。
2. 三类注入缺陷（按钮样式、文本内容、行分隔线）分别被对应门禁抓到。
3. 新项目（不同组件/内容）不改测试代码即可运行 A2/A3。
4. 未知组件在 `figma:plan` 阶段即失败，并给出 specId。
5. 结构 lint 能报出空槽位、页高超预算、重复块。
6. 分块实验报告：接缝缺陷、重试、token 漂移、页高偏差有数字；给出推广/回退结论。
7. 门禁顺序接入文档与签核流程：verify + conformance + parity 缺一不可。
8. Handoff 包完整、离线可读、manifest 可校验、LICENSES 完整。
9. `pnpm test`、`pnpm typecheck` clean；`pnpm test:dsh` 不回归。
10. v0.6 人工签核已完成（Gate 0）。

## 12. 风险与已定默认值

| 风险 | 处理 |
|---|---|
| parity 受字体/抗锯齿影响 | 固定 viewport/字体/scale，禁动画；先用 0.5% + 0.98，8 页校准一次并签核；不达标记录为已知限制 |
| conformance 噪声（伪元素、继承、合成节点） | 只取 `[data-node-id]`；material 合成节点白名单；origin/mapping/reason 排除预期缺失 |
| 插件导出 PNG 仍依赖人工 | `figma:serve` + 自动 POST 降低步骤；插件无法 headless，作为已知限制 |
| 结构 lint 误报 | v0.7 全部 warning；项目配置可覆盖阈值；稳定后逐条升级 |
| 分块接缝 | 组装层统一间距；块内禁页面级定位；round-trip 校验；实验未达标即回退 |
| Handoff 门禁过严 | Gate 0 先清 stale baseline/v0.6 证据；缺证据时明确列出，不生成半包 |
| readback 契约扩展破坏旧证据 | 新字段 optional；旧 readback 缺字段记 minor，不静默通过 |

已定默认值：

- parity 阈值：像素差 ≤ 0.5%，SSIM ≥ 0.98；校准后写入 `parity.config.json` 并签核。
- 结构 lint：v0.7 全部 warning；mobile 页高预算 2100px，web 2400px。
- 块实验：today + appointment-list 两页；真实 dsh 预算 ¥3；块重试 ≤2，整页重试 ≤1。
- Handoff：目录 + manifest 为必产；`--zip` 可选；Figma 只带 fileKey/plans/readback/PNG，不带 `.fig` 二进制。

## 13. 与版本路线

- v0.7 完成后，v0.8 真实项目试点直接消费 Handoff 包与门禁证据。
- C 的推广只在实验结论为 `promote` 时进入 v0.8；否则 v0.8 继续整页生成，只保留 B。
- v0.9 只做稳定性、可复现性与文档；不再新增门禁能力。
