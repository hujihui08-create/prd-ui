# Asset Review Hardening M0.5 — User Acceptance Test Spec

- 日期：2026-10-20
- 状态：Ready for execution
- 对应实现：`docs/superpowers/plans/2026-10-20-asset-review-hardening.md`
- 测试视角：用户/操作者可见结果，不重复 `pnpm test` 已覆盖的内部单元细节
- 测试数据：`samples/projects/employee-app`、`samples/assets/m0`、`samples/assets/m0-scenarios`

## 1. 目标

验证 M0.5 硬化在用户视角下满足五件事：

1. **主链不回归**：`phase1:verify` 和 `render:html` 仍产出 2 页、0 blockers 的可查看 HTML。
2. **坏资产被挡住**：内联 `style`、`transform`、SMIL、外部引用、整套不一致都会失败，而不是静默通过。
3. **成本可控**：真实 dsh 的 usage/cost 可见，10 元上限会停止批次。
4. **错误可解释**：配置、provider、reviewer 错误有明确错误码和可定位信息。
5. **证据可审计**：`asset-review.json`、`manifest.review.json`、`review.raw.json`、`candidate.png`、`log.ndjson` 能互相对上，且不含 key。

## 2. 环境与前置条件

从仓库根目录开始，命令均在 `pipeline/` 下执行。

```bash
cd pipeline
pnpm install
pnpm test          # 期望 350 passed
pnpm test:dsh      # 期望 1 passed，无需真实 key
pnpm typecheck     # 期望 clean
```

真实 dsh 用例需要：

- `pipeline/.env` 中存在 `PRD_UI_VISION_API_KEY`、`PRD_UI_VISION_BASE_URL`、`PRD_UI_VISION_MODEL`。
- 每次真实 dsh 前执行 `set -a; . ./.env; set +a`；CLI 不会自动加载 `.env`。
- key 只存在于 `pipeline/.env`（gitignored），不得写入本 spec、测试报告、命令历史或提交。

所有临时资产复制到 `/tmp/uat-*`，不修改仓库内样例。

## 3. 测试用例

### UAT-01 主链与 HTML 渲染（P0，无需 key）

```bash
pnpm phase1:verify \
  --project samples/projects/employee-app/project.yaml \
  --runs /tmp/uat-phase1

pnpm render:html \
  --run /tmp/uat-phase1/<runId> \
  --out /tmp/uat-html
```

**预期**

- `Phase 1A OK: 2 pages, 0 blockers`
- `/tmp/uat-html/index.html`、`today.html`、`inventory-query.html` 存在
- 浏览器打开后两页可读，无空白、无横向溢出
- `today.html?state=empty|loading|error` 状态可切换

**证据**：runId、`reports/validation.json`、HTML 路径、截图。

### UAT-02 正常资产评审（P0，无需 key）

```bash
pnpm asset:review \
  --project samples/projects/employee-app/project.yaml \
  --assets samples/assets/m0 \
  --runtime standalone \
  --runs /tmp/uat-m0
```

**预期**

- `13 assets, 13 passed, 0 retried, 0 unresolved, 0 degraded`
- `manifest.json` 的 `complete` 为 `true`
- `manifest.review.json` 的 `iconSetPassed` / `illustrationSetPassed` 均为 `true`

**证据**：`asset-review.json` 的 `summary`、`manifest.json`、`manifest.review.json`。

### UAT-03 `--only` 部分评审（P0，无需 key）

```bash
pnpm asset:review \
  --project samples/projects/employee-app/project.yaml \
  --assets samples/assets/m0 \
  --only icon-home --runtime standalone \
  --runs /tmp/uat-only
```

**预期**

- run 只包含 `icon-home`
- `manifest.json.complete === false`
- `assets/batch-gates.json` 含 `skipped: true`、`reason: "PARTIAL_REVIEW"`
- `manifest.review.json` 不宣称整套 set gate 通过

### UAT-04 坏 SVG 被挡住（P0，无需 key）

