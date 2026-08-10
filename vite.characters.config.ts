import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";

const rendererRoot = fileURLToPath(
  new URL("./src/renderers/characters", import.meta.url),
);

export default defineConfig({
  base: "./",
  build: {
    emptyOutDir: true,
    outDir: fileURLToPath(new URL("./dist/renderer/characters", import.meta.url)),
    sourcemap: true,
  },
  root: rendererRoot,
});
