# 会话交接：v0.7 自动门禁实现与证据（人工 Figma 重建 / Gate 0 待办）

- 日期：2026-10-26
- 状态：**v0.7 可自动化部分已实现并验证；Figma 重建、parity、签核与 Gate 0 仍未完成，v0.7 未签核**
- 上一版：[v0.6 Figma 门禁证据](2026-10-26-v06-figma-gate-evidence.md)
- 设计输入：[v0.7 输入：视觉门禁、结构优化与分块生成](../specs/2026-10-26-v07-visual-gates-structure-block-input.md)

## 1. 一句话状态

`figma:conformance`（plan ↔ HTML）在 8 页上 **0 blocker / 0 major**（233 项检查）；
`render:measure` 8 页、`structure:check` 0 warning；`v07:smoke` 退出 0，但
`executedGatesPassed: true` / `complete: false` / `paritySkipped: true`（parity 未运行，
不是完整通过）。`figma:verify` 因 **v0.6 readback 过期** 仍为红（3/8 passed，4 blocker / 53 major），
parity 未运行（没有 Figma PNG 和可用的已签核 baseline），`handoff:pack` fail-closed
（exit 1，23 blockers，未产出目录）。v0.6 人工签核与 baseline 重生成（Gate 0）仍是最前置的阻塞项。

## 2. 本次交付

| 项 | 内容 |
|---|---|
| CLI | `runtimes/standalone/src/v07-smoke-cli.ts` + `pnpm v07:smoke`；顺序执行 conformance → measure → structure → parity，首个失败即停 |
| 测试 | `runtimes/standalone/tests/v07-smoke-cli.test.ts`（19 个：参数、顺序、停止、exit code、parity 跳过原因、无绝对路径、summary 落盘、默认 structure 适配器） |
| 证据 | `artifacts/employee-app-phase2/{figma/conformance,render/metrics,render/structure,blocks,v07-smoke.json}` |
| 文档 | `AGENTS.md`、`CHANGELOG.md`、`docs/superpowers/plans/2026-10-23-version-roadmap.md`、本文件 |
| 未做 | 不运行 `visual:baseline`（仅人工）；不伪造 Figma PNG/readback/签核；不提交部分 handoff 包 |

`v07:smoke` 行为：

- `--spec-run/--html/--project/--out` 必填；`--plans` 或 `--figma` 至少一个（plans 默认 `<figma>/plans`）。
- conformance 输出到 `<figma>/conformance`（有 `--figma` 时），否则 `<out>/conformance`。
- measure/structure 输出到 `<out>/render/metrics`、`<out>/render/structure`。
- parity 仅在同时提供 `--figma` 与 `--baseline`、baseline `manifest.json` 存在、且每页
  `<figma>/parity/figma.<pageId>.png` 都存在时运行；否则 `status: "skipped"` 并写明原因，
  **不因跳过而把执行过的门禁判失败**，但 summary 会记录 `paritySkipped: true` 与 `complete: false`。
- 真实门禁失败（conformance blocker、measure/structure infra、parity 失败）退出非 0；
  summary 写到 `<out>/v07-smoke.json` 并作为最后一行 JSON 打印。跳过原因中的路径为仓库相对路径
  （仓库外目标写成 `<external>/<name>`），不写本机绝对路径。

## 3. 测试与门禁结果（2026-10-26）

| 命令 | 结果 |
|---|---|
| `pnpm test` | **87 files / 983 tests passed** |
| `pnpm test:dsh` | **3 files / 4 tests passed** |
| `pnpm typecheck` | clean（所有 workspace 包） |
| `pnpm --dir runtimes/figma typecheck` | clean |
| `pnpm --dir runtimes/figma build` | `dist/code.js` 23.4kb |

### 3.1 `v07:smoke`（真实 8 页）

```bash
pnpm render:html --run artifacts/employee-app-phase2/figma/spec-source --out /tmp/html-v07-final2
pnpm v07:smoke \
  --spec-run artifacts/employee-app-phase2/figma/spec-source \
  --html /tmp/html-v07-final2 \
  --project samples/projects/employee-app-phase2/project.yaml \
  --figma artifacts/employee-app-phase2/figma \
  --baseline baselines/employee-app-phase2 \
  --out artifacts/employee-app-phase2 --json
```