```bash
cp -R samples/assets/m0 /tmp/uat-bad
perl -0777 -pi -e 's/<path/<path style="fill:#ff0000"/' \
  /tmp/uat-bad/library/icons/home.svg

pnpm asset:review \
  --assets /tmp/uat-bad --only icon-home \
  --runtime standalone --runs /tmp/uat-bad-runs
```

**预期**

- exit 1
- 错误码 `SVG_INLINE_STYLE`
- 不产生 `assets/frozen/icon-home/asset.svg`

同一用例分别替换为以下写法，均应失败：

| 注入 | 期望错误码 |
|---|---|
| `transform="translate(200 0)"` | `SVG_TRANSFORM` |
| `<animateTransform attributeName="transform">` | `SVG_ANIMATION` |
| `<?xml-stylesheet href="https://..."?>` | `SVG_PROCESSING_INSTRUCTION` |
| `fill="url(https://...)"` | `SVG_EXTERNAL_REF` |

### UAT-05 整套不一致被挡住（P0，无需 key）

```bash
cp -R samples/assets/m0 /tmp/uat-set
perl -pi -e 's/stroke-linecap="round"/stroke-linecap="square"/' \
  /tmp/uat-set/library/icons/search.svg

pnpm asset:review \
  --assets /tmp/uat-set --runtime standalone \
  --runs /tmp/uat-set-runs
```

**预期**

- 单个图标仍通过自己的 gate（`stroke-linecap` 不是单图标 gate 的检查项）
- 整套失败，exit 1
- `error` 为 `ICON_SET_INCONSISTENT`
- `manifest.json.complete === false`
- `assets/icon-set.json` 记录不一致项

### UAT-06 配置损坏 fail fast（P0，无需 key）

```bash
printf '{ bad json' > /tmp/uat-bad/style.json

pnpm asset:review \
  --assets /tmp/uat-bad --only icon-home --dry-run \
  --runs /tmp/uat-config
```

**预期**

- exit 1
- stderr 含 `INVALID_STYLE` 和文件路径
- 删除 `style.json` 后重跑使用默认值，不报错

同样验证 `source-policy.json` 损坏 → `INVALID_SOURCE_POLICY`，`pricing.json` 损坏 → `INVALID_PRICING`。

### UAT-07 `--json` 机器可读输出（P0，无需 key）

```bash
pnpm asset:review \
  --project samples/projects/employee-app/project.yaml \
  --assets samples/assets/m0 \
  --runtime standalone --json \
  > /tmp/uat.json
echo "exit=$?"
jq . /tmp/uat.json
```

**预期**

- exit 0
- stdout 只有一个 JSON 对象
- 含 `runDir`、`summary`、`assets`、`batchGates`、`error`、`reviewCostCny`、`usageSource`、`usageComplete`
- 失败场景（如 UAT-04）仍 exit 1，且 stdout 仍是可解析 JSON

### UAT-08 真实 dsh 全量（P0，需要 key）

```bash
set -a; . ./.env; set +a
DSH_HOME="$PWD/dsh/home" pnpm asset:review \
  --project samples/projects/employee-app/project.yaml \
  --assets samples/assets/m0 \
  --runtime dsh \
  --runs /tmp/uat-dsh
```

**预期**

- `13 assets, 13 passed`，0 unresolved
- `usageSource === "json-events"`、`usageComplete === true`
- `reviewCostCny` ≤ 10（当前约 ¥0.35）
- 至少 13 张 `candidate.png`（每个 attempt 一张；retry 会增加，本次 2 次 retry → 15）
- 至少 13 次 `read_image`（本次 15）
- `review.raw.json` 含 `parsed`、`usage`、`usageComplete`
- 两个 set gate 通过，`manifest.complete === true`

### UAT-09 成本上限停止（P1，需要 key）

```bash
set -a; . ./.env; set +a
DSH_HOME="$PWD/dsh/home" pnpm asset:review \
  --project samples/projects/employee-app/project.yaml \
  --assets samples/assets/m0 \
  --runtime dsh --max-review-cost-cny 0.01 \
  --runs /tmp/uat-cost
```

