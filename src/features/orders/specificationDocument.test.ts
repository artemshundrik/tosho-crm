import { describe, expect, it } from "vitest";

import { DEFAULT_ORDER_EXECUTOR } from "./orderExecutor";
import type { DerivedOrderRecord } from "./orderRecords";
import {
  buildDefaultSpecItemText,
  buildSpecificationHtml,
  buildSpecPaymentClause,
  signatoryActsPhrase,
} from "./specificationDocument";

/** Intl ставить нерозривний пробіл між тисячами; у тексті тесту — звичайний. */
const plain = (value: string) => value.replace(/[\u00a0\u202f]/g, " ");

const record = (overrides: Partial<DerivedOrderRecord> = {}) =>
  ({
    id: "o1",
    quoteNumber: "TS-1026-0012",
    customerName: "Авангард",
    legalEntityLabel: "ТОВ «Авангард»",
    customerSignatoryName: "Петренко Олена Іванівна",
    customerSignatoryPosition: "Директор",
    customerSignatoryAuthority: "Статут",
    customerLegalAddress: "м. Київ",
    customerTaxId: "12345678",
    customerVatId: null,
    customerIban: "UA213223130000026007233566001",
    customerBankDetails: "АТ КБ «ПриватБанк»",
    customerVatRate: "20",
    contractNumber: "19/10/2026-002",
    contractDate: "2026-10-19",
    contractCreatedAt: "2026-10-19T08:00:00Z",
    specificationCreatedAt: "2026-10-19T09:00:00Z",
    contractProductionDays: 15,
    prepaymentPct: 70,
    balancePct: 30,
    balanceTiming: "after_shipment",
    balanceDaysAfterShipment: 3,
    balanceDaysKind: "working",
    incotermsCode: "FCA",
    incotermsPlace: "м. Київ",
    currency: "UAH",
    total: 152300,
    executor: DEFAULT_ORDER_EXECUTOR,
    items: [
      { id: "i1", position: 1, name: "Футболка", qty: 100, unit: "шт.", unitPrice: 1523, lineTotal: 152300 },
    ],
    ...overrides,
  }) as unknown as DerivedOrderRecord;

describe("СП за шаблоном № 31", () => {
  const html = plain(buildSpecificationHtml({
    records: [record()],
    specificationNumber: 3,
    itemTexts: new Map([["i1", "Футболка\nТехнічні характеристики: бавовна 100%.\nДТФ, груди — згідно затвердженого макету"]]),
  }));

  it("шапка: номер СП у межах договору, номер і дата договору", () => {
    expect(html).toContain("Додаток (Специфікація) № 3 до");
    expect(html).toContain("№ 19/10/2026-002 від 19.10.2026 р.");
  });

  it("преамбула: повна назва замовника і «яка діє» за по батькові", () => {
    expect(html).toContain("Товариство з обмеженою відповідальністю «Авангард»");
    expect(html).toContain("яка діє на підставі Статуту");
  });

  it("рядок «Разом» з ПДВ = сума / 6, колонки «Строки» немає", () => {
    expect(html).toContain("Загальна вартість з ПДВ: 152 300,00 грн. (в тому числі ПДВ — 25 383,33 грн.)");
    expect(html).not.toContain("Строки");
  });

  it("пункти 2.1–2.3, 3.1–3.2 суцільним текстом, банк після IBAN", () => {
    expect(html).toContain("2.1. Загальна вартість робіт з виготовлення Продукції складає 152 300,00 (сто");
    expect(html).toContain("до 15 робочих днів");
    expect(html).toContain("(Telegram, Viber)");
    expect(html).toContain("1. СПЕЦИФІКАЦІЯ НА ВИГОТОВЛЕННЯ");
    expect(html).toContain("3. ПОРЯДОК ОПЛАТИ ТА ДОСТАВКИ");
    expect(html).toContain("3.2. Поставка Продукції здійснюється на умовах FCA (Incoterms 2020), м. Київ.");
    expect(html).not.toContain("2.4.");
    expect(html).toContain("IBAN: UA213223130000026007233566001 в АТ КБ «ПриватБанк»");
    expect(html).not.toContain("Спосіб оплати");
  });

  it("без номера СП (старий документ) — номер замовлення", () => {
    expect(buildSpecificationHtml({ records: [record()], specificationNumber: null })).toContain(
      "Додаток (Специфікація) № TS-1026-0012 до"
    );
  });
});

describe("п. 3.1", () => {
  it("70/30 з доплатою від видаткової накладної", () => {
    expect(
      plain(buildSpecPaymentClause({
        stages: { advance: 70, balance: 30 },
        total: 152300,
        vatPayer: true,
        balanceTiming: "after_shipment",
        balanceDaysTerm: "3 робочих днів",
      }))
    ).toBe(
      "3.1. Оплата Продукції здійснюється Замовником в 2 етапи: передоплата здійснюється у розмірі 70% загальної вартості продукції (106 610,00 грн з ПДВ) на підставі підписаного додатку до Договору та виставленого Виконавцем рахунку-фактури; остаточний розрахунок у розмірі 30% (45 690,00 грн з ПДВ) з моменту виписки видаткової накладної протягом 3 робочих днів."
    );
  });

  it("100% передоплата — один етап", () => {
    expect(
      plain(buildSpecPaymentClause({
        stages: { advance: 100, balance: 0 },
        total: 1000,
        vatPayer: false,
        balanceTiming: null,
        balanceDaysTerm: "",
      }))
    ).toContain("у розмірі 100% загальної вартості продукції (1 000,00 грн) на підставі підписаного додатку");
  });
});

describe("допоміжне", () => {
  it("рід підписанта за по батькові", () => {
    expect(signatoryActsPhrase("Петренко Олена Іванівна")).toBe("яка діє");
    expect(signatoryActsPhrase("Шевченко Тарас Григорович")).toBe("який діє");
    expect(signatoryActsPhrase("Smith John")).toBe("що діє");
  });

  it("типовий текст позиції: назва, характеристики, нанесення", () => {
    expect(
      buildDefaultSpecItemText({ name: "Футболка", characteristics: ["бавовна 100%.", "колір чорний"], imprints: ["ДТФ, груди"] })
    ).toBe("Футболка\nТехнічні характеристики: бавовна 100%; колір чорний.\nДТФ, груди — згідно затвердженого макету");
  });
});
