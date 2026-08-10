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
      external: [
        "electron",
        "events",
        "fs",
        "node:fs",
        "node:fs/promises",
        "node:crypto",
        "node:path",
        "node:perf_hooks",
        "node:sqlite",
        "node:url",
        "stream",
        "util",
        "yauzl",
        "zlib",
      ],
    },
    sourcemap: true,
    target: "node24",
  },
});
