# employee-app-phase2 Handoff

## 1. 页面清单

| 页面 | 路由 | Archetype | 状态 |
| --- | --- | --- | --- |
| 预约详情（`appointment-detail`） | `/appointments/detail/:id` | `detail` | default, disabled, error, loading |
| 新增/改期预约（`appointment-form`） | `/appointments/form` | `mobile-form` | default, disabled, error, loading |
| 预约列表（`appointment-list`） | `/appointments` | `mobile-list` | default, disabled, empty, error, loading |
| 回访登记（`callback-register`） | `/callbacks/form` | `mobile-form` | default, disabled, error, loading |
| 客户详情（`customer-detail`） | `/customers/detail/:id` | `detail` | default, disabled, error, loading |
| 客户搜索（`customer-search`） | `/customers/search` | `mobile-list` | default, empty, error, loading |
| 今日（`today`） | `/today` | `home` | default, disabled, empty, error, loading |
| 术后告知（`treatment-notice`） | `/appointments/detail/:id/notice` | `detail` | default, disabled, empty, error, loading |

## 2. 本地查看

```bash
cd handoff
python3 -m http.server 8080
# open http://127.0.0.1:8080/html/<pageId>.html
```

可直接打开的页面：

- `html/appointment-detail.html` — 预约详情
- `html/appointment-form.html` — 新增/改期预约
- `html/appointment-list.html` — 预约列表
- `html/callback-register.html` — 回访登记
- `html/customer-detail.html` — 客户详情
- `html/customer-search.html` — 客户搜索
- `html/today.html` — 今日
- `html/treatment-notice.html` — 术后告知

## 3. 设计令牌与组件

- 流水线版本：`0.7.0`
- Profile：`b-mobile`
- Catalog：`b-mobile`
- 令牌、文本样式与组件清单：`figma/plans/figma-plan.<pageId>.json`
- 页面渲染结果与组件类名：`html/<pageId>.html`
- 设计系统包：`@prd-ui/design-system`

## 4. Figma

| 页面 | fileKey |
| --- | --- |
| 预约详情（`appointment-detail`） | `Ccy4HCkRVOVM70LDeyi4ZP` |
| 新增/改期预约（`appointment-form`） | `Ccy4HCkRVOVM70LDeyi4ZP` |
| 预约列表（`appointment-list`） | `Ccy4HCkRVOVM70LDeyi4ZP` |
| 回访登记（`callback-register`） | `Ccy4HCkRVOVM70LDeyi4ZP` |
| 客户详情（`customer-detail`） | `Ccy4HCkRVOVM70LDeyi4ZP` |
| 客户搜索（`customer-search`） | `Ccy4HCkRVOVM70LDeyi4ZP` |
| 今日（`today`） | `Ccy4HCkRVOVM70LDeyi4ZP` |
| 术后告知（`treatment-notice`） | `Ccy4HCkRVOVM70LDeyi4ZP` |

Figma 页面：预约详情（`appointment-detail`）、新增/改期预约（`appointment-form`）、预约列表（`appointment-list`）、回访登记（`callback-register`）、客户详情（`customer-detail`）、客户搜索（`customer-search`）、今日（`today`）、术后告知（`treatment-notice`）

Figma 文件以 fileKey 引用；本包不包含 `.fig` 二进制。

## 5. 门禁与证据

| 门禁 | 结果 | 证据 hash |
| --- | --- | --- |
| figma:verify（每页 diff + readback） | passed | `sha256:f54e369ab3de71dc77fbeacc8077dc442fe95fbf14389cca7a3b2d0ee28ad986` |
| figma:conformance | passed | `sha256:693ebc4299c95946b36ec298a06691d2a3df7d890d74629409979eebde35f252` |
| figma:parity | passed | `sha256:d8c768a98a1109d7e0a8bfaad4c2e4b39eb4d5b1d226dc122a6e313c35c21998` |
| Figma 人工签核 | passed | `sha256:b35f26ccc275475080ee183a89202064ad19369d0c581ba9d15f3da332d9691b` |
| Visual 人工签核 | passed | `sha256:6878d11e5a6c3dbbd9971dc153c455adcab50b38da1714b40f0cc5c7a897ccd4` |

| 签核 | 签核人 | 日期 | 签核 hash |
| --- | --- | --- | --- |
| figma | 胡冀徽 | 2026-10-27 | `sha256:b35f26ccc275475080ee183a89202064ad19369d0c581ba9d15f3da332d9691b` |
| visual | 胡冀徽 | 2026-10-27 | `sha256:6878d11e5a6c3dbbd9971dc153c455adcab50b38da1714b40f0cc5c7a897ccd4` |

证据位置：

- `figma/plans/`、`figma/readback/`、`figma/evidence/`
- `baseline/manifest.json` 与 baseline 截图
- `signoffs/figma-sign.json`、`signoffs/visual-sign.json`
- `evidence/`（spec-engineer、structure-lint、render-metrics，存在即包含）

## 6. 已知限制

- Figma loading/empty/error/business state frames are not included
- Figma files are referenced by fileKey; no .fig binary is bundled
- screenshots/figma-manual/appointment-detail.png is a manual v0.6 canvas crop; it is not current Figma parity evidence
- screenshots/figma-manual/appointment-form.png is a manual v0.6 canvas crop; it is not current Figma parity evidence
- screenshots/figma-manual/appointment-list.png is a manual v0.6 canvas crop; it is not current Figma parity evidence
- screenshots/figma-manual/callback-register.png is a manual v0.6 canvas crop; it is not current Figma parity evidence
- screenshots/figma-manual/customer-detail.png is a manual v0.6 canvas crop; it is not current Figma parity evidence
- screenshots/figma-manual/customer-search.png is a manual v0.6 canvas crop; it is not current Figma parity evidence
- screenshots/figma-manual/today.png is a manual v0.6 canvas crop; it is not current Figma parity evidence
- screenshots/figma-manual/treatment-notice.png is a manual v0.6 canvas crop; it is not current Figma parity evidence
- Material Symbols glyphs depend on the locally installed font
- Block manifests are not included for this run; Page Specs are the source of truth.
- Figma delivery-page readbacks and diffs are not included.

## 7. 资产与授权

本包包含 4 个资产文件，授权与字体说明见 `LICENSES.md`。
