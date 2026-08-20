import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  build: {
    emptyOutDir: true,
    outDir: fileURLToPath(new URL("./dist/renderer/onboarding", import.meta.url)),
    sourcemap: true,
  },
  root: fileURLToPath(new URL("./src/renderers/onboarding", import.meta.url)),
});
