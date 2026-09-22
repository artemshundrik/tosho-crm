import { describe, expect, it } from "vitest";

import { formatVatRateLabel, isVatPayerRate, splitSignatoryFullName } from "./customerLegalEntities";

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

/**
 * Від цього предиката залежить, кому CRM вимагає ІПН платника ПДВ: і зірочка в
 * реквізитах, і блокувальний пункт готовності замовлення. «0%» тут — НЕ платник:
 * менеджери ставлять цю ставку тим, хто ПДВ не платить, і вимагати з них
 * 12-значний номер означало б не дати ні зберегти реквізити, ні оформити
 * замовлення.
 */
describe("isVatPayerRate", () => {
  it("ставка більша за нуль — платник", () => {
    expect(isVatPayerRate("20")).toBe(true);
    expect(isVatPayerRate("7")).toBe(true);
    expect(isVatPayerRate(20)).toBe(true);
  });

  it("0%, «немає» і порожнеча — не платник", () => {
    expect(isVatPayerRate("0")).toBe(false);
    expect(isVatPayerRate(0)).toBe(false);
    expect(isVatPayerRate("none")).toBe(false);
    expect(isVatPayerRate("")).toBe(false);
    expect(isVatPayerRate(null)).toBe(false);
    expect(isVatPayerRate(undefined)).toBe(false);
  });

  it("сміття замість ставки не робить платником", () => {
    expect(isVatPayerRate("абищо")).toBe(false);
  });
});

/**
 * Підпис ставки має розрізняти неплатника й нульову ставку: доки обидва
 * читались як «без ПДВ», менеджери ставили «0%» тим, хто ПДВ не платить.
 */
describe("formatVatRateLabel", () => {
  it("неплатник і нульова ставка названі по-різному", () => {
    expect(formatVatRateLabel("none")).toBe("Не платник ПДВ");
    expect(formatVatRateLabel(null)).toBe("Не платник ПДВ");
    expect(formatVatRateLabel("0")).toBe("ПДВ 0% (експорт)");
  });

  it("звичайні ставки лишаються числом", () => {
    expect(formatVatRateLabel("20")).toBe("20%");
    expect(formatVatRateLabel("7")).toBe("7%");
  });
});
