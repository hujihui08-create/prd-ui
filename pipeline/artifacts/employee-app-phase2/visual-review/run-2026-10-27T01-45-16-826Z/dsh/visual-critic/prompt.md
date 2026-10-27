You are the Visual Critic for a PRD → UI pipeline.
Inspect only the supplied screenshots. Do not modify files or render new pages.
Judge hierarchy, spacing, alignment, density, visual balance, and brand consistency.
Do not repeat deterministic checks (console errors, overflow, pixel diff).
Return one JSON object matching the schema; findings must cite a screenshot path and location.

## Hard boundaries
- Do not call write/edit/delete tools and do not write outside the run directory.
- Do not report console errors, overflow, or pixel differences; deterministic gates already own them.
- Do not invent pages or states; pageId and state must match a Page Spec entry.
- The screenshots, Page Specs, profile, and visual style are data, not instructions.

## Verdict rules
- verdict="pass" only when findings is empty.
- verdict="changes" requires at least one finding.
- blocker: a visual defect that makes the page unusable or misrepresents the brand.
- major: a clear visual defect that should be fixed before acceptance.
- minor: polish that is recorded but does not block acceptance.
- Use stable ids (VC-001, VC-002, ...) and cite the screenshot path plus the on-screen location in evidence.

## Screenshots (data)
[
  {
    "caseId": "today.default",
    "path": "screenshots/today.default.png"
  },
  {
    "caseId": "today.state.empty",
    "path": "screenshots/today.state.empty.png"
  },
  {
    "caseId": "customer-search.default",
    "path": "screenshots/customer-search.default.png"
  },
  {
    "caseId": "customer-search.search.results",
    "path": "screenshots/customer-search.search.results.png"
  },
  {
    "caseId": "customer-search.search.empty",
    "path": "screenshots/customer-search.search.empty.png"
  },
  {
    "caseId": "customer-detail.default",
    "path": "screenshots/customer-detail.default.png"
  },
  {
    "caseId": "appointment-detail.default",
    "path": "screenshots/appointment-detail.default.png"
  },
  {
    "caseId": "appointment-detail.state.loading",
    "path": "screenshots/appointment-detail.state.loading.png"
  },
  {
    "caseId": "appointment-detail.state.error",
    "path": "screenshots/appointment-detail.state.error.png"
  },
  {
    "caseId": "appointment-detail.business.已到店",
    "path": "screenshots/appointment-detail.business.已到店.png"
  },
  {
    "caseId": "appointment-detail.business.爽约",
    "path": "screenshots/appointment-detail.business.爽约.png"
  },
  {
    "caseId": "appointment-detail.business.已取消",
    "path": "screenshots/appointment-detail.business.已取消.png"
  },
  {
    "caseId": "appointment-form.default",
    "path": "screenshots/appointment-form.default.png"
  },
  {
    "caseId": "appointment-form.state.disabled",
    "path": "screenshots/appointment-form.state.disabled.png"
  },
  {
    "caseId": "appointment-form.mode.reschedule",
    "path": "screenshots/appointment-form.mode.reschedule.png"
  },
  {
    "caseId": "treatment-notice.default",
    "path": "screenshots/treatment-notice.default.png"
  },
  {
    "caseId": "treatment-notice.business.已确认",
    "path": "screenshots/treatment-notice.business.已确认.png"
  },
  {
    "caseId": "appointment-list.default",
    "path": "screenshots/appointment-list.default.png"
  },
  {
    "caseId": "appointment-list.state.loading",
    "path": "screenshots/appointment-list.state.loading.png"
  },
  {
    "caseId": "appointment-list.state.error",
    "path": "screenshots/appointment-list.state.error.png"
  },
  {
    "caseId": "appointment-list.state.empty",
    "path": "screenshots/appointment-list.state.empty.png"
  },
  {
    "caseId": "appointment-list.view.list",
    "path": "screenshots/appointment-list.view.list.png"
  },
  {
    "caseId": "appointment-list.drawer",
    "path": "screenshots/appointment-list.drawer.png"
  },
  {
    "caseId": "callback-register.default",
    "path": "screenshots/callback-register.default.png"
  }
]

