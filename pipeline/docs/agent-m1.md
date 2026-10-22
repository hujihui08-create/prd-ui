# M1 Agent 层（IA / Interaction / Visual Style）

M1 在确定性管线之上增加三个只读设计 Agent（IA / Interaction / Visual Style），产物是结构化 spec 与 findings，供人工决策和 Phase 2 的 Spec Engineer 消费。M1 **不修改 Page Spec、HTML、Figma 或 renderer**。

v0.4 另有一个独立的 **Visual Critic** 角色：它不属于 `agent:run` 的三 Agent 流水线，由 `visual:review --runtime dsh --profile prd-ui-visual` 在渲染后调用，对 24 张截图做主观视觉评审；findings 只作 advisory，blocker 需要人工 waiver。

## 命令

从 `pipeline/` 运行。

```bash
# 离线：scripted fixtures，跑三个 Agent 但不产生 pass（awaiting_signoff）
pnpm agent:run \
  --project samples/projects/employee-app/project.yaml \
  --runs /tmp/m1-agent-runs \
  --allow-unreviewed

# 离线 + 人工签核文件（success）
pnpm agent:run \
  --project samples/projects/employee-app/project.yaml \
  --runs /tmp/m1-agent-runs \
  --signoff-ia /tmp/signoff-ia.md \
  --signoff-visual-style /tmp/signoff-visual-style.md

# 只跑 IA（例如先处理 IA blocker）
pnpm agent:run --only-role ia --runs /tmp/m1-ia --allow-unreviewed

# 真实 dsh（需要 provider env；CLI 不自动加载 .env）
set -a; . ./.env; set +a
DSH_HOME="$PWD/dsh/home" pnpm agent:run \
  --project samples/projects/employee-app/project.yaml \
  --runtime dsh \
  --runs /tmp/m1-agent-dsh
```

常用参数：

| 参数 | 说明 |
|---|---|
| `--project <path>` | 项目 YAML；默认 employee-app |
| `--brief <path>` | 覆盖项目配置的 brief；用于消费 intake 签核后的 brief |
| `--prd <path>` | PRD 原文/摘要；默认取 `project.yaml` 的 `prd` |
| `--runs <dir>` | run 产物目录 |
| `--runtime standalone\|dsh` | 执行适配器；默认 standalone |
| `--profile <name>` | dsh profile；默认 `prd-ui-agents`；8 页 M1 可用 `prd-ui-intake`（65536 maxTokens）；Visual Critic 用 `prd-ui-visual`（同样是 65536 maxTokens，只读工具面） |
| `--fixtures <dir>` | standalone fixtures；默认 `samples/agents/m1` |
| `--only-role <role>` | 只跑某个 design role；IA 始终运行 |
| `--max-cost-cny <n>` | 整 run 成本上限；默认 10 |
| `--allow-unknown-cost` | usage 不完整时显式继续（标记 degraded） |
| `--allow-unreviewed` | 缺签核时仍运行 design；最终状态必须是 `awaiting_signoff` |
| `--signoff-ia <path>` | 把 IA 签核复制进 run |
| `--signoff-visual-style <path>` | 把视觉签核复制进 run |
| `--json` | stdout 只输出一个 JSON summary |

## 状态与门禁

```text
init -> ia -> ia_gate -> design (interaction + visual 并行) -> design_gate -> signoff -> done
```

- IA 必须先通过；blocker 没有有效 waiver 时不会进入 design。
- Interaction / Visual 相互独立，一个失败不会删除另一个的产物；run 变为 `partial`。
- 最终 `success` 需要：所有运行过的 Agent 通过、门禁 passed/waived、所需签核有效。
- `awaiting_signoff` 不算通过；`--allow-unreviewed` 也不会产生 `success`。
- `usageComplete=false` 且预算启用时 fail closed；`--allow-unknown-cost` 可继续，但 run 标记 `degraded`。
- 模型/网络错误每个 Agent 最多 3 次；schema 修复 1 次（runner 内，usage 合并）；门禁修复 2 轮。

消费方可以根据 `state.json` 的 `status` 判断：

| status | 含义 |
|---|---|
| `success` | 所有门禁通过、签核有效 |
| `awaiting_signoff` | 产物已完成，缺人工签核 |
| `partial` | 一个 design Agent 失败，另一个产物仍可用 |
| `failed` | IA 失败或全部 design Agent 失败 |
| `budget_exceeded` | 超出 10 CNY 或单 Agent 上限 |
| `usage_incomplete` | usage 不完整且未允许未知成本 |

