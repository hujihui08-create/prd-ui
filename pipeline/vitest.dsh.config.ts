import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["runtimes/dsh/tests/dsh-integration.test.ts"],
    environment: "node",
    // One real dsh CLI run (model call + plugin load) is slower than a unit test.
    testTimeout: 240_000,
    hookTimeout: 30_000,
  },
});
