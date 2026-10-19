# Phase 1B · 修复后独立用户验收记录（最终复测）

- 日期：2026-10-19
- 方式：独立用户验收测试，不代表开发者。只从 `README.md`、CLI、`samples/` 的真实用户入口出发，自己执行命令并检查真实产物；未参考 `docs/handoffs/`、git 历史、开发者测试记录或计划中的“已完成”结论；未修改仓库源码、测试、`samples/`。
- 代码状态：分支 `phase-1b-usability`；实际检出 **`0084181`**（`fix: close phase 1b final review gates`）。按开发侧说明，`7faca50 → 74474bd` 仅 handoff 文档差异、代码一致，最终复测在 `0084181` 完成。
- 结论：**A/B/C 通过；D-1 至 D-5 通过；D-6 在 CLI 层不可构造（见文末开发侧补充）**。D-3 的裸错误信息已修复为 `Phase 1A FAILED: missing manifests...`。A–D-5 未发现回归；settings 语义校验由 validator 回归测试覆盖。

## 场景结果

| 场景 | 结果 | 证据 |
|---|---|---|
| A. 默认 sample | **通过** | `pnpm phase1:verify --runs /tmp/ua-2026-10-19-final/A-runs` 退出 0；stdout 为 `Phase 1A OK: 8 pages, 0 blockers` 和 Run 目录；`state.json` 为 `stage: done` / `status: success` / `gates.brief: passed`；8 份 page-spec；`validation.json` 8 条全部 `passed: true`、`blockers: 0`。 |
| B. 追加第 9 页 `customers-list` | **通过** | 使用 /tmp 中的 brief 副本和两份 manifest 副本运行，退出 0；`Phase 1A OK: 9 pages, 0 blockers`；9 份 page-spec；`customers-list` 的 FilterBar 为 `customerName/phone` + `新建客户`，DataTable 列为 `customerName/phone/email`，另有 `导出客户` 按钮和 `暂无客户` 空态；`新建订单`、`暂无订单`、`status`、`date`、`keyword` 均未出现；全部 semantic findings 为空。 |
| C. 新项目 `demo-crm` | **通过** | `pnpm phase1:verify --project samples/projects/demo-crm/project.yaml --runs /tmp/ua-2026-10-19-final/demo-crm-runs` 退出 0；`Phase 1A OK: 1 page, 0 blockers`；`contacts-list` spec 含 `name/email/phone`、`新建联系人`、`暂无联系人`、nav `联系人/设置`；spec 与 ui-brief 中均无订单文案。 |
| D-1. `--help` | **通过** | 退出 0；打印完整 usage；执行前后仓库 `runs/` 目录数量均为 22，没有产生新 run。 |
| D-2. 未知参数 `--bogus` | **通过** | 退出 2；stderr 打印 `unknown argument: --bogus` 和 usage；没有产生新 run。 |
| D-3. 只传 `--brief`、不传 manifest | **通过（已修复）** | 退出 1；stderr 为 `Phase 1A FAILED: missing manifests: pass --manifest <profile>=<path> or --project`；仍不创建 run 目录。不再是裸错误信息。 |
| D-4. 项目不匹配 | **通过** | 用 `demo-crm` brief + `demo-orders` 的 b-dense manifest 运行，退出 1；stdout 含 `Phase 1A FAILED`、Run 目录和 `- PROJECT-MANIFEST-PROJECT: Manifest for profile "b-dense" belongs to project "demo-orders", expected "demo-crm".` |
| D-5. 缺少 manifest profile | **通过** | 只传 b-dense manifest 运行含 c-expressive 页面的 sample brief，退出 1；stdout 含 `Phase 1A FAILED`、Run 目录和 `- PROJECT-MANIFEST-MISSING: No asset manifest for profile "c-expressive" required by page(s): home-feed, item-detail, auth.` |
| D-6. 自定义 settings 页面 + `bogus-setting` | **未复现预期（CLI 场景不可构造）** | 期望退出非 0 并打印 `SEMANTIC-FIELD`；实际退出 0，`9 pages, 0 blockers`。`custom-settings` 的 page-spec 把 `bogus-setting` 渲染成 `FormField.props.label`，布局中存在该字段，因此语义校验不会报缺失。该场景无法通过 CLI 构造，见文末开发侧补充与问题 1。 |

## 关键命令与产物

### A. 默认 sample

```bash
cd "/Users/jihui/Desktop/产品、ui/pipeline"
pnpm phase1:verify --runs /tmp/ua-2026-10-19-final/A-runs
```

实际输出（stdout）：

