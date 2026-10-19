import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: "html",
  base: "./",
  plugins: [react()],
  build: {
    outDir: "../dist-html",
    emptyOutDir: true,
  },
});
