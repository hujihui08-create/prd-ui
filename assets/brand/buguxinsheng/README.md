# 布谷鑫声 · 三鸟和鸣

面性（实心填充）App Icon。三只布谷鸟沿上升枝条由低到高排列，中间一只张口鸣唱；枝条斜向上升，形成类似旋律线的动势。未使用「鑫」字、三金或任何文字图形。

## 文件

| 用途 | 文件 |
|---|---|
| 主 SVG（明亮） | `src/icon-light.svg` |
| 主 SVG（深色） | `src/icon-dark.svg` |
| 圆角 SVG | `src/icon-light-rounded.svg` / `src/icon-dark-rounded.svg` |
| PNG 1024 全出血（商店 / 系统掩码） | `png/1024.png` / `png/1024-dark.png` |
| PNG 圆角（展示 / 网页） | `png/1024-rounded.png` / `png/1024-dark-rounded.png` |
| 尺寸导出 | `png/{512,256,128,64,32}.png`（另有 `-dark` / `-rounded`） |
| 本地预览 | `preview.html` |

## 规格

- 画布 1024×1024；商店图标使用全出血方形版本，由系统裁切圆角。
- 圆角版本为 22.5% 圆角，仅用于展示或网页。
- 面性填充，无描边；图标不含文字，名称由系统标签展示。
- 明亮版：珊瑚 `#E85D3F` / 暖米 `#FFF3E6` / 松墨 `#1E3A33` / 蜜金 `#F2AE45`
- 深色版：暖米 `#F5E6CD` / 松绿 `#173B34` / 珊瑚 `#FF8A68`

## 生成与校验

```bash
node build.mjs     # 重新生成 SVG + PNG + 预览
node validate.mjs  # 31/31 checks passed
```

构建使用仓库 `spike/` 下已安装的 Playwright Chromium。

<details>
<summary>校验输出</summary>

```text
PASS  SVG light
PASS  1024.png  1024×1024
PASS  512.png  512×512
PASS  256.png  256×256
PASS  128.png  128×128
PASS  64.png  64×64
PASS  32.png  32×32
PASS  1024-rounded.png  1024×1024
PASS  512-rounded.png  512×512
PASS  256-rounded.png  256×256
PASS  128-rounded.png  128×128
PASS  64-rounded.png  64×64
PASS  32-rounded.png  32×32
PASS  SVG dark
PASS  1024-dark.png  1024×1024
PASS  512-dark.png  512×512
PASS  256-dark.png  256×256
PASS  128-dark.png  128×128
PASS  64-dark.png  64×64
PASS  32-dark.png  32×32
PASS  1024-dark-rounded.png  1024×1024
PASS  512-dark-rounded.png  512×512
PASS  256-dark-rounded.png  256×256
PASS  128-dark-rounded.png  128×128
PASS  64-dark-rounded.png  64×64
PASS  32-dark-rounded.png  32×32
PASS  fragment root
PASS  fragment is fragment
PASS  fragment literal quotes
PASS  fragment size < 1MB
PASS  standalone preview

31/31 checks passed
```

</details>

## 使用

- **App Store / 应用商店**：上传 1024×1024 全出血 PNG（`png/1024.png`；深色主题用 `png/1024-dark.png`）。
- **网页 / 演示 / 设计稿**：用圆角 PNG 或 SVG。
- **尺寸**：32px 下仍可辨认为「三只鸟在枝条上」；不建议低于 32px 使用，16px 会丢失细节。