## 签核格式

`signoff/ia.md` 与 `signoff/visual-style.md` 是 Markdown，必须包含一个机器可读块：

```md
# IA signoff

<!-- signoff
{
  "signer": "张三",
  "date": "2026-10-20",
  "waivers": [
    {
      "findingId": "IA-003",
      "owner": "张三",
      "reason": "库管落地页在下一个切片补齐",
      "expires": "2026-11-20"
    }
  ]
}
-->
```

- `signer` / `date` 必填；`date` 必须可解析。
- waiver 必须有 `findingId`、`owner`、`reason`、`expires`；过期 waiver 无效。
- 只有 blocker 需要 waiver；major/minor 不阻断。
- 文件缺失或块无效 → 该签核视为未签，run 为 `awaiting_signoff`。

### 无模型调用签核

如果 run 已完成 artifacts、状态为 `awaiting_signoff`，可以用 `agent:sign` 复用现有 run，只校验 gate/签核并更新 `state.json`，不重跑 Agent：

```bash
pnpm agent:sign \
  --run /tmp/m1-8p/<runId> \
  --signoff-visual-style /tmp/signoff-visual-style-8p.md
```

- `--signoff-ia <path>` 仅在 run 尚未有 IA 签核时需要。
- 成功时写 `signoff/visual-style.md`、`agent-sign.json`，state 变为 `success`。
- gate 未通过、签核缺失/无效时退出 1，不修改 state。

## 产物

```text
runs/<runId>/
  state.json
  agent-run.json                 # CLI summary（status/gates/agents/signoff/cost）
  artifacts/
    ia-map.json
    ia-findings.json
    ia-proposed.json
    ia-review.md
    interaction-spec.json
    motion-spec.json
    interaction-review.md
    visual-style.json
    asset-briefs/<assetId>.json  # 纯 AssetBrief，可直接交给 M0 资产评审
  agents/<role>/
    prompt.md
    output.json
    raw.json
    stdout.txt / stderr.txt
    session.json
    history.json
    attempts/<nn>/...
  findings/
    ia-gate.json
    interaction-gate.json
    visual-style-gate.json
  signoff/
    ia.md
    visual-style.md
  logs/agent.ndjson
```

- 所有结构化 artifacts 带 `schemaVersion`、`project`、`generatedAt`、`model`、`promptHash`。
- `asset-briefs/*.json` 是例外：为了保持 M0 `AssetBrief` 严格 schema 可直接消费，brief 文件本身不带 envelope；envelope 在 `visual-style.json` 与 `agents/visual-style/session.json`。
- 原始输出、stdout/stderr、日志统一脱敏；不写 key。

## 门禁代码（摘要）

IA：`IA_PAGE_MISSING`、`IA_PAGE_UNKNOWN`、`IA_DUPLICATE_PAGE`、`IA_FLOW_STEP_UNKNOWN`、`IA_CROSSLINK_UNKNOWN`、`IA_TAB_OVERFLOW`、`IA_BLOCKER_UNWAIVED`、`IA_WAIVER_INVALID`、`IA_DUPLICATE_FINDING`。

Interaction：`INTERACTION_PAGE_MISSING`、`INTERACTION_ACTION_MISSING`、`INTERACTION_STATE_MISSING`、`INTERACTION_DEFAULT_EMPTY`、`INTERACTION_FOCUS_EMPTY`、`INTERACTION_TRANSITION_UNKNOWN`、`MOTION_PRESET_UNKNOWN`、`MOTION_EASING_NOT_TOKEN`、`MOTION_DURATION_NOT_TOKEN`、`MOTION_REDUCED_MISSING`。

Visual Style：`VISUAL_PALETTE_EMPTY`、`VISUAL_TYPOGRAPHY_EMPTY`、`VISUAL_ASSET_STRATEGY_MISSING`、`ASSET_BRIEF_MISSING`、`ASSET_BRIEF_DUPLICATE`、`ASSET_BRIEF_KIND_MISMATCH`、`ASSET_SOURCE_STRATEGY_MISMATCH`（extra brief 为 warning）。

完整定义见 `core/agents/src/gates/`。

## 退出码

| code | 含义 |
|---|---|
| 0 | `success` |
| 1 | `awaiting_signoff` / `partial` / `failed` / `budget_exceeded` / `usage_incomplete` |
| 2 | 参数错误（未知参数、非法 role、缺 PRD） |

