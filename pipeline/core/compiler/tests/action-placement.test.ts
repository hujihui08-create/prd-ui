import { describe, expect, it } from "vitest";
import { resolveActionPlacements } from "../src/action-placement.js";

const ref = (
  id: string,
  placement?: "footer" | "card-actions" | "overflow" | "inline"
) => ({
  id,
  label: id,
  ...(placement === undefined ? {} : { placement }),
});

describe("resolveActionPlacements", () => {
  it("cascades footer, three card actions, then overflow", () => {
    const groups = resolveActionPlacements([
      ref("a"),
      ref("b"),
      ref("c"),
      ref("d"),
      ref("e"),
      ref("f"),
    ]);
    expect(groups.footer.map((entry) => entry.id)).toEqual(["a"]);
    expect(groups.cardActions.map((entry) => entry.id)).toEqual(["b", "c", "d"]);
    expect(groups.overflow.map((entry) => entry.id)).toEqual(["e", "f"]);
  });

  it("honors explicit placements without consuming cascade slots", () => {
    const groups = resolveActionPlacements([
      ref("a"),
      ref("b", "overflow"),
      ref("c"),
      ref("d"),
      ref("e"),
      ref("f"),
    ]);
    expect(groups.footer.map((entry) => entry.id)).toEqual(["a"]);
    expect(groups.cardActions.map((entry) => entry.id)).toEqual(["c", "d", "e"]);
    expect(groups.overflow.map((entry) => entry.id)).toEqual(["b", "f"]);
  });

  it("keeps inline only when explicit", () => {
    const groups = resolveActionPlacements([ref("a"), ref("b", "inline")]);
    expect(groups.inline.map((entry) => entry.id)).toEqual(["b"]);
    expect(groups.cardActions).toEqual([]);
  });

  it("rejects multiple footers and more than three card actions", () => {
    expect(() =>
      resolveActionPlacements([ref("a", "footer"), ref("b", "footer")])
    ).toThrow(/footer/);
    expect(() =>
      resolveActionPlacements([
        ref("a"),
        ref("b", "card-actions"),
        ref("c", "card-actions"),
        ref("d", "card-actions"),
        ref("e", "card-actions"),
      ])
    ).toThrow(/card-actions/);
  });
});
