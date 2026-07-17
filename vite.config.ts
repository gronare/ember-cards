import { defineConfig } from "vite";

// Single self-contained ES bundle -> dist/ember-cards.js
// (lit is bundled, not externalized, so HA loads one resource file).
export default defineConfig({
  build: {
    lib: {
      entry: "src/ember-cards.ts",
      formats: ["es"],
      fileName: () => "ember-cards.js",
    },
    rollupOptions: {
      output: { inlineDynamicImports: true },
    },
    minify: true,
    target: "es2021",
    emptyOutDir: true,
  },
});
