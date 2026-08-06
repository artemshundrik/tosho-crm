import { describe, expect, it } from "vitest";

import { splitSignatoryFullName } from "./customerLegalEntities";

/**
 * Розбір ПІБ визначає, що потрапить у договір: підпис «Д.О. Буйна» будується з
 * припущення, що прізвище відоме, а не вгадане. Тому тут і найпідступніші
 * випадки — прізвища, які самі виглядають як по батькові.
 */
describe("splitSignatoryFullName", () => {
  it("документний порядок: прізвище першим", () => {
    expect(splitSignatoryFullName("Буйна Дар'я Олександрівна")).toEqual({
      last: "Буйна",
      first: "Дар'я",
      middle: "Олександрівна",
    });
  });

  it("розмовний порядок: прізвище в кінці", () => {
    expect(splitSignatoryFullName("Дар'я Олександрівна Буйна")).toEqual({
      last: "Буйна",
      first: "Дар'я",
      middle: "Олександрівна",
    });
  });

  it("чоловіче по батькові в кінці", () => {
    expect(splitSignatoryFullName("Іваненко Іван Іванович")).toEqual({
      last: "Іваненко",
      first: "Іван",
      middle: "Іванович",
    });
  });

  it("чоловіче по батькові посередині", () => {
    expect(splitSignatoryFullName("Іван Іванович Іваненко")).toEqual({
      last: "Іваненко",
      first: "Іван",
      middle: "Іванович",
    });
  });

  it("прізвище саме схоже на по батькові, стоїть першим", () => {
    // «Гуревич» має суфікс по батькові, але посередині «Іван» — отже це прізвище.
    expect(splitSignatoryFullName("Гуревич Іван Петрович")).toEqual({
      last: "Гуревич",
      first: "Іван",
      middle: "Петрович",
    });
  });

  it("прізвище саме схоже на по батькові, стоїть у кінці", () => {
    expect(splitSignatoryFullName("Іван Петрович Гуревич")).toEqual({
      last: "Гуревич",
      first: "Іван",
      middle: "Петрович",
    });
  });

  it("подвійне прізвище через пробіл лишається цілим", () => {
    expect(splitSignatoryFullName("Дар'я Олександрівна Буйна Петренко")).toEqual({
      last: "Буйна Петренко",
      first: "Дар'я",
      middle: "Олександрівна",
    });
  });

  it("без по батькові — прізвище першим, як у документах", () => {
    expect(splitSignatoryFullName("Буйна Дар'я")).toEqual({
      last: "Буйна",
      first: "Дар'я",
      middle: "",
    });
  });

  it("одне слово — це прізвище", () => {
    expect(splitSignatoryFullName("Буйна")).toEqual({ last: "Буйна", first: "", middle: "" });
  });

  it("порожній рядок і зайві пробіли", () => {
    expect(splitSignatoryFullName("   ")).toEqual({ last: "", first: "", middle: "" });
    expect(splitSignatoryFullName("  Буйна   Дар'я   Олександрівна  ")).toEqual({
      last: "Буйна",
      first: "Дар'я",
      middle: "Олександрівна",
    });
  });
});
