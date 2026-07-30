import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";

export default defineConfig(({ mode }) => {
  const isManagement = mode === "management";
  const bundleName = isManagement ? "management" : "pet";
  const entry = isManagement
    ? "./src/preload/management.ts"
    : "./src/preload/index.ts";

  return {
    build: {
      emptyOutDir: !isManagement,
      lib: {
        entry: fileURLToPath(new URL(entry, import.meta.url)),
        formats: ["cjs"],
        fileName: () => `${bundleName}.cjs`,
      },
      minify: false,
      outDir: "dist/preload",
      rollupOptions: {
        external: ["electron"],
      },
      sourcemap: true,
      target: "node24",
    },
  };
});
