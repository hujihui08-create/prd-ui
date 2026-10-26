import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { UiBriefSchema } from "@prd-ui/contracts";
import type { PageId, PageSpec } from "@prd-ui/contracts";
import { compileProject } from "@prd-ui/compiler";
import { getArchetype, getCatalog, getProfile } from "@prd-ui/design-system";
import { buildVisualMatrix } from "../src/index.js";

const pipelineRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../.."
);

function makeSpec(input: {
  pageId: string;
  target?: "web" | "mobile";
  layout?: PageSpec["layout"];
  states?: PageSpec["states"];
  businessStates?: PageSpec["businessStates"];
  currentStatus?: string;
  formModes?: PageSpec["formModes"];
  views?: PageSpec["views"];
  defaultView?: PageSpec["defaultView"];
  searchIdleTitle?: string;
  emptyTitle?: string;
  noticeBlocks?: PageSpec["noticeBlocks"];
}): PageSpec {
  return {
    meta: {
      pageId: input.pageId as PageId,
      project: "visual-fixture",
      name: input.pageId,
      target: input.target ?? "mobile",
      profile: "b-mobile",
      archetype: "detail",
      purpose: `${input.pageId} fixture`,
      route: `/${input.pageId}`,
      roles: ["staff"],
      reqRefs: ["REQ-APP-001"],
      version: "0.1.0",
    },
    layout: input.layout ?? { type: "MobileShell" },
    states: {
      default: { name: "default" },
      ...(input.states ?? {}),
    },
    interactions: [],
    ...(input.businessStates === undefined
      ? {}
      : { businessStates: input.businessStates }),
    ...(input.currentStatus === undefined
      ? {}
      : { currentStatus: input.currentStatus }),
    ...(input.formModes === undefined ? {} : { formModes: input.formModes }),
    ...(input.views === undefined ? {} : { views: input.views }),
    ...(input.defaultView === undefined
      ? {}
      : { defaultView: input.defaultView }),
    ...(input.searchIdleTitle === undefined
      ? {}
      : { searchIdleTitle: input.searchIdleTitle }),
    ...(input.emptyTitle === undefined ? {} : { emptyTitle: input.emptyTitle }),
    ...(input.noticeBlocks === undefined
      ? {}
      : { noticeBlocks: input.noticeBlocks }),
    traceability: { reqMap: {}, designDefaults: [], unmapped: [] },
  };
}

const appointmentDetail = makeSpec({
  pageId: "appointment-detail",
  states: {
    loading: { name: "loading" },
    error: { name: "error" },
    disabled: { name: "disabled" },
  },
  businessStates: [
    { name: "已登记", actions: [] },
    { name: "已到店", actions: ["开单"] },
    { name: "爽约", actions: [] },
    { name: "已取消", actions: [] },
  ],
  currentStatus: "已登记",
});

const appointmentForm = makeSpec({
  pageId: "appointment-form",
  states: {
    loading: { name: "loading" },
    error: { name: "error" },
    disabled: { name: "disabled" },
  },
  formModes: [
    { name: "new", label: "新增预约", actions: [] },
    { name: "reschedule", label: "改期", actions: [], customerLocked: true },
  ],
});

const appointmentList = makeSpec({
  pageId: "appointment-list",
  states: {
    empty: { name: "empty" },
    loading: { name: "loading" },
    error: { name: "error" },
    disabled: { name: "disabled" },
  },
  views: ["calendar", "list"],
  defaultView: "calendar",
  emptyTitle: "当前条件没有预约",
});

