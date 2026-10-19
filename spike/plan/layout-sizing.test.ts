import { describe, expect, it } from "vitest";
import { resolveSizingModes } from "./layout-sizing";

describe("resolveSizingModes", () => {
  it("keeps explicit root dimensions fixed on both axes", () => {
    expect(
      resolveSizingModes({ layout: "HORIZONTAL", width: 1440, height: 900 })
    ).toEqual({ primary: "FIXED", counter: "FIXED" });
  });

  it("hugs both axes when a frame has no dimensions", () => {
    expect(resolveSizingModes({ layout: "VERTICAL" })).toEqual({
      primary: "AUTO",
      counter: "AUTO",
    });
  });

  it("fixes width and hugs height for a width-only horizontal frame", () => {
    expect(
      resolveSizingModes({ layout: "HORIZONTAL", width: 320 })
    ).toEqual({ primary: "FIXED", counter: "AUTO" });
  });

  it("hugs width and fixes height for a height-only horizontal frame", () => {
    expect(
      resolveSizingModes({ layout: "HORIZONTAL", height: 64 })
    ).toEqual({ primary: "AUTO", counter: "FIXED" });
  });

  it("fixes height and hugs width for a height-only vertical frame", () => {
    expect(resolveSizingModes({ layout: "VERTICAL", height: 64 })).toEqual({
      primary: "FIXED",
      counter: "AUTO",
    });
  });

  it("fixes both axes for Content (grow + stretch in a horizontal parent)", () => {
    expect(
      resolveSizingModes({
        layout: "VERTICAL",
        layoutGrow: 1,
        layoutAlign: "STRETCH",
        parentLayout: "HORIZONTAL",
      })
    ).toEqual({ primary: "FIXED", counter: "FIXED" });
  });

  it("hugs height and fixes width for Section", () => {
    expect(
      resolveSizingModes({
        layout: "VERTICAL",
        layoutAlign: "STRETCH",
        parentLayout: "VERTICAL",
      })
    ).toEqual({ primary: "AUTO", counter: "FIXED" });
  });

  it("fixes both axes for Sidebar", () => {
    expect(
      resolveSizingModes({
        layout: "VERTICAL",
        width: 240,
        layoutAlign: "STRETCH",
        parentLayout: "HORIZONTAL",
      })
    ).toEqual({ primary: "FIXED", counter: "FIXED" });
  });

  it("fixes both axes for Header", () => {
    expect(
      resolveSizingModes({
        layout: "HORIZONTAL",
        height: 64,
        layoutAlign: "STRETCH",
        parentLayout: "VERTICAL",
      })
    ).toEqual({ primary: "FIXED", counter: "FIXED" });
  });

  it("fixes both axes for FilterBar", () => {
    expect(
      resolveSizingModes({
        layout: "HORIZONTAL",
        height: 56,
        layoutAlign: "STRETCH",
        parentLayout: "VERTICAL",
      })
    ).toEqual({ primary: "FIXED", counter: "FIXED" });
  });

  it("hugs height and fixes width for DataTable", () => {
    expect(
      resolveSizingModes({
        layout: "VERTICAL",
        layoutAlign: "STRETCH",
        parentLayout: "VERTICAL",
      })
    ).toEqual({ primary: "AUTO", counter: "FIXED" });
  });

  it("fixes both axes for a table Row", () => {
    expect(
      resolveSizingModes({
        layout: "HORIZONTAL",
        height: 44,
        layoutAlign: "STRETCH",
        parentLayout: "VERTICAL",
      })
    ).toEqual({ primary: "FIXED", counter: "FIXED" });
  });

  it("hugs height and fixes width for FeedCard", () => {
    expect(
      resolveSizingModes({
        layout: "VERTICAL",
        layoutAlign: "STRETCH",
        parentLayout: "VERTICAL",
      })
    ).toEqual({ primary: "AUTO", counter: "FIXED" });
  });

  it("fixes both axes for TopBar and BottomNav", () => {
    for (const height of [56, 64]) {
      expect(
        resolveSizingModes({
          layout: "HORIZONTAL",
          height,
          layoutAlign: "STRETCH",
          parentLayout: "VERTICAL",
        })
      ).toEqual({ primary: "FIXED", counter: "FIXED" });
    }
  });
});