```text
Phase 1A OK: 8 pages, 0 blockers
Run: /tmp/ua-2026-10-19-final/A-runs/run-2026-10-19T14-32-13-632Z
```

`state.json`：

```json
{
  "runId": "run-2026-10-19T14-32-13-632Z",
  "stage": "done",
  "status": "success",
  "degraded": false,
  "gates": { "brief": "passed" }
}
```

8 份 page-spec：

```text
auth.json
home-feed.json
item-detail.json
order-detail.json
order-form.json
orders-list.json
orders-overview.json
settings.json
```

`reports/validation.json` 共 8 条，逐页均为 `passed: true`、`blockers: 0`、`findings: []`，包括 `orders-overview`、`orders-list`、`order-detail`、`order-form`、`settings`、`home-feed`、`item-detail`、`auth`。

### B. 自定义第 9 页 customers-list

临时输入目录：`/tmp/ua-2026-10-19-final/B-project/`。`ui-brief.json` 是 `samples/ui-brief.sample.json` 的副本，追加了：

```json
{
  "id": "customers-list",
  "name": "客户列表",
  "purpose": "让运营人员按客户名称与电话检索客户，并查看客户联系方式。",
  "archetype": "list",
  "target": "web",
  "profile": "b-dense",
  "route": "/customers",
  "roles": ["admin", "operator"],
  "requiredStates": ["default", "empty", "loading", "error"],
  "reqRefs": ["REQ-CUSTOMER-001"],
  "fields": ["customerName", "phone", "email"],
  "filterFields": ["customerName", "phone"],
  "actions": ["新建客户", "导出客户"],
  "emptyTitle": "暂无客户"
}
```

并在 `traceability.reqMap` 中加入 `"REQ-CUSTOMER-001": ["customers-list"]`。两份 manifest 也是 sample 的原样副本。

```bash
pnpm phase1:verify \
  --brief /tmp/ua-2026-10-19-final/B-project/ui-brief.json \
  --manifest b-dense=/tmp/ua-2026-10-19-final/B-project/manifest-b-dense.json \
  --manifest c-expressive=/tmp/ua-2026-10-19-final/B-project/manifest-c-expressive.json \
  --runs /tmp/ua-2026-10-19-final/B-runs
```

实际输出（stdout）：

```text
Phase 1A OK: 9 pages, 0 blockers
Run: /tmp/ua-2026-10-19-final/B-runs/run-2026-10-19T14-32-19-161Z
```

`state.json` 为 `stage: done` / `status: success` / `gates.brief: passed`；`reports/validation.json` 9 条全部 `passed: true`、`blockers: 0`；`customers-list` 条目为：

```json
{
  "pageId": "customers-list",
  "findings": [],
  "blockers": 0,
  "major": 0,
  "minor": 0,
  "questions": 0,
  "passed": true
}
```

`artifacts/page-spec/customers-list.json` 的关键布局内容：

```json
{
  "meta": {
    "pageId": "customers-list",
    "project": "demo-orders",
    "name": "客户列表",
    "target": "web",
    "profile": "b-dense",
    "archetype": "list",
    "purpose": "让运营人员按客户名称与电话检索客户，并查看客户联系方式。",
    "route": "/customers",
    "roles": ["admin", "operator"],
    "reqRefs": ["REQ-CUSTOMER-001"]
  },
  "layout": {
    "type": "PageShell",
    "props": {
      "title": "客户列表",
      "nav": ["概览", "订单", "客户", "设置"]
    },
    "slots": {
      "content": [
        {
          "type": "Section",
          "children": [
            {
              "type": "FilterBar",
              "props": {
                "fields": ["customerName", "phone"],
                "action": "新建客户"
              }
            },
            {
              "type": "DataTable",
              "props": {
                "columns": ["customerName", "phone", "email"],
                "pageSize": 20
              }
            },
            {
              "type": "Row",
              "children": [
                {
                  "type": "Button",
                  "props": { "label": "导出客户", "emphasis": "secondary" }
                }
              ]
            },
            {
              "type": "EmptyState",
              "props": {
                "title": "暂无客户",
                "description": "调整筛选条件后重试"
              }
            }
          ]
        }
      ]
    }
  },
  "interactions": [
    { "trigger": "新建客户", "action": "navigate", "reqRef": "REQ-CUSTOMER-001" },
    { "trigger": "导出客户", "action": "navigate", "reqRef": "REQ-CUSTOMER-001" }
  ]
}
```

（上面为省略 Pagination 等未变化节点的关键摘录，字段与值均来自实际文件。）

逐项检查结果：

