import { describe, expect, it } from "vitest";

import { formatInvoicePartyName } from "./invoicePartyName";

describe("formatInvoicePartyName — як у рахунку з BAS", () => {
  it("коротке ТОВ розгортається, лапки прямі, великі літери", () => {
    expect(formatInvoicePartyName("ТОВ  «АВАНТІ ГРУП»")).toBe('ТОВАРИСТВО З ОБМЕЖЕНОЮ ВІДПОВІДАЛЬНІСТЮ "АВАНТІ ГРУП"');
  });

  it("повна назва з довідника юросіб лише переходить у великі", () => {
    expect(formatInvoicePartyName("Товариство з обмеженою відповідальністю «АВАНПРІНТ»")).toBe(
      'ТОВАРИСТВО З ОБМЕЖЕНОЮ ВІДПОВІДАЛЬНІСТЮ "АВАНПРІНТ"'
    );
  });

  it("ФОП розгортається, апостроф лишається", () => {
    expect(formatInvoicePartyName("ФОП Хом'яков В.О.")).toBe("ФІЗИЧНА ОСОБА-ПІДПРИЄМЕЦЬ ХОМ'ЯКОВ В.О.");
  });

  it("ПрАТ не плутається з ПП чи АТ, ТОВАРИСТВО не чіпається", () => {
    expect(formatInvoicePartyName("ПрАТ «Ромашка»")).toBe('ПРИВАТНЕ АКЦІОНЕРНЕ ТОВАРИСТВО "РОМАШКА"');
    expect(formatInvoicePartyName("Товариство «Х»")).toBe('ТОВАРИСТВО "Х"');
  });

  it("порожнє — порожнє", () => {
    expect(formatInvoicePartyName(null)).toBe("");
  });
});
