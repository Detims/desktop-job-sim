import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";

export default defineConfig(({ mode }) => {
  const isManagement = mode === "management";
  const isHome = mode === "home";
  const bundleName = isManagement ? "management" : isHome ? "home" : "pet";
  const entry = isManagement
    ? "./src/preload/management.ts"
    : isHome
      ? "./src/preload/home.ts"
      : "./src/preload/index.ts";

  return {
    build: {
      emptyOutDir: !isManagement && !isHome,
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
