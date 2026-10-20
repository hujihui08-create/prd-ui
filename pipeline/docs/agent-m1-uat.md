# M1 Agent Layer UAT

- 日期：2026-10-20
- 范围：IA / Interaction Design / Visual Style 三个 Agent、`runM1`、`agent:run`、dsh runner、门禁、预算、签核
- 环境：macOS arm64、Node + pnpm workspace、pinned dsh `0.2.1-rc.2`、`deepseek-flash`
- 结论：**M1 验收通过**；employee-app 切片本身仍有 3 个 IA blocker（见 §4），不是 M1 缺陷。

## 1. 自动化结果

| 项 | 结果 |
|---|---|
| `pnpm test` | **421 passed** / 35 files |
| `pnpm test:dsh` | **2 passed**（asset review + M1 IA，真实 pinned dsh + 本地 mock） |
| `pnpm typecheck` | clean |
| employee-app phase1 | `2 pages / 0 blockers` |
| standalone asset review | `13 assets / 13 passed` |
| real dsh asset review | `13 assets / 13 passed`，¥0.3541，`usageComplete=true` |

## 2. 测试矩阵 T-M1-01..20

| ID | 层 | 覆盖 | 证据（测试文件 → 用例） | 结果 |
|---|---|---|---|---|
| T-M1-01 | unit | 角色 schema 接受合法 fixture、拒绝未知/缺失字段 | `core/agents/tests/contracts.test.ts` → “parses a valid IA output”, “parses a valid visual output and rejects invalid asset briefs”, “requires reduced motion…” | PASS |
| T-M1-02 | unit | IA blocker / waiver / pass 路由 | `core/agents/tests/gates.test.ts` → “passes a clean map”, “fails an unwaived blocker”, “passes with a valid waiver…”, “fails an expired waiver” | PASS |
| T-M1-03 | unit | IA 不能输出 Page Spec/视觉字段 | `contracts.test.ts` → “rejects visual/page-spec fields in an IA output” | PASS |
| T-M1-04 | unit | Interaction 缺 reaction/状态/motion token/reducedMotion | `gates.test.ts` → interaction gate 6 cases | PASS |
| T-M1-05 | unit | Visual 缺 palette/typography/assetStrategy/brief | `gates.test.ts` → visual gate 7 cases（含 image source strategy） | PASS |
| T-M1-06 | unit | 预算超限停止；剩余 agent `budget_exceeded` | `core/agents/tests/run-m1.test.ts` → “stops on budget…”, “enforces a lower per-agent cap”；`agent-cli.test.ts` → “stops on budget…”, “reports budget_exceeded in the JSON summary” | PASS |
| T-M1-07 | unit | `usageComplete=false` fail closed；`allowUnknownCost` 继续 | `run-m1.test.ts` → “fails closed on incomplete usage, and allows it explicitly”；`agent-cli.test.ts` → “fails closed on incomplete usage unless explicitly allowed” | PASS |
| T-M1-08 | unit | 单 agent 失败不污染其他产物；run partial/failed | `run-m1.test.ts` → “isolates a design failure…”, “stops before design when IA has an unwaived blocker”；`agent-cli.test.ts` → “keeps the other design artifact…” | PASS |
| T-M1-09 | unit | schema repair 1 次、usage 合并；两次失败 → agent error | `runtimes/dsh/tests/agent-runner.test.ts` → “repairs invalid JSON once and merges both usages”, “reports AGENT_INVALID_OUTPUT after the repair also fails”, “skips the schema repair when the budget callback denies it” | PASS |
| T-M1-10 | unit | 模型/网络重试 3 次；门禁修复 2 轮 | `run-m1.test.ts` → “retries model errors up to three attempts…”, “fails after three model errors”, “repairs a failed design gate twice…”, “stops after two gate repair rounds…” | PASS |
| T-M1-11 | unit | artifacts 严格 schema + `schemaVersion` | `run-m1.test.ts` → “records stage progression and the complete evidence set”；CLI success test；`writeArtifact` 在写入前 parse | PASS |
| T-M1-12 | unit | raw evidence / usage / promptHash 写入 `agents/<role>/` | `run-m1.test.ts` → “records stage progression and the complete evidence set”（8 个 evidence 文件/角色）；“redacts secrets…records model/promptHash” | PASS |
| T-M1-13 | unit | 日志/raw/stdout/`--json` 脱敏 | `run-m1.test.ts` → “redacts secrets in evidence and logs…”；`agent-cli.test.ts` → “redacts secrets from the JSON summary” | PASS |
| T-M1-14 | unit | IA 先于 Interaction/Visual；后两者并行；无 agent-to-agent 调用 | `run-m1.test.ts` → “runs interaction and visual style concurrently after IA”（barrier 证明并发）、“runs IA first…” | PASS |
| T-M1-15 | integration | `runM1` + ScriptedAgentRunner 完整 artifacts + signoff | `run-m1.test.ts` → “runs IA first, then produces the full artifact set with signoff”；`agent-cli.test.ts` → “reaches success with both signoffs” | PASS |
| T-M1-16 | integration | `--allow-unreviewed` 只产生 `awaiting_signoff` | `run-m1.test.ts` → “runs design with --allow-unreviewed but never reports success”；`agent-cli.test.ts` → “runs the scripted fixtures and stays awaiting_signoff” | PASS |
| T-M1-17 | integration | phase1 `2/0` 与 asset review `13/13` 不回归 | 手动命令（§1）；现有 phase1/asset CLI 测试全绿 | PASS |
| T-M1-18 | dsh contract | `--json -` + stdin + `final.text` + `step_end.usage` | `runtimes/dsh/tests/dsh-process.test.ts` → `runDshTask` 2 cases；`agent-runner.test.ts` → “runs one dsh task…” | PASS |
| T-M1-19 | dsh integration | 本地 mock dsh 跑 IA fixture | `runtimes/dsh/tests/agent-integration.test.ts`（`pnpm test:dsh`） | PASS |
| T-M1-20 | manual | 真实 dsh 三 agent；usage/cost ≤10 CNY；记录 prompt/model | §3.1–3.3；`state.json` 与 `agents/<role>/session.json` | PASS |