`exit 0`（执行过的门禁通过，但**不是完整通过**），最后一行 summary（也写入
`artifacts/employee-app-phase2/v07-smoke.json`）：

```json
{"schemaVersion":"1.0","generatedAt":"2026-10-26T15:47:13.031Z","executedGatesPassed":true,"complete":false,
 "conformance":{"status":"passed","passed":true,"blockers":0,"majors":0,"pages":8},
 "measure":{"status":"passed","pages":8},
 "structure":{"status":"passed","warnings":0,"blockers":0},
 "parity":{"status":"skipped","reason":"missing Figma PNGs in pipeline/artifacts/employee-app-phase2/figma/parity: appointment-detail, appointment-form, appointment-list, callback-register, customer-detail, customer-search, today, treatment-notice"},
 "paritySkipped":true}
```

注意：parity 的 `skipped` 不是通过；`complete: false` / `paritySkipped: true` 明确表示
这不是一次完整门禁运行。完整包仍由 `handoff:pack` fail-closed 把关。

### 3.2 `figma:conformance`（0/0）

`artifacts/employee-app-phase2/figma/conformance/conformance.json`：

| page | passed | checked | skipped | findings |
|---|---|---:|---:|---:|
| appointment-detail | true | 20 | 0 | 0 |
| appointment-form | true | 17 | 0 | 0 |
| appointment-list | true | 125 | 8 | 0 |
| callback-register | true | 13 | 0 | 0 |
| customer-detail | true | 17 | 0 | 0 |
| customer-search | true | 4 | 4 | 0 |
| today | true | 18 | 2 | 0 |
| treatment-notice | true | 19 | 0 | 0 |
| **total** | **8/8** | **233** | **14** | **0** |

summary：`{"blockers":0,"majors":0,"pages":8}`。

### 3.3 `render:measure` / `structure:check`

`artifacts/employee-app-phase2/render/metrics/render-metrics.json`：

| page | documentHeight | contentHeight | firstScreenNodes | fixedFooter | widest | overflowX |
|---|---:|---:|---:|---|---:|---|
| appointment-detail | 844 | 727 | 20 | 69px | 390 | false |
| appointment-form | 844 | 727 | 17 | 69px | 390 | false |
| appointment-list | 844 | 760 | 125 | 69px | 390 | false |
| callback-register | 844 | 727 | 13 | 69px | 390 | false |
| customer-detail | 844 | 727 | 17 | 69px | 390 | false |
| customer-search | 844 | 796 | 4 | none | 390 | false |
| today | 844 | 732 | 18 | none | 390 | false |
| treatment-notice | 844 | 727 | 18 | 69px | 390 | false |

`artifacts/employee-app-phase2/render/structure/structure-measured.json`：
`findings: []`，`summary: {warnings: 0, blockers: 0}`（v0.7 结构规则为 warning；--project 为必填）。

### 3.4 `figma:verify` 现状（红，原因是 stale readback）

对已提交的 v0.6 readback 运行 `figma:verify`（diff 输出到 `/tmp/v07-verify`，**未覆盖**
`artifacts/.../figma/diff` 的 v0.6 证据）：

| page | passed | blocker | major | findings |
|---|---|---:|---:|---:|
| appointment-detail | false | 0 | 4 | 113 |
| appointment-form | true | 0 | 0 | 67 |
| appointment-list | false | 0 | 24 | 413 |
| callback-register | true | 0 | 0 | 49 |
| customer-detail | false | 0 | 4 | 91 |
| customer-search | true | 0 | 1 | 20 |
| today | false | 0 | 9 | 132 |
| treatment-notice | false | 4 | 11 | 88 |
| **total** | **3/8** | **4** | **53** | **973** |

