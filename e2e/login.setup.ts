import { test } from "@playwright/test";

import { AUTH_STATE_FILE } from "./env";

/**
 * Разовий ручний вхід — `npm run e2e:login`.
 *
 * ЧОМУ ЦЕ ОКРЕМА КОМАНДА, А НЕ ПАРОЛЬ У ФАЙЛІ. Репозиторій публічний, і навіть
 * у `.env.local` пароль живого облікового запису — це пароль, який колись
 * кудись поїде. Тут його вводить людина у справжньому вікні браузера, а на
 * диск лягає лише сесія (`.auth/`, під .gitignore).
 *
 * Для CI шлях інший: E2E_EMAIL/E2E_PASSWORD із секретів GitHub і окремий
 * тестовий обліковий запис — див. e2e/globalSetup.ts.
 */
test.use({ storageState: { cookies: [], origins: [] } });

test("зберегти сесію для наскрізних перевірок", async ({ page, context }) => {
  // Десять хвилин: стільки може зайняти вхід із двофакторкою й пошуком пароля.
  test.setTimeout(10 * 60_000);

  await page.goto("/login");
  console.log("\nУвійди у вікні браузера, що відкрилось. Далі все станеться саме.\n");

  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 10 * 60_000 });
  await context.storageState({ path: AUTH_STATE_FILE });

  console.log(`\nСесію збережено у ${AUTH_STATE_FILE}. Тепер працює \`npm run e2e\`.\n`);
});