## 8 页出口（2026-10-21）

- `samples/project.demo-orders-intake.yaml` 指向 signed 8 页 brief。
- 真实 dsh M1：`--profile prd-ui-intake`，IA-001/002 以 sample waiver 处理；
  `gates={ia:waived, interaction:passed, visualStyle:passed}`，¥0.3298，
  `usageComplete=true`；随后用 `agent:sign` 完成 visual-style 签核，
  `status=success`。
- 产物为 8 页 IA/interaction/motion/visual spec；Spec Engineer 消费后产出 8 个
  Page Spec。

## 03 真实 PRD 四页切片（2026-10-21）

- 项目：`samples/projects/employee-app-appointments-03`（预约详情、新增/改期、
  术后告知、预约列表）。
- 真实 dsh M1：`--profile prd-ui-intake`，IA-001/002 以 sample waiver 处理；
  `gates={ia:waived, interaction:passed, visualStyle:passed}`，¥0.2746，
  `usageComplete=true`；`agent:sign` 完成 visual-style 签核后 `status=success`。
- Spec Engineer 产出 4 Page Specs / 0 blockers；renderer 产出 4 页 HTML +
  `index.html`，Phase 1 `4 pages / 0 blockers`。
- 该切片新增 `mobile-list` / `mobile-form` archetype；renderer v0.1 已补
  七列日历、固定操作栏、detail 主/次动作拆分、表单单主 CTA 和告知分块。
  业务状态动作切换与真正的表单 mode 仍留待后续。

## Phase 2 8 页真实 PRD（2026-10-21）

- 项目：`samples/projects/employee-app-phase2`（今日、客户搜索、客户详情、
  预约详情、新增/改期、术后告知、预约列表、回访登记）。
- 真实 dsh intake：8 页、PRD readiness ready、brief gate passed、publish，
  ¥0.5249；IA-001..IA-010 以 sample waiver 处理，brief 做过一次确定性收敛
  （home fields/route/warehouse create/host create action）。
- 真实 dsh M1：`/tmp/m1-phase2d/run-2026-10-21T10-46-02-038Z`，
  `gates={ia:waived, interaction:passed, visualStyle:passed}`，`agent:sign`
  后 `status=success`，¥0.4355，4 个标准图标 asset briefs。
- Asset review：`asset:review --briefs` `4/4 passed`。
- Spec Engineer：8 Page Specs、8 motion pages、0 blockers、20 warnings，
  assets referenced=2 / unused=2 / missing=0；renderer 8 页 + index，
  Phase 1 `8 pages / 0 blockers`。
- 限制：Phase 2 出口依赖 sample IA waivers 和 brief patch；下一轮应重跑
  intake 让 briefer 直接生成合规 brief 并重新签核。

## Phase 2 clean 收尾 M1（2026-10-22，v0.3.1）

- 项目：`samples/projects/employee-app-phase2`；clean intake
  `run-2026-10-22T03-09-28-544Z`，0 waiver / 0 手工 brief patch，brief hash
  `sha256:b558b57a…b8335`。
- 真实 dsh M1：`run-2026-10-22T03-16-05-257Z`，
  `gates={ia:passed, interaction:passed, visualStyle:passed}`，0 waivers；
  visual-style 由 `pnpm agent:sign` 签核（不调用模型），最终
  `status=success`。
- 成本 ¥0.4399832736（IA ¥0.1676724192 + interaction ¥0.2259093024 +
  visual-style ¥0.046401552），`usageComplete=true`。
- 产物：8 页 IA map/findings、interaction spec、motion spec、visual style、
  4 个 asset briefs（`icon-home` / `icon-plus` / `icon-search` / `icon-user`）
  和两道 signoff。
- 已知债务：`interaction-spec.json` 的 `cd.new-appointment` 仍写“预填并锁定
  客户”，与已签核 brief（new 可编辑、仅 reschedule 锁定）不一致；artifact
  保留不改，留给 v0.4 对齐 prompt/schema。详见
  `docs/superpowers/specs/2026-10-22-clean-phase-2-finish-design.md` §9。

## Visual Critic（v0.4）

- 角色与 schema：`core/agents/src/roles/visual-critic.ts`；`AgentTaskRoleSchema`
  包含 `visual-critic`。
