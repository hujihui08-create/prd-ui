import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/**/*.test.ts", "pipeline/**/*.test.ts"],
    environment: "node",
  },
});
