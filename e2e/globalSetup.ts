import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { chromium, type FullConfig, type Page } from "@playwright/test";

import { AUTH_STATE_FILE, loadLocalEnv } from "./env";
import { installWriteGuard } from "./writeGuard";

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

    /**
     * СТОРОЖ ПОТРІБЕН І ТУТ, хоч це «лише вхід».
     *
     * Знайдено 11.09.2026 після перших прогонів: цей файл ходив на /overview
     * БЕЗ гальма, і застосунок устигав дописати в ПРОД свою побутівку —
     * присутність і «бачив розділ». П'ять рядків у member_seen_modules і один
     * у user_presence приїхали саме звідси, а не зі сценаріїв.
     *
     * Самі рядки нешкідливі. Небезпечне інше: правило «записів не буває»
     * трималось на тому, що сторож скрізь, а тут у ньому була дірка — і про
     * неї ніхто не знав. Вхід від цього не страждає: `/auth/v1/*` гальмо
     * пропускає навмисно, інакше сесія не народилась би.
     */
    installWriteGuard(page);

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
      // `exact` тут обов'язковий: поруч із полем стоїть кнопка «Показати
      // пароль», і нестрогий /пароль/i знаходить обидва елементи — вхід падав
      // на strict mode violation ще до першого сценарію (11.09.2026).
      await page.getByLabel("Пароль", { exact: true }).fill(password);
      await page.getByRole("button", { name: /увійти/i }).click();
      await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });
    }

    await seedBrowserState(page);
    await context.storageState({ path: AUTH_STATE_FILE });
    await context.close();
  } finally {
    await browser.close();
  }
}

/**
 * СТАН БРАУЗЕРА, ЯКИЙ У ЖИВОЇ ЛЮДИНИ ВЖЕ Є, А В ЧИСТОГО ПРОФІЛЮ НЕМАЄ.
 *
 * Службовий акаунт заходить щоразу з порожнього профілю, і застосунок зустрічає
 * його як новачка. Перший прогін 11.09.2026 це й показав: усі вісім сценаріїв
 * упали, і сім із них — через вікно «Підключи Telegram-бот», яке накрило
 * сторінку й перехопило кожен клік. Закрити його сценарієм не вийде по колу:
 * відмову застосунок пам'ятає в localStorage, а сторінка щоразу починається з
 * чистого.
 *
 * Тому потрібний стан кладемо ДО збереження сесії — один раз на весь набір.
 * З'явиться нове вікно «для новачка» — його прапорець дописується сюди, а не
 * обходиться кліками в кожному сценарії.
 */
async function seedBrowserState(page: Page): Promise<void> {
  await page.evaluate(() => {
    try {
      // Промо телеграм-бота: лічильник показів на стелі = «більше не показувати».
      localStorage.setItem("promo_telegram_v1_count", "3");
      localStorage.setItem("promo_telegram_v1_last", String(Date.now()));
      // Прорахунки за замовчуванням відкриваються списком, а сценарії описують
      // ДОШКУ. Перемикач запам'ятовується тут же, тож ставимо його наперед.
      localStorage.setItem("quotes_view_mode", "kanban");
    } catch {
      // Профіль без доступу до сховища — не привід валити вхід.
    }
  });
}