describe("buildVisualMatrix", () => {
  it("builds page, state, business-state, form-mode, view, and empty cases", () => {
    const cases = buildVisualMatrix([appointmentDetail, appointmentForm, appointmentList]);
    expect(cases.map((entry) => entry.id)).toEqual(
      expect.arrayContaining([
        "appointment-detail.default",
        "appointment-detail.state.loading",
        "appointment-detail.business.已到店",
        "appointment-form.mode.reschedule",
        "appointment-list.state.empty",
        "appointment-list.view.list",
      ])
    );
  });

  it("filters states to representative pages and designed empty states", () => {
    const ids = buildVisualMatrix([
      appointmentDetail,
      appointmentForm,
      appointmentList,
    ]).map((entry) => entry.id);

    // loading/error only for the two representative pages.
    expect(ids).toEqual(
      expect.arrayContaining([
        "appointment-detail.state.loading",
        "appointment-detail.state.error",
        "appointment-list.state.loading",
        "appointment-list.state.error",
      ])
    );
    expect(ids).not.toContain("appointment-form.state.loading");
    expect(ids).not.toContain("appointment-form.state.error");

    // disabled only for the form page.
    expect(ids).toContain("appointment-form.state.disabled");
    expect(ids).not.toContain("appointment-detail.state.disabled");
    expect(ids).not.toContain("appointment-list.state.disabled");

    // Generic empty only when emptyTitle is set and the page is not a search page.
    expect(ids).toContain("appointment-list.state.empty");

    // Content-driven empty blocks (today) are designed empty states too.
    const contentEmpty = makeSpec({
      pageId: "today",
      states: { empty: { name: "empty" } },
      layout: {
        type: "MobileShell",
        slots: {
          content: [
            {
              type: "EmptyState",
              props: { title: "今天没有预约", description: "客户直接上门？" },
            },
          ],
        },
      },
    });
    expect(buildVisualMatrix([contentEmpty]).map((entry) => entry.id)).toContain(
      "today.state.empty"
    );

    // The mobile-list fallback title is not a designed empty state.
    const fallbackEmpty = makeSpec({
      pageId: "plain-list",
      states: { empty: { name: "empty" } },
      layout: {
        type: "MobileShell",
        slots: {
          content: [{ type: "EmptyState", props: { title: "暂无plain-list" } }],
        },
      },
    });
    expect(buildVisualMatrix([fallbackEmpty]).map((entry) => entry.id)).not.toContain(
      "plain-list.state.empty"
    );

    const search = makeSpec({
      pageId: "customer-search",
      states: {
        empty: { name: "empty" },
        loading: { name: "loading" },
        error: { name: "error" },
      },
      searchIdleTitle: "输入姓名或脱敏手机号搜索客户",
      emptyTitle: "没有匹配的客户",
    });
    const searchCases = buildVisualMatrix([search]);
    const searchIds = searchCases.map((entry) => entry.id);
    expect(searchIds).toContain("customer-search.default");
    expect(searchIds).toContain("customer-search.search.results");
    expect(searchIds).toContain("customer-search.search.empty");
    expect(searchIds).not.toContain("customer-search.search.idle");
    expect(searchIds).not.toContain("customer-search.state.empty");
    expect(searchIds).not.toContain("customer-search.state.loading");

    const noticeWithoutTitle = makeSpec({
      pageId: "treatment-notice",
      states: { empty: { name: "empty" } },
    });
    expect(buildVisualMatrix([noticeWithoutTitle]).map((entry) => entry.id)).toEqual([
      "treatment-notice.default",
    ]);
  });

  it("skips the current or first business state", () => {
    const ids = buildVisualMatrix([appointmentDetail]).map((entry) => entry.id);
    expect(ids).toContain("appointment-detail.business.已到店");
    expect(ids).toContain("appointment-detail.business.爽约");
    expect(ids).toContain("appointment-detail.business.已取消");
    expect(ids).not.toContain("appointment-detail.business.已登记");

    const noCurrent = makeSpec({
      pageId: "queue",
      businessStates: [
        { name: "未开始", actions: [] },
        { name: "进行中", actions: [] },
      ],
    });
    const noCurrentIds = buildVisualMatrix([noCurrent]).map((entry) => entry.id);
    expect(noCurrentIds).toContain("queue.business.进行中");
    expect(noCurrentIds).not.toContain("queue.business.未开始");
  });

  it("skips the first form mode and the default view", () => {
    const ids = buildVisualMatrix([appointmentForm, appointmentList]).map(
      (entry) => entry.id
    );
    expect(ids).toContain("appointment-form.mode.reschedule");
    expect(ids).not.toContain("appointment-form.mode.new");
    expect(ids).toContain("appointment-list.view.list");
    expect(ids).not.toContain("appointment-list.view.calendar");

    const listDefault = makeSpec({
      pageId: "task-list",
      views: ["list", "calendar"],
      defaultView: "list",
    });
    const listDefaultIds = buildVisualMatrix([listDefault]).map((entry) => entry.id);
    expect(listDefaultIds).toContain("task-list.view.calendar");
    expect(listDefaultIds).not.toContain("task-list.view.list");

    const implicitDefault = makeSpec({
      pageId: "implicit-list",
      views: ["calendar", "list"],
    });
    const implicitIds = buildVisualMatrix([implicitDefault]).map((entry) => entry.id);
    expect(implicitIds).toContain("implicit-list.view.list");
    expect(implicitIds).not.toContain("implicit-list.view.calendar");
  });

  it("adds search actions while treating idle as the default state", () => {
    const search = makeSpec({
      pageId: "customer-search",
      searchIdleTitle: "输入姓名或脱敏手机号搜索客户",
    });
    const cases = buildVisualMatrix([search]);
    const byId = new Map(cases.map((entry) => [entry.id, entry]));
    expect(byId.get("customer-search.default")).toMatchObject({
      state: "default",
    });
    expect(byId.get("customer-search.default")?.actions).toBeUndefined();
    expect(byId.get("customer-search.search.results")?.actions).toEqual([
      { kind: "search", value: "张" },
    ]);
    expect(byId.get("customer-search.search.empty")?.actions).toEqual([
      { kind: "search", value: "zzz" },
    ]);
  });

  it("adds drawer cases for view pages and notice cases for notice pages", () => {
    const listIds = buildVisualMatrix([appointmentList]).map((entry) => entry.id);
    expect(listIds).toContain("appointment-list.drawer");
    expect(buildVisualMatrix([appointmentDetail]).map((entry) => entry.id)).not.toContain(
      "appointment-detail.drawer"
    );

    const customList = makeSpec({
      pageId: "custom-list",
      views: ["calendar", "list"],
      defaultView: "calendar",
    });
    expect(buildVisualMatrix([customList]).map((entry) => entry.id)).toContain(
      "custom-list.drawer"
    );

    // Drawer blocks render only in the calendar panel, so the case forces it.
    const drawer = buildVisualMatrix([appointmentList]).find(
      (entry) => entry.id === "appointment-list.drawer"
    );
    expect(drawer?.query).toEqual({ view: "calendar" });

    const listOnly = makeSpec({
      pageId: "list-only",
      views: ["list"],
      defaultView: "list",
    });
    expect(buildVisualMatrix([listOnly]).map((entry) => entry.id)).not.toContain(
      "list-only.drawer"
    );

    const notice = makeSpec({
      pageId: "handoff-notice",
      noticeBlocks: [{ title: "小气泡", items: ["注意防晒"] }],
      businessStates: [{ name: "未确认", actions: ["确认已当面告知"] }],
    });
    const noticed = buildVisualMatrix([notice]);
    expect(noticed.find((entry) => entry.id === "handoff-notice.confirmed")?.actions).toEqual(
      [{ kind: "confirm-notice" }]
    );

    const covered = makeSpec({
      pageId: "covered-notice",
      noticeBlocks: [{ title: "小气泡", items: ["注意防晒"] }],
      businessStates: [
        { name: "未确认", actions: ["确认已当面告知"] },
        { name: "已确认", actions: [] },
      ],
      currentStatus: "未确认",
    });
    expect(buildVisualMatrix([covered]).map((entry) => entry.id)).not.toContain(
      "covered-notice.confirmed"
    );

    expect(buildVisualMatrix([appointmentDetail]).map((entry) => entry.id)).not.toContain(
      "appointment-detail.confirmed"
    );
  });

  it("assigns deterministic ids, queries, and viewports", () => {
    const specs = [appointmentDetail, appointmentForm, appointmentList];
    const cases = buildVisualMatrix(specs);
    expect(buildVisualMatrix(specs)).toEqual(cases);
    expect(new Set(cases.map((entry) => entry.id)).size).toBe(cases.length);
    expect(cases[0]?.id).toBe("appointment-detail.default");

    const byId = new Map(cases.map((entry) => [entry.id, entry]));
    expect(byId.get("appointment-detail.default")).toMatchObject({
      pageId: "appointment-detail",
      state: "default",
      viewport: { width: 390, height: 844 },
    });
    expect(byId.get("appointment-detail.default")?.query).toBeUndefined();
    expect(byId.get("appointment-detail.state.loading")).toMatchObject({
      state: "loading",
      query: { state: "loading" },
    });
    expect(byId.get("appointment-detail.business.已到店")).toMatchObject({
      state: "business:已到店",
      query: { status: "已到店" },
    });
    expect(byId.get("appointment-form.mode.reschedule")).toMatchObject({
      state: "mode:reschedule",
      query: { mode: "reschedule" },
    });
    expect(byId.get("appointment-list.view.list")).toMatchObject({
      state: "view:list",
      query: { view: "list" },
    });

    const web = makeSpec({ pageId: "dashboard", target: "web" });
    expect(buildVisualMatrix([web])[0]?.viewport).toEqual({
      width: 1440,
      height: 900,
    });
  });

  it("keeps the clean 8-page brief within 19-24 cases", () => {
    const brief = UiBriefSchema.parse(
      JSON.parse(
        readFileSync(
          path.join(
            pipelineRoot,
            "samples",
            "projects",
            "employee-app-phase2",
            "ui-brief.json"
          ),
          "utf8"
        )
      )
    );
    const specs = compileProject(brief, { getProfile, getCatalog, getArchetype });
    const cases = buildVisualMatrix(specs);
    expect(cases.length).toBeGreaterThanOrEqual(19);
    expect(cases.length).toBeLessThanOrEqual(24);
    expect(new Set(cases.map((entry) => entry.id)).size).toBe(cases.length);
    expect(cases.map((entry) => entry.id)).toContain("today.state.empty");

    // The brief carries the markers the matrix filters on.
    expect(specs.find((spec) => spec.meta.pageId === "appointment-list")?.emptyTitle).toBe(
      "当前条件没有预约"
    );
    expect(
      specs.find((spec) => spec.meta.pageId === "treatment-notice")?.noticeBlocks
    ).toHaveLength(2);
  });

  it("seeds the reschedule screenshot from the appointment detail summary", () => {
    const brief = UiBriefSchema.parse(
      JSON.parse(
        readFileSync(
          path.join(
            pipelineRoot,
            "samples",
            "projects",
            "employee-app-phase2",
            "ui-brief.json"
          ),
          "utf8"
        )
      )
    );
    const specs = compileProject(brief, { getProfile, getCatalog, getArchetype });
    const reschedule = buildVisualMatrix(specs).find(
      (entry) => entry.id === "appointment-form.mode.reschedule"
    )!;
    expect(reschedule.query).toEqual({
      mode: "reschedule",
      recordId: "appointment-detail",
    });
    expect(reschedule.storage).toBeDefined();
    const record = JSON.parse(Object.values(reschedule.storage!)[0]!);
    expect(record).toMatchObject({
      customer: "张女士",
      project: "小气泡",
      time: "11-05 周三 10:00-11:00",
      therapist: "王美容",
    });
  });
});
