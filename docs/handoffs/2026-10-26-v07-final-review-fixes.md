# 终审修复交接：v0.7 视觉门禁 / 结构 / 分块 / Handoff

- 日期：2026-10-26
- 状态：**终审 Critical/Important 全部修复并验证；v0.7 仍未签核，Figma verify/parity 仍未绿**
- 上一版：[v0.7 实施交接](2026-10-26-v07-implementation-handoff.md)

## 1. 一句话

分支终审的 2 个 Critical（stale `figma-diff` 被信任、块高门禁漏 `contentHeight`）
和 6 个 Important（parity PNG 哈希、handoff 截图来源、render metrics、
HTML/spec 门禁输入绑定、block C4 条件、structure diff 文案/无 id）已修复，
每项都有回归测试。`pnpm test` 87 files / 983 passed，`pnpm test:dsh`
3 files / 4 passed，`pnpm typecheck` clean。

## 2. 关键行为变化

- `figma:sign` / `handoff:pack` 从当前 plan + readback 重算每页 diff；
  stored diff 必须与重算一致，否则 `FIGMA_DIFF_STALE` / handoff blocker。
- sign/pack 重算 parity PNG 与 signed baseline PNG 的哈希，必须匹配
  `parity.json` 的 `figmaHash`/`baselineHash`（`PARITY_HASH_STALE`）。
- `handoff:pack` 的 `screenshots/figma/<page>.png` 来自 `parity/figma.<page>.png`；
  v0.6 手工裁剪只作为 `screenshots/figma-manual/` 的 stale provenance。
- `handoff:pack` 要求 `render/metrics/render-metrics.json`（或 `--metrics`）；
  `figma:conformance` / `visual:review` 记录 HTML+spec 哈希，handoff 校验供给字节。
- `block:experiment` 同时 gate `documentHeight` 与 `contentHeight`；推广要求
  Phase 1 0 blockers、token drift ≤ baseline、conformance、parity。
- `structure:diff` 比较文案 props，并对无 id 节点做位置回退匹配。

## 3. 证据与文档

- 报告：`.superpowers/sdd/2026-10-26-v07-visual-gates-structure-handoff/final-fix-report.md`
- 块高更正：`pipeline/artifacts/employee-app-phase2/blocks/block-experiment.md`
  （appointment-list contentHeight 760→804，+5.79%，修正后 rollback）
- Figma 证据说明：`pipeline/artifacts/employee-app-phase2/figma/README.md`
  （parity PNG 为主证据；手工裁剪为 stale provenance）
- 设计输入补注：`docs/superpowers/specs/2026-10-26-v07-visual-gates-structure-block-input.md`
  （B2 fold advisory 省略、B3 文案/无 id 规则）

## 4. 仍未完成（阻塞签核）

1. Gate 0：v0.6 人工并排视觉检查 + v0.5 baseline 重生成/重签。
2. 用修正后的 plan 重建 8 页 Figma（scratch + delivery），重新生成 readback/diff。
3. 运行真实 `figma:parity`（需要 `parity/figma.<page>.png` 与已签 baseline）。
4. `figma:sign`（现在会重算 diff + parity 哈希）。
5. `handoff:pack` 完整成功一次；在此之前 v0.7 不能宣称 signed/passed。
