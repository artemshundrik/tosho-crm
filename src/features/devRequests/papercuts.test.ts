import { describe, expect, it } from "vitest";

import { isEmptyPapercut, isPapercutCard, papercutLabel } from "./papercuts";

const card = (title: string, items = 0) => ({ title, checklist: Array.from({ length: items }, () => ({})) });

describe("накопичувач дрібниць", () => {
  it("впізнається за префіксом, байдуже до регістру й пробілів", () => {
    expect(isPapercutCard({ title: "Дрібниці: мова інтерфейсу" })).toBe(true);
    expect(isPapercutCard({ title: "  дрібниці: гроші замовлення" })).toBe(true);
    expect(isPapercutCard({ title: "Дрібна правка в картці" })).toBe(false);
  });

  it("назва напряму — те, що після двокрапки", () => {
    expect(papercutLabel({ title: "Дрібниці: картка прорахунку" })).toBe("картка прорахунку");
  });

  it("порожня полиця — накопичувач без жодної дрібниці", () => {
    // Саме її не показують на дошці: вона не задача й не робота, а місце, куди
    // складатимуть. Наповнюють її у «Черзі», звідки вона не зникає.
    expect(isEmptyPapercut(card("Дрібниці: гроші замовлення"))).toBe(true);
    expect(isEmptyPapercut(card("Дрібниці: гроші замовлення", 3))).toBe(false);
  });

  it("звичайна картка без пунктів порожньою полицею НЕ є", () => {
    // Інакше з дошки зникла б половина беклогу: у більшості карток чекліста
    // немає взагалі.
    expect(isEmptyPapercut(card("Перебудувати процес створення прорахунку"))).toBe(false);
  });
});
