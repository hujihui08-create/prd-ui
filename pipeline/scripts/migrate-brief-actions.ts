import { readFileSync, writeFileSync } from "node:fs";

/**
 * One-off migration for brief fixtures: string action labels -> { id, label }.
 * Idempotent: an already-migrated id passes the pattern check unchanged.
 * Run with --check to validate without writing.
 */
const MAP: Record<string, string> = {
  保存: "form.submit",
  保存改期: "form.reschedule",
  保存回访: "form.submit",
  保存设置: "form.submit",
  "切换我的排单/全店": "scope.toggle",
  "切换日历/列表": "view.toggle",
  取消: "appointment.cancel",
  回访登记: "customer.callback.create",
  客户详情: "customer.view",
  已到店确认: "appointment.check-in",
  "已当面告知客户，确认": "treatment.confirm",
  库存查询: "inventory.query",
  开单: "order.create",
  接单并确认到店: "appointment.accept",
  搜索: "search.submit",
  改期: "appointment.reschedule",
  新增预约: "appointment.create",
  新建联系人: "customer.create",
  新建订单: "order.create",
  术后告知: "treatment.notice.view",
  查看告知: "treatment.notice.view",
  查看完整详情: "appointment.view",
  查看详情: "appointment.view",
  查看预约: "appointment.view",
  清空筛选: "filter.clear",
  登录: "auth.login",
  确认已当面告知: "treatment.confirm",
  立即购买: "purchase.create",
  编辑订单: "order.edit",
  返回列表: "nav.back",
  选择客户: "customer.select",
};

const ACTION_ID = /^[a-z][a-z0-9]*(\.[a-z0-9]+(-[a-z0-9]+)*)+$/;

function idFor(value: string): string {
  const mapped = MAP[value];
  if (mapped !== undefined) return mapped;
  if (ACTION_ID.test(value)) return value;
  throw new Error(`UNMAPPED_ACTION: ${value}`);
}

function migrateBrief(brief: {
  ia: {
    pages: Array<Record<string, unknown>>;
  };
}): void {
  for (const page of brief.ia.pages) {
    const pageId = String(page.id);
    const seen = new Set<string>();
    const actions = (page.actions as unknown[] | undefined) ?? [];
    page.actions = actions.map((value) => {
      if (typeof value === "object" && value !== null) return value;
      const id = idFor(String(value));
      if (seen.has(id)) {
        throw new Error(`DUPLICATE_ACTION: ${pageId} -> ${id}`);
      }
      seen.add(id);
      return { id, label: String(value) };
    });
    const states = (page.businessStates as
      | Array<{ actions: string[] }>
      | undefined) ?? [];
    for (const state of states) {
      state.actions = state.actions.map(idFor);
    }
    const modes = (page.formModes as
      | Array<{ actions: string[]; actionLabels?: string[] }>
      | undefined) ?? [];
    for (const mode of modes) {
      const labels = mode.actions.map((value) => String(value));
      mode.actions = labels.map(idFor);
      if (mode.actionLabels === undefined) mode.actionLabels = labels;
    }
  }
}

const checkOnly = process.argv.includes("--check");
for (const file of process.argv.slice(2).filter((arg) => arg !== "--check")) {
  const json = JSON.parse(readFileSync(file, "utf8")) as {
    output?: { brief?: { ia: { pages: Array<Record<string, unknown>> } } };
    ia?: { pages: Array<Record<string, unknown>> };
  };
  const brief = json.output?.brief ?? (json as { ia: { pages: Array<Record<string, unknown>> } });
  migrateBrief(brief);
  if (checkOnly) {
    console.log(`checked ${file}`);
  } else {
    writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`);
    console.log(`migrated ${file}`);
  }
}
