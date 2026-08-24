import path from "path";
import { defineConfig } from "vitest/config";

const alias = { "@": path.resolve(import.meta.dirname, "./src") };

// Separate from vite.config.ts on purpose: that config carries dev-server
// middleware (Supabase/currency/preview renderers) which must not load in tests.
//
// ДВА ПРОЄКТИ, А НЕ ОДИН (REQ-60). Тести чистої логіки бігають у `node` — це
// швидко й чесно: там немає ні DOM, ні браузерних заглушок, тож помилку «працює
// лише в браузері» вони не пропустять повз. Тести ПОВЕДІНКИ компонентів
// потребують jsdom, і вмикати його всім було б і повільніше, і небезпечніше:
// код, що випадково поліз у `document`, мовчки проходив би в логічних тестах.
//
// Розділ проходить по розширенню: `.test.ts` — логіка, `.test.tsx` — компонент.
// Правило навмисно механічне, щоб не думати про нього щоразу.
export default defineConfig({
  resolve: { alias },
  test: {
    passWithNoTests: false,
    projects: [
      {
        resolve: { alias },
        test: {
          name: "логіка",
          environment: "node",
          // Netlify-функції теж тестуємо: там живе логіка отримувачів і порогів,
          // помилка в якій не падає, а тихо дає неправильні числа. Скрипти релізів —
          // з тієї ж причини: вони вирішують, що піде в звіт керівництву.
          // e2e/ теж: сторож записів у наскрізних перевірках (REQ-140) — чиста
          // функція, і перевіряти її браузером було б і повільно, і пізно.
          // Помилка в ній означає справжній запис у продівську базу.
          include: [
            "src/**/*.test.ts",
            "netlify/**/*.test.ts",
            "scripts/**/*.test.mjs",
            "e2e/**/*.test.ts",
          ],
        },
      },
      {
        resolve: { alias },
        test: {
          name: "компоненти",
          environment: "jsdom",
          include: ["src/**/*.test.tsx"],
          setupFiles: ["./src/test/setupComponentTests.ts"],
          // Потрібні Testing Library: без них автоприбирання після кожного тесту
          // не вмикається, і сусідні тести бачать чужу розмітку.
          globals: true,
        },
      },
    ],
  },
});