```text
customerName / phone / email      出现在 layout（FilterBar 与 DataTable）
新建客户                          出现在 FilterBar.action 和 interactions
导出客户                          出现在 Button.label 和 interactions
暂无客户                          出现在 EmptyState.title
新建订单 / 暂无订单               未出现（layout=false, full=false）
status / date / keyword           未出现（layout=false, full=false）
semantic findings                 全部为空
```

唯一的订单相关字样是 `layout.props.nav` 中的项目级导航项“订单”，来自被复制 brief 的 `ia.navigation.primary`（`["概览","订单","客户","设置"]`），不是页面正文、筛选、列、动作或空态模板泄漏。详见问题 2。

### C. 新项目 demo-crm

```bash
pnpm phase1:verify \
  --project samples/projects/demo-crm/project.yaml \
  --runs /tmp/ua-2026-10-19-final/demo-crm-runs
```

实际输出（stdout）：

```text
Phase 1A OK: 1 page, 0 blockers
Run: /tmp/ua-2026-10-19-final/demo-crm-runs/run-2026-10-19T14-32-19-602Z
```

`artifacts/page-spec/contacts-list.json` 关键内容：

```json
{
  "meta": {
    "pageId": "contacts-list",
    "project": "demo-crm",
    "name": "联系人列表",
    "target": "web",
    "profile": "b-dense",
    "archetype": "list",
    "route": "/contacts"
  },
  "layout": {
    "type": "PageShell",
    "props": { "title": "联系人列表", "nav": ["联系人", "设置"] },
    "slots": {
      "content": [
        {
          "type": "Section",
          "children": [
            {
              "type": "FilterBar",
              "props": { "fields": ["name", "email"], "action": "新建联系人" }
            },
            {
              "type": "DataTable",
              "props": { "columns": ["name", "email", "phone"], "pageSize": 20 }
            },
            {
              "type": "EmptyState",
              "props": { "title": "暂无联系人" },
              "assetRef": "empty-contacts"
            }
          ]
        }
      ]
    }
  },
  "interactions": [
    { "trigger": "新建联系人", "action": "navigate", "reqRef": "REQ-CRM-001" }
  ]
}
```

`state.json` 为 `stage: done` / `status: success`；`reports/validation.json` 只有 1 条，`passed: true`、`blockers: 0`。对 page-spec 和 `artifacts/ui-brief.json` 搜索 `订单|order|Order`，均无命中。

### D. CLI 用户路径与错误处理

D-1 `--help`：

```bash
pnpm phase1:verify --help
# EXIT=0
# runs/ 目录数：执行前 22，执行后 22
```

stdout 打印 `Usage: pnpm phase1:verify [options]` 及 `--project`、`--brief`、`--manifest`、`--runs`、`-h, --help` 的说明；没有执行 pipeline。

D-2 未知参数：

```bash
pnpm phase1:verify --bogus
# EXIT=2
```

stderr：

```text
unknown argument: --bogus
Usage: pnpm phase1:verify [options]
...
```

D-3 只传 brief、不传 manifest：

```bash
pnpm phase1:verify \
  --brief /tmp/ua-2026-10-19-final/B-project/ui-brief.json \
  --runs /tmp/ua-2026-10-19-final/D3-runs
# EXIT=1
```

stderr：

```text
Phase 1A FAILED: missing manifests: pass --manifest <profile>=<path> or --project
```

该命令没有创建 `/tmp/ua-2026-10-19-final/D3-runs/run-*`，行为符合“失败时打印 failure reason、但不创建 run”的预期。本次修复已把原来的裸错误信息改为统一的 `Phase 1A FAILED` 前缀。

D-4 项目不匹配：

```bash
pnpm phase1:verify \
  --brief samples/projects/demo-crm/ui-brief.json \
  --manifest b-dense=samples/asset-manifest.b-dense.json \
  --runs /tmp/ua-2026-10-19-final/D4-runs
# EXIT=1
```

stdout：

```text
Phase 1A FAILED: 0 pages, 1 blocker
Run: /tmp/ua-2026-10-19-final/D4-runs/run-2026-10-19T14-32-34-060Z
- PROJECT-MANIFEST-PROJECT: Manifest for profile "b-dense" belongs to project "demo-orders", expected "demo-crm".
```

`state.json` 为 `stage: brief` / `status: failed`；`logs/run.log` 记录了同样的 rule 与 message。

D-5 缺少 manifest profile：

```bash
pnpm phase1:verify \
  --brief samples/ui-brief.sample.json \
  --manifest b-dense=samples/asset-manifest.b-dense.json \
  --runs /tmp/ua-2026-10-19-final/D5-runs
# EXIT=1
```

stdout：

