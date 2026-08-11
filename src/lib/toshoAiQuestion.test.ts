import { describe, expect, it } from "vitest";
import { looksLikeQuestion } from "./toshoAiQuestion";

/**
 * Правило вирішує лише порядок рядків у палітрі, тож тут не «правильно/
 * неправильно», а «щоб типові запити не переїжджали місцями щодня».
 */

describe("що вважаємо питанням", () => {
  it("питальне слово на початку", () => {
    expect(looksLikeQuestion("скільки прорахунків висить")).toBe(true);
    expect(looksLikeQuestion("хто перевантажений")).toBe(true);
    expect(looksLikeQuestion("Чому замовлення прострочене")).toBe(true);
  });

  it("знак питання будь-де в кінці", () => {
    expect(looksLikeQuestion("ерідон?")).toBe(true);
  });

  it("прохання дієсловом", () => {
    expect(looksLikeQuestion("покажи прорахунки Ерідон")).toBe(true);
    expect(looksLikeQuestion("склади лист замовнику")).toBe(true);
  });

  it("довга фраза — теж питання, назви такими не бувають", () => {
    expect(looksLikeQuestion("прорахунки без відповіді більше ніж тиждень")).toBe(true);
  });
});

describe("що лишається пошуком", () => {
  it("назва замовника", () => {
    expect(looksLikeQuestion("ерідон")).toBe(false);
    expect(looksLikeQuestion("нова пошта")).toBe(false);
  });

  it("номер документа", () => {
    expect(looksLikeQuestion("TS-0826-0141")).toBe(false);
  });

  it("коротка фраза без питального слова", () => {
    expect(looksLikeQuestion("прорахунки по менеджерах")).toBe(false);
  });

  it("порожній рядок", () => {
    expect(looksLikeQuestion("")).toBe(false);
    expect(looksLikeQuestion("   ")).toBe(false);
  });
});
