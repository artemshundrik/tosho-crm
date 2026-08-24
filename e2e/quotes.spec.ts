import { test, expect } from "./fixtures";
import {
  closeDialog,
  dialog,
  expectDialogClosed,
  flickerReport,
  stopWatchingFlicker,
  waitForPageBody,
  watchForFlicker,
} from "./helpers";

const ESTIMATES = "/orders/estimates";
/** Номер прорахунку: TS-0826-0034. Формат сталий і видно його на обох екранах. */
const QUOTE_NUMBER = /\b[A-Z]{2}-\d{4}-\d{4}\b/;

const columns = "[data-quote-status-column]";

test.describe("Прорахунки", () => {
  test("дошка відкривається й перемикається між списком і канбаном", async ({ page }) => {
    await page.goto(ESTIMATES);
    await waitForPageBody(page, page.locator(columns));

    /**
     * П'ять колонок — не випадкове число: скасовані з дошки виведені в окремий
     * список (REQ-138). Якщо тут раптом стане шість, це або повернули колонку,
     * або реєстр канбанів розійшовся зі сторінкою.
     */
    await expect(page.locator(columns)).toHaveCount(5);

    await page.getByRole("button", { name: "Список" }).click();
    await expect(page.getByRole("table")).toBeVisible();
    await expect(page.locator(columns)).toHaveCount(0);

    await page.getByRole("button", { name: "Kanban" }).click();
    await expect(page.locator(columns)).toHaveCount(5);
  });

  test("картка прорахунку відкривається за UUID", async ({ page }) => {
    await page.goto(ESTIMATES);
    await waitForPageBody(page, page.locator(columns));

    await page.locator("[data-kanban-card='true']").first().click();
    await page.waitForURL(/\/orders\/estimates\/[0-9a-f-]{36}$/, { timeout: 30_000 });
    const byUuid = page.url();

    // Прямий перехід за адресою, а не лише клік: картка відкривається саме за
    // UUID (не за номером — див. пам'ять про маршрути), і посилання з чату чи
    // з листа мають працювати так само, як клік по картці.
    await page.goto(byUuid);
    await expect(page.getByText(QUOTE_NUMBER).first()).toBeVisible({ timeout: 30_000 });
  });

  /**
   * МІРИЛО УСПІХУ КАРТКИ REQ-140, ЧАСТИНА ПЕРША.
   *
   * У прод поїхало блимання сторінки прорахунків при закритті вікна хрестиком,
   * і його не побачив жоден із 1217 тестів — бо жоден не відкриває застосунок.
   * Тут перевіряються обидві половини: вікно СПРАВДІ закрилось і сторінка при
   * цьому не перемалювалась.
   */
  for (const how of ["cross", "escape"] as const) {
    const label = how === "cross" ? "хрестиком" : "клавішею Esc";
    test(`вікно нового прорахунку закривається ${label}, і сторінка не блимає`, async ({ page }) => {
      await page.goto(ESTIMATES);
      await waitForPageBody(page, page.locator(columns));

      await page.getByRole("button", { name: "Новий прорахунок" }).click();
      await expect(dialog(page).first()).toBeVisible();

      /**
       * Мінімальні дані — щоб форма стала «брудною» і спрацював захист
       * «Закрити без збереження?». Без нього перевірявся б простіший шлях, ніж
       * той, яким ходить людина. Поле шукаємо, а не називаємо: склад білдера
       * змінюється частіше, ніж сам факт, що там є куди писати.
       */
      const anyText = dialog(page).first().locator("input[type='text'], textarea").first();
      if (await anyText.isVisible().catch(() => false)) {
        await anyText.fill("наскрізна перевірка");
      }

      await watchForFlicker(page);
      await closeDialog(page, how);
      await expectDialogClosed(page);

      // Дошка на місці й та сама: колонки не зникали, каркас не повертався.
      await expect(page.locator(columns)).toHaveCount(5);
      const flicker = await flickerReport(page);
      await stopWatchingFlicker(page);

      expect(flicker.skeletons, "каркас завантаження повертався при закритті вікна").toBe(0);
      expect(flicker.removedColumns, "колонки дошки зникали при закритті вікна").toBe(0);
    });
  }

  test("пошук за назвою звужує список і очищається", async ({ page }) => {
    await page.goto(ESTIMATES);
    await waitForPageBody(page, page.locator(columns));

    const search = page.getByPlaceholder("Пошук за назвою...");
    await search.fill("щось-чого-точно-немає-0000");
    // Порожній результат — теж результат: сторінка має сказати про це словами,
    // а не лишитись дошкою з учорашніми картками.
    await expect(page.getByText("Немає прорахунків").first()).toBeVisible({ timeout: 30_000 });

    await page.getByRole("button", { name: "Очистити пошук" }).click();
    await expect(search).toHaveValue("");
    await expect(page.locator(columns)).toHaveCount(5, { timeout: 30_000 });
  });
});
