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
    // Netlify-функції теж тестуємо: там живе логіка отримувачів і порогів,
    // помилка в якій не падає, а тихо дає неправильні числа.
    include: ["src/**/*.test.ts", "netlify/**/*.test.ts"],
    passWithNoTests: false,
  },
});