```text
Phase 1A FAILED: 0 pages, 1 blocker
Run: /tmp/ua-2026-10-19-final/D5-runs/run-2026-10-19T14-32-34-453Z
- PROJECT-MANIFEST-MISSING: No asset manifest for profile "c-expressive" required by page(s): home-feed, item-detail, auth.
```

`state.json` 为 `stage: brief` / `status: failed`；`logs/run.log` 记录一致。D-4/D-5 均满足“打印 failure reason”的格式要求。

### D-6. 自定义 settings 页面 + bogus-setting（未复现预期）

临时输入：`/tmp/ua-2026-10-19-final/D6-project/ui-brief.json`。在 sample brief 副本中追加：

```json
{
  "id": "custom-settings",
  "name": "自定义设置",
  "purpose": "验证 settings 页面的 brief 字段与布局语义校验。",
  "archetype": "settings",
  "target": "web",
  "profile": "b-dense",
  "route": "/custom-settings",
  "roles": ["admin"],
  "requiredStates": ["default", "loading", "error"],
  "reqRefs": ["REQ-SETTINGS-001"],
  "fields": ["notifications", "bogus-setting"],
  "actions": ["保存设置"]
}
```

并在 `traceability.reqMap` 中加入 `"REQ-SETTINGS-001": ["custom-settings"]`。两份 manifest 使用 sample 副本。

```bash
pnpm phase1:verify \
  --brief /tmp/ua-2026-10-19-final/D6-project/ui-brief.json \
  --manifest b-dense=/tmp/ua-2026-10-19-final/D6-project/manifest-b-dense.json \
  --manifest c-expressive=/tmp/ua-2026-10-19-final/D6-project/manifest-c-expressive.json \
  --runs /tmp/ua-2026-10-19-final/D6-runs
# 实际 EXIT=0
```

实际 stdout：

```text
Phase 1A OK: 9 pages, 0 blockers
Run: /tmp/ua-2026-10-19-final/D6-runs/run-2026-10-19T14-32-45-577Z
```

`reports/validation.json` 中 `custom-settings` 为：

```json
{
  "pageId": "custom-settings",
  "findings": [],
  "blockers": 0,
  "major": 0,
  "minor": 0,
  "questions": 0,
  "passed": true
}
```

实际 `artifacts/page-spec/custom-settings.json` 的布局包含 `bogus-setting`：

```json
{
  "type": "FormField",
  "props": {
    "label": "bogus-setting"
  },
  "children": [
    {
      "type": "Select",
      "props": { "options": ["开启", "关闭"] }
    }
  ]
}
```

原因：当前 settings 模板把 `page.fields` 的每一项都渲染成 `FormField`，已知字段用本地化 label，未知字段回退为原始字段名（`label: meta?.label ?? field`）。因此 `bogus-setting` 会出现在布局中，`SEMANTIC-FIELD` 的“字段不在布局中”条件无法通过这个 CLI 构造触发。

为确认语义规则本身生效，补做对照诊断：把同一 `bogus-setting` 放到一个 **overview** 页面（overview 模板不渲染 fields），CLI 退出 1：

```text
Phase 1A FAILED: 9 pages, 1 blocker
Run: /tmp/ua-2026-10-19-final/D6-diag-runs/run-2026-10-19T14-34-25-395Z
- SEMANTIC-FIELD: Brief field "bogus-setting" does not appear as an exact value in the page layout.
```

这说明 `SEMANTIC-FIELD` 规则和 CLI 失败格式都正常；但该对照不是 settings 页面，不能证明 settings 已不再被语义校验整体豁免。D-6 按本次要求判定为 **失败（未复现预期）**，需要开发侧提供一个 CLI 可构造的 settings 缺失字段用例，或补充直接针对 validator 的 fixtures。

## 发现的问题（按严重度）

### 1. 中（验收覆盖）：D-6 的 settings 语义回归无法通过当前 CLI 构造

- 期望：`custom-settings` 的 `fields` 含 `bogus-setting`，退出非 0，并打印 `SEMANTIC-FIELD`。
- 实际：退出 0，`9 pages, 0 blockers`；`custom-settings` 的 page-spec 将 `bogus-setting` 渲染为 `FormField.props.label`，布局中存在该字段。
- 产物：`/tmp/ua-2026-10-19-final/D6-runs/run-2026-10-19T14-32-45-577Z/artifacts/page-spec/custom-settings.json` 与同 run 的 `reports/validation.json`。
- 影响：无法用本次 CLI 回归证明 settings 已不再被语义校验整体豁免。overview 对照能触发 `SEMANTIC-FIELD`，说明规则本身可用；缺口在“settings 布局缺失字段”的构造方式/编译行为。
- 建议：提供 CLI 可构造的 settings fixture，或在 validator 层增加直接构造“settings layout 缺失字段”的回归；若产品意图是忽略未知 settings 字段，再调整 compiler 并同步验收口径。

