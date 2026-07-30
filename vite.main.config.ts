import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";

export default defineConfig({
  build: {
    emptyOutDir: true,
    lib: {
      entry: fileURLToPath(new URL("./src/main/index.ts", import.meta.url)),
      formats: ["es"],
      fileName: () => "index.js",
    },
    minify: false,
    outDir: "dist/main",
    rollupOptions: {
      external: ["electron", "node:path", "node:perf_hooks", "node:url"],
    },
    sourcemap: true,
    target: "node24",
  },
});
