import { describe, expect, it } from "vitest";
import { ACTION_KEYS, QUICK_KEYS, semanticNodeId } from "../src/index.js";

describe("semantic ids", () => {
  it("builds stable ids and maps known labels", () => {
    expect(semanticNodeId("appointment-detail", "action", "checkin")).toBe(
      "appointment-detail.action.checkin"
    );
    expect(ACTION_KEYS["已到店确认"]).toBe("checkin");
    expect(ACTION_KEYS["接单并确认到店"]).toBe("checkin");
    expect(QUICK_KEYS["新增预约"]).toBe("new-appointment");
  });
});