## 3. 真实 dsh 运行记录

### 3.1 三 Agent 全签核（success）

命令：

```bash
set -a; . ./.env; set +a
DSH_HOME="$PWD/dsh/home" pnpm agent:run \
  --project samples/projects/employee-app/project.yaml \
  --runtime dsh --runs /tmp/m1-agent-dsh-signed \
  --signoff-ia /tmp/m1-ia-waiver.md \
  --signoff-visual-style /tmp/m1-visual-signoff.md
```

- `status=success`
- `gates={ia:waived, interaction:passed, visualStyle:passed}`
- `signoff={ia:true, visualStyle:true}`
- 10 个 `asset-briefs/*.json`；`interaction-spec.pages=[today, inventory-query]`
- 每角色 1 次调用，无 schema repair、无门禁修复

| Agent | input | cache read | output | cost CNY |
|---|---:|---:|---:|---:|
| IA | 254 | 14,720 | 7,055 | 0.0621 |
| Interaction | 9,528 | 6,144 | 6,531 | 0.0773 |
| Visual Style | 6,373 | 6,016 | 6,328 | 0.0687 |
| **合计** | | | | **0.2081** |

`usageComplete=true`，低于 10 CNY 上限。IA 的 input 较低是因为同 prompt 在之前的 IA-only run 中已缓存。

### 3.2 无签核（awaiting_signoff）

- `--allow-unreviewed` 跑三 Agent：`status=awaiting_signoff`，gates 全通过，signoff 全 false，**¥0.2756**。
- 证明 `--allow-unreviewed` 只允许继续，不会伪造 pass。

### 3.3 IA-only（blocker 路由）

- 无 waiver：`status=failed`，`IA gate=failed`，downstream `skipped`，**¥0.0905**，`usageComplete=true`。
- IA 输出 3 个 blocker（见 §4），门禁按设计阻断。
- 加开发 waiver 后：`gates.ia=waived`，三 Agent 继续，§3.1 success。

## 4. employee-app 切片的真实 IA 发现

IA Agent 对 2 页切片给出 3 个 blocker，均可在 PRD/brief 中找到证据：

1. **死 Tab**：底部 4 个 Tab 中「客户」「工作台」「我的」没有落地页。
2. **库存无入口**：PRD 说库存从今日快捷入口进入，但 brief 的今日 `quickActions` 只有开单/预约。
3. **库管权限死路**：`warehouse` 不在 today 的可见角色中，而 inventory 只能从 today 进入。

真实 success run 使用了 `/tmp/m1-ia-waiver.md`，其中明确标注“development smoke test — not a production human signoff”，owner/reason/expiry 齐全。**这 3 个 blocker 没有修复**；它们是切片待办，不是 M1 门禁误报。

## 5. 未覆盖/后续

- 真实 dsh 的 schema repair、预算超限、usage incomplete 没有主动诱发；分别由 dsh mock / scripted / unit 测试覆盖。
- 真实 dsh 的门禁修复没有诱发；scripted 测试覆盖 2 轮上限。
- `asset-briefs/*` 已用 M0 `AssetBriefSchema` 解析通过；没有跑完整 M0 asset review，因为需要匹配的 library/style pack。
- 没有浏览器/视觉评审 M1 产物（M3 Visual Critic 范围）。
- Interaction spec 尚未被 Page Spec 消费（Phase 2）。