全部差异都是 v0.6 build 的旧值：**57 条值差异**（41 `FIGMA_SPACING` +
8 `FIGMA_SIZE` + 4 `FIGMA_ABSOLUTE` + 4 `FIGMA_TEXT_STYLE`）+ **916 条
`READBACK_STYLE_UNSUPPORTED` minor**，合计 **973 = 4 blocker + 53 major + 916 minor**。
**没有** `UNMAPPED_COMPONENT`/`SPEC_NODE_ID_MISSING`/`FIGMA_NODE_MISSING`/
`FIGMA_NODE_EXTRA`/`FIGMA_HIERARCHY`/`FIGMA_LAYOUT_MODE`。plan 已按 HTML 修正
（Task 20a），不重建 Figma 就无法变绿。

## 4. 缺陷注入验收

三个可自动化的注入都按预期变红；parity 的文本注入无法执行（无 Figma PNG、无可用 baseline）。

### 4.1 按钮样式（ghost-chip 高度 32 → 36）

```bash
cp -R artifacts/employee-app-phase2/figma/plans /tmp/defect-plans-button
# 仅改 /tmp 副本：appointment-detail 的 components.Button.variants["ghost-chip"].height = 36
pnpm exec tsx runtimes/standalone/src/figma-conformance-cli.ts \
  --spec-run artifacts/employee-app-phase2/figma/spec-source \
  --html /tmp/html-v07-final2 --plans /tmp/defect-plans-button \
  --out /tmp/defect-conformance-button
```

`exit 1`，`2 blocker / 0 major`：

```text
- [blocker] CONFORMANCE_STYLE_MISMATCH height appointment-detail.action.reschedule: height expected 36, got 32
- [blocker] CONFORMANCE_STYLE_MISMATCH height appointment-detail.action.customer: height expected 36, got 32
Conformance: 8 pages, 2 blocker / 0 major
```

### 4.2 行分隔线（删除 borderBottom + borderBottomWidth）

```bash
cp -R artifacts/employee-app-phase2/figma/plans /tmp/defect-plans-divider
# 仅改 /tmp 副本：appointment-detail.root.summary.0.children.0.row.0
# 删除 borderBottom 与 borderBottomWidth
pnpm exec tsx runtimes/standalone/src/figma-conformance-cli.ts \
  --spec-run artifacts/employee-app-phase2/figma/spec-source \
  --html /tmp/html-v07-final2 --plans /tmp/defect-plans-divider \
  --out /tmp/defect-conformance-divider
```

`exit 1`，`1 blocker / 0 major`：

```text
- [blocker] CONFORMANCE_STYLE_MISMATCH borderBottomWidth appointment-detail.root.summary.0.children.0.row.0: borderBottomWidth expected 0, got 1
Conformance: 8 pages, 1 blocker / 0 major
```

只删除 `borderBottom` 而保留 `borderBottomWidth: 1` 不会报错（宽度仍由 width 字段声明）；
真实缺陷是两者一起消失，注入按此模拟。

### 4.3 未知组件（Chart）

```bash
cp -R artifacts/employee-app-phase2/figma/spec-source /tmp/spec-unknown
# 在 /tmp 副本 today.layout.slots.content[0].children 追加
#   { "type":"Chart", "id":"today.chart.1", "props":{"title":"本周预约趋势"} }
pnpm figma:plan --spec-run /tmp/spec-unknown --out /tmp/plans-unknown
pnpm exec tsx runtimes/standalone/src/figma-cli.ts verify \
  --plan /tmp/plans-unknown/figma-plan.today.json \
  --readback artifacts/employee-app-phase2/figma/readback/figma-readback.today.json \
  --out /tmp/verify-unknown/figma-diff.today.json
```

`figma:plan` exit 0，但 `figma-plan.today.json` 的 coverage 记为：

```json
{"specId":"today.chart.1","specType":"Chart","path":"layout.slots.content[0].children[3]",
 "status":"unmapped","reason":"UNMAPPED_COMPONENT:Chart"}
```

`figma:verify` exit 1，含预期 blocker（另有 2 blocker / 9 major 来自旧 readback 的噪声；
本次 verify 合计 3 blocker / 9 major）：

