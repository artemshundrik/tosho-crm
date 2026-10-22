import { describe, expect, it } from "vitest";

import { buildOrderActHtml } from "./orderActDocument";
import { buildExecutorFromLegalEntity, DEFAULT_ORDER_EXECUTOR } from "./orderExecutor";

const record = {
  executor: buildExecutorFromLegalEntity({
    id: "fop-1",
    name: "ФОП Петренко П.П.",
    kind: "sole_prop",
    vat_payer: false,
    tax_group: "3",
    edrpou: null,
    ipn: "1234567890",
    iban: "UA000000000000000000000000000",
    requisites: { signatory_name: "Петренко Петро Петрович", bank: "АТ «БАНК»", address: "м. Київ" },
  }),
  items: [{ name: "Розробка макету бейджа", qty: 1, unit: "посл.", lineTotal: 1200 }],
  total: 1200,
  currency: "UAH",
  quoteNumber: "TO-1026-0003",
  customerName: "Замовник",
  legalEntityLabel: "ТОВ «Замовник»",
  customerSignatoryName: "Іваненко Ірина Іванівна",
  customerSignatoryPosition: "Генеральний директор",
  customerTaxId: "37018799",
  customerVatId: null,
  customerLegalAddress: null,
  invoiceNumber: "СФ-0000118",
  invoiceDate: "2026-09-15",
} as unknown as Parameters<typeof buildOrderActHtml>[0];

describe("buildOrderActHtml", () => {
  const html = buildOrderActHtml(record, { date: new Date(2026, 8, 18) });

  it("за шаблоном: рахунок, сума прописом, без ПДВ для ФОП", () => {
    expect(html).toContain("здачі-прийняття робіт (надання послуг)");
    expect(html).toContain("по рахунку № СФ-0000118 від 15.09.26");
    expect(html).toContain("Розробка макету бейджа");
    expect(html).toContain("(Одна тисяча двісті гривень 00 копійок)");
    expect(html).toContain(", без ПДВ.");
    expect(html).toContain("РНОКПП 1234567890");
    expect(html).toContain("Керівник");
    expect(html).toContain("18 вересня 2026 р.");
  });

  it("ТОВ показує ПДВ у сумі", () => {
    const llc = buildOrderActHtml({ ...record, executor: DEFAULT_ORDER_EXECUTOR }, { date: new Date(2026, 8, 18) });
    expect(llc).toContain("у т.ч. ПДВ 200,00 грн");
    expect(llc).toContain("код за ЄДРПОУ 43024297");
  });

  it("назва товару екранується", () => {
    const evil = buildOrderActHtml({ ...record, items: [{ ...record.items[0], name: "<b>x</b>" }] });
    expect(evil).toContain("&lt;b&gt;x&lt;/b&gt;");
  });
});

describe("номер акта з BAS", () => {
  it("внесений номер друкується, без нього — прочерк", () => {
    const withNumber = buildOrderActHtml({ ...record, actNumber: "ОУ-0000007", actDate: "2026-10-16" } as typeof record, {});
    expect(withNumber).toContain("АКТ № ОУ-0000007 від 16 жовтня 2026 р.");
    expect(buildOrderActHtml(record)).toContain("АКТ № ________");
  });
});
