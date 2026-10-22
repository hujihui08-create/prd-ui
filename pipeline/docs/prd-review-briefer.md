# PRD Review + UI Briefer

Phase 2 前半段：把 Markdown PRD 变成已签核的 `ui-brief.json`。它由确定性的 intake/normalize、PRD Reviewer、IA Agent 和 UI Briefer 组成；不调用模型写 Page Spec，也不改 renderer。

## 命令

从 `pipeline/` 运行。

```bash
# 1) 8 页 sample PRD：PRD review + IA map；无 blocker 时停在 awaiting_signoff
pnpm intake:run \
  --project samples/project.demo-orders.yaml \
  --prd samples/sample-prd.md \
  --runs /tmp/intake-runs \
  --fixtures samples/agents/intake

# 2) 人工看 findings 后，带 PRD/IA 签核继续到 brief 草稿
pnpm intake:run \
  --project samples/project.demo-orders.yaml \
  --prd samples/sample-prd.md \
  --resume /tmp/intake-runs/<runId> \
  --fixtures samples/agents/intake \
  --signoff-prd-ia /tmp/signoff-prd-ia.md

# 3) 人工看 brief draft 后，带 brief 签核并发布
pnpm intake:run \
  --project samples/project.demo-orders.yaml \
  --prd samples/sample-prd.md \
  --resume /tmp/intake-runs/<runId> \
  --fixtures samples/agents/intake \
  --signoff-prd-ia /tmp/signoff-prd-ia.md \
  --signoff-brief /tmp/signoff-brief.md \
  --publish-brief /tmp/demo-orders-ui-brief.json
```

真实 dsh：

```bash
cd pipeline
set -a; . ./.env; set +a
DSH_HOME="$PWD/dsh/home" pnpm intake:run \
  --project samples/project.demo-orders.yaml \
  --prd samples/sample-prd.md \
  --runtime dsh \
  --runs /tmp/intake-dsh
```

employee-app 两页切片：

```bash
pnpm intake:run \
  --project samples/projects/employee-app/project.yaml \
  --prd samples/projects/employee-app/prd.md \
  --fixtures samples/agents/intake-employee-app \
  --runs /tmp/intake-employee
```

## 参数

| 参数 | 说明 |
|---|---|
| `--project <path>` | 项目 YAML；默认 employee-app |
| `--prd <path>` | PRD Markdown；默认取 `project.yaml` 的 `prd` |
| `--runs <dir>` | 新 run 的输出目录 |
| `--resume <dir>` | 继续已有 run；校验 PRD hash |
| `--runtime standalone\|dsh` | 执行适配器；默认 standalone |
| `--fixtures <dir>` | standalone 的 `ia` / `prd-review` / `ui-briefer` fixtures |
| `--pricing <path>` | 定价文件；默认 `pipeline/pricing.json` |
| `--max-cost-cny <n>` | 整 run 成本上限；默认 10 |
| `--allow-unknown-cost` | usage 不完整时继续，标记 degraded |
| `--signoff-prd-ia <path>` | PRD/IA 签核 Markdown |
| `--signoff-brief <path>` | Brief 签核 Markdown |
| `--publish-brief <path>` | 成功后将签名 brief 原子写入目标路径 |
| `--brief-version <semver>` | 最终 brief 版本；默认 `0.1.0` |
| `--existing-brief <path>` | 仅用于 semantic regression 对照，不作为事实源 |
| `--force` | 允许覆盖内容不同的已发布 brief |
| `--json` | stdout 只输出一个 JSON summary |
| `--help` | usage |

退出码：0 `success`，1 `awaiting_signoff` / `blocked` / `partial` / `failed` / 预算或 usage 失败，2 参数错误。

## 流程与状态

```text
init -> intake -> review（PRD Reviewer + IA 并行）
     -> prd_ia_gate -> brief -> brief_gate -> done
```

| status | 含义 |
|---|---|
| `success` | 两道签核完成，`ui-brief.json` 已写 |
| `awaiting_signoff` | 门禁已过，缺签核；`state.json` 的 `stage` 指向等待点 |
| `blocked` | 有未 waiver 的 blocker、blocking question 或 compile 失败 |
| `partial` | PRD Reviewer / IA 一个失败，另一个产物保留 |
| `failed` | intake/输入/agent 失败 |
| `budget_exceeded` / `usage_incomplete` | 预算或 usage fail-closed |

- `--resume` 复用已完成的 agent 产物；PRD hash 变化会报 `PRD_CHANGED`。
- 第一段签核后 resume 只运行 UI Briefer；brief gate 等待签核时 resume 只重新 gate，不重复调用 briefer。
- `--publish-brief` 只在 `success` 时执行；默认拒绝覆盖不同内容，`--force` 才覆盖。

## 签核

PRD/IA 签核（`signoff/prd-ia.md`）：

```md
# PRD/IA signoff

<!-- signoff
{
  "signer": "张三",
  "date": "2026-10-20",
  "answers": [
    { "questionId": "PRD-004", "answer": "首版只读", "source": "产品决策" }
  ],
  "waivers": [
    {
      "findingId": "PRD-003",
      "owner": "张三",
      "reason": "字段表下一轮补",
      "expires": "2026-11-20"
    }
  ],
  "approvals": []
}
-->
```

Brief 签核（`signoff/brief.md`）必须带 `briefHash`，且与候选 brief 的 canonical hash 一致：