```text
- [blocker] UNMAPPED_COMPONENT: Chart at layout.slots.content[0].children[3]: UNMAPPED_COMPONENT:Chart
```

findings 中该条 `specId: "today.chart.1"`。

### 4.4 parity 文本注入（未执行）

需要真实 Figma PNG 与**当前 HTML** 的已签核 baseline。二者都不存在（见 §6），
因此 `figma:parity` 没有任何真实输入；本次不伪造 PNG/baseline，也不把该注入记为通过。

## 5. 新项目可用性检查（employee-app，2 页）

```bash
pnpm phase1:verify --project samples/projects/employee-app/project.yaml --runs /tmp/v07-new-project
pnpm render:html --run /tmp/v07-new-project/run-2026-10-26T15-31-55-635Z --out /tmp/v07-new-project-html
pnpm figma:plan --spec-run /tmp/v07-new-project/run-2026-10-26T15-31-55-635Z --out /tmp/v07-new-project-plans
pnpm figma:conformance \
  --spec-run /tmp/v07-new-project/run-2026-10-26T15-31-55-635Z \
  --html /tmp/v07-new-project-html --plans /tmp/v07-new-project-plans \
  --out /tmp/v07-new-project-conformance
```

- `phase1:verify`：2 pages / 0 blockers。
- `figma:plan`：2 plans；`inventory-query` 有 6 个 degraded（1×`Switch`、5×`InventoryCard`），
  0 unmapped；`today` 无 degraded。
- `figma:conformance`：**exit 1，6 blocker / 0 major**（未改任何测试代码即可运行）：
  `today` passed（0 findings，18 checked，2 skipped）；`inventory-query` failed，6 条
  `CONFORMANCE_NODE_MISSING`——`Switch` 与 5 个 `InventoryCard` 在 plan 里是 degraded 空
  frame，HTML 渲染器同样没有对应节点。

结论：门禁可跨项目运行，但该 sample 的 spec 使用了 renderer/compiler 都未映射的类型，
因此不是干净的通过。这是真实的“项目无关”边界，不是 false positive；v0.8 需要决定
是补渲染/映射还是让这类 spec 在 Phase 1 就失败。

## 6. `handoff:pack` fail-closed 记录（未提交部分包）

按 Task 20 brief 的原始命令：

```bash
pnpm handoff:pack \
  --spec-run artifacts/employee-app-phase2/figma/spec-source \
  --html artifacts/employee-app-phase2/html \
  --figma artifacts/employee-app-phase2/figma \
  --visual-run artifacts/employee-app-phase2/visual-review \
  --assets artifacts/employee-app-phase2/asset-compiler \
  --out artifacts/employee-app-phase2/handoff --zip
```

结果：**exit 2**，`asset-compiler/` 下只有 `m0/` 与 `phase2/` 两个资产包，没有根
`manifest.json`；`artifacts/employee-app-phase2/handoff` 未创建。

改用有效的资产包与 baseline 枚举证据缺口：

```bash
pnpm handoff:pack ... --assets artifacts/employee-app-phase2/asset-compiler/phase2 \
  --baseline baselines/employee-app-phase2 --out artifacts/employee-app-phase2/handoff --zip
```

结果：**exit 1，23 blockers，未创建输出目录**：

| 类别 | 数量 | 具体 |
|---|---:|---|
| parity 证据缺失 | 10 | `figma/parity/parity.json` 缺失（hashing + parity gate），8 页 `parity/diff/<page>.png` 缺失 |
| readback 无 `fileKey` | 8 | v0.6 readback 早于插件 `fileKey` 字段；需 `figma-files.json` 或重建 readback |
| Figma 签核缺失 | 3 | `figma/signoff/figma-sign.json` 缺失（含 `validateHandoff` 的重复摘要） |
| spec-engineer gate 缺失 | 1 | `figma/spec-source` 只有 `artifacts/page-spec`，没有 `findings/spec-engineer-gate.json` |
| Figma gate 未通过摘要 | 1 | `figmaSign gate did not pass`（parity/签核的汇总） |