- 输入：截图 manifest（24 张，相对 run 目录）、Page Spec、profile / visual
  style、确定性 findings；输出 `VisualCritique`（verdict + findings）。
- 规则：只做主观视觉判断（层级、留白、对齐、密度、视觉平衡、品牌一致性），
  不重复 console/overflow/diff；`blocker` 必须有 owner/reason/expires 的人工
  waiver 才能通过，`major` 为 warning，`minor` 记录不阻断。
- 运行时：`prd-ui-visual`（vision provider；`read` / `read_image` / `glob` /
  `grep`；无 write/edit/bash/workflow/subagent/web；`maxTokens=65536`）。
  `visual:review` 的 critic 超时默认 900000ms，`--max-cost-cny 3`，
  usage fail-closed，一次 schema repair。
- 真实 8 页 run（final focused round）：`run-2026-10-22T11-44-01-938Z`，
  24 张截图、0 console / 0 overflow / diff 24/0/0、11 findings（6 major /
  5 minor / 0 blocker）、`usageComplete=true`、¥0.3260564064；按 stopping
  rule 签核（`waivers=[]`），`status=passed`；critic verdict 仍 changes，
  6 major 记为 v0.5 债。
- 采样波动：首次 run 12 findings，签核后重跑得到另一组 10 findings；最终 run
  以自身 findings 签核。确定性 findings replay 尚未实现。

## per-profile M1（2026-10-21）

- `agent:run` 从 brief 页面收集 profile，向 Interaction prompt 传
  `catalogsByProfile` / `motionTokensByProfile`；prompt 增加 page → profile
  映射和“每页只用自己 profile 的组件/动效”规则。
- 单 profile 路径保持不变；`catalog` / `motionTokens` 仍表示
  `brief.meta.profile`。
- 真实 8 页 demo-orders run（b-dense + c-expressive）：
  `/tmp/m1-perprofile3/run-2026-10-21T10-06-55-674Z`，
  `gates={ia:waived, interaction:passed, visualStyle:passed}`，
  `awaiting_signoff`，¥0.5105，`usageComplete=true`。
- Visual Style 使用 `deriveStandardAssetInventory`；该 run 产出 4 个标准
  图标 briefs，asset review 可直接消费。
- per-profile 目前是 **prompt 约束**；Interaction gate 仍只校验
  action/state/motion 语法，不校验组件/token 的 profile 归属。

## 真实 dsh 回归（2026-10-20）

- Profile：`prd-ui-agents`（仅 base/headless/pi-ai，无工具插件）。
- 模型：`deepseek-flash`；prompt 与 model 写入 `agents/<role>/session.json` 与 artifacts。
- 三个 Agent 各 1 次调用，无 schema repair、无门禁修复：
  - IA：input 254 + cache 14,720 / output 7,055；¥0.0621
  - Interaction：input 9,528 + cache 6,144 / output 6,531；¥0.0773
  - Visual Style：input 6,373 + cache 6,016 / output 6,328；¥0.0687
  - 合计 **¥0.2081**，`usageComplete=true`，低于 10 CNY 上限。
- 结果：`status=success`，`gates={ia:waived, interaction:passed, visualStyle:passed}`，`signoff={ia:true, visualStyle:true}`，10 个 asset briefs。
- IA 在 employee-app 切片上发现了 3 个真实 blocker（3 个死 Tab、brief 缺少库存入口、库管无落地页）；真实 run 用开发 waiver 继续，以便验证 Interaction/Visual。这些 blocker 不是测试噪声，是切片本身待修的问题。
- 另一次只用 `--allow-unreviewed` 的真实 run 在 IA 后按设计停在 `awaiting_signoff`，成本 ¥0.2756。

## 限制

- M1 不编译 Page Spec、不渲染 HTML、不跑资产评审；`asset-briefs/*` 供 M0 流程或 Phase 2 消费。
- Spec Engineer v0 已把 interaction/motion/asset 写进 Page Spec；v0.4 clean 8 页 motion 已动画到 HTML，其他项目未迁移 motion 仍是 warning。
- 没有签核 UI；CLI 只校验文件内容。
- `--allow-unreviewed` 仅用于开发冒烟，不会产生 `success`。
- `prd-ui-agents` profile 没有工具插件，但 dsh base 自身的能力边界不属于 M1 的沙箱范围。
- Visual Critic 是 advisory；真实模型的 findings 有采样波动，不能当作确定性 gate。
