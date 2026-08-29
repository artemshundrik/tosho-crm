import { describe, expect, it } from "vitest";

import { edgeFadeState } from "./useEdgeFade";

/**
 * Межові випадки згасання країв (REQ-201).
 *
 * Юніт, а не перевірка оком: сама маска — це CSS, а от рішення «чи є за краєм
 * вміст» ухвалює арифметика, і саме в ній усі три способи помилитись —
 * короткий список, дробові висоти й докручений до кінця список.
 */
describe("edgeFadeState", () => {
  it("короткий список не згасає з жодного боку", () => {
    expect(edgeFadeState({ offset: 0, viewport: 600, content: 400 })).toEqual({
      start: false,
      end: false,
    });
  });

  it("список рівно у висоту колонки теж не згасає", () => {
    expect(edgeFadeState({ offset: 0, viewport: 600, content: 600 })).toEqual({
      start: false,
      end: false,
    });
  });

  it("на початку довгого списку згасає лише нижній край", () => {
    expect(edgeFadeState({ offset: 0, viewport: 600, content: 1800 })).toEqual({
      start: false,
      end: true,
    });
  });

  it("посередині згасають обидва краї", () => {
    expect(edgeFadeState({ offset: 500, viewport: 600, content: 1800 })).toEqual({
      start: true,
      end: true,
    });
  });

  it("докрутили до кінця — нижній край гасне, верхній лишається", () => {
    expect(edgeFadeState({ offset: 1200, viewport: 600, content: 1800 })).toEqual({
      start: true,
      end: false,
    });
  });

  /**
   * Заради цього випадку в розрахунку взагалі є допуск. Масштаб сторінки дає
   * дробові висоти, і докручений донизу список показує scrollTop 1199.5 при
   * scrollHeight 1800 — без допуску нижній край згасав би вічно, обіцяючи
   * картки, яких немає.
   */
  it("дробовий піксель у кінці списку не лишає згасання", () => {
    expect(edgeFadeState({ offset: 1199.5, viewport: 600, content: 1800 })).toEqual({
      start: true,
      end: false,
    });
  });

  it("дробовий піксель на самому початку не вмикає верхній край", () => {
    expect(edgeFadeState({ offset: 0.5, viewport: 600, content: 1800 })).toEqual({
      start: false,
      end: true,
    });
  });
});