视觉侧的 **gate 机制**在过期的 v0.5 baseline 上通过：visual run 状态 `success`、
`visual-sign.json` 与 baseline PNG hash 均匹配（baseline 仍是 v0.5 那份）。这不等于当前
视觉通过——v0.5.x CSS 变更后 baseline 已过期，**Gate 0 仍待人工重生成并签核**（见 §7）。
没有提交任何部分包。

## 7. 阻塞在人工 Figma / Gate 0 的项

1. **Gate 0**：v0.6 人工并排视觉检查与签核未完成；v0.5.x CSS 变更后 baseline 已过期，
   需要人工重新生成并签核（`visual:baseline` 只允许人工执行）。
2. **Figma 重建**：Task 20a 修正了 plan（卡片 8px 节奏、日历、行分隔、quick-action 等），
   v0.6 readback/diff 全部过期。需在 Figma 桌面版按
   `artifacts/employee-app-phase2/figma/README.md` 的 checklist 重建 8 页（scratch + delivery），
   由插件自动保存 readback 与 `figma.<page>.png`。
3. **verify 变绿**：重建后对 8 页重跑 `figma:verify`，用新 diff 覆盖 `figma/diff/`；
   当前 3/8 通过不能宣称全绿。
4. **parity**：用新的 signed baseline + 新 Figma PNG 运行 `figma:parity`；首次可能需要
   人工签核 `parity.config.json` 阈值（默认 pixel ≤0.5%、SSIM ≥0.98、cluster ≤24px）。
5. **签核**：`figma:sign` 需要五个 hash（plan/readback/conformance/parity/baseline）；
   `figma:sign` 会拒绝任何 `passed:false` 的 diff。
6. **重新打包**：补齐 `figma/parity/`、readback `fileKey`、`figma/signoff/`，并让
   `--spec-run` 指向含 `findings/spec-engineer-gate.json` 的真实 spec run，再跑 `handoff:pack`。

## 8. 分块实验结论（沿用 Task 17 的真实运行）

- 结论：**rollback**；成本 **¥0.3302**（预算 ¥3；today ¥0.1468 / appointment-list ¥0.1834）。
- 7 次生成 / 8 次模型调用，`usageComplete: true`；块/页重试 0/0；页高 Δ 0%；新增接缝 0；
  token 漂移 0；块 manifest 校验通过；`conformanceComparable: true`；新增 conformance
  blocker 0（today）/ 2（appointment-list）；Phase 1 blocker 0 / 5；parity 未评估。
- 原因：conformance failed（当时 baseline 仍为 19 / 708 blockers）且 parity 未评估。
- 证据副本：`artifacts/employee-app-phase2/blocks/`（`block-experiment.{json,md}`、
  `block-verify.json`、`measurements.json`、baseline/experiment metrics、`validation.json`）。
- **重要限定**：该运行发生在 Task 20a 的 conformance 修复之前，baseline 当时是红的；
  现在 conformance baseline 已为 0/0，若 v0.8 要重新评估分块生成，应重跑实验，不能把
  “rollback”当作对当前 plan 编译器的最终结论。

## 9. 如何复现