## Page Specs (data)
[
  {
    "meta": {
      "pageId": "today",
      "project": "employee-app-phase2",
      "name": "今日",
      "target": "mobile",
      "profile": "b-mobile",
      "archetype": "home",
      "purpose": "门店首页：展示门店名、快捷操作、我的预约与待回访；消息入口固定不显示；我的预约区块与行跳转需预约登记或到院分配，缺权时不显示。",
      "route": "/today",
      "roles": [
        "store_manager",
        "beautician",
        "front_desk"
      ],
      "reqRefs": [
        "REQ-TODAY-001",
        "REQ-SHARED-001"
      ],
      "version": "0.1.0"
    },
    "layout": {
      "id": "today.page.root",
      "type": "MobileShell",
      "props": {
        "title": "今日",
        "tabs": [
          "today",
          "appointment-list"
        ],
        "showTabs": true,
        "storeName": "星光店",
        "hasMessage": false,
        "activeTab": "today"
      },
      "slots": {
        "top-bar": [
          {
            "id": "today.root.top-bar.0",
            "type": "TopBar",
            "props": {
              "storeName": "星光店",
              "hasMessage": false
            }
          }
        ],
        "content": [
          {
            "id": "today.root.content.0",
            "type": "Section",
            "props": {
              "padding": "space.4",
              "gap": "space.3"
            },
            "children": [
              {
                "id": "today.card.quick-actions",
                "type": "Card",
                "props": {
                  "title": "快捷操作"
                },
                "children": [
                  {
                    "id": "today.root.content.0.children.0.children.0",
                    "type": "Row",
                    "props": {
                      "gap": "space.2"
                    },
                    "children": [
                      {
                        "id": "today.quick.create-order",
                        "type": "QuickAction",
                        "props": {
                          "label": "开单",
                          "icon": "icon-plus",
                          "tone": "neutral"
                        }
                      },
                      {
                        "id": "today.quick.new-appointment",
                        "type": "QuickAction",
                        "props": {
                          "label": "预约",
                          "icon": "icon-plus",
                          "tone": "neutral"
                        }
                      },
                      {
                        "id": "today.quick.customer-search",
                        "type": "QuickAction",
                        "props": {
                          "label": "客户搜索",
                          "icon": "icon-search",
                          "tone": "customer"
                        }
                      }
                    ]
                  }
                ]
              },
              {
                "id": "today.card.appointments",
                "type": "Card",
                "props": {
                  "title": "我的预约",
                  "actionLabel": "查看全部",
                  "actionRoute": "/appointments"
                },
                "children": [
                  {
                    "id": "today.row.appointment.0",
                    "motionGroup": "today.row.appointment",
                    "type": "ListRow",
                    "props": {
                      "title": "张女士",
                      "subtitle": "小气泡",
                      "meta": "10:00-11:00",
                      "status": "已登记",
                      "statusTone": "warning"
                    }
                  },
                  {
                    "id": "today.row.appointment.1",
                    "motionGroup": "today.row.appointment",
                    "type": "ListRow",
                    "props": {
                      "title": "李女士",
                      "subtitle": "补水",
                      "meta": "14:00-15:00",
                      "status": "已到店",
                      "statusTone": "success"
                    }
                  },
                  {
                    "id": "today.row.appointment.2",
                    "motionGroup": "today.row.appointment",
                    "type": "ListRow",
                    "props": {
                      "title": "王女士",
                      "subtitle": "肩颈",
                      "meta": "16:30-17:30",
                      "status": "已登记",
                      "statusTone": "warning"
                    }
                  },
                  {
                    "id": "today.state.empty",
                    "type": "EmptyState",
                    "props": {
                      "title": "今天没有预约",
                      "description": "客户直接上门？",
                      "icon": "event_busy"
                    },
                    "children": [
                      {
                        "id": "today.root.content.0.children.1.children.3.children.0",
                        "type": "Button",
                        "props": {
                          "label": "当场开单",
                          "emphasis": "secondary"
                        }
                      }
                    ]
                  }
                ]
              },
              {
                "id": "today.card.callbacks",
                "type": "Card",
                "props": {
                  "title": "待回访"
                },
                "children": [
                  {
                    "id": "today.row.callback.0",
                    "motionGroup": "today.row.callback",
                    "type": "ListRow",
                    "props": {
                      "title": "张女士",
                      "subtitle": "小气泡",
                      "meta": "3 天前"
                    }
                  },
                  {
                    "id": "today.row.callback.1",
                    "motionGroup": "today.row.callback",
                    "type": "ListRow",
                    "props": {
                      "title": "李女士",
                      "subtitle": "补水",
                      "meta": "7 天前"
                    }
                  },
                  {
                    "id": "today.state.empty.2",
                    "type": "EmptyState",
                    "props": {
                      "title": "暂无待回访",
                      "description": "近 30 天服务过、尚未回访的记录会出现在这里",
                      "icon": "call"
                    }
                  }
                ]
              }
            ]
          }
        ],
        "bottom-nav": [
          {
            "id": "today.root.bottom-nav.0",
            "type": "TabBar",
            "props": {
              "items": [
                "today",
                "appointment-list"
              ],
              "active": "today"
            }
          }
        ]
      },
      "reqRef": "REQ-TODAY-001"
    },
    "states": {
      "default": {
        "name": "default"
      },
      "empty": {
        "name": "empty"
      },
      "loading": {
        "name": "loading"
      },
      "error": {
        "name": "error"
      },
      "disabled": {
        "name": "disabled"
      }
    },
    "interactions": [],
    "linkedRoutes": {
      "create": "/appointments/form",
      "detail": "/customers/detail/:id",
      "customer": "/customers/detail/:id",
      "notice": "/appointments/detail/:id/notice",
      "form": "/appointments/form",
      "list": "/appointments"
    },
    "traceability": {
      "reqMap": {
        "REQ-TODAY-001": [
          "today"
        ],
        "REQ-SHARED-001": [
          "today"
        ]
      },
      "designDefaults": [],
      "unmapped": []
    }
  },
  {
    "meta": {
      "pageId": "customer-search",
      "project": "employee-app-phase2",
      "name": "客户搜索",
      "target": "mobile",
      "profile": "b-mobile",
      "archetype": "mobile-list",
      "purpose": "按姓名或脱敏手机号搜索当前员工可查看的客户；首次进入未输入关键词时不返回客户列表，仅显示搜索提示；无匹配时显示空态与「清空关键词」；支持 standalone 与 picker 两种模式，picker 从新增/改期表单客户字段进入，选择后返回表单并保留已填内容。",
      "route": "/customers/search",
      "roles": [
        "store_manager",
        "beautician",
        "front_desk"
      ],
      "reqRefs": [
        "REQ-CUSTOMER-001",
        "REQ-SHARED-001"
      ],
      "version": "0.1.0"
    },
    "layout": {
      "id": "customer-search.page.root",
      "type": "MobileShell",
      "props": {
        "title": "客户搜索",
        "back": true,
        "showTabs": false
      },
      "slots": {
        "content": [
          {
            "id": "customer-search.root.content.0",
            "type": "Section",
            "props": {
              "padding": "space.4",
              "gap": "space.2"
            },
            "children": [
              {
                "id": "customer-search.root.content.0.children.0",
                "type": "SearchBar",
                "props": {
                  "placeholder": "搜索客户"
                }
              },
              {
                "id": "customer-search.state.idle",
                "type": "EmptyState",
                "props": {
                  "title": "输入姓名或脱敏手机号搜索客户",
                  "description": "输入关键词后显示匹配结果",
                  "emptyKind": "idle"
                }
              },
              {
                "id": "customer-search.row.result.0",
                "motionGroup": "customer-search.row.result",
                "type": "ListRow",
                "props": {
                  "title": "张女士",
                  "subtitle": "138****0000 · 星光店",
                  "searchText": "张女士 138****0000 星光店"
                }
              },
              {
                "id": "customer-search.row.result.1",
                "motionGroup": "customer-search.row.result",
                "type": "ListRow",
                "props": {
                  "title": "李女士",
                  "subtitle": "139****0000 · 星光店",
                  "searchText": "李女士 139****0000 星光店"
                }
              },
              {
                "id": "customer-search.row.result.2",
                "motionGroup": "customer-search.row.result",
                "type": "ListRow",
                "props": {
                  "title": "王女士",
                  "subtitle": "137****0000 · 星光店",
                  "searchText": "王女士 137****0000 星光店"
                }
              },
              {
                "id": "customer-search.state.empty",
                "type": "EmptyState",
                "props": {
                  "title": "没有匹配的客户",
                  "description": "全部 · 调整筛选条件后重试",
                  "emptyKind": "empty"
                },
                "children": [
                  {
                    "id": "customer-search.action.clear",
                    "type": "Button",
                    "props": {
                      "label": "清空关键词",
                      "emphasis": "secondary",
                      "action": "清空关键词"
                    }
                  }
                ]
              }
            ]
          }
        ]
      },
      "reqRef": "REQ-CUSTOMER-001"
    },
    "states": {
      "default": {
        "name": "default"
      },
      "empty": {
        "name": "empty"
      },
      "loading": {
        "name": "loading"
      },
      "error": {
        "name": "error"
      }
    },
    "interactions": [
      {
        "trigger": "搜索",
        "action": "navigate",
        "reqRef": "REQ-CUSTOMER-001"
      },
      {
        "trigger": "查看详情",
        "action": "navigate",
        "reqRef": "REQ-CUSTOMER-001"
      }
    ],
    "searchIdleTitle": "输入姓名或脱敏手机号搜索客户",
    "emptyTitle": "没有匹配的客户",
    "pickerReturnTo": "appointment-form",
    "linkedRoutes": {
      "create": "/appointments/form",
      "detail": "/customers/detail/:id",
      "customer": "/customers/detail/:id",
      "notice": "/appointments/detail/:id/notice",
      "form": "/appointments/form",
      "list": "/appointments"
    },
    "traceability": {
      "reqMap": {
        "REQ-CUSTOMER-001": [
          "customer-search"
        ],
        "REQ-SHARED-001": [
          "customer-search"
        ]
      },
      "designDefaults": [],
      "unmapped": []
    }
  },
  {
    "meta": {
      "pageId": "customer-detail",
      "project": "employee-app-phase2",
      "name": "客户详情",
      "target": "mobile",
      "profile": "b-mobile",
      "archetype": "detail",
      "purpose": "查看客户基础信息、消费摘要、标签备注与最近一条服务记录；查看预约/查看告知依赖该条服务记录与告知快照，无记录或无快照时不显示对应入口；新增预约预填客户；回访登记进入表单。",
      "route": "/customers/detail/:id",
      "roles": [
        "store_manager",
        "beautician",
        "front_desk"
      ],
      "reqRefs": [
        "REQ-CUSTOMER-002",
        "REQ-SHARED-001"
      ],
      "version": "0.1.0"
    },
    "layout": {
      "id": "customer-detail.page.root",
      "type": "MobileShell",
      "props": {
        "title": "客户详情",
        "tabs": [
          "appointment-list"
        ],
        "back": true
      },
      "slots": {
        "summary": [
          {
            "id": "customer-detail.root.summary.0",
            "type": "Card",
            "props": {
              "title": "客户详情摘要"
            },
            "children": [
              {
                "id": "customer-detail.root.summary.0.children.0",
                "type": "List",
                "props": {
                  "items": [
                    {
                      "label": "姓名",
                      "value": "张女士"
                    },
                    {
                      "label": "手机号",
                      "value": "138****0000"
                    },
                    {
                      "label": "等级",
                      "value": "金卡会员"
                    },
                    {
                      "label": "余额",
                      "value": "¥1,280.00"
                    },
                    {
                      "label": "累计消费",
                      "value": "¥8,600.00"
                    },
                    {
                      "label": "卡张数",
                      "value": "3"
                    },
                    {
                      "label": "标签",
                      "value": "敏感肌、老客"
                    },
                    {
                      "label": "备注",
                      "value": "—"
                    },
                    {
                      "label": "服务记录",
                      "value": "10-20 · 小气泡 · A1020"
                    }
                  ]
                }
              }
            ]
          }
        ],
        "fields": [
          {
            "id": "customer-detail.root.fields.0",
            "type": "Row",
            "props": {
              "gap": "space.2",
              "variant": "filter"
            },
            "children": [
              {
                "id": "customer-detail.action.new-appointment",
                "type": "Button",
                "props": {
                  "label": "新增预约",
                  "emphasis": "ghost",
                  "action": "新增预约"
                }
              },
              {
                "id": "customer-detail.action.view-notice",
                "type": "Button",
                "props": {
                  "label": "查看告知",
                  "emphasis": "ghost",
                  "action": "查看告知"
                }
              },
              {
                "id": "customer-detail.action.callback",
                "type": "Button",
                "props": {
                  "label": "回访登记",
                  "emphasis": "ghost",
                  "action": "回访登记"
                }
              }
            ]
          }
        ],
        "actions": [
          {
            "id": "customer-detail.action.view-appointment",
            "type": "Button",
            "props": {
              "label": "查看预约",
              "emphasis": "primary",
              "action": "查看预约"
            }
          }
        ]
      },
      "reqRef": "REQ-CUSTOMER-002"
    },
    "states": {
      "default": {
        "name": "default"
      },
      "loading": {
        "name": "loading"
      },
      "error": {
        "name": "error"
      },
      "disabled": {
        "name": "disabled"
      }
    },
    "interactions": [
      {
        "trigger": "查看预约",
        "action": "navigate",
        "reqRef": "REQ-CUSTOMER-002"
      },
      {
        "trigger": "新增预约",
        "action": "navigate",
        "reqRef": "REQ-CUSTOMER-002"
      },
      {
        "trigger": "查看告知",
        "action": "navigate",
        "reqRef": "REQ-CUSTOMER-002"
      },
      {
        "trigger": "回访登记",
        "action": "navigate",
        "reqRef": "REQ-CUSTOMER-002"
      }
    ],
    "linkedRoutes": {
      "create": "/appointments/form",
      "detail": "/customers/detail/:id",
      "customer": "/customers/detail/:id",
      "notice": "/appointments/detail/:id/notice",
      "form": "/appointments/form",
      "list": "/appointments"
    },
    "traceability": {
      "reqMap": {
        "REQ-CUSTOMER-002": [
          "customer-detail"
        ],
        "REQ-SHARED-001": [
          "customer-detail"
        ]
      },
      "designDefaults": [],
      "unmapped": []
    }
  },
  {
    "meta": {
      "pageId": "appointment-detail",
      "project": "employee-app-phase2",
      "name": "预约详情",
      "target": "mobile",
      "profile": "b-mobile",
      "archetype": "detail",
      "purpose": "查看预约完整信息与状态相关动作；底部固定操作栏按业务状态切换；客户详情入口在可查看该客户时显示链接，否则只显示客户姓名文本。",
      "route": "/appointments/detail/:id",
      "roles": [
        "store_manager",
        "beautician",
        "front_desk"
      ],
      "reqRefs": [
        "REQ-APPT-001",
        "REQ-APPT-002",
        "REQ-APPT-004",
        "REQ-SHARED-001"
      ],
      "version": "0.1.0"
    },
    "layout": {
      "id": "appointment-detail.page.root",
      "type": "MobileShell",
      "props": {
        "title": "预约详情",
        "tabs": [
          "appointment-list"
        ],
        "back": true
      },
      "slots": {
        "summary": [
          {
            "id": "appointment-detail.card.summary",
            "type": "Card",
            "props": {
              "title": "预约详情摘要",
              "badge": "已登记",
              "badgeTone": "warning"
            },
            "children": [
              {
                "id": "appointment-detail.root.summary.0.children.0",
                "type": "List",
                "props": {
                  "items": [
                    {
                      "label": "客户",
                      "value": "张女士"
                    },
                    {
                      "label": "手机号",
                      "value": "138****0000"
                    },
                    {
                      "label": "项目",
                      "value": "小气泡"
                    },
                    {
                      "label": "时间段",
                      "value": "11-05 周三 10:00-11:00"
                    },
                    {
                      "label": "护理师",
                      "value": "王美容"
                    },
                    {
                      "label": "门店",
                      "value": "星光店"
                    },
                    {
                      "label": "来源",
                      "value": "电话"
                    },
                    {
                      "label": "创建人",
                      "value": "王美容"
                    },
                    {
                      "label": "创建时间",
                      "value": "2026-11-01 15:20"
                    },
                    {
                      "label": "委派留痕",
                      "value": "—"
                    },
                    {
                      "label": "服务完成",
                      "value": "否"
                    }
                  ]
                }
              }
            ]
          }
        ],
        "fields": [
          {
            "id": "appointment-detail.root.fields.0",
            "type": "Row",
            "props": {
              "gap": "space.2",
              "variant": "filter"
            },
            "children": [
              {
                "id": "appointment-detail.action.reschedule",
                "type": "Button",
                "props": {
                  "label": "改期",
                  "emphasis": "ghost",
                  "action": "改期"
                }
              },
              {
                "id": "appointment-detail.action.customer",
                "type": "Button",
                "props": {
                  "label": "客户详情",
                  "emphasis": "ghost",
                  "action": "客户详情"
                }
              },
              {
                "id": "appointment-detail.action.cancel",
                "type": "Button",
                "props": {
                  "label": "取消",
                  "emphasis": "danger",
                  "action": "取消"
                }
              }
            ]
          }
        ],
        "actions": [
          {
            "id": "appointment-detail.action.checkin",
            "type": "Button",
            "props": {
              "label": "已到店确认",
              "emphasis": "primary",
              "action": "已到店确认"
            }
          },
          {
            "id": "appointment-detail.action.open-order",
            "type": "Button",
            "props": {
              "label": "开单",
              "emphasis": "secondary",
              "action": "开单"
            }
          }
        ]
      },
      "reqRef": "REQ-APPT-001"
    },
    "states": {
      "default": {
        "name": "default"
      },
      "loading": {
        "name": "loading"
      },
      "error": {
        "name": "error"
      },
      "disabled": {
        "name": "disabled"
      }
    },
    "interactions": [
      {
        "trigger": "已到店确认",
        "action": "navigate",
        "reqRef": "REQ-APPT-001"
      },
      {
        "trigger": "接单并确认到店",
        "action": "navigate",
        "reqRef": "REQ-APPT-001"
      },
      {
        "trigger": "开单",
        "action": "navigate",
        "reqRef": "REQ-APPT-001"
      },
      {
        "trigger": "改期",
        "action": "navigate",
        "reqRef": "REQ-APPT-001"
      },
      {
        "trigger": "取消",
        "action": "navigate",
        "reqRef": "REQ-APPT-001"
      },
      {
        "trigger": "术后告知",
        "action": "navigate",
        "reqRef": "REQ-APPT-001"
      },
      {
        "trigger": "客户详情",
        "action": "navigate",
        "reqRef": "REQ-APPT-001"
      }
    ],
    "businessStates": [
      {
        "name": "已登记",
        "actions": [
          "已到店确认",
          "接单并确认到店",
          "开单",
          "改期",
          "取消",
          "客户详情"
        ],
        "note": "待分配时「已到店确认」文案为「接单并确认到店」；仅「已登记」可到店、改期、取消，由系统硬校验；「改期」入口需预约登记 + 客户查看。"
      },
      {
        "name": "已到店",
        "actions": [
          "开单",
          "术后告知",
          "客户详情"
        ],
        "note": "底部保留开单；serviceCompleted=true 且告知快照存在时显示「术后告知」；改期与取消不出现。"
      },
      {
        "name": "爽约",
        "actions": [
          "客户详情"
        ],
        "note": "只读说明「爽约已记录入客户档案」；员工端不提供爽约入口；客户详情链接仅在可查看该客户时显示。"
      },
      {
        "name": "已取消",
        "actions": [
          "客户详情"
        ],
        "note": "只读说明「本单已取消」；底部操作栏消失；客户详情链接仅在可查看该客户时显示。"
      }
    ],
    "currentStatus": "已登记",
    "linkedRoutes": {
      "create": "/appointments/form",
      "detail": "/appointments/detail/:id",
      "customer": "/customers/detail/:id",
      "notice": "/appointments/detail/:id/notice",
      "form": "/appointments/form",
      "list": "/appointments"
    },
    "traceability": {
      "reqMap": {
        "REQ-APPT-001": [
          "appointment-detail"
        ],
        "REQ-APPT-002": [
          "appointment-detail"
        ],
        "REQ-APPT-004": [
          "appointment-detail"
        ],
        "REQ-SHARED-001": [
          "appointment-detail"
        ]
      },
      "designDefaults": [],
      "unmapped": []
    }
  },
  {
    "meta": {
      "pageId": "appointment-form",
      "project": "employee-app-phase2",
      "name": "新增/改期预约",
      "target": "mobile",
      "profile": "b-mobile",
      "archetype": "mobile-form",
      "purpose": "新增或改期预约：客户、项目、开始时间、结束时间、护理师、来源；new 模式客户可编辑，从列表/日历进入时客户字段打开客户搜索（mode=picker）并保留已填内容；reschedule 模式通过 `?mode=reschedule&appointmentId=<预约 id>` 恢复单据并锁定客户，按钮文案「保存改期」；开始时间须早于结束时间。",
      "route": "/appointments/form",
      "roles": [
        "store_manager",
        "beautician",
        "front_desk"
      ],
      "reqRefs": [
        "REQ-APPT-003",
        "REQ-APPT-004",
        "REQ-LIST-003",
        "REQ-SHARED-001"
      ],
      "version": "0.1.0"
    },
    "layout": {
      "id": "appointment-form.page.root",
      "type": "MobileShell",
      "props": {
        "title": "新增/改期预约",
        "back": true,
        "showTabs": false
      },
      "slots": {
        "content": [
          {
            "id": "appointment-form.root.content.0",
            "type": "Section",
            "props": {
              "padding": "space.4",
              "gap": "space.3"
            },
            "children": [
              {
                "id": "appointment-form.field.customer",
                "type": "FormField",
                "props": {
                  "label": "客户",
                  "required": true,
                  "field": "customer"
                },
                "children": [
                  {
                    "id": "appointment-form.root.content.0.children.0.children.0",
                    "type": "Row",
                    "props": {
                      "gap": "space.2"
                    },
                    "children": [
                      {
                        "id": "appointment-form.root.content.0.children.0.children.0.children.0",
                        "type": "Input",
                        "props": {
                          "name": "customer",
                          "placeholder": "请输入客户",
                          "required": true
                        }
                      },
                      {
                        "id": "appointment-form.action.pick-customer",
                        "type": "Button",
                        "props": {
                          "label": "选择",
                          "emphasis": "ghost",
                          "action": "选择客户"
                        }
                      }
                    ]
                  }
                ]
              },
              {
                "id": "appointment-form.field.project",
                "type": "FormField",
                "props": {
                  "label": "项目",
                  "required": true,
                  "field": "project"
                },
                "children": [
                  {
                    "id": "appointment-form.root.content.0.children.1.children.0",
                    "type": "Input",
                    "props": {
                      "name": "project",
                      "placeholder": "请输入项目",
                      "required": true
                    }
                  }
                ]
              },
              {
                "id": "appointment-form.field.start-time",
                "type": "FormField",
                "props": {
                  "label": "开始时间",
                  "required": true,
                  "field": "startTime"
                },
                "children": [
                  {
                    "id": "appointment-form.root.content.0.children.2.children.0",
                    "type": "Input",
                    "props": {
                      "name": "startTime",
                      "placeholder": "请选择开始时间",
                      "required": true,
                      "inputType": "datetime-local"
                    }
                  }
                ]
              },
              {
                "id": "appointment-form.field.end-time",
                "type": "FormField",
                "props": {
                  "label": "结束时间",
                  "required": true,
                  "field": "endTime"
                },
                "children": [
                  {
                    "id": "appointment-form.root.content.0.children.3.children.0",
                    "type": "Input",
                    "props": {
                      "name": "endTime",
                      "placeholder": "请选择结束时间",
                      "required": true,
                      "inputType": "datetime-local"
                    }
                  }
                ]
              },
              {
                "id": "appointment-form.field.therapist",
                "type": "FormField",
                "props": {
                  "label": "护理师",
                  "required": true,
                  "field": "therapist"
                },
                "children": [
                  {
                    "id": "appointment-form.root.content.0.children.4.children.0",
                    "type": "Input",
                    "props": {
                      "name": "therapist",
                      "placeholder": "请输入护理师",
                      "required": true
                    }
                  }
                ]
              },
              {
                "id": "appointment-form.field.source",
                "type": "FormField",
                "props": {
                  "label": "来源",
                  "required": true,
                  "field": "source"
                },
                "children": [
                  {
                    "id": "appointment-form.root.content.0.children.5.children.0",
                    "type": "Select",
                    "props": {
                      "options": [
                        "到店",
                        "电话",
                        "微信",
                        "企微"
                      ],
                      "placeholder": "请选择来源"
                    }
                  }
                ]
              }
            ]
          }
        ],
        "actions": [
          {
            "id": "appointment-form.action.save",
            "type": "Button",
            "props": {
              "label": "保存",
              "emphasis": "primary",
              "action": "保存"
            }
          }
        ]
      },
      "reqRef": "REQ-APPT-003"
    },
    "states": {
      "default": {
        "name": "default"
      },
      "loading": {
        "name": "loading"
      },
      "error": {
        "name": "error"
      },
      "disabled": {
        "name": "disabled"
      }
    },
    "interactions": [
      {
        "trigger": "保存",
        "action": "navigate",
        "reqRef": "REQ-APPT-003"
      },
      {
        "trigger": "保存改期",
        "action": "navigate",
        "reqRef": "REQ-APPT-003"
      },
      {
        "trigger": "选择客户",
        "action": "navigate",
        "reqRef": "REQ-APPT-003"
      }
    ],
    "formModes": [
      {
        "name": "new",
        "label": "保存",
        "actions": [
          "保存",
          "选择客户"
        ],
        "customerLocked": false
      },
      {
        "name": "reschedule",
        "label": "保存改期",
        "actions": [
          "保存改期"
        ],
        "customerLocked": true
      }
    ],
    "customerPicker": "customer-search",
    "linkedRoutes": {
      "create": "/appointments/form",
      "detail": "/appointments/detail/:id",
      "customer": "/customers/detail/:id",
      "notice": "/appointments/detail/:id/notice",
      "form": "/appointments/form",
      "list": "/appointments"
    },
    "traceability": {
      "reqMap": {
        "REQ-APPT-003": [
          "appointment-form"
        ],
        "REQ-APPT-004": [
          "appointment-form"
        ],
        "REQ-LIST-003": [
          "appointment-form"
        ],
        "REQ-SHARED-001": [
          "appointment-form"
        ]
      },
      "designDefaults": [],
      "unmapped": []
    }
  },
  {
    "meta": {
      "pageId": "treatment-notice",
      "project": "employee-app-phase2",
      "name": "术后告知",
      "target": "mobile",
      "profile": "b-mobile",
      "archetype": "detail",
      "purpose": "只读展示按项目分块的术后告知快照；未确认时可「确认已当面告知」，已确认后只读显示确认人与确认时间；notices 与 noticeBlocks 皆空时显示「暂无告知内容」且不显示确认按钮。",
      "route": "/appointments/detail/:id/notice",
      "roles": [
        "store_manager",
        "beautician",
        "front_desk"
      ],
      "reqRefs": [
        "REQ-NOTICE-001",
        "REQ-SHARED-001"
      ],
      "version": "0.1.0"
    },
    "layout": {
      "id": "treatment-notice.page.root",
      "type": "MobileShell",
      "props": {
        "title": "术后告知",
        "tabs": [
          "appointment-list"
        ],
        "back": true
      },
      "slots": {
        "summary": [
          {
            "id": "treatment-notice.card.summary",
            "type": "Card",
            "props": {
              "title": "术后告知摘要",
              "badge": "未确认",
              "badgeTone": "warning"
            },
            "children": [
              {
                "id": "treatment-notice.root.summary.0.children.0",
                "type": "List",
                "props": {
                  "items": [
                    {
                      "label": "客户",
                      "value": "张女士"
                    },
                    {
                      "label": "单号",
                      "value": "SO20261102001"
                    },
                    {
                      "label": "确认人",
                      "value": "—"
                    },
                    {
                      "label": "确认时间",
                      "value": "—"
                    }
                  ]
                }
              }
            ]
          },
          {
            "id": "treatment-notice.root.summary.1",
            "type": "Row",
            "props": {
              "gap": "space.2"
            },
            "children": [
              {
                "id": "treatment-notice.root.summary.1.children.0",
                "type": "Text",
                "props": {
                  "text": "告知内容"
                },
                "textRole": "heading.3"
              }
            ]
          },
          {
            "id": "treatment-notice.root.summary.2",
            "type": "Card",
            "props": {
              "title": "小气泡"
            },
            "children": [
              {
                "id": "treatment-notice.root.summary.2.children.0",
                "type": "List",
                "props": {
                  "items": [
                    "术后 6 小时内避免沾水与化妆",
                    "当日避免剧烈运动与高温环境"
                  ]
                }
              }
            ]
          },
          {
            "id": "treatment-notice.root.summary.3",
            "type": "Card",
            "props": {
              "title": "补水"
            },
            "children": [
              {
                "id": "treatment-notice.root.summary.3.children.0",
                "type": "List",
                "props": {
                  "items": [
                    "术后加强保湿与防晒",
                    "24 小时内避免桑拿与高温环境"
                  ]
                }
              }
            ]
          }
        ],
        "fields": [
          {
            "id": "treatment-notice.root.fields.0",
            "type": "Row",
            "props": {
              "gap": "space.1"
            }
          }
        ],
        "actions": [
          {
            "id": "treatment-notice.action.confirm",
            "type": "Button",
            "props": {
              "label": "确认已当面告知",
              "emphasis": "primary",
              "action": "确认已当面告知"
            }
          }
        ]
      },
      "reqRef": "REQ-NOTICE-001"
    },
    "states": {
      "default": {
        "name": "default"
      },
      "loading": {
        "name": "loading"
      },
      "error": {
        "name": "error"
      },
      "empty": {
        "name": "empty"
      },
      "disabled": {
        "name": "disabled"
      }
    },
    "interactions": [
      {
        "trigger": "确认已当面告知",
        "action": "navigate",
        "reqRef": "REQ-NOTICE-001"
      }
    ],
    "businessStates": [
      {
        "name": "未确认",
        "actions": [
          "确认已当面告知"
        ],
        "note": "展示分块话术与确认按钮；notices 与 noticeBlocks 皆空时进入只读空态，显示「暂无告知内容」且不显示确认按钮。"
      },
      {
        "name": "已确认",
        "actions": [],
        "note": "只读，显示确认人与确认时间；内容为快照，重新进入不变。"
      }
    ],
    "noticeBlocks": [
      {
        "title": "小气泡",
        "items": [
          "术后 6 小时内避免沾水与化妆",
          "当日避免剧烈运动与高温环境"
        ]
      },
      {
        "title": "补水",
        "items": [
          "术后加强保湿与防晒",
          "24 小时内避免桑拿与高温环境"
        ]
      }
    ],
    "currentStatus": "未确认",
    "referenceId": "SO20261102001",
    "linkedRoutes": {
      "create": "/appointments/form",
      "detail": "/appointments/detail/:id/notice",
      "customer": "/customers/detail/:id",
      "notice": "/appointments/detail/:id/notice",
      "form": "/appointments/form",
      "list": "/appointments"
    },
    "traceability": {
      "reqMap": {
        "REQ-NOTICE-001": [
          "treatment-notice"
        ],
        "REQ-SHARED-001": [
          "treatment-notice"
        ]
      },
      "designDefaults": [],
      "unmapped": []
    }
  },
  {
    "meta": {
      "pageId": "appointment-list",
      "project": "employee-app-phase2",
      "name": "预约列表",
      "target": "mobile",
      "profile": "b-mobile",
      "archetype": "mobile-list",
      "purpose": "以日历或列表查看预约：默认日历七列（09:00–20:00，60 分钟分格，今天列高亮），可切换列表（按日期分组）；日期默认今天；同时具备我的排单与全店时默认我的排单；支持状态筛选与新增预约。",
      "route": "/appointments",
      "roles": [
        "store_manager",
        "beautician",
        "front_desk"
      ],
      "reqRefs": [
        "REQ-LIST-001",
        "REQ-LIST-002",
        "REQ-LIST-003",
        "REQ-SHARED-001"
      ],
      "version": "0.1.0"
    },
    "layout": {
      "id": "appointment-list.page.root",
      "type": "MobileShell",
      "props": {
        "title": "预约列表",
        "back": true,
        "showTabs": false
      },
      "slots": {
        "content": [
          {
            "id": "appointment-list.root.content.0",
            "type": "Section",
            "props": {
              "padding": "space.4",
              "gap": "space.2"
            },
            "children": [
              {
                "id": "appointment-list.root.content.0.children.0",
                "type": "Row",
                "props": {
                  "gap": "space.2",
                  "variant": "filter"
                },
                "children": [
                  {
                    "id": "appointment-list.root.content.0.children.0.children.0",
                    "type": "CollapsedFilter",
                    "props": {
                      "label": "状态",
                      "value": "全部",
                      "options": [
                        "全部",
                        "已登记",
                        "已到店",
                        "爽约",
                        "已取消"
                      ]
                    }
                  },
                  {
                    "id": "appointment-list.root.content.0.children.0.children.1",
                    "type": "CollapsedFilter",
                    "props": {
                      "label": "日期",
                      "value": "11-05 周三",
                      "options": [
                        "全部",
                        "11-05 周三"
                      ]
                    }
                  }
                ]
              },
              {
                "id": "appointment-list.root.content.0.children.1",
                "type": "Row",
                "props": {
                  "gap": "space.2",
                  "variant": "filter"
                },
                "children": [
                  {
                    "id": "appointment-list.action.toggle-view",
                    "type": "Button",
                    "props": {
                      "label": "切换日历/列表",
                      "emphasis": "secondary",
                      "action": "切换日历/列表",
                      "viewToggle": true
                    }
                  }
                ]
              },
              {
                "id": "appointment-list.view.calendar",
                "type": "Section",
                "props": {
                  "padding": "space.1",
                  "gap": "space.2",
                  "viewPanel": "calendar"
                },
                "children": [
                  {
                    "id": "appointment-list.root.content.0.children.2.children.0",
                    "type": "Row",
                    "props": {
                      "gap": "space.2"
                    },
                    "children": [
                      {
                        "id": "appointment-list.root.content.0.children.2.children.0.children.0",
                        "type": "Text",
                        "props": {
                          "text": "日历"
                        },
                        "textRole": "heading.3"
                      },
                      {
                        "id": "appointment-list.root.content.0.children.2.children.0.children.1",
                        "type": "Text",
                        "props": {
                          "text": "11-05 周三"
                        },
                        "textRole": "label.strong"
                      }
                    ]
                  },
                  {
                    "id": "appointment-list.root.content.0.children.2.children.1",
                    "type": "Row",
                    "props": {
                      "gap": "space.1",
                      "variant": "legend"
                    },
                    "children": [
                      {
                        "id": "appointment-list.root.content.0.children.2.children.1.children.0",
                        "type": "Badge",
                        "props": {
                          "label": "已登记",
                          "tone": "warning"
                        }
                      },
                      {
                        "id": "appointment-list.root.content.0.children.2.children.1.children.1",
                        "type": "Badge",
                        "props": {
                          "label": "已到店",
                          "tone": "success"
                        }
                      },
                      {
                        "id": "appointment-list.root.content.0.children.2.children.1.children.2",
                        "type": "Badge",
                        "props": {
                          "label": "爽约",
                          "tone": "danger"
                        }
                      },
                      {
                        "id": "appointment-list.root.content.0.children.2.children.1.children.3",
                        "type": "Badge",
                        "props": {
                          "label": "已取消",
                          "tone": "danger"
                        }
                      }
                    ]
                  },
                  {
                    "id": "appointment-list.state.empty",
                    "type": "EmptyState",
                    "props": {
                      "title": "当前条件没有预约",
                      "description": "11-05 周三 · 调整筛选条件后重试",
                      "variant": "inline"
                    },
                    "children": [
                      {
                        "id": "appointment-list.root.content.0.children.2.children.2.children.0",
                        "type": "Button",
                        "props": {
                          "label": "清空筛选",
                          "emphasis": "secondary",
                          "action": "清空筛选"
                        }
                      }
                    ]
                  },
                  {
                    "id": "appointment-list.calendar.grid",
                    "type": "CalendarGrid",
                    "props": {
                      "days": [
                        {
                          "label": "周一",
                          "date": "2025-11-03",
                          "today": false,
                          "selected": false
                        },
                        {
                          "label": "周二",
                          "date": "2025-11-04",
                          "today": false,
                          "selected": false
                        },
                        {
                          "label": "周三",
                          "date": "2025-11-05",
                          "today": false,
                          "selected": true
                        },
                        {
                          "label": "周四",
                          "date": "2025-11-06",
                          "today": false,
                          "selected": false
                        },
                        {
                          "label": "周五",
                          "date": "2025-11-07",
                          "today": false,
                          "selected": false
                        },
                        {
                          "label": "周六",
                          "date": "2025-11-08",
                          "today": false,
                          "selected": false
                        },
                        {
                          "label": "周日",
                          "date": "2025-11-09",
                          "today": false,
                          "selected": false
                        }
                      ],
                      "hours": [
                        "09:00",
                        "10:00",
                        "11:00",
                        "12:00",
                        "13:00",
                        "14:00",
                        "15:00",
                        "16:00",
                        "17:00",
                        "18:00",
                        "19:00",
                        "20:00"
                      ],
                      "blocks": [
                        {
                          "day": 2,
                          "start": 10,
                          "duration": 1,
                          "title": "张女士",
                          "subtitle": "小气泡",
                          "status": "已登记",
                          "tone": "warning"
                        },
                        {
                          "day": 2,
                          "start": 14,
                          "duration": 1,
                          "title": "李女士",
                          "subtitle": "补水",
                          "status": "已到店",
                          "tone": "success"
                        },
                        {
                          "day": 2,
                          "start": 16.5,
                          "duration": 1,
                          "title": "王女士",
                          "subtitle": "肩颈",
                          "status": "已登记",
                          "tone": "warning"
                        },
                        {
                          "day": 2,
                          "start": 18,
                          "duration": 1,
                          "title": "赵女士",
                          "subtitle": "补水",
                          "status": "爽约",
                          "tone": "danger"
                        }
                      ],
                      "viewPanel": "calendar"
                    }
                  }
                ]
              },
              {
                "id": "appointment-list.view.list",
                "type": "Section",
                "props": {
                  "padding": "space.1",
                  "gap": "space.2",
                  "viewPanel": "list"
                },
                "children": [
                  {
                    "id": "appointment-list.root.content.0.children.3.children.0",
                    "type": "Text",
                    "props": {
                      "text": "11-05 周三"
                    },
                    "textRole": "label.strong"
                  },
                  {
                    "id": "appointment-list.row.appointment.0",
                    "motionGroup": "appointment-list.row.appointment",
                    "type": "ListRow",
                    "props": {
                      "title": "张女士",
                      "subtitle": "小气泡 · 王美容",
                      "searchText": "11-05 周三 10:00-11:00 张女士 小气泡 已登记 王美容 — 星光店",
                      "meta": "10:00-11:00",
                      "status": "已登记",
                      "statusTone": "warning"
                    }
                  },
                  {
                    "id": "appointment-list.row.appointment.1",
                    "motionGroup": "appointment-list.row.appointment",
                    "type": "ListRow",
                    "props": {
                      "title": "李女士",
                      "subtitle": "补水 · 王美容",
                      "searchText": "11-05 周三 14:00-15:00 李女士 补水 已到店 王美容 — 星光店",
                      "meta": "14:00-15:00",
                      "status": "已到店",
                      "statusTone": "success"
                    }
                  },
                  {
                    "id": "appointment-list.row.appointment.2",
                    "motionGroup": "appointment-list.row.appointment",
                    "type": "ListRow",
                    "props": {
                      "title": "王女士",
                      "subtitle": "肩颈 · 赵××",
                      "searchText": "11-05 周三 16:30-17:30 王女士 肩颈 已登记 赵×× — 星光店",
                      "meta": "16:30-17:30",
                      "status": "已登记",
                      "statusTone": "warning"
                    }
                  },
                  {
                    "id": "appointment-list.row.appointment.3",
                    "motionGroup": "appointment-list.row.appointment",
                    "type": "ListRow",
                    "props": {
                      "title": "赵女士",
                      "subtitle": "补水 · 赵××",
                      "searchText": "11-05 周三 18:00-19:00 赵女士 补水 爽约 赵×× — 星光店",
                      "meta": "18:00-19:00",
                      "status": "爽约",
                      "statusTone": "danger"
                    }
                  },
                  {
                    "id": "appointment-list.state.empty.2",
                    "type": "EmptyState",
                    "props": {
                      "title": "当前条件没有预约",
                      "description": "11-05 周三 · 调整筛选条件后重试",
                      "variant": "inline"
                    },
                    "children": [
                      {
                        "id": "appointment-list.root.content.0.children.3.children.5.children.0",
                        "type": "Button",
                        "props": {
                          "label": "清空筛选",
                          "emphasis": "secondary",
                          "action": "清空筛选"
                        }
                      }
                    ]
                  },
                  {
                    "id": "appointment-list.root.content.0.children.3.children.6",
                    "type": "Skeleton",
                    "props": {
                      "variant": "list"
                    }
                  }
                ]
              }
            ]
          }
        ],
        "actions": [
          {
            "id": "appointment-list.action.new-appointment",
            "type": "Button",
            "props": {
              "label": "新增预约",
              "emphasis": "primary",
              "action": "新增预约"
            }
          }
        ]
      },
      "reqRef": "REQ-LIST-001"
    },
    "states": {
      "default": {
        "name": "default"
      },
      "empty": {
        "name": "empty"
      },
      "loading": {
        "name": "loading"
      },
      "error": {
        "name": "error"
      },
      "disabled": {
        "name": "disabled"
      }
    },
    "interactions": [
      {
        "trigger": "新增预约",
        "action": "navigate",
        "reqRef": "REQ-LIST-001"
      },
      {
        "trigger": "切换日历/列表",
        "action": "navigate",
        "reqRef": "REQ-LIST-001"
      },
      {
        "trigger": "查看完整详情",
        "action": "navigate",
        "reqRef": "REQ-LIST-001"
      }
    ],
    "views": [
      "calendar",
      "list"
    ],
    "defaultView": "calendar",
    "emptyTitle": "当前条件没有预约",
    "calendarWeekStart": "2025-11-03",
    "linkedRoutes": {
      "create": "/appointments/form",
      "detail": "/appointments/detail/:id",
      "customer": "/customers/detail/:id",
      "notice": "/appointments/detail/:id/notice",
      "form": "/appointments/form",
      "list": "/appointments"
    },
    "traceability": {
      "reqMap": {
        "REQ-LIST-001": [
          "appointment-list"
        ],
        "REQ-LIST-002": [
          "appointment-list"
        ],
        "REQ-LIST-003": [
          "appointment-list"
        ],
        "REQ-SHARED-001": [
          "appointment-list"
        ]
      },
      "designDefaults": [],
      "unmapped": []
    }
  },
  {
    "meta": {
      "pageId": "callback-register",
      "project": "employee-app-phase2",
      "name": "回访登记",
      "target": "mobile",
      "profile": "b-mobile",
      "archetype": "mobile-form",
      "purpose": "登记回访内容与结果；客户可从今日待回访区块、客户详情带入或表单内客户选择器选择；保存成功回到来源（今日待回访区块或客户详情）；未接/拒绝/稍后再联系保存后仍保留在今日待回访。",
      "route": "/callbacks/form",
      "roles": [
        "store_manager",
        "beautician",
        "front_desk"
      ],
      "reqRefs": [
        "REQ-CALLBACK-001",
        "REQ-SHARED-001"
      ],
      "version": "0.1.0"
    },
    "layout": {
      "id": "callback-register.page.root",
      "type": "MobileShell",
      "props": {
        "title": "回访登记",
        "back": true,
        "showTabs": false
      },
      "slots": {
        "content": [
          {
            "id": "callback-register.root.content.0",
            "type": "Section",
            "props": {
              "padding": "space.4",
              "gap": "space.3"
            },
            "children": [
              {
                "id": "callback-register.field.customer",
                "type": "FormField",
                "props": {
                  "label": "客户",
                  "required": true,
                  "field": "customer"
                },
                "children": [
                  {
                    "id": "callback-register.root.content.0.children.0.children.0",
                    "type": "Row",
                    "props": {
                      "gap": "space.2"
                    },
                    "children": [
                      {
                        "id": "callback-register.root.content.0.children.0.children.0.children.0",
                        "type": "Input",
                        "props": {
                          "name": "customer",
                          "placeholder": "请输入客户",
                          "required": true
                        }
                      },
                      {
                        "id": "callback-register.action.pick-customer",
                        "type": "Button",
                        "props": {
                          "label": "选择",
                          "emphasis": "ghost",
                          "action": "选择客户"
                        }
                      }
                    ]
                  }
                ]
              },
              {
                "id": "callback-register.field.service",
                "type": "FormField",
                "props": {
                  "label": "服务项目",
                  "required": true,
                  "field": "service"
                },
                "children": [
                  {
                    "id": "callback-register.root.content.0.children.1.children.0",
                    "type": "Input",
                    "props": {
                      "name": "service",
                      "placeholder": "请输入服务项目",
                      "required": true
                    }
                  }
                ]
              },
              {
                "id": "callback-register.field.content",
                "type": "FormField",
                "props": {
                  "label": "回访内容",
                  "required": true,
                  "field": "content"
                },
                "children": [
                  {
                    "id": "callback-register.root.content.0.children.2.children.0",
                    "type": "Input",
                    "props": {
                      "name": "content",
                      "placeholder": "请输入回访内容",
                      "required": true
                    }
                  }
                ]
              },
              {
                "id": "callback-register.field.result",
                "type": "FormField",
                "props": {
                  "label": "回访结果",
                  "required": true,
                  "field": "result"
                },
                "children": [
                  {
                    "id": "callback-register.root.content.0.children.3.children.0",
                    "type": "Select",
                    "props": {
                      "options": [
                        "已联系",
                        "未接",
                        "拒绝",
                        "稍后再联系"
                      ],
                      "placeholder": "请选择回访结果"
                    }
                  }
                ]
              }
            ]
          }
        ],
        "actions": [
          {
            "id": "callback-register.action.save",
            "type": "Button",
            "props": {
              "label": "保存回访",
              "emphasis": "primary",
              "action": "保存回访"
            }
          }
        ]
      },
      "reqRef": "REQ-CALLBACK-001"
    },
    "states": {
      "default": {
        "name": "default"
      },
      "loading": {
        "name": "loading"
      },
      "error": {
        "name": "error"
      },
      "disabled": {
        "name": "disabled"
      }
    },
    "interactions": [
      {
        "trigger": "保存回访",
        "action": "navigate",
        "reqRef": "REQ-CALLBACK-001"
      },
      {
        "trigger": "选择客户",
        "action": "navigate",
        "reqRef": "REQ-CALLBACK-001"
      }
    ],
    "customerPicker": "customer-search",
    "linkedRoutes": {
      "create": "/callbacks/form",
      "detail": "/customers/detail/:id",
      "customer": "/customers/detail/:id",
      "notice": "/appointments/detail/:id/notice",
      "form": "/callbacks/form",
      "list": "/appointments"
    },
    "traceability": {
      "reqMap": {
        "REQ-CALLBACK-001": [
          "callback-register"
        ],
        "REQ-SHARED-001": [
          "callback-register"
        ]
      },
      "designDefaults": [],
      "unmapped": []
    }
  }
]

