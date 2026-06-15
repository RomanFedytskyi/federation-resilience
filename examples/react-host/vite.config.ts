import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

// This example runs directly against the library SOURCE via aliases, so you can
// `npm i && npm run dev` without publishing/building the package first.
const root = fileURLToPath(new URL("../../src", import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "federation-resilience/react": `${root}/adapters/react.tsx`,
      "federation-resilience": `${root}/index.ts`,
    },
  },
});