```bash
cd pipeline

# 1. 自动门禁（fresh HTML + committed plans + smoke）
rm -rf /tmp/html-v07-final2
pnpm render:html --run artifacts/employee-app-phase2/figma/spec-source --out /tmp/html-v07-final2
# plans 是 Task 20a 的已提交输出；需要重新生成时：
pnpm figma:plan --spec-run artifacts/employee-app-phase2/figma/spec-source --out artifacts/employee-app-phase2/figma/plans
pnpm v07:smoke \
  --spec-run artifacts/employee-app-phase2/figma/spec-source \
  --html /tmp/html-v07-final2 \
  --project samples/projects/employee-app-phase2/project.yaml \
  --figma artifacts/employee-app-phase2/figma \
  --baseline baselines/employee-app-phase2 \
  --out artifacts/employee-app-phase2 --json

# 2. 静态与测试门
pnpm test
pnpm test:dsh
pnpm typecheck
pnpm --dir runtimes/figma typecheck
pnpm --dir runtimes/figma build

# 3. 人工 Figma 重建（此步之后 verify/parity/sign 才能变绿）
pnpm figma:serve --figma artifacts/employee-app-phase2/figma --port 9600
# 在 Figma 桌面版加载插件、指向 http://127.0.0.1:9600，逐页 Build（scratch + delivery）
for page in appointment-detail appointment-form appointment-list callback-register \
            customer-detail customer-search today treatment-notice; do
  pnpm figma:verify \
    --plan "artifacts/employee-app-phase2/figma/plans/figma-plan.$page.json" \
    --readback "artifacts/employee-app-phase2/figma/readback/figma-readback.$page.json" \
    --out "artifacts/employee-app-phase2/figma/diff/figma-diff.$page.json"
done
pnpm figma:parity \
  --figma artifacts/employee-app-phase2/figma/parity \
  --baseline baselines/employee-app-phase2 \
  --spec-run artifacts/employee-app-phase2/figma/spec-source \
  --out artifacts/employee-app-phase2/figma/parity
pnpm figma:sign --figma artifacts/employee-app-phase2/figma \
  --baseline baselines/employee-app-phase2 --signoff-figma /tmp/signoff-figma.md
```

## 10. 已知缺口与剩余债

- **v0.6 readback/diff 过期**：verify 3/8 是假红，但也不能当作通过；必须重建。
- **parity 从未在 v0.7 对真实 PNG 运行**：跳过不是通过；阈值仍需首个真实样本校准。
- **已提交的 `artifacts/employee-app-phase2/html` 过期**：早于 v0.5.x 颜色 token
  （secondary/tertiary）和 v0.7 的 `data-node-id` 覆盖；所有门禁必须用 fresh HTML。
  是否需要刷新这份历史 HTML 留待 Gate 0 一并决定（baseline 也要重生成）。
- **baseline 过期**：v0.5.x CSS 变更后未重签；parity 与 handoff 的 baselineHash 都依赖它。
- **`figma/spec-source` 不是完整 spec run**：没有 `findings/spec-engineer-gate.json`，
  `handoff:pack` 必然 fail-closed；正式打包应使用真实 spec run 目录。
- **`handoff:pack` 不再信任已提交 diff**（终审修复）：它从当前 plan + readback
  重算每页 diff，并要求 stored diff 与重算结果一致；重建后仍必须重新生成 diff，
  否则它以 `figma verify failed` / `figma diff evidence is stale` fail-closed。
- **新项目 sample 的 Switch/InventoryCard 未映射**：conformance 以 6 个
  `CONFORMANCE_NODE_MISSING` 失败；是 fail-closed 的正确行为，但需要 v0.8 决策。
- **分块实验**：`requiredStates` 语义、保留 baseline id、新增节点的 conformance 成本仍是
  v0.8 议题；本次结论不覆盖修复后的编译器。
- **`v07:smoke` 不含 `figma:verify`**：verify 需要人工 Figma readback，保持独立门禁；
  smoke 只覆盖可无头执行的门禁。
- **Task 20a 遗留**：`figma:plan`/`conformance` 的 `checked` 数量依赖 renderer 的
  `data-node-id`；新增组件类型时必须同时补 renderer 与 compiler，否则会出现
  “plan 有、HTML 无”的 `CONFORMANCE_NODE_MISSING`（employee-app sample 即为例证）。

## 11. 证据路径

- 自动门禁：`pipeline/artifacts/employee-app-phase2/figma/conformance/`（`conformance.json`、
  `style-manifest.json`）、`.../render/metrics/render-metrics.json`、
  `.../render/structure/structure-measured.json`、`.../v07-smoke.json`
- 分块实验副本（自包含，路径已仓库相对化）：
  `pipeline/artifacts/employee-app-phase2/blocks/`（含 `conformance/conformance.json` 与
  `artifacts/block-manifest/`）
- 历史 Figma 证据（过期，勿当通过）：`pipeline/artifacts/employee-app-phase2/figma/{plans,readback,diff,screenshots}`
- 失败注入与 verify 日志（本机临时，未提交）：`/tmp/v07-verify/`、`/tmp/defect-*.log`、
  `/tmp/v07-new-project*`