```md
# Brief signoff

<!-- signoff
{
  "signer": "李四",
  "date": "2026-10-20",
  "briefHash": "sha256:...",
  "answers": [],
  "waivers": []
}
-->
```

- `answers` 只用于 blocking PRD questions；`approvals` 可选，提供时按 owner 检查。
- v0 不允许 brief waiver；brief 的结构性 blocker 必须修 brief 或回到 PRD。
- 等待签核时，`--json` summary 的 `brief.hash` 就是需要写进 brief signoff 的 hash。

## 产物

```text
runs/<runId>/
  state.json
  intake.json
  input/prd.md
  artifacts/
    normalized-prd.json
    prd-review.json / prd-findings.json / prd-readiness.json / prd-extract.json / prd-review.md
    ia-map.json / ia-findings.json / ia-proposed.json / ia-review.md
    ui-brief.draft.json / questions.json / assumptions.json
    ui-brief.json                # 仅 success
    brief-published.json         # 仅 --publish-brief
  findings/
    prd-gate.json / ia-gate.json / brief-gate.json
  signoff/
    prd-ia.md / brief.md
  agents/
    ia/ / prd-review/ / ui-briefer/
  logs/intake.ndjson
```

- `ui-brief.json` 是纯 `UiBrief`，可直接被 `pnpm agent:run` 消费。
- agent 原始输出、prompt hash、usage/cost、raw/stdout/stderr 都在 `agents/<role>/`，统一脱敏。
- `state.json` 是唯一状态源；resume 以它为准。

## 门禁摘要

PRD：required sections、占位符、blocker evidence/confidence、question 预算、waiver/answers/approvals、PRD/IA signoff。

IA：复用 M1 `IA_*` 结构门禁，页面/角色 scope 来自 PRD extract。

Brief：schema、PRD hash、页面集合、角色/路由、archetype/profile、状态矩阵、reqRefs/traceability、占位符、blocking questions/assumptions、compiler dry-run + Phase 1 语义 validators、brief signoff hash。

Brief 数据完整性（warning，不阻断）：Briefer 必须为每个页面字段生成 `fieldLabels`，并按页型生成示例数据——list 用 `mockData.rows`（3–5 行）、detail 用 `mockData.values`、overview 用 `mockData.listItems`、feed 用 `feedItems`。缺失时 gate 报 `BRIEF_FIELD_LABELS_MISSING` / `BRIEF_MOCK_DATA_MISSING`，提示换真实 PRD 后会出现骨架或英文 id。示例数据必须从 PRD 验收示例/字段表派生，不得使用真实 PII。

完整代码见 `core/intake/src/gates.ts`；brief 结构性 blocker 不写最终 brief。

## 样本与限制

- `samples/agents/intake`：demo-orders 8 页 fixture（含 `fieldLabels` / `mockData` / `feedItems`）；`samples/agents/intake-employee-app`：employee-app 2 页 fixture（含库存页中文标签与 home typed content）；`samples/agents/intake-appointments-03`：03 预约与告知 4 页 fixture（真实 run 固化，含 `mobile-list` / `mobile-form`）。
- `samples/projects/employee-app-appointments-03`：从 `03-预约与告知.md` + `00-总纲.md` 共享规则整理的四页真实 PRD 切片；`intake:run` 真实 dsh 4 页、brief gate 通过、publish，¥0.5147。
- `samples/projects/employee-app-phase2`：从 00–04 拼的 8 页真实 PRD 切片（今日、客户搜索、客户详情、预约详情、新增/改期、术后告知、预约列表、回访登记）；真实 dsh 8 页、brief gate 通过、publish，¥0.5249（IA sample waivers + 一次确定性 brief 收敛）。fixtures 在 `samples/agents/intake-employee-app-phase2`。
- 8 页 sample PRD 的 v0 验收是 review + brief + compile dry-run；8 页 M1（真实 dsh）、Spec Engineer 与 HTML 渲染已经在 `samples/project.demo-orders-intake.yaml` 上跑通。
- 真实 dsh：2 页 employee-app 完整跑通（success + publish，累计 ¥0.6948）；8 页 sample 使用 `prd-ui-intake` profile（65536 maxTokens），真实 findings 以 sample waiver 通过后 brief gate 通过，success + publish，累计 ¥0.90666。默认离线验收仍用 scripted fixtures。
- Task 1 真实 dsh 干净 run：8 页、brief gate 通过、`awaiting_signoff`，总成本 ¥0.5938（PRD review ¥0.1760 + IA ¥0.2050 + briefer ¥0.2128，均 1 次调用），产出 `orders-list` 5 rows、`order-detail` 5 values、overview 4 listItems、feed 4 feedItems 和完整 `fieldLabels`。Run：`/tmp/intake-task1-dsh-clean/run-2026-10-21T07-34-29-193Z`。
- Briefer 已从 PRD 示例生成 `home` 的 `content`（quickActions/appointments/callbacks）和按项目的 `noticeBlocks`；`inventory-list` 的 typed 字段仍是 employee-app 专用。其他页型使用通用字段，未知页型由 briefer 发 blocking question。
- 未解析的 visual/motion 细节不在 intake 范围；交给 M1 Visual Style Agent。
- 真实 dsh 成本受 provider 定价影响；默认整 run 上限 10 CNY，usage 不完整时 fail closed。
