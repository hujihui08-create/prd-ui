import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["core/**/*.test.ts", "runtimes/**/*.test.ts"],
    // The dsh integration test spawns the real CLI and a local mock server;
    // it runs only through `pnpm test:dsh`.
    exclude: [...configDefaults.exclude, "runtimes/dsh/tests/dsh-integration.test.ts"],
    environment: "node",
  },
});
