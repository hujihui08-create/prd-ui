# Spec Engineer v0

Spec Engineer v0 是连接 M1 Agent 层与 Page Spec 的确定性 mapper。它读取一个已完成的 M1 run 和项目 brief，编译 base Page Spec，然后把 interaction / motion / asset 信息写进 Page Spec。

v0 **不调用模型、不修改 brief、不改布局、不改 HTML**。

## 命令

```bash
cd pipeline

pnpm spec:engineer \
  --project samples/projects/employee-app/project.yaml \
  --agent-run /tmp/m1-agent-runs/<runId> \
  --runs /tmp/spec-engineer-runs
```

| 参数 | 说明 |
|---|---|
| `--project <path>` | 项目 YAML；默认 employee-app |
| `--agent-run <dir>` | 必填；M1 run 目录 |
| `--runs <dir>` | 输出目录 |
| `--json` | stdout 只输出一个 JSON summary |
| `--help` | usage |

## 输入

M1 run 必须包含：

- `state.json`，状态为 `success` / `awaiting_signoff` / `partial`
- `artifacts/interaction-spec.json`
- `artifacts/motion-spec.json`
- `artifacts/ia-map.json`（可选；用于页面漂移 warning）
- `artifacts/asset-briefs/*.json`（可选；缺失时 asset gate 记 warning）

所有 artifact 的 `project` 必须与 brief 的 project 一致；`failed` / `budget_exceeded` / `usage_incomplete` / `running` 的 M1 run 会被拒绝。

## 输出

```text
runs/<runId>/
  spec-engineer.json
  artifacts/page-spec/<pageId>.json
  findings/spec-engineer-gate.json
  logs/spec-engineer.ndjson
```

- 只有 gate 通过时才写 `artifacts/page-spec/*.json`。
- `spec-engineer.json` 记录 pages、motionPages、assets、gate、passed。
- `findings/spec-engineer-gate.json` 保存完整 gate issues。
- 同一 brief + M1 artifacts 两次运行，Page Spec byte-identical。

## Page Spec 映射

- **Transition** → `{ trigger, action: "navigate", target: route, reqRef }`
- **Trigger** → `{ trigger: action, action: reaction, nodeId?, reqRef }`
- **States** → 合并 interaction 的 default/loading/empty/error/disabled/success，写入 `description`；base state 保留。
- **Motion** → 只保留 `pageId` 匹配的 bindings；解析用到的 presets；写入 `reducedMotion`。
- **Assets** → 扫描 `assetRef`、`props.assetRef`、QuickAction `icon`、Icon `name`；与 asset briefs 对齐。
- **Traceability** → `designDefaults` 追加 `motion:<preset>` / `asset:<id>`。

## 门禁

| code | severity | 条件 |
|---|---|---|
| `SPEC_INPUT_INVALID` | blocker | M1 run 不可读/状态不允许/项目不一致/artifact 缺失或 schema 失败 |
| `SPEC_SCHEMA` | blocker | 增强后的 Page Spec 不通过 `PageSpecSchema` |
| `SPEC_PAGE_MISSING` | blocker | brief 页没有 Page Spec，或没有出现在 interaction spec 中 |
| `SPEC_PAGE_UNKNOWN` | blocker | Page Spec / interaction page 不在 brief |
| `SPEC_ACTION_MISSING` | blocker | brief action 没有被 trigger 覆盖 |
| `SPEC_STATE_MISSING` | blocker | interaction/required state 没进入 Page Spec |
| `SPEC_STATE_UNMAPPED` | warning | base state 没有 interaction 描述 |
| `SPEC_TRANSITION_PAGE_UNKNOWN` | blocker | transition 指向未知页面 |
| `SPEC_MOTION_BINDING_PAGE_UNKNOWN` | blocker | binding page 不存在 |
| `SPEC_MOTION_PRESET_UNKNOWN` | blocker | binding preset 不存在 |
| `SPEC_MOTION_TOKEN_MISMATCH` | blocker | preset duration/easing 不是 token |
| `SPEC_MOTION_NODE_UNRESOLVED` | warning | binding nodeId 不在 layout（v0 编译器还没有稳定 node id） |
| `SPEC_ASSET_MISSING` | blocker | Page Spec 引用的 asset 没有 brief |
| `SPEC_ASSET_UNUSED` | warning | asset brief 没有被引用 |
| `SPEC_ASSET_BRIEFS_MISSING` | warning | 没有 asset briefs |
| `SPEC_IA_PAGE_MISSING` / `SPEC_IA_PAGE_UNKNOWN` | warning | IA map 与 brief 页面漂移 |

额外的 tab/刷新/筛选/错误重试 trigger 是允许的；gate 只要求 brief actions 被覆盖。

## 退出码

| code | 含义 |
|---|---|
| 0 | gate passed |
| 1 | gate failed / 输入无效 |
| 2 | 参数错误 |

## 真实 run（2026-10-20）

- 输入：employee-app clean M1 run（`success`，2 页，10 asset briefs）。
- 输出：2 个 Page Spec；`interactions` 各 10 条；states 为 default/empty/loading/error/disabled/success；两个页面都有 motion presets/bindings。
- gate：**0 blockers**；28 warnings（19 `SPEC_MOTION_NODE_UNRESOLVED`、9 `SPEC_ASSET_UNUSED`）。
- `assets.referenced=["inventory"]`；`missing=[]`。
- 这些 warning 是 v0 预期：
  - M1 interaction spec 使用语义 node id（如 `today.quickAction.inventory`），compiler 还没有稳定 node id；v0.1 再升级为 blocker。
  - 视觉 agent 为 brief 的 10 个图标都产出了 brief，两页切片只引用 `inventory`。

## v0 限制

- motion 只写入 Page Spec，renderer 尚未消费；HTML 不变。
- 未解析的 motion nodeId 是 warning，不是 blocker。
- Spec Engineer 不做 Spec Repair；gate 失败时只写 findings。
- 不解决 M1 UAT 中与 Spec Engineer 无关的 6 条 findings（搜索建模、forbidden 状态、在途字段、命名、回程 flow、空态文案）。
- 资产评审仍是独立的 M0 步骤；v0 只校验 brief 引用。
