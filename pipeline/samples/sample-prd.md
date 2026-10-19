# 订单管理 Sample PRD（Phase 1 样本）

> **重要说明**：本文件是 PRD → UI Pipeline 的 **Phase 1 样本 PRD**，仅用于验证 UI Brief 契约、确定性编译器和校验器。它不是真实业务 PRD，不得直接用于需求评审、排期或产品交付。样本中的页面、字段和验收示例均为演示用途。

- 项目：`demo-orders`
- 产品名称：订单管理
- 版本：`0.1.0`
- 平台：web（运营后台）+ mobile（C 端）
- 需求编号：`REQ-ORDER-001` 至 `REQ-ORDER-008`

## 1. 业务范围

本样本覆盖两条业务线：

1. **B 端订单管理（web）**：运营人员查看订单概览、检索订单列表、查看订单详情、新建订单，管理员维护系统设置。
2. **C 端浏览与下单（mobile）**：用户浏览首页信息流、查看商品详情、通过邮箱密码登录后发起购买。

范围内页面共 8 个：订单概览、订单列表、订单详情、新建订单、设置、首页、商品详情、登录。

不在本样本范围内：支付渠道、退款、库存与履约系统、多租户、注册与找回密码。这些内容不建模、不生成页面。

## 2. 角色与权限

| 角色 | 说明 | 可见页面 | 可用操作 |
|---|---|---|---|
| `admin` | 管理员，具备全部 web 与 mobile 页面权限 | orders-overview、orders-list、order-detail、order-form、settings、home-feed、item-detail、auth | 全部操作，包括保存设置 |
| `operator` | 运营人员，负责日常订单处理 | orders-overview、orders-list、order-detail、order-form | 查看订单、新建订单、编辑订单；不可访问设置 |
| `viewer` | C 端用户 | home-feed、item-detail、auth | 浏览首页与商品详情、登录、立即购买 |

权限规则：

- web 订单页面（orders-overview、orders-list、order-detail、order-form）对 `admin` 和 `operator` 可见。
- settings 仅对 `admin` 可见；`operator` 与 `viewer` 不可见、不可访问。
- mobile 页面（home-feed、item-detail、auth）对 `viewer` 和 `admin` 可见。
- 无权访问时隐藏入口；直接访问时展示无权限提示，不渲染页面数据。

## 3. 页面清单

| 平台 | 页面 id | 页面名称 | 原型 (archetype) | Profile | 路由 | 角色 | 必填状态 | 需求 |
|---|---|---|---|---|---|---|---|---|
| web | orders-overview | 订单概览 | overview | b-dense | `/orders/overview` | admin, operator | default, loading, error | REQ-ORDER-001 |
| web | orders-list | 订单列表 | list | b-dense | `/orders` | admin, operator | default, empty, loading, error | REQ-ORDER-002 |
| web | order-detail | 订单详情 | detail | b-dense | `/orders/:id` | admin, operator | default, loading, error | REQ-ORDER-003 |
| web | order-form | 新建订单 | form | b-dense | `/orders/new` | admin, operator | default, loading, error, disabled | REQ-ORDER-004 |
| web | settings | 设置 | settings | b-dense | `/settings` | admin | default, loading, error | REQ-ORDER-005 |
| mobile | home-feed | 首页 | feed | c-expressive | `/home` | viewer, admin | default, empty, loading, error | REQ-ORDER-006 |
| mobile | item-detail | 商品详情 | detail | c-expressive | `/item/:id` | viewer, admin | default, loading, error | REQ-ORDER-007 |
| mobile | auth | 登录 | auth | c-expressive | `/auth` | viewer, admin | default, loading, error, disabled | REQ-ORDER-008 |

页面字段与操作：

| 页面 id | 字段 | 操作 |
|---|---|---|
| orders-overview | 无（只读指标） | 无 |
| orders-list | orderNo, customer, amount, status, createdAt | 新建订单 |
| order-detail | orderNo, customer, amount, status, createdAt | 编辑订单 |
| order-form | customer, amount, status | 保存, 取消 |
| settings | notifications, language, timezone | 保存设置 |
| home-feed | 无（卡片内容由信息流提供） | 无 |
| item-detail | title, price, description | 立即购买 |
| auth | email, password | 登录 |

