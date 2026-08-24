import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { chromium, type FullConfig } from "@playwright/test";

import { AUTH_STATE_FILE, loadLocalEnv } from "./env";

/**
 * СЕСІЯ ДЛЯ ПРОГОНУ. Один вхід на весь набір, далі сценарії стартують уже
 * автентифікованими.
 *
 * ДВА ШЛЯХИ, І ЦЕ НАВМИСНО:
 *
 *   1. E2E_EMAIL + E2E_PASSWORD в оточенні — тихий вхід через справжню форму
 *      застосунку. Так це працює в CI, де значення приходять із секретів
 *      GitHub, і так має працювати окремий тестовий обліковий запис.
 *   2. Готовий `.auth/state.json` — коли сесію зберегли руками командою
 *      `npm run e2e:login`. Пароль при цьому вводить людина у справжньому
 *      вікні браузера, і ні в оточення, ні в репозиторій він не потрапляє.
 *
 * ЧОМУ ВХІД ЧЕРЕЗ ФОРМУ, А НЕ ЧЕРЕЗ API. Через API було б на секунду швидше,
 * але тоді сама форма входу не перевіряється ніколи — а це сторінка, зламавши
 * яку, ми не пустимо в застосунок узагалі нікого.
 *
 * ЧОМУ СЕСІЮ ЩОРАЗУ ЗВІРЯЄМО. Токен протухає, і набір, який мовчки почав
 * ганятись на сторінці входу, показав би 8 однакових падінь замість одного
 * зрозумілого рядка «сесія протухла».
 */
export default async function globalSetup(config: FullConfig): Promise<void> {
  loadLocalEnv();

  // `npm run e2e:login` і є той прогін, що створює сесію, — вимагати її від
  // нього означало б вимагати те, по що він прийшов.
  if (process.env.E2E_LOGIN === "1") return;

  const baseURL = config.projects[0]?.use?.baseURL;
  if (!baseURL) throw new Error("Не задано baseURL у playwright.config.ts");

  const email = process.env.E2E_EMAIL?.trim();
  const password = process.env.E2E_PASSWORD?.trim();
  const hasSavedState = existsSync(AUTH_STATE_FILE);

  if (!email && !hasSavedState) {
    throw new Error(
      [
        "Немає сесії для наскрізних перевірок.",
        "",
        "Або задай E2E_EMAIL і E2E_PASSWORD у .env.local (окремий тестовий",
        "обліковий запис — не свій робочий), або збережи сесію руками:",
        "",
        "  npm run e2e:login",
        "",
        "Друга команда відкриє справжнє вікно браузера: пароль вводиш ти, у",
        "файл лягає лише сесія, і .auth/ під git не потрапляє.",
      ].join("\n")
    );
  }

  mkdirSync(dirname(AUTH_STATE_FILE), { recursive: true });

  const browser = await chromium.launch();
  try {
    const context = await browser.newContext(
      hasSavedState ? { storageState: AUTH_STATE_FILE, baseURL } : { baseURL }
    );
    const page = await context.newPage();

    await page.goto("/overview", { waitUntil: "domcontentloaded" });
    // Сторінка входу може з'явитись не миттєво: AuthProvider спершу перевіряє
    // збережену сесію, і лише потім вирішує перекидати чи ні.
    await page.waitForTimeout(2_000);

    const needsLogin = page.url().includes("/login");
    if (needsLogin) {
      if (!email || !password) {
        throw new Error(
          "Збережена сесія протухла, а E2E_EMAIL/E2E_PASSWORD немає. Повтори `npm run e2e:login`."
        );
      }
      await page.getByLabel(/e-?mail/i).fill(email);
      await page.getByLabel(/пароль/i).fill(password);
      await page.getByRole("button", { name: /увійти/i }).click();
      await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });
    }

    await context.storageState({ path: AUTH_STATE_FILE });
    await context.close();
  } finally {
    await browser.close();
  }
}
