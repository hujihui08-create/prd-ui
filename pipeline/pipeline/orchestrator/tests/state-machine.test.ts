import { describe, expect, it } from "vitest";
import { createRunState, transition } from "../src/state-machine.js";

describe("state machine", () => {
  it("runs the happy path", () => {
    let state = createRunState("run-test");
    state = transition(state, "brief");
    state = transition(state, "compile");
    state = transition(state, "validate");
    state = transition(state, "report");
    state = transition(state, "done");
    expect(state.stage).toBe("done");
    expect(state.status).toBe("success");
  });

  it("starts with a pending brief gate", () => {
    const state = createRunState("run-test");
    expect(state.gates.brief).toBe("pending");
  });

  it("rejects an invalid transition", () => {
    const state = createRunState("run-test");
    expect(() => transition(state, "done")).toThrow(/invalid transition/i);
  });
});
