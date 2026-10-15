import { describe, expect, it } from "vitest";

import {
  buildExecutorFromLegalEntity,
  DEFAULT_ORDER_EXECUTOR,
  executorFromSnapshot,
  getExecutorGaps,
  splitVat,
  toInitialsLabel,
  type LegalEntityRow,
} from "./orderExecutor";

const fop: LegalEntityRow = {
  id: "fop-1",
  name: "ФОП Петренко П.П.",
  kind: "sole_prop",
  vat_payer: false,
  tax_group: "3",
  edrpou: null,
  ipn: "1234567890",
  iban: "UA000000000000000000000000000",
  requisites: { signatory_name: "Петренко Петро Петрович", signatory_genitive: "Петренка Петра Петровича", address: "м. Київ", bank: "АТ «БАНК»" },
};

describe("buildExecutorFromLegalEntity", () => {
  it("ФОП: без ПДВ, РНОКПП замість ЄДРПОУ, посада «Керівник» за замовчуванням", () => {
    const executor = buildExecutorFromLegalEntity(fop);
    expect(executor).toMatchObject({
      kind: "sole_prop",
      vatPayer: false,
      companyName: "Фізична особа-підприємець Петренко Петро Петрович",
      taxIdLabel: "РНОКПП",
      taxId: "1234567890",
      vatId: null,
      signatory: "Петренка Петра Петровича",
      signatoryPositionDisplay: "Керівник",
      signatureLabel: "П.П. Петренко",
      taxStatus: "Платник єдиного податку 3-ї групи, не є платником ПДВ.",
    });
    expect(getExecutorGaps(executor)).toEqual([]);
  });

  it("ТОВ «АВАНПРІНТ» з порожніми реквізитами в довіднику добирає вшиті", () => {
    const executor = buildExecutorFromLegalEntity({
      id: "llc-1",
      name: "ТОВ «АВАНПРІНТ»",
      kind: "llc",
      vat_payer: true,
      tax_group: null,
      edrpou: DEFAULT_ORDER_EXECUTOR.taxId,
      ipn: DEFAULT_ORDER_EXECUTOR.vatId,
      iban: DEFAULT_ORDER_EXECUTOR.iban,
      requisites: {},
    });
    expect(executor).toEqual({ ...DEFAULT_ORDER_EXECUTOR, legalEntityId: "llc-1" });
  });

  it("ФОП без адреси й банку — це видно як прогалини, а не реквізити ТОВ", () => {
    const executor = buildExecutorFromLegalEntity({ ...fop, requisites: { signatory_name: "Петренко Петро Петрович" } });
    expect(executor.bank).toBe("");
    expect(getExecutorGaps(executor)).toEqual(["банк", "адреса"]);
  });
});

describe("executorFromSnapshot", () => {
  it("без знімка — ТОВ, як було до юросіб", () => {
    expect(executorFromSnapshot(null)).toEqual(DEFAULT_ORDER_EXECUTOR);
  });

  it("знімок ФОП читається назад без домішок ТОВ", () => {
    const executor = buildExecutorFromLegalEntity(fop);
    expect(executorFromSnapshot(JSON.parse(JSON.stringify(executor)))).toEqual(executor);
    expect(executorFromSnapshot({ kind: "sole_prop", shortName: "ФОП" }).iban).toBe("");
  });
});

describe("splitVat", () => {
  it("платник ПДВ: 1200 → 1000 + 200", () => {
    expect(splitVat(1200, true)).toEqual({ net: 1000, vat: 200, gross: 1200 });
  });
  it("без ПДВ сума не ділиться", () => {
    expect(splitVat(1200, false)).toEqual({ net: 1200, vat: 0, gross: 1200 });
  });
});

it("toInitialsLabel", () => {
  expect(toInitialsLabel("Хом'яков Роман Олегович")).toBe("Р.О. Хом'яков");
  expect(toInitialsLabel("")).toBe("");
});

describe("тексти документа", () => {
  it("ТОВ діє в особі директора, ФОП — сам", async () => {
    const { executorPreamble, executorCodesInline } = await import("./orderExecutor");
    expect(executorPreamble(DEFAULT_ORDER_EXECUTOR)).toContain("в особі директора Борщ Олени Вікторівни, яка діє на підставі Статуту");
    const executor = buildExecutorFromLegalEntity(fop);
    expect(executorPreamble(executor)).toBe(
      "Фізична особа-підприємець Петренко Петро Петрович (надалі – Виконавець), що діє на підставі Виписки з Єдиного державного реєстру"
    );
    expect(executorCodesInline(executor)).toBe("РНОКПП 1234567890");
  });
});

describe("storedLegalEntityId", () => {
  it("ТОВ «АВАНПРІНТ» зберігається як null — так само, як старі замовлення", async () => {
    const { storedLegalEntityId } = await import("./orderExecutor");
    const llc = { ...DEFAULT_ORDER_EXECUTOR, legalEntityId: "llc-1" };
    expect(storedLegalEntityId({ row: { id: "llc-1" }, executor: llc })).toBeNull();
    expect(storedLegalEntityId({ row: { id: "fop-1" }, executor: buildExecutorFromLegalEntity(fop) })).toBe("fop-1");
    expect(storedLegalEntityId(null)).toBeNull();
  });
});

describe("legalEntityLockReason", () => {
  it("після рахунку з номером або підписаної СП юрособу не міняють", async () => {
    const { legalEntityLockReason } = await import("./orderExecutor");
    expect(legalEntityLockReason({ invoiceNumber: null, specificationSignedAt: null })).toBeNull();
    expect(legalEntityLockReason({ invoiceNumber: "118", specificationSignedAt: null })).toMatch(/рахунок/i);
    expect(legalEntityLockReason({ invoiceNumber: null, specificationSignedAt: "2026-10-01" })).toMatch(/СП/);
  });
});
