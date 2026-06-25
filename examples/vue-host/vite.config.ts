import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { fileURLToPath } from "node:url";

// Run directly against the library SOURCE (no publish/build needed).
const root = fileURLToPath(new URL("../../src", import.meta.url));

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      "federation-resilience/vue": `${root}/adapters/vue.ts`,
      "federation-resilience":     `${root}/index.ts`,
    },
  },
});
