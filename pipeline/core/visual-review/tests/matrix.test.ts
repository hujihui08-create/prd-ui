import { describe, expect, it } from "vitest";
import type { PageId, PageSpec } from "@prd-ui/contracts";
import { buildVisualMatrix } from "../src/index.js";

function makeSpec(input: {
  pageId: string;
  target?: "web" | "mobile";
  states?: PageSpec["states"];
  businessStates?: PageSpec["businessStates"];
  formModes?: PageSpec["formModes"];
  views?: PageSpec["views"];
  searchIdleTitle?: string;
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
    layout: { type: "MobileShell" },
    states: {
      default: { name: "default" },
      ...(input.states ?? {}),
    },
    interactions: [],
    ...(input.businessStates === undefined
      ? {}
      : { businessStates: input.businessStates }),
    ...(input.formModes === undefined ? {} : { formModes: input.formModes }),
    ...(input.views === undefined ? {} : { views: input.views }),
    ...(input.searchIdleTitle === undefined
      ? {}
      : { searchIdleTitle: input.searchIdleTitle }),
    traceability: { reqMap: {}, designDefaults: [], unmapped: [] },
  };
}

const appointmentDetail = makeSpec({
  pageId: "appointment-detail",
  states: { cancelled: { name: "cancelled" } },
  businessStates: [
    { name: "已到店", actions: ["核销"] },
    { name: "已取消", actions: [] },
  ],
});

const appointmentForm = makeSpec({
  pageId: "appointment-form",
  formModes: [
    { name: "new", label: "新增预约", actions: [] },
    { name: "reschedule", label: "改期", actions: [], customerLocked: true },
  ],
});

const appointmentList = makeSpec({
  pageId: "appointment-list",
  views: ["calendar", "list"],
  searchIdleTitle: "搜索客户",
});

describe("buildVisualMatrix", () => {
  it("builds page, state, business-state, form-mode, and view cases", () => {
    const cases = buildVisualMatrix([appointmentDetail, appointmentForm, appointmentList]);
    expect(cases.map((entry) => entry.id)).toEqual(
      expect.arrayContaining([
        "appointment-detail.default",
        "appointment-detail.business.已到店",
        "appointment-form.mode.reschedule",
        "appointment-list.view.calendar",
        "appointment-list.view.list",
      ])
    );
  });

  it("assigns deterministic ids, queries, and viewports", () => {
    const cases = buildVisualMatrix([appointmentDetail, appointmentForm, appointmentList]);
    expect(buildVisualMatrix([appointmentDetail, appointmentForm, appointmentList])).toEqual(cases);
    expect(new Set(cases.map((entry) => entry.id)).size).toBe(cases.length);

    const byId = new Map(cases.map((entry) => [entry.id, entry]));
    expect(byId.get("appointment-detail.default")).toMatchObject({
      pageId: "appointment-detail",
      state: "default",
      viewport: { width: 390, height: 844 },
    });
    expect(byId.get("appointment-detail.default")?.query).toBeUndefined();
    expect(byId.get("appointment-detail.state.cancelled")).toMatchObject({
      state: "cancelled",
      query: { state: "cancelled" },
    });
    expect(byId.has("appointment-detail.state.default")).toBe(false);
    expect(byId.get("appointment-detail.business.已到店")).toMatchObject({
      state: "business:已到店",
      query: { status: "已到店" },
    });
    expect(byId.get("appointment-form.mode.reschedule")).toMatchObject({
      state: "mode:reschedule",
      query: { mode: "reschedule" },
    });
    expect(byId.get("appointment-list.view.calendar")).toMatchObject({
      state: "view:calendar",
      query: { view: "calendar" },
    });
    expect(cases[0]?.id).toBe("appointment-detail.default");
  });

  it("adds search, drawer, and notice cases with their actions", () => {
    const cases = buildVisualMatrix([appointmentList]);
    const byId = new Map(cases.map((entry) => [entry.id, entry]));
    expect(byId.get("appointment-list.search.idle")).toMatchObject({
      state: "search:idle",
    });
    expect(byId.get("appointment-list.search.results")?.actions).toEqual([
      { kind: "search", value: "张" },
    ]);
    expect(byId.get("appointment-list.search.empty")?.actions).toEqual([
      { kind: "search", value: "zzz" },
    ]);
    expect(byId.get("appointment-list.drawer")?.actions).toEqual([
      { kind: "open-drawer" },
    ]);

    const notice = makeSpec({ pageId: "treatment-notice" });
    const noticeCase = buildVisualMatrix([notice]).find(
      (entry) => entry.id === "treatment-notice.confirmed"
    );
    expect(noticeCase?.actions).toEqual([{ kind: "confirm-notice" }]);
  });

  it("omits search and special cases when the spec has no such affordance", () => {
    const ids = buildVisualMatrix([makeSpec({ pageId: "today" })]).map((entry) => entry.id);
    expect(ids).toEqual(["today.default"]);
  });

  it("uses a desktop viewport for web targets", () => {
    const web = makeSpec({ pageId: "dashboard", target: "web" });
    expect(buildVisualMatrix([web])[0]?.viewport).toEqual({ width: 1440, height: 900 });
  });
});
