import { describe, expect, it, vi } from "vitest";

// Модуль бере нормалізацію URL з довідника логотипів, а той тягне клієнт
// Supabase, який у node лізе у window. Сам клієнт добору не потрібен: добір —
// чиста функція, тож клієнта тут просто немає.
vi.mock("@/lib/supabaseClient", () => ({ supabase: {} }));

import { createCustomerLogoResolver, normalizePartyLabel } from "./customerLogoIndex";

/**
 * Добір логотипа за назвою (REQ-274).
 *
 * Тут закріплено не швидкість, а ПОРЯДОК добору: індекс замінив перебір
 * довідника, і кожен крок старого перебору — точний збіг у межах типу сторони,
 * збіг без пробілів, ті самі кроки без огляду на тип, власний логотип — мусить
 * давати ту саму відповідь, що й раніше.
 */
const CUSTOMER = "https://cdn.example/customer.webp";
const LEAD = "https://cdn.example/lead.webp";
const OWN = "https://cdn.example/own.webp";

describe("normalizePartyLabel", () => {
  it("зводить лапки, розділові знаки й регістр до одного ключа", () => {
    expect(normalizePartyLabel("«Галіт» ТОВ")).toBe("галіт тов");
    expect(normalizePartyLabel("  Галіт-ТОВ ")).toBe("галіт тов");
    expect(normalizePartyLabel("L'Albero della")).toBe("lalbero della");
    expect(normalizePartyLabel(null)).toBe("");
  });
});

describe("createCustomerLogoResolver", () => {
  const resolve = createCustomerLogoResolver([
    { label: "Vita Agro", entityType: "customer", logoUrl: CUSTOMER },
    { label: "Vita Agro", entityType: "lead", logoUrl: LEAD },
    { label: "Без лого", entityType: "customer", logoUrl: null },
    { label: "Тільки лід", entityType: "lead", logoUrl: LEAD },
  ]);

  it("бере логотип свого типу сторони, коли назва є в обох", () => {
    expect(resolve({ customerName: "vita agro", partyType: "customer" })).toBe(CUSTOMER);
    expect(resolve({ customerName: "vita agro", partyType: "lead" })).toBe(LEAD);
  });

  it("без типу сторони вважає запис замовником", () => {
    expect(resolve({ customerName: "Vita Agro" })).toBe(CUSTOMER);
  });

  it("знаходить назву, написану без пробілів", () => {
    expect(resolve({ customerName: "VitaAgro", partyType: "customer" })).toBe(CUSTOMER);
  });

  it("переходить до іншого типу сторони, якщо у своєму назви немає", () => {
    expect(resolve({ customerName: "Тільки лід", partyType: "customer" })).toBe(LEAD);
    expect(resolve({ customerName: "ТількиЛід", partyType: "customer" })).toBe(LEAD);
  });

  it("запис довідника без логотипа не перекриває власний логотип", () => {
    expect(resolve({ customerName: "Без лого", customerLogoUrl: OWN })).toBe(OWN);
  });

  it("невідома назва й порожня назва віддають власний логотип, нормалізований", () => {
    expect(resolve({ customerName: "Невідомий", customerLogoUrl: OWN })).toBe(OWN);
    expect(resolve({ customerName: "", customerLogoUrl: OWN })).toBe(OWN);
    // Вбудований data:-логотип довідник не приймає — так само, як і раніше.
    expect(resolve({ customerName: "Невідомий", customerLogoUrl: "data:image/png;base64,AAAA" })).toBeNull();
    expect(resolve({ customerName: "Невідомий" })).toBeNull();
  });

  it("порожній довідник віддає власний логотип", () => {
    const empty = createCustomerLogoResolver([]);
    expect(empty({ customerName: "Vita Agro", customerLogoUrl: OWN })).toBe(OWN);
  });
});