### 2. 低（文案口径）：customers-list spec 的项目级 nav 含“订单”

- 证据：`/tmp/ua-2026-10-19-final/B-runs/run-2026-10-19T14-32-19-161Z/artifacts/page-spec/customers-list.json` 第 26 行附近，`layout.props.nav` 为 `["概览","订单","客户","设置"]`。
- 来源：临时 brief 是 `demo-orders` sample 的副本，`ia.navigation.primary` 本来就包含“订单”；这是项目级导航，不是页面模板把订单文案写进客户页。
- 影响：页面标题、FilterBar、DataTable、Button、EmptyState、interactions 均无订单文案；`新建订单`、`暂无订单`、`status/date/keyword` 均未出现。按本次明确列出的禁用词判定通过；如果验收口径要求整个 spec 任意位置都不能出现“订单”二字，则该项会不通过，需要先裁剪项目导航或使用独立客户的 brief。

### 3. 已修复：D-3 的裸错误信息

- 前次复测中，只传 brief、不传 manifest 只打印 `missing manifests: ...`，没有 `Phase 1A FAILED` 前缀。
- 本次在 `0084181` 上复测，stderr 为 `Phase 1A FAILED: missing manifests: pass --manifest <profile>=<path> or --project`，退出 1，且仍不创建 run 目录。该项通过。

## 结论

- **A：通过。** 默认 sample 在 `0084181` 上退出 0，8 页、0 blocker，state 为 done/success，8 份 page-spec 与 8 条 validation 全通过。
- **B：通过。** 自定义第 9 页从 brief 正确编译，9 页、0 blocker；客户字段、两个动作、空态均进入布局；无订单页面文案泄漏；semantic findings 为空。唯一相关字样是项目级 nav 的“订单”，见问题 2。
- **C：通过。** 独立 `demo-crm` 项目可运行，1 页、0 blocker；联系人字段、动作、空态、导航正确；无订单文案。
- **D：D-1 至 D-5 通过；D-6 场景在 CLI 层不可构造。** `--help`、未知参数、缺 manifest、项目不匹配、缺 profile 的退出码和错误信息均符合预期；D-3 已改为 `Phase 1A FAILED: missing manifests...` 且不创建 run。D-6 按指定 settings 构造未触发 `SEMANTIC-FIELD`，原因是 settings 模板会把 brief 的每个字段渲染进布局，CLI 无法制造“布局缺失 settings 字段”的输入；规则本身由 validator 回归测试覆盖，见文末开发侧补充。
- **总体：** 在 `0084181` 上，A/B/C 与 D-1 至 D-5 没有回归，D-3 修复有效。D-6 是黑盒测试构造限制，不是产品缺陷；settings 语义校验已在 validator 层验证通过。

所有临时 brief/manifest/运行产物位于 `/tmp/ua-2026-10-19-final/`；未污染仓库 `runs/`。唯一写入仓库的文件是本记录。

## 开发侧补充（2026-10-19）

D-6 的场景在当前 CLI 架构下无法构造，原因是编译器会从 brief 确定性生成 Page Spec：settings 模板对 `page.fields` 逐项渲染 FormField，已知字段使用本地化 label（`notifications` → `通知设置` 等），未知字段直接使用原始 key。因此在 CLI 输入里声明 `bogus-setting`，编译结果必然包含它，`SEMANTIC-FIELD` 不会也不应报缺失。

settings 语义校验改在 validator 层验证，测试位于 `pipeline/packages/validators/tests/validators.test.ts`：

- 测试名：`checks settings fields via their localized labels instead of skipping them`
- 做法：拿未修改的 settings Page Spec，配一个额外声明 `bogus-setting` 的 brief page；布局里没有该字段，期望恰好一条 `SEMANTIC-FIELD`，evidence 为 `bogus-setting`。
- 定向运行：`pnpm vitest run packages/validators/tests/validators.test.ts -t "checks settings fields"` → 1 passed。
- 同一测试还先验证了未篡改的 settings 页面（本地化 label）0 semantic findings。

此外，独立复测已用 overview 页面的 `bogus-setting` 对照证明：CLI 能正常输出 `- SEMANTIC-FIELD: ...`，说明规则与 CLI 失败格式都已接通。

因此 D-6 的结论是“CLI 黑盒场景不可构造”，不是“settings 语义豁免仍然存在”。Phase 1B 的 settings 校验可以按已覆盖处理。

