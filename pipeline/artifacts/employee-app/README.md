# 员工端 · 两页高保真切片

从 `samples/projects/employee-app/` 的 UI Brief 生成：

- `today`（今日首页）
- `inventory-query`（库存查询）

流程：UI Brief → Page Spec → `b-mobile` profile → HTML Renderer。

视觉：当前为中性 B 端测试基线（黑色主按钮、客户蓝/库存橙、语义红黄绿）；首页卡片暂不启用插画。暖玫瑰 + 插画作为实验能力保留，A/B/C 测试时再启用。

## 打开

```bash
open "/Users/jihui/Desktop/产品、ui/pipeline/artifacts/employee-app/html/index.html"
```

或直接打开：

- `html/today.html`
- `html/inventory-query.html`

页面右上角（桌面宽屏）可切换 `默认 / 空 / 加载 / 失败` 状态；也可用 `?state=empty|loading|error`。

## 重新生成

```bash
cd "/Users/jihui/Desktop/产品、ui/pipeline"
pnpm phase1:verify --project samples/projects/employee-app/project.yaml --runs /tmp/employee-app-runs
pnpm render:html --run /tmp/employee-app-runs/<runId> --out /tmp/employee-app-html
```

## 截图

- `today-default.png` / `today-empty.png` / `today-loading.png` / `today-error.png`
- `inventory-default.png` / `inventory-empty.png`

均为 390×844（Playwright）。

## 当前已知限制（首版切片）

- 没有微信状态栏/胶囊位；顶部从门店栏开始。
- 图标用 Material Symbols Rounded（Google Fonts），离线交付前需本地化字体或换 SVG。
- TabBar 为 `今日` + `库存查询`，两页均可达；`客户`、`工作台`、`我的` 延后。
- `今日` 只保留「库存查询」快捷操作；`开单`、`预约` 及其目标流程不在 M1。
- 加载/失败态由 Renderer 生成（骨架/错误面板），还不是 Page Spec 节点。
- 数据来自 PRD 示例 + 合成内容；不含真实 PII。
- 首版只覆盖 `b-mobile` 的 home/inventory-list 两个 archetype；Figma Renderer、视觉 diff、更多页面尚未接入。
