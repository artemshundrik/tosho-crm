import { describe, expect, it } from "vitest";

import { isIdlePapercut, isPapercutCard, papercutLabel } from "./papercuts";

const card = (title: string, states: string[] = []) => ({
  title,
  checklist: states.map((state) => ({ state })),
});

describe("накопичувач дрібниць", () => {
  it("впізнається за префіксом, байдуже до регістру й пробілів", () => {
    expect(isPapercutCard({ title: "Дрібниці: мова інтерфейсу" })).toBe(true);
    expect(isPapercutCard({ title: "  дрібниці: гроші замовлення" })).toBe(true);
    expect(isPapercutCard({ title: "Дрібна правка в картці" })).toBe(false);
  });

  it("назва напряму — те, що після двокрапки", () => {
    expect(papercutLabel({ title: "Дрібниці: картка прорахунку" })).toBe("картка прорахунку");
  });

  it("полиця без роботи — і порожня, і повністю розгребена", () => {
    // Саме таку не показують на дошці. Друга половина правила знайшлась не
    // одразу: спершу ховали лише порожні, і на дошці лишалась картка з єдиною
    // ЗАКРИТОЮ дрібницею — з галочкою й зеленою смугою, тобто «робота», якої
    // насправді немає.
    expect(isIdlePapercut(card("Дрібниці: гроші замовлення"))).toBe(true);
    expect(isIdlePapercut(card("Дрібниці: картка прорахунку", ["done"]))).toBe(true);
    expect(isIdlePapercut(card("Дрібниці: мова інтерфейсу", ["done", "todo"]))).toBe(false);
  });

  it("скасовані дрібниці роботою не рахуються", () => {
    expect(isIdlePapercut(card("Дрібниці: довіра до релізу", ["done", "dropped"]))).toBe(true);
  });

  it("пункт, що чекає на людину, — це робота: полиця лишається на дошці", () => {
    expect(isIdlePapercut(card("Дрібниці: стек", ["waiting"]))).toBe(false);
  });

  it("звичайна картка без пунктів полицею НЕ є", () => {
    // Інакше з дошки зникла б половина беклогу: у більшості карток чекліста
    // немає взагалі.
    expect(isIdlePapercut(card("Перебудувати процес створення прорахунку"))).toBe(false);
  });
});