## 4. 状态矩阵

状态定义：

| 状态 | 含义 | 通用表现 |
|---|---|---|
| `default` | 数据加载成功且有内容 | 渲染完整页面与数据 |
| `loading` | 请求进行中 | 显示骨架屏或加载指示；提交类操作禁用 |
| `error` | 请求失败或提交失败 | 显示错误说明与重试入口；保留可恢复操作 |
| `empty` | 请求成功但没有数据 | 显示空状态文案与创建/探索引导 |
| `disabled` | 页面或表单不可编辑 | 输入与主操作禁用，并说明原因（无权限或提交中） |

各页面状态矩阵：

| 页面 id | default | empty | loading | error | disabled | 状态说明 |
|---|---|---|---|---|---|---|
| orders-overview | 必须 | - | 必须 | 必须 | - | loading 显示指标骨架；error 显示重试 |
| orders-list | 必须 | 必须 | 必须 | 必须 | - | empty 引导新建订单；error 保留筛选条件 |
| order-detail | 必须 | - | 必须 | 必须 | - | loading 显示字段骨架；error 提供返回列表与重试 |
| order-form | 必须 | - | 必须 | 必须 | 必须 | disabled 用于提交中或不可编辑字段 |
| settings | 必须 | - | 必须 | 必须 | - | loading 显示设置项骨架；error 提供重试 |
| home-feed | 必须 | 必须 | 必须 | 必须 | - | empty 显示探索引导；error 提供重试 |
| item-detail | 必须 | - | 必须 | 必须 | - | loading 显示商品骨架；error 提供重试 |
| auth | 必须 | - | 必须 | 必须 | 必须 | disabled 用于登录提交中或校验未通过 |

## 5. 字段表

### 5.1 Order（订单）

| 字段 | 类型 | 必填 | 约束 / 枚举 |
|---|---|---|---|
| orderNo | string | 是 | 唯一订单号，格式 `ORD-YYYYMMDD-NNNN` |
| customer | string | 是 | 客户名称，对应 Customer.name |
| amount | number | 是 | 人民币金额，保留两位小数，必须大于 0 |
| status | enum | 是 | `pending`、`paid`、`shipped`、`completed`、`cancelled` |
| createdAt | datetime | 是 | ISO 8601 时间，创建后不可修改 |

状态中文文案：pending=待支付，paid=已支付，shipped=已发货，completed=已完成，cancelled=已取消。

### 5.2 Customer（客户）

| 字段 | 类型 | 必填 | 约束 / 枚举 |
|---|---|---|---|
| name | string | 是 | 客户名称，1–50 个字符 |
| phone | string | 是 | 中国大陆手机号，11 位数字 |
| email | string | 是 | 合法邮箱地址 |

### 5.3 Settings（系统设置）

| 字段 | 类型 | 必填 | 约束 / 枚举 |
|---|---|---|---|
| notifications | enum | 是 | `on`、`off`；默认 `on` |
| language | enum | 是 | `zh-CN`、`en-US`；默认 `zh-CN` |
| timezone | string | 是 | IANA 时区，默认 `Asia/Shanghai` |

商品详情页的 `title`、`price`、`description` 由内容服务提供，Phase 1 不纳入订单数据模型。

## 6. 验收示例

### 6.1 订单概览（orders-overview）

**示例**：运营人员打开 `/orders/overview`。页面展示“今日订单、待处理、已完成、异常”四项指标和近期订单列表；请求中显示骨架屏；请求失败时显示错误说明与“重试”按钮，点击后重新请求。

### 6.2 订单列表（orders-list）

**示例**：运营人员打开 `/orders`，在筛选栏选择状态 `paid` 并输入关键字“张”，点击搜索后表格仅展示已支付且客户名包含“张”的订单；无匹配结果时显示空状态和“新建订单”入口；点击“新建订单”进入 `/orders/new`。

### 6.3 订单详情（order-detail）

**示例**：运营人员从订单列表点击订单号，进入 `/orders/ORD-20261019-0001`。页面展示订单号、客户、金额、状态、创建时间；点击“编辑订单”进入编辑态；订单不存在时显示错误状态并提供返回列表入口。