- 测试：`pipeline/runtimes/standalone/tests/v07-smoke-cli.test.ts`

## 12. 本次改动文件

- `pipeline/runtimes/standalone/src/v07-smoke-cli.ts`（新增）
- `pipeline/runtimes/standalone/tests/v07-smoke-cli.test.ts`（新增）
- `pipeline/package.json`（`v07:smoke`）
- `pipeline/artifacts/employee-app-phase2/{figma/conformance,render,v07-smoke.json}`（证据）
- `pipeline/artifacts/employee-app-phase2/blocks/`（包含 `conformance/` 与
  `artifacts/block-manifest/` 的自包含副本；本地绝对路径已仓库相对化）
- `AGENTS.md`、`CHANGELOG.md`、`docs/superpowers/plans/2026-10-23-version-roadmap.md`、本文件

## 13. 终审修复（2026-10-26，同一版本，未签核）

分支终审发现 2 个 Critical + 6 个 Important；全部修复并加回归测试：

| 项 | 修复 |
|---|---|
| Critical 1 | `figma:sign` / `handoff:pack` 不再信任 stored `figma-diff.*.json` 的 `passed`；从当前 plan + readback 重算，stored diff 必须与重算一致（`FIGMA_DIFF_STALE` / handoff blocker）。回归测试覆盖“stored passed + 按钮高度回归”。 |
| Critical 2 | 块高门禁同时读 `contentHeight` 与 `documentHeight`。已提交试跑的 appointment-list 760→804 (+5.79%) 在修正后是 `heightDelta>5%`；`blocks/block-experiment.md` 记录更正与差异，机器 JSON 保持原始证据。 |
| Important 3 | sign/pack 重算 `parity/figma.<page>.png` 与 baseline case PNG 的 sha256，必须匹配 `parity.json` 的 `figmaHash`/`baselineHash`；测试在写入 parity.json 后篡改 PNG。 |
| Important 4 | handoff 的 `screenshots/figma/<page>.png` 改为 parity PNG（hash 绑定）；v0.6 手工裁剪只进 `screenshots/figma-manual/` 并写 known gap；`figma/README.md` checklist 同步。 |
| Important 5 | `handoff:pack --metrics` + 搜索 `<html>/../render/metrics/render-metrics.json`；缺失是 blocker；测试使用 v0.7 输出布局。 |
| Important 6 | `figma:conformance` 记录 `htmlSha256`/`specSha256`；`visual:review` state 记录 `htmlHashes`；handoff 校验供给的 HTML/spec 字节，并把 `inputHashes` 写入 manifest；测试覆盖 HTML/visual 不匹配。 |
| Important 7 | `verifyBlockContracts` 强制 `allowedComponents`/`requiredStates`（block:experiment + block:verify）；推广要求 Phase 1 0 blockers、token drift ≤ baseline、parity；`--figma`/`--figma-baseline` 才评估 parity，否则只能 `insufficient_evidence`。 |
| Important 8 | structure diff 比较 `title/text/label/subtitle/description/value/meta/...`，无 id 节点按位置路径回退（`idless: true`）。 |
| Minors | parity.config.json 固定阈值；figma:serve 保留 scratch/delivery readback 目录；structure-diff/block-experiment 路径仓库相对化；figma:sign 校验项目/日期并硬化 `__proto__`；handoff baseline 回退 `pipeline/baselines/<project>`；B2/B3 文档补 fold 省略与 text/id-less 规则。 |

验证：`pnpm test` 87 files / 983 passed；`pnpm test:dsh` 3 files / 4 passed；
`pnpm typecheck` clean；`figma:conformance` 仍 0 blocker / 0 major（8 页，233
checked，fresh HTML）；`v07:smoke` 仍 `complete: false` / `paritySkipped: true`；
`handoff:pack` 对当前 stale evidence 仍 fail-closed 且不写部分包。v0.7 **未签核**，
Figma verify/parity 仍未绿。
