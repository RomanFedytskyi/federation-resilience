import { defineConfig } from "tsup";

// Dual ESM + CJS build with a separate React subpath entry so the core stays
// React-free for non-React hosts (Vue/Angular/Svelte/bare-ESM).
export default defineConfig({
  entry: {
    index: "src/index.ts",
    react: "src/adapters/react.tsx",
    vue:   "src/adapters/vue.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  target: "es2020",
  external: ["react", "react-dom", "vue", "@module-federation/enhanced"],
  outExtension({ format }) {
    return { js: format === "cjs" ? ".cjs" : ".js" };
  },
});