**预期**

- exit 1
- `error` 含 `REVIEW_COST_BUDGET_EXCEEDED`
- 第一个资产之后停止；剩余资产 `unresolved` / `budget_exceeded`
- `summary.reviewCostCny` 显示实际花费

### UAT-10 provider 缺失 fail fast（P1，无需 key）

```bash
env -u PRD_UI_VISION_BASE_URL -u PRD_UI_VISION_MODEL \
  pnpm asset:review \
    --project samples/projects/employee-app/project.yaml \
    --assets samples/assets/m0 --only icon-home --runtime dsh \
    --runs /tmp/uat-no-provider
```

**预期**

- exit 1
- `CONFIGURATION_ERROR: missing PRD_UI_VISION_BASE_URL, PRD_UI_VISION_MODEL`
- standalone scripted 路径不需要这些变量，仍 13/13

### UAT-11 reviewer 错误隔离（P1，无需真实 key）

用不可达的 model endpoint 制造确定性 reviewer 错误；不要只 unset key，dsh 会回退到 `DSH_HOME` 的 credentials。

```bash
env PRD_UI_VISION_API_KEY=invalid \
  PRD_UI_VISION_BASE_URL=http://127.0.0.1:9/v1 \
  PRD_UI_VISION_MODEL=mock \
  pnpm asset:review \
    --project samples/projects/employee-app/project.yaml \
    --assets samples/assets/m0 \
    --only icon-home --only icon-search --only icon-plus \
    --runtime standalone --reviewer model \
    --runs /tmp/uat-reviewer-error
```

**预期**

- 默认：3 个资产全部尝试，`summary.reviewerErrors === 3`，`unresolved === 3`，`error` 含 `REVIEWER_ERROR`
- 加 `--fail-fast`：`reviewerErrors === 1`，剩余 2 个资产标记 `reviewer_error`，`unresolved === 3`
- 不因 reviewer 错误切换 source

**dsh 变体**：如果用 dsh + 不可达 provider，可能出现 `REVIEW_USAGE_INCOMPLETE`（部分 usage + 10 元预算的 fail-closed 行为），这是预期成本保护，不是隔离失败；用 model reviewer 用例验证 H3 更稳定。

### UAT-12 图像评审负例（P2，需要 key，探索性）

```bash
mkdir -p /tmp/uat-negative
cp -R samples/assets/m0/* /tmp/uat-negative/
git show 049ee19^:pipeline/samples/assets/m0/library/illustrations/empty-inventory.svg \
  > /tmp/uat-negative/library/illustrations/empty-inventory.svg

set -a; . ./.env; set +a
DSH_HOME="$PWD/dsh/home" pnpm asset:review \
  --assets /tmp/uat-negative --only illus-empty-inventory \
  --runtime dsh --runs /tmp/uat-negative-runs
```

**预期**

- 旧 fixture 被 `retry` / `unresolved`
- `review.reason` 提到“空货架语义不足 / 像柱状图”
- 当前新 fixture 在 UAT-08 中通过

模型评分有波动，本用例记录结果即可，不作为硬门禁。

### UAT-13 证据与脱敏审计（P0，需要 key）

```bash
RUN=$(ls -d /tmp/uat-dsh/run-* | tail -1)
jq '{summary,batchGates,usageSource,usageComplete}' "$RUN/asset-review.json"
jq '.assets[] | select(.status != "passed")' "$RUN/asset-review.json"
find "$RUN" -name 'review.raw.json' | head
find "$RUN" -name 'candidate.png' | head
grep -R "sk-" "$RUN" || echo "no key leaked"
wc -l "$RUN/log.ndjson"
```

**预期**

- 结果、分数、成本、原始 verdict、PNG 证据能对上
- 无 `sk-` key
- `log.ndjson` 行数大于 0，且为 append-only
- `manifest.review.json` 能看到 set gate、usageSource、usageComplete

### UAT-14 场景回归（P0，无需 key）

