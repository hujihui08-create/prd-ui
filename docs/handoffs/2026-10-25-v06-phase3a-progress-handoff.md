# v0.6 Phase 3A 实施交接（进行中）

- 日期：2026-10-25
- 状态：Implemented（自动化部分）；Figma 人工门禁待执行，**未签核**
- 设计：[v0.6 设计](../superpowers/specs/2026-10-23-v06-figma-studio-asset-compiler-design.md)
- 计划：[v0.6 实施计划](../superpowers/plans/2026-10-23-v06-figma-studio-asset-compiler.md)
- 上一版：[v0.5 交接](2026-10-23-v05-visual-a11y-closure-handoff.md)

> 2026-10-26 更新：本文引用的 `/tmp` 证据已过期。8 个 plan 已保存到
> `pipeline/artifacts/employee-app-phase2/figma/plans/`，可直接用于 Figma 门禁；
> 完整会话状态见 [总交接](2026-10-26-v041-v05-v06-session-handoff.md)。

## 1. 一句话状态

v0.6 的 Figma plan/plugin/readback diff、Asset Compiler、只读 Studio 已实现并通过自动化测试；真实 Figma scratch/delivery/readback 尚未执行，因此 v0.6 不能签 `passed`。Brio MCP 当前未连接。

## 2. 已完成

- `core/contracts/src/figma.ts`：FigmaPlan/Readback/Diff schema。
- `core/figma`：8 页 default plan compiler、Button 实例、glyph/vector/image、CalendarGrid 绝对定位、readback diff。
- `runtimes/figma`：插件 UI（plan 选择、scratch/delivery、readback 下载）、esbuild bundle、manifest；bundle 15.8kb，无 Node import。
- `runtimes/standalone`：`figma:plan`、`figma:verify`、`asset:compile`、`studio:prepare` CLI。
- `core/asset-compiler`：M0 13/13、phase2 4 frozen icons、LICENSES、hash/幂等。
- `studio`：Vite/React/Tailwind v4 + 本地 shadcn 原语；8 页页面树、iframe 状态预览、Spec/Catalog/Profile/Findings/Assets/Trace 面板；手动 Chromium smoke 0 console。

## 3. 证据与数字

| 项 | 值 |
|---|---|
| `pnpm test` | **688 passed** |
| typecheck | clean |
| `pnpm test:dsh` | 4 passed |
| Phase 1 | `8 / 2 / 4 / 8` 全 0 blockers |
| Figma plans | `/tmp/figma-v06`，8 页；appointment-list 124 frames / 2 instances |
| Figma plugin | `runtimes/figma/dist/{code.js,ui.html}`（gitignored） |
| Assets | `/tmp/assets-m0` 13/13；`/tmp/assets-phase2` 4/4 |
| Studio | `studio/public`（generated，gitignored）；`/tmp/studio-v06.png` |

### 命令

```bash
cd pipeline
pnpm install
pnpm test && pnpm typecheck && pnpm test:dsh

pnpm figma:plan --spec-run /tmp/spec-v05/run-2026-10-23T06-07-48-403Z \
  --out /tmp/figma-v06
pnpm --dir runtimes/figma build

pnpm asset:compile --library samples/assets/m0/library/index.json \
  --source samples/assets/m0/library --licenses samples/assets/m0 \
  --out /tmp/assets-m0
pnpm asset:compile --asset-review artifacts/employee-app-phase2/asset-review \
  --licenses samples/assets/m0 --out /tmp/assets-phase2

pnpm studio:prepare --spec-run /tmp/spec-v05/run-2026-10-23T06-07-48-403Z \
  --html /tmp/html-v05 --visual-run /tmp/visual-v05d/run-2026-10-23T06-10-08-791Z \
  --assets /tmp/assets-phase2 --figma-plan /tmp/figma-v06 --out studio/public
pnpm --dir studio build
```

## 4. 未完成（人工门禁）

1. 打开 Figma 桌面版，新建空白文件，导入 `pipeline/runtimes/figma/manifest.json`。
   - 或连接 Brio MCP（当前 `connected=false`）。
2. 逐页选择 `/tmp/figma-v06/figma-plan.<page>.json`，执行 **Scratch + readback**，下载 readback JSON。
3. 运行：

```bash
pnpm figma:verify --plan /tmp/figma-v06/figma-plan.<page>.json \
  --readback <downloaded>.json --out /tmp/figma-v06/diff.<page>.json
```

要求 0 blocker；major ≤2 且有理由。
4. diff 通过后执行 **Delivery page**；检查中文字体、变量、文本样式、Button 实例、glyph/vector、16:30 日历、关键页 side-by-side。
5. 证据保存到 `pipeline/artifacts/employee-app-phase2/figma/`；更新 spec/roadmap/CHANGELOG/AGENTS；本地 commit，不 push。

## 5. 坑与约束

- Figma 插件不能 headless；没有真实 build/readback 时不能签 v0.6。
- delivery 页面同名会阻止；使用新白文件或先清理 scratch。
- 插件在当前文件内复用颜色变量/文本样式/Button 组件集；scratch 页面重建时会清空组件集引用并重建。
- Material Symbols glyph 依赖本机字体；缺失会记录 fallback/错误，图标可能 tofu；完整矢量集是 v0.6.x 债。
- `studio/public`、`runtimes/figma/dist` 是生成物，已 gitignore；不要提交。
- v0.5 baseline/signoff 不受 v0.6 影响；v0.6 不改 HTML 产物。
- v0.5/v0.6 改动均未 commit；不 push。

## 6. 下一步

完成 Figma 人工门禁后签 v0.6；然后进入 v0.7（scratch 沙箱、Test Subagent、Handoff Packager）。v0.6.x 继续 Figma 状态帧、完整组件库、Material Symbols 矢量集、Studio Playwright 接入。
