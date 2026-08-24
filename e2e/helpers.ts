import { expect, type Locator, type Page } from "@playwright/test";

/**
 * Спостерігач за «блиманням» сторінки.
 *
 * НАВІЩО. Мірило успіху REQ-140 — упіймати блимання сторінки прорахунків при
 * закритті вікна хрестиком. «Блимання» тут не метафора й не про кадри: воно
 * виглядало як каркас завантаження, що на мить повертався замість уже
 * намальованої дошки. Причина відома (прапорець вікна жив у тілі сторінки-гіганта,
 * тож його зміна перемальовувала всю сторінку), але ловити треба НАСЛІДОК, а не
 * причину: наступного разу причина буде інша.
 *
 * ЯК. Каркас у застосунку позначений `data-deferred-body-skeleton` — той самий
 * атрибут, за яким його ставлять сторінки прорахунків і дизайну. Вішаємо
 * MutationObserver ПЕРЕД дією і питаємо після: чи з'являвся каркас у DOM.
 *
 * ЧОМУ НЕ ЗНІМОК ЕКРАНА. Візуальні порівняння до задачі не входять, і вони б
 * ловили це ненадійно: блимання триває один-два кадри, і знімок або встиг, або
 * ні. Поява вузла в DOM — факт, який не залежить від того, коли ми подивились.
 */
const FLICKER_WATCH = `
(() => {
  const state = { skeletons: 0, removedColumns: 0 };

  const hasSkeleton = (node) =>
    node instanceof HTMLElement &&
    (node.matches("[data-deferred-body-skeleton]") ||
      !!node.querySelector("[data-deferred-body-skeleton]"));

  const hasColumns = (node) =>
    node instanceof HTMLElement &&
    (node.matches(".kanban-column-surface") || !!node.querySelector(".kanban-column-surface"));

  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) if (hasSkeleton(node)) state.skeletons += 1;
      for (const node of record.removedNodes) if (hasColumns(node)) state.removedColumns += 1;
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  window.__e2eFlickerWatch = { state, observer };
  return true;
})()
`;

export type FlickerReport = { skeletons: number; removedColumns: number };

export async function watchForFlicker(page: Page): Promise<void> {
  await page.evaluate(FLICKER_WATCH);
}

/**
 * Що сталося з тілом сторінки, поки за нею стежили.
 *
 * ДВА СИГНАЛИ, БО БЛИМАННЯ БУВАЄ ДВОХ ВИДІВ. `skeletons` — каркас повернувся
 * замість готового вмісту. `removedColumns` — колонки дошки прибрали з DOM,
 * тобто сторінка на мить лишилась порожньою, навіть якщо каркаса не було.
 * Одного лічильника не досить: React під час повного перемальовування може
 * зберегти вузли (тоді спрацює перший), а може й викинути гілку (тоді другий).
 */
export async function flickerReport(page: Page): Promise<FlickerReport> {
  return page.evaluate(() => {
    const watch = (
      window as unknown as {
        __e2eFlickerWatch?: { state: { skeletons: number; removedColumns: number } };
      }
    ).__e2eFlickerWatch;
    return watch ? { ...watch.state } : { skeletons: -1, removedColumns: -1 };
  });
}

export async function stopWatchingFlicker(page: Page): Promise<void> {
  await page.evaluate(() => {
    const watch = (window as unknown as { __e2eFlickerWatch?: { observer: MutationObserver } })
      .__e2eFlickerWatch;
    watch?.observer.disconnect();
  });
}

/**
 * Закрити вікно способом, який обрала людина, і пройти захист «незбережене».
 *
 * Захист типовий для всіх вікон застосунку: щойно у формі щось введено, ✕ і Esc
 * питають «Закрити без збереження?». Сценарій має відповісти так, як відповіла
 * б людина, — інакше він перевіряв би не закриття вікна, а появу питання.
 */
export async function closeDialog(page: Page, how: "cross" | "escape" | "cancel"): Promise<void> {
  if (how === "escape") {
    await page.keyboard.press("Escape");
  } else if (how === "cross") {
    await dialog(page).first().getByRole("button", { name: /close/i }).click();
  } else {
    await dialog(page).first().getByRole("button", { name: "Скасувати" }).click();
  }

  const discard = page.getByRole("button", { name: "Закрити без збереження" });
  if (await discard.isVisible().catch(() => false)) await discard.click();
}

/**
 * Дочекатись, поки сторінка перестане бути каркасом.
 *
 * Просте `waitForLoadState("networkidle")` тут не годиться: у застосунку живе
 * присутність у розділі й опитування, тож мережа не затихає ніколи. Чекаємо на
 * те, що справді означає «сторінка готова» — зник каркас і з'явився вміст.
 */
export async function waitForPageBody(page: Page, content: Locator): Promise<void> {
  await expect(content.first()).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("[data-deferred-body-skeleton]")).toHaveCount(0, { timeout: 30_000 });
}

/** Вікно застосунку: і Radix-діалог, і аркуш збоку мають role="dialog". */
export function dialog(page: Page): Locator {
  return page.locator('[role="dialog"]');
}

/**
 * Закрити вікно й переконатись, що воно СПРАВДІ закрилось.
 *
 * Другий пункт мірила успіху REQ-140: «Скасувати» перестала закривати форму, і
 * жоден із 1190 тестів цього не помітив. Тому перевіряємо не натискання, а
 * наслідок — вікна на екрані немає.
 */
export async function expectDialogClosed(page: Page): Promise<void> {
  await expect(dialog(page)).toHaveCount(0, { timeout: 15_000 });
}
