import { defineConfig, devices } from "@playwright/test";

import { AUTH_STATE_FILE, loadLocalEnv } from "./e2e/env";

loadLocalEnv();

/**
 * НАСКРІЗНІ ПЕРЕВІРКИ — застосунок очима людини (REQ-140).
 *
 * НАВІЩО, КОЛИ Є 1217 ТЕСТІВ. Ті тести перевіряють код: функції, правила,
 * окремі компоненти. Вони зелені — і при цьому в прод поїхали блимання сторінки
 * прорахунків при закритті вікна хрестиком і кнопка «Скасувати», яка перестала
 * закривати форму. Жоден модульний тест такого не бачить, бо жоден із них не
 * відкриває застосунок і не натискає кнопку.
 *
 * НА ЗІБРАНОМУ, А НЕ НА DEV. `vite build` + `vite preview` — бо саме зібраний
 * застосунок їде в прод: у dev інші межі, інші чанки й інші строки (заміряно:
 * dev завищує блокування приблизно вдесятеро). Перевіряти треба те, що поїде.
 *
 * ОДИН ПРАЦІВНИК, А НЕ ВІСІМ. Supabase у проєкті один, і він продівський:
 * вісім паралельних сесій — це вісім присутностей у розділі, вісім наборів
 * запитів і взаємні перегони за блокуваннями сутностей. Швидкість тут не варта
 * випадкових падінь; записи все одно заборонені (див. e2e/writeGuard.ts).
 *
 * НЕ ЗУПИНЯЄ ПУШ. Гак pre-push цього набору не ганяє — він занадто повільний
 * для кожного пуша і залежить від живої бази. Місце запуску — окремий робочий
 * процес GitHub Actions (.github/workflows/e2e.yml), як і просила картка.
 */
const PORT = 4173;
const BASE_URL = `http://localhost:${PORT}`;
const PREVIEW = `npx vite preview --port ${PORT} --strictPort`;

export default defineConfig({
  testDir: "./e2e",
  // Сесію готує globalSetup; під час `--project=login` він себе вимикає.
  globalSetup: "./e2e/globalSetup.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // Сторінки в застосунку важкі, а база продівська: хвилина на сценарій — це
  // запас на реальну мережу, а не на «хай якось допливе».
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],

  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    video: "retain-on-failure",
    screenshot: "only-on-failure",
    locale: "uk-UA",
    timezoneId: "Europe/Kiev",
  },

  projects: [
    {
      // Разовий ручний вхід: `npm run e2e:login`. Пароль вводить людина у
      // справжньому вікні — ні в оточення, ні в репозиторій він не потрапляє.
      name: "login",
      testMatch: /login\.setup\.ts$/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "checks",
      testMatch: /.*\.spec\.ts$/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: AUTH_STATE_FILE,
      },
    },
  ],

  webServer: {
    // E2E_SKIP_BUILD=1 — коли dist уже зібраний і йде налагодження сценаріїв:
    // повна збірка щоразу з'їдає більше часу, ніж самі перевірки.
    command: process.env.E2E_SKIP_BUILD === "1" ? PREVIEW : `npm run build && ${PREVIEW}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
