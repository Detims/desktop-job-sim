import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";

export default defineConfig(({ mode }) => {
  const isManagement = mode === "management";
  const isHome = mode === "home";
  const isCommerce = mode === "commerce";
  const isSettings = mode === "settings";
  const bundleName = isManagement
    ? "management"
    : isHome
      ? "home"
      : isCommerce
        ? "commerce"
        : isSettings
          ? "settings"
          : "pet";
  const entry = isManagement
    ? "./src/preload/management.ts"
    : isHome
      ? "./src/preload/home.ts"
      : isCommerce
        ? "./src/preload/commerce.ts"
        : isSettings
          ? "./src/preload/settings.ts"
          : "./src/preload/index.ts";

  return {
    build: {
      emptyOutDir: mode === "pet",
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
