import { test, expect } from "./fixtures";
import { closeDialog, dialog, expectDialogClosed, waitForPageBody } from "./helpers";

const DESIGN = "/design";
const columns = ".kanban-column-surface";

test.describe("Дизайн", () => {
  test("дошка дизайну відкривається, дизайн-задача теж", async ({ page }) => {
    await page.goto(DESIGN);
    await waitForPageBody(page, page.locator(columns));

    // Шість колонок: скасовані виведені з дошки в окремий список (REQ-138).
    await expect(page.locator(columns)).toHaveCount(6);

    await page.locator("[data-kanban-card='true']").first().click();
    await page.waitForURL(/\/design\/[0-9a-f-]{36}$/, { timeout: 30_000 });
    // Сторінка задачі важка (12 800 рядків) — чекаємо не на «щось з'явилось», а
    // на зникнення каркаса: інакше перевірка зелена ще до того, як вміст є.
    await expect(page.locator("[data-deferred-body-skeleton]")).toHaveCount(0, { timeout: 30_000 });
  });

  /**
   * МІРИЛО УСПІХУ КАРТКИ REQ-140, ЧАСТИНА ДРУГА.
   *
   * «Скасувати» перестала закривати форму, і цього не побачив жоден тест.
   * Перевіряємо наслідок, а не натискання: вікна на екрані немає.
   */
  test("вікно нової дизайн-задачі закривається кнопкою «Скасувати»", async ({ page }) => {
    await page.goto(DESIGN);
    await waitForPageBody(page, page.locator(columns));

    await page.getByRole("button", { name: "Нова дизайн-задача" }).click();
    await expect(page.getByText("Нова дизайн-задача (без прорахунку)")).toBeVisible();

    const anyText = dialog(page).first().locator("input[type='text'], textarea").first();
    if (await anyText.isVisible().catch(() => false)) {
      await anyText.fill("наскрізна перевірка");
    }

    await closeDialog(page, "cancel");
    await expectDialogClosed(page);
    await expect(page.locator(columns)).toHaveCount(6);
  });
});