```bash
pnpm asset:review \
  --assets samples/assets/m0-scenarios \
  --runtime standalone --runs /tmp/uat-scenarios
echo "exit=$?"
```

**预期**

- exit 1
- `1 passed / 1 unresolved`

### UAT-15 项目隔离（P1，无需 key）

```bash
pnpm phase1:verify \
  --project samples/projects/employee-app/project.yaml \
  --runs /tmp/uat-employee

pnpm phase1:verify \
  --project samples/projects/demo-crm/project.yaml \
  --runs /tmp/uat-demo-crm
```

**预期**

- 两个 runs 目录独立
- 各自 run 内的 project/brief 对得上
- `asset:review` 不自动读取 `project.yaml.runsDir`；资产评审必须显式传 `--runs`

## 4. 通过标准

- P0 用例全部通过。
- P1 用例通过；若失败，记录原因和影响。
- P2 用例记录结果，不作为硬门禁。
- 没有 key 出现在 spec、报告、run 目录、`log.ndjson`、`review.raw.json`、`--json` 输出或提交中。
- `phase1:verify` 保持 `2 pages / 0 blockers`，renderer 两页正常。
- 所有失败用例都有明确错误码和可定位文件路径。

## 5. 记录模板

每个用例记录：

- 用例 ID、执行时间、执行人/代理
- 命令
- 实际 exit code
- 关键输出（summary/error code）
- runId / 产物路径
- 通过/失败
- 若失败：现象、预期、实际、初步原因

## 6. 清理

```bash
rm -rf /tmp/uat-* /tmp/uat-html
```

`pipeline/.env` 保留（gitignored），不要删除或提交。

## 7. 不在本 spec 范围

- 单元级 schema/usage/redaction 边界：已由 `pnpm test` 覆盖。
- 多用户/远程服务/鉴权/队列：当前实现不提供。
- B/C 供应商、PRD 自动摄取、自定义设计系统：后续里程碑。
- 资产评审结果自动进入 renderer：当前为旁路管线，不在本次验收。

## 8. 安全

- API key 只放在 `pipeline/.env`；本 spec 和测试报告不得包含 key。
- 测试结束后如 key 曾在聊天/日志中出现，建议轮换。
- 真实 dsh 默认 10 元上限；先用 `--only` 验证，再跑全量。

## 9. 本轮执行结果（2026-10-20）

| 用例 | 结果 |
|---|---|
| UAT-01 ~ UAT-07、UAT-14、UAT-15 | **22/22 PASS**（无需 key） |
| UAT-08 真实 dsh 全量 | **13/13 passed**，2 retried，cost ¥0.4176，`usageSource=json-events`，`usageComplete=true`，15 张 PNG / 15 次 `read_image`；两个 set gate 通过 |
| UAT-09 成本上限 | exit 1，`REVIEW_COST_BUDGET_EXCEEDED`；实际 cost ¥0.0240，1 passed / 12 unresolved |
| UAT-10 provider 缺失 | exit 1，`CONFIGURATION_ERROR`，列出 `PRD_UI_VISION_BASE_URL` / `PRD_UI_VISION_MODEL` |
| UAT-11 reviewer 隔离 | model reviewer 默认 `reviewerErrors=3`；`--fail-fast` 时 `reviewerErrors=1`、`unresolved=3` |
| UAT-12 图像负例 | 旧 bar-chart fixture 被拒绝：semantics 2、composition 3，reason 明确提到“像柱状图/不是空货架” |
| UAT-13 证据审计 | `review.raw.json` 含 parsed/usage/usageComplete；`manifest.review.json` 含 usageSource/usageComplete；run 目录无 `sk-` key |
| 总体 | **PASS**；UAT-08 的 PNG 数量按“每 attempt 一张”修正为 ≥13；UAT-11 改用 model reviewer 制造确定性错误（dsh 不可达 provider 会触发 `REVIEW_USAGE_INCOMPLETE` 的 cost fail-closed，属预期行为） |

执行目录：`/tmp/uat-no-key`、`/tmp/uat-real`（临时证据，不提交）。
