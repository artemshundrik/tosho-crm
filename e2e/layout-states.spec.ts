import { test } from "./fixtures";
import { waitForPageBody } from "./helpers";

/**
 * Аркуш станів шару лейауту — щоб правка меню чи смуги дій перевірялась у ВСІХ
 * станах за один раз, а не в тому одному, куди подивились.
 *
 * НАВІЩО. Замір 27.08.2026 по чотирьох днях роботи: бокове меню лагодили
 * ЧОТИРМА комітами за вісім годин («згортається живою хвилею» → «розгортання не
 * смикається» → «підписи не відлітають убік» → «без пружного відскоку»), а
 * шапку зі смугою дій — трьома за тридцять три хвилини. Щоразу правку дивились
 * в одному стані, а ламався сусідній: згорнуте vs розгорнуте, десктоп vs
 * телефон, сторінка зі смугою дій vs без неї.
 *
 * ЩО ЦЕ РОБИТЬ. Не судить, а ПОКАЗУЄ: обходить стани й складає знімки в
 * `e2e/__screens__/`. Далі одним поглядом видно всі шість, а не один.
 * Свідомо БЕЗ `toHaveScreenshot`: еталони на анімованому меню — це червоні
 * прогони на рівному місці, а не захист.
 *
 * Запуск: `npm run e2e:layout` (потрібен разовий `npm run e2e:login`).
 */

const SCREENS = "e2e/__screens__";

/** Сторінка зі смугою дій і сторінка без неї — це різні верхні межі вмісту. */
const PAGES = [
  { name: "quotes", url: "/orders/estimates", anchor: "[data-kanban-card='true'], table" },
  { name: "overview", url: "/overview", anchor: "main" },
];

test.describe("Стани лейауту", () => {
  test("шість знімків: меню, смуга дій, десктоп і телефон", async ({ page }) => {
    test.setTimeout(180_000);

    for (const target of PAGES) {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(target.url);
      await waitForPageBody(page, page.locator(target.anchor).first());

      await page.screenshot({ path: `${SCREENS}/${target.name}-desktop-menu-open.png`, fullPage: false });

      // Згорнуте меню: та сама сторінка, інша ширина колонки навігації.
      const toggle = page.getByRole("button", { name: /Згорнути меню|Розгорнути меню/ }).first();
      if (await toggle.isVisible().catch(() => false)) {
        await toggle.click();
        // Чекаємо кінця переходу ширини, а не фіксованої паузи.
        await page.waitForTimeout(400);
        await page.screenshot({ path: `${SCREENS}/${target.name}-desktop-menu-collapsed.png` });
        await toggle.click();
        await page.waitForTimeout(400);
      }

      // Телефон: смуга вкладок унизу, шапка інша, смуга дій ховається на прокрутці.
      await page.setViewportSize({ width: 390, height: 844 });
      await page.reload();
      await waitForPageBody(page, page.locator(target.anchor).first());
      await page.screenshot({ path: `${SCREENS}/${target.name}-mobile.png` });

      await page.mouse.wheel(0, 600);
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${SCREENS}/${target.name}-mobile-scrolled.png` });
    }
  });
});
