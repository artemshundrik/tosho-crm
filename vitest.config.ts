import path from "path";
import { defineConfig } from "vitest/config";

// Separate from vite.config.ts on purpose: that config carries dev-server
// middleware (Supabase/currency/preview renderers) which must not load in tests.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    passWithNoTests: false,
  },
});
