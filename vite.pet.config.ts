import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";

const rendererRoot = fileURLToPath(
  new URL("./src/renderers/pet", import.meta.url),
);

export default defineConfig({
  base: "./",
  build: {
    assetsInlineLimit: 0,
    emptyOutDir: true,
    outDir: fileURLToPath(new URL("./dist/renderer/pet", import.meta.url)),
    sourcemap: true,
  },
  root: rendererRoot,
});