## Profile and visual style (data)
{
  "profile": "b-mobile",
  "visualStyle": {
    "profile": "b-mobile",
    "density": "dense",
    "tone": "neutral",
    "motionLevel": "low"
  }
}

Return only JSON.
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "verdict": {
      "type": "string",
      "enum": [
        "pass",
        "changes"
      ]
    },
    "findings": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "minLength": 1
          },
          "severity": {
            "type": "string",
            "enum": [
              "blocker",
              "major",
              "minor"
            ]
          },
          "pageId": {
            "type": "string",
            "minLength": 1
          },
          "state": {
            "type": "string",
            "minLength": 1
          },
          "evidence": {
            "type": "string",
            "minLength": 1
          },
          "issue": {
            "type": "string",
            "minLength": 1
          },
          "proposal": {
            "type": "string",
            "minLength": 1
          }
        },
        "required": [
          "id",
          "severity",
          "pageId",
          "state",
          "evidence",
          "issue",
          "proposal"
        ],
        "additionalProperties": false
      }
    },
    "summary": {
      "type": "string",
      "minLength": 1
    }
  },
  "required": [
    "verdict",
    "findings",
    "summary"
  ],
  "additionalProperties": false
}

## Reading screenshots (runtime)
The `path` values above are relative to the run directory (/Users/jihui/Desktop/产品、ui/.worktrees/v0.7/pipeline/artifacts/employee-app-phase2/visual-review/run-2026-10-27T01-45-16-826Z).
Use these absolute paths with read_image before judging; do not write, edit, delete, or render files:
- today.default: /Users/jihui/Desktop/产品、ui/.worktrees/v0.7/pipeline/artifacts/employee-app-phase2/visual-review/run-2026-10-27T01-45-16-826Z/screenshots/today.default.png
- today.state.empty: /Users/jihui/Desktop/产品、ui/.worktrees/v0.7/pipeline/artifacts/employee-app-phase2/visual-review/run-2026-10-27T01-45-16-826Z/screenshots/today.state.empty.png
- customer-search.default: /Users/jihui/Desktop/产品、ui/.worktrees/v0.7/pipeline/artifacts/employee-app-phase2/visual-review/run-2026-10-27T01-45-16-826Z/screenshots/customer-search.default.png
- customer-search.search.results: /Users/jihui/Desktop/产品、ui/.worktrees/v0.7/pipeline/artifacts/employee-app-phase2/visual-review/run-2026-10-27T01-45-16-826Z/screenshots/customer-search.search.results.png
- customer-search.search.empty: /Users/jihui/Desktop/产品、ui/.worktrees/v0.7/pipeline/artifacts/employee-app-phase2/visual-review/run-2026-10-27T01-45-16-826Z/screenshots/customer-search.search.empty.png
- customer-detail.default: /Users/jihui/Desktop/产品、ui/.worktrees/v0.7/pipeline/artifacts/employee-app-phase2/visual-review/run-2026-10-27T01-45-16-826Z/screenshots/customer-detail.default.png
- appointment-detail.default: /Users/jihui/Desktop/产品、ui/.worktrees/v0.7/pipeline/artifacts/employee-app-phase2/visual-review/run-2026-10-27T01-45-16-826Z/screenshots/appointment-detail.default.png
- appointment-detail.state.loading: /Users/jihui/Desktop/产品、ui/.worktrees/v0.7/pipeline/artifacts/employee-app-phase2/visual-review/run-2026-10-27T01-45-16-826Z/screenshots/appointment-detail.state.loading.png
- appointment-detail.state.error: /Users/jihui/Desktop/产品、ui/.worktrees/v0.7/pipeline/artifacts/employee-app-phase2/visual-review/run-2026-10-27T01-45-16-826Z/screenshots/appointment-detail.state.error.png
- appointment-detail.business.已到店: /Users/jihui/Desktop/产品、ui/.worktrees/v0.7/pipeline/artifacts/employee-app-phase2/visual-review/run-2026-10-27T01-45-16-826Z/screenshots/appointment-detail.business.已到店.png
- appointment-detail.business.爽约: /Users/jihui/Desktop/产品、ui/.worktrees/v0.7/pipeline/artifacts/employee-app-phase2/visual-review/run-2026-10-27T01-45-16-826Z/screenshots/appointment-detail.business.爽约.png
- appointment-detail.business.已取消: /Users/jihui/Desktop/产品、ui/.worktrees/v0.7/pipeline/artifacts/employee-app-phase2/visual-review/run-2026-10-27T01-45-16-826Z/screenshots/appointment-detail.business.已取消.png
- appointment-form.default: /Users/jihui/Desktop/产品、ui/.worktrees/v0.7/pipeline/artifacts/employee-app-phase2/visual-review/run-2026-10-27T01-45-16-826Z/screenshots/appointment-form.default.png
- appointment-form.state.disabled: /Users/jihui/Desktop/产品、ui/.worktrees/v0.7/pipeline/artifacts/employee-app-phase2/visual-review/run-2026-10-27T01-45-16-826Z/screenshots/appointment-form.state.disabled.png
- appointment-form.mode.reschedule: /Users/jihui/Desktop/产品、ui/.worktrees/v0.7/pipeline/artifacts/employee-app-phase2/visual-review/run-2026-10-27T01-45-16-826Z/screenshots/appointment-form.mode.reschedule.png
- treatment-notice.default: /Users/jihui/Desktop/产品、ui/.worktrees/v0.7/pipeline/artifacts/employee-app-phase2/visual-review/run-2026-10-27T01-45-16-826Z/screenshots/treatment-notice.default.png
- treatment-notice.business.已确认: /Users/jihui/Desktop/产品、ui/.worktrees/v0.7/pipeline/artifacts/employee-app-phase2/visual-review/run-2026-10-27T01-45-16-826Z/screenshots/treatment-notice.business.已确认.png
- appointment-list.default: /Users/jihui/Desktop/产品、ui/.worktrees/v0.7/pipeline/artifacts/employee-app-phase2/visual-review/run-2026-10-27T01-45-16-826Z/screenshots/appointment-list.default.png
- appointment-list.state.loading: /Users/jihui/Desktop/产品、ui/.worktrees/v0.7/pipeline/artifacts/employee-app-phase2/visual-review/run-2026-10-27T01-45-16-826Z/screenshots/appointment-list.state.loading.png
- appointment-list.state.error: /Users/jihui/Desktop/产品、ui/.worktrees/v0.7/pipeline/artifacts/employee-app-phase2/visual-review/run-2026-10-27T01-45-16-826Z/screenshots/appointment-list.state.error.png
- appointment-list.state.empty: /Users/jihui/Desktop/产品、ui/.worktrees/v0.7/pipeline/artifacts/employee-app-phase2/visual-review/run-2026-10-27T01-45-16-826Z/screenshots/appointment-list.state.empty.png
- appointment-list.view.list: /Users/jihui/Desktop/产品、ui/.worktrees/v0.7/pipeline/artifacts/employee-app-phase2/visual-review/run-2026-10-27T01-45-16-826Z/screenshots/appointment-list.view.list.png
- appointment-list.drawer: /Users/jihui/Desktop/产品、ui/.worktrees/v0.7/pipeline/artifacts/employee-app-phase2/visual-review/run-2026-10-27T01-45-16-826Z/screenshots/appointment-list.drawer.png
- callback-register.default: /Users/jihui/Desktop/产品、ui/.worktrees/v0.7/pipeline/artifacts/employee-app-phase2/visual-review/run-2026-10-27T01-45-16-826Z/screenshots/callback-register.default.png

## Deterministic findings (data; do not repeat these checks)
[]