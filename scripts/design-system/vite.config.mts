// Збірка карток дизайн-системи для Claude Design. Запускається ТІЛЬКИ через
// scripts/design-system/build.mjs — той підставляє VITE_DS_CARD і робить
// окремий прогін на кожну картку (одна картка = один самодостатній HTML).
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../..");

export default defineConfig({
  root: here,
  // Без базового шляху: усе буде вбудовано в HTML, зовнішніх адрес не лишиться.
  base: "./",
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.join(repo, "src") } },
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  build: {
    outDir: path.join(repo, ".design-system-export", "work", process.env.VITE_DS_CARD ?? "card"),
    emptyOutDir: true,
    // Шрифти й картинки — у data-URI: картка має жити без жодного запиту назовні.
    assetsInlineLimit: 1e9,
    cssCodeSplit: false,
    modulePreload: false,
    minify: true,
    sourcemap: false,
    rollupOptions: {
      input: path.join(here, "index.html"),
      // Класичний скрипт, не модуль: модулі не виконуються в jsdom, яким
      // build.mjs робить попередній рендер на випадок, якщо полотно не
      // виконує скриптів.
      output: { format: "iife", inlineDynamicImports: true, entryFileNames: "card.js", assetFileNames: "card.[ext]" },
    },
  },
});
