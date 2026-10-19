import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./html/tests",
  use: {
    baseURL: "http://127.0.0.1:4173",
  },
  webServer: {
    command: "pnpm preview:html",
    port: 4173,
    reuseExistingServer: true,
  },
});
