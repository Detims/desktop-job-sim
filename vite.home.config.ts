import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";

const rendererRoot = fileURLToPath(
  new URL("./src/renderers/home", import.meta.url),
);

export default defineConfig({
  base: "./",
  build: {
    assetsInlineLimit: 0,
    emptyOutDir: true,
    outDir: fileURLToPath(new URL("./dist/renderer/home", import.meta.url)),
    sourcemap: true,
  },
  root: rendererRoot,
});
