import { writeFileSync } from "node:fs";
import { expect, test } from "./fixtures";
import { waitForPageBody } from "./helpers";

/**
 * Зонд ролей радіуса (REQ-271#p3, #p8). Не еталонні знімки, а ПРАВИЛО:
 * контрол заввишки 26–42px має радіус 6 чи 8 (або бути пігулкою/колом).
 *
 * НАВІЩО. Було: 100 полів і 62 селекти по 36px із радіусом 12 поруч із такими
 * самими полями радіусом 8 — радіус ішов за розміром, а сторінки стискали поле
 * класом, лишаючи розмір типовим. Одне поле на двох сторінках виглядало
 * по-різному, і жоден юніт-тест цього не бачив: розбіжність живе на стику
 * примітива й сторінки.
 *
 * `r === 0` дозволено: рядки таблиць, вкладки-підкреслення, склеєні групи.
 *
 * Запуск: `npm run e2e:controls` (потрібен разовий `npm run e2e:login`).
 * Звіт пар «висота/радіус» по сторінках — `e2e/__screens__/control-roles.json`.
 */

const SCREENS = "e2e/__screens__";

const PAGES = [
  { name: "overview", url: "/overview" },
  { name: "estimates", url: "/orders/estimates" },
  { name: "production", url: "/orders/production" },
  { name: "design", url: "/design" },
  { name: "finances", url: "/finances" },
  { name: "team", url: "/team" },
  { name: "catalog", url: "/catalog/products" },
  { name: "customers", url: "/orders/customers" },
  { name: "backlog", url: "/dev/backlog" },
];

type Offender = { page: string; tag: string; h: number; r: number; text: string };

test.describe("Ролі радіусів контролів", () => {
  test("контрол 26–42px має радіус 6 або 8 на всіх сторінках", async ({ page }) => {
    test.setTimeout(300_000);
    const offenders: Offender[] = [];
    const pairs: Record<string, Record<string, number>> = {};

    for (const target of PAGES) {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(target.url);
      await waitForPageBody(page, page.locator("main").first());
      // Списки домальовуються після тіла сторінки — міряємо вже осілий кадр.
      await page.waitForTimeout(1500);

      const found = await page.evaluate(() => {
        const sel =
          "button, input:not([type=checkbox]):not([type=radio]):not([type=hidden]), [role=combobox], [role=tab], select";
        return [...document.querySelectorAll<HTMLElement>(sel)].flatMap((el) => {
          const rect = el.getBoundingClientRect();
          if (rect.width < 8 || rect.height < 8) return [];
          const r = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
          const text = (
            el.innerText ||
            (el as HTMLInputElement).placeholder ||
            el.getAttribute("aria-label") ||
            ""
          )
            .trim()
            .slice(0, 30);
          return [
            {
              tag: el.getAttribute("role") ?? el.tagName.toLowerCase(),
              h: Math.round(rect.height),
              w: Math.round(rect.width),
              r,
              text,
            },
          ];
        });
      });

      pairs[target.name] = {};
      for (const f of found) {
        const key = `${f.tag} h${f.h} r${f.r}`;
        pairs[target.name][key] = (pairs[target.name][key] ?? 0) + 1;
        const isControl = f.h >= 26 && f.h <= 42;
        const isRound = f.r * 2 >= Math.min(f.h, f.w) - 1;
        if (isControl && !isRound && f.r !== 0 && f.r !== 6 && f.r !== 8) {
          offenders.push({ page: target.name, tag: f.tag, h: f.h, r: f.r, text: f.text });
        }
      }
      await page.screenshot({ path: `${SCREENS}/control-roles-${target.name}.png` });
    }

    writeFileSync(`${SCREENS}/control-roles.json`, JSON.stringify({ pairs, offenders }, null, 2));
    expect(offenders, JSON.stringify(offenders.slice(0, 40), null, 2)).toEqual([]);
  });
});