### 6.4 新建订单（order-form）

**示例**：运营人员打开 `/orders/new`，未填写客户与金额时“保存”不可用（disabled）；填写客户“张三”、金额 `199.00`、状态 `pending` 后点击“保存”，提交期间按钮禁用，成功后跳转至 `/orders/ORD-20261019-0002`；点击“取消”返回 `/orders` 且不创建订单。

### 6.5 设置（settings）

**示例**：管理员打开 `/settings`，将通知设为 `off`、语言设为 `en-US`、时区设为 `Asia/Shanghai`，点击“保存设置”后显示保存成功；`operator` 直接访问 `/settings` 时显示无权限提示，不渲染设置表单。

### 6.6 首页（home-feed）

**示例**：C 端用户打开 `/home`，信息流展示商品卡片；无内容时显示空状态与探索引导；请求失败时显示错误与“重试”；点击任一卡片进入 `/item/:id`。

### 6.7 商品详情（item-detail）

**示例**：用户打开 `/item/1001`，页面展示商品标题、价格和描述；点击“立即购买”时记录购买意图并进入下单流程；加载期间显示商品骨架；请求失败时显示错误与重试。

### 6.8 登录（auth）

**示例**：用户打开 `/auth`，输入邮箱 `viewer@example.com` 和密码后点击“登录”；邮箱格式错误时显示字段错误；登录请求期间按钮禁用；登录成功后进入 `/home`，失败时显示错误说明并保留输入。

## 7. 需求编号与可测试结果

| 需求编号 | 页面 | 可测试结果 |
|---|---|---|
| REQ-ORDER-001 | orders-overview | 打开概览页可看到四项指标与近期订单；loading 显示骨架，error 显示重试且可恢复。 |
| REQ-ORDER-002 | orders-list | 按状态/日期/关键字过滤后结果匹配；无结果时显示 empty 状态；“新建订单”进入 order-form。 |
| REQ-ORDER-003 | order-detail | 路由参数对应的订单展示 orderNo、customer、amount、status、createdAt；“编辑订单”可进入编辑态。 |
| REQ-ORDER-004 | order-form | 必填项缺失时保存禁用；合法提交后进入详情；提交中按钮禁用；“取消”不产生订单。 |
| REQ-ORDER-005 | settings | admin 可修改并保存 notifications/language/timezone；非 admin 访问被拒绝且不渲染表单。 |
| REQ-ORDER-006 | home-feed | 首页渲染信息流卡片；empty 显示引导；点击卡片进入 item-detail。 |
| REQ-ORDER-007 | item-detail | 商品标题、价格、描述可见；“立即购买”触发购买流程。 |
| REQ-ORDER-008 | auth | 非法邮箱显示错误；提交中按钮禁用；成功后进入 home-feed，失败保留输入并显示错误。 |

## 8. 追溯、假设与待确认事项

### 8.1 需求到页面追溯

| 需求编号 | 页面 id |
|---|---|
| REQ-ORDER-001 | orders-overview |
| REQ-ORDER-002 | orders-list |
| REQ-ORDER-003 | order-detail |
| REQ-ORDER-004 | order-form |
| REQ-ORDER-005 | settings |
| REQ-ORDER-006 | home-feed |
| REQ-ORDER-007 | item-detail |
| REQ-ORDER-008 | auth |

8 条需求全部有页面归属，无未映射需求。

### 8.2 假设

- A-001：订单金额以人民币（CNY）计，保留两位小数。
- A-002：Phase 1 仅包含登录，不包含注册、找回密码与第三方登录。
- A-003：商品详情字段由内容服务提供，Phase 1 不在订单数据模型中建模。
- A-004：Phase 1 的权限仅做页面级可见性控制，不细化到字段级。

### 8.3 待确认事项（不阻塞 Phase 1）

- Q-001：首页推荐信息流的默认排序策略（按热度或按时间）尚未确认，Phase 1 使用固定演示数据。

## 9. 样本声明

本 PRD 为 Phase 1 Pipeline 样本，页面、字段、角色与验收示例仅用于契约与校验测试。真实业务 PRD 必须经过需求评审并替换本文件。
