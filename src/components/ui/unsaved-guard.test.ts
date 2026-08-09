// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { isMutatingTarget } from "./unsaved-guard";

/**
 * Регресія на реальну поломку: модалка прорахунку закривалась по хрестику
 * мовчки, хоча в ній щойно міняли замовника, статус і валюту.
 *
 * Причина була в припущенні, що контроли значень несуть ARIA-ролі. У цьому коді
 * 12 із 33 форм будують дропдауни руками — зі звичайних `<button>` усередині
 * `Popover`, без жодної ролі, — тож детектор їх не бачив.
 */

const render = (html: string): Element => {
  document.body.innerHTML = html;
  return document.body.firstElementChild as Element;
};

describe("isMutatingTarget", () => {
  it("рахує саморобний пікер на голій кнопці — саме він і ламався", () => {
    const button = render(`<button type="button"><span>ТОВ «Ерідон»</span></button>`);
    expect(isMutatingTarget(button)).toBe(true);
  });

  it("рахує клік по вкладеному вмісту кнопки, а не лише по ній самій", () => {
    render(`<button type="button"><span id="label">Гривня</span></button>`);
    expect(isMutatingTarget(document.getElementById("label"))).toBe(true);
  });

  it("рахує опцію Radix Select", () => {
    const option = render(`<div role="option">УФ-друк</div>`);
    expect(isMutatingTarget(option)).toBe(true);
  });

  it.each(["switch", "checkbox", "radio", "menuitemcheckbox", "menuitemradio"])(
    "рахує контрол значення з роллю %s",
    (role) => {
      expect(isMutatingTarget(render(`<div role="${role}"></div>`))).toBe(true);
    }
  );

  it("НЕ рахує перемикання вкладок — це навігація, а не зміна даних", () => {
    const tab = render(`<button role="tab">Юр. особи</button>`);
    expect(isMutatingTarget(tab)).toBe(false);
  });

  it("НЕ рахує кнопки закриття", () => {
    // Критично: слухач висить у фазі захоплення й спрацьовує раніше за
    // React-обробник хрестика. Без цього виключення чиста форма питала б завжди.
    const close = render(`<button data-unsaved-ignore><span>×</span></button>`);
    expect(isMutatingTarget(close)).toBe(false);
  });

  it("НЕ рахує клік по іконці всередині кнопки закриття", () => {
    render(`<button data-unsaved-ignore><svg id="x"></svg></button>`);
    expect(isMutatingTarget(document.getElementById("x"))).toBe(false);
  });

  it("НЕ рахує клік у порожнє місце", () => {
    expect(isMutatingTarget(render(`<div>Просто текст</div>`))).toBe(false);
  });

  it("НЕ рахує клік у поле вводу: зміну дасть подія input, а не фокус", () => {
    expect(isMutatingTarget(render(`<input type="text" />`))).toBe(false);
  });

  it("не падає на порожньому таргеті", () => {
    expect(isMutatingTarget(null)).toBe(false);
  });
});

/**
 * Регресія на протилежну поломку: ЧИСТА форма питала «закрити без збереження?»
 * навіть тоді, коли в ній нічого не вводили.
 *
 * СПРАВЖНЯ ПРИЧИНА (знайдена в браузері 2026-08-09, а не з коду). Слухачі
 * реєструвались у хуку, а `DialogContent` виконується ЗАВЖДИ, коли батько його
 * рендерить — Radix ховає лише вміст порталу, не сам компонент. Тож обробники
 * висіли на документі й при закритому вікні, і клік, яким людина ВІДКРИВАЄ
 * вікно, позначав форму зміненою ще до її появи. Скидання ж робилось лише при
 * монтуванні, тому будь-який клік по сторінці перед відкриттям давав те саме.
 *
 * Лікування структурне: слухачі переїхали в окремий компонент `Listener`, який
 * рендериться ВСЕРЕДИНІ вмісту модалки — тобто з'являється разом із відкриттям
 * і зникає при закритті.
 *
 * Доказ, що це справді полагоджено, — не тут, а в браузері: порожня форма
 * закривається по Esc мовчки, форма з введеним текстом питає. Юніт-тест нижче
 * стереже лише черговість позначки, і його самого по собі НЕ ДОСИТЬ: рівно
 * такий зелений тест був і вчора, коли баг лишався живий.
 */
describe("черговість позначки", () => {
  it("клік не встигає порахувати сам себе зміною", async () => {
    let touched = false;
    const mark = (event: Event) => {
      if (!isMutatingTarget(event.target as Element | null)) return;
      queueMicrotask(() => {
        touched = true;
      });
    };
    document.addEventListener("click", mark, true);

    const button = render(`<button type="button">Скасувати</button>`) as HTMLButtonElement;
    // Обробник у фазі спливання — саме там React питає shouldBlock().
    let seenAtHandler: boolean | null = null;
    button.addEventListener("click", () => {
      seenAtHandler = touched;
    });
    button.click();

    // На момент обробника закриття форма ще НЕ вважається зміненою.
    expect(seenAtHandler).toBe(false);

    // А от наступним мікротаском позначка лягає — справжня зміна не губиться.
    await Promise.resolve();
    expect(touched).toBe(true);

    document.removeEventListener("click", mark, true);
  });
});
