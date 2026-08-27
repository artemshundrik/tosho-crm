import { describe, expect, it } from "vitest";

import { findParty, isSameParty } from "./partyNameMatch";

/**
 * Назви — зі СПРАВЖНЬОЇ бази (замір 27.08.2026). Це важливо: саме реальний
 * випадок «masseeds» ↔ «MAS Seeds» показав, що фонетичного порівняння
 * недостатньо, а вигаданий приклад цього б не виявив.
 */
const lead = (name: string, legalName: string | null = null) => ({ name, legalName });

describe("isSameParty — те саме, просто записане інакше", () => {
  it("випадок зі скарги: пробіл і регістр не рахуються", () => {
    // Артем перейменував «masseeds» на «MAS Seeds»; текст у прорахунку лишився старим.
    expect(isSameParty("masseeds", lead("MAS Seeds"))).toBe(true);
  });

  it("точний збіг", () => {
    expect(isSameParty("КОНКОРД", lead("конкорд"))).toBe(true);
  });

  it("лапки й подвійні пробіли не заважають", () => {
    expect(isSameParty('ФК «ЛОКОМОТИВ Київ»', lead("ФК ЛОКОМОТИВ  Київ"))).toBe(true);
  });

  it("юридична назва теж рахується", () => {
    expect(isSameParty("АВАНТІ ГРУП", lead("AVANTI GROUP/MAN", "ТОВ «АВАНТІ ГРУП»"))).toBe(true);
  });
});

describe("isSameParty — чуже лишається чужим", () => {
  it("ПІДРЯДОК НЕ Є ЗБІГОМ — саме через нього відкривалась чужа картка", () => {
    // «masseeds».includes(«eds») — істина, і стара функція показувала EDS
    // з чужим контактом і телефоном.
    expect(isSameParty("masseeds", lead("EDS"))).toBe(false);
  });

  it("і в зворотному напрямку теж", () => {
    expect(isSameParty("EDS", lead("MAS Seeds"))).toBe(false);
  });

  it("сміттєві записи не збігаються ні з чим", () => {
    // У базі є ліди з назвами «.» і «..» — саме їх повертав останній щабель
    // старої функції для назв, яких у базі немає взагалі.
    expect(isSameParty("Нова Земля", lead("."))).toBe(false);
    expect(isSameParty("FlexiFai", lead(".."))).toBe(false);
  });

  it("схожі, але різні компанії", () => {
    expect(isSameParty("Ропа", lead("Агро Панцир"))).toBe(false);
    expect(isSameParty("Вектор", lead("ВЕКТОР ВС (Vector VS)"))).toBe(false);
  });

  it("порожнє не збігається ні з чим", () => {
    expect(isSameParty("", lead("EDS"))).toBe(false);
    expect(isSameParty("EDS", lead(""))).toBe(false);
  });
});

describe("findParty", () => {
  const rows = [lead("."), lead(".."), lead("EDS"), lead("MAS Seeds"), lead("Ерідон")];

  it("знаходить потрібну, а не першу за абеткою", () => {
    expect(findParty(rows, "masseeds")?.name).toBe("MAS Seeds");
  });

  it("немає впевненого збігу — НІЧОГО, а не «найкраще з наявного»", () => {
    // Головна зміна: показати чужу компанію з чужим телефоном гірше, ніж
    // сказати «не знайшли».
    expect(findParty(rows, "Нова Земля")).toBeNull();
    expect(findParty(rows, "people force")).toBeNull();
  });

  it("порожній список — null, а не падіння", () => {
    expect(findParty([], "будь-що")).toBeNull();
  });
});
