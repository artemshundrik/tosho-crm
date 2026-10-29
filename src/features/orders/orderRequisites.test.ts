import { describe, expect, it } from "vitest";
import { createEmptyCustomerLegalEntity, type CustomerLegalEntity } from "@/lib/customerLegalEntities";
import { resolveOrderRequisites, type OrderRequisitesSnapshot } from "./orderRequisites";

const entity = (patch: Partial<CustomerLegalEntity>): CustomerLegalEntity => ({
  ...createEmptyCustomerLegalEntity(),
  ownershipType: "tov",
  ...patch,
});

const bonFruit = entity({
  legalName: "ТОВ «БОН ФРУКТ»",
  taxId: "41052689",
  iban: "UA000000000000000000000000002",
  legalAddress: "Київ, вул. Нова, 2",
  signatoryName: "Петренко Олег Іванович",
  signatoryPosition: "директор",
  signatoryAuthority: "Статуту",
});

const snapshot: OrderRequisitesSnapshot = {
  legalEntityLabel: "ТОВ БОН ФРУКТ",
  taxId: "41052689",
  iban: "UA000000000000000000000000001",
  legalAddress: "Київ, вул. Стара, 1",
  signatoryLabel: "Петренко Олег Іванович, директор",
  signatoryAuthority: "Статуту",
};

describe("resolveOrderRequisites", () => {
  it("непідписаний документ бере виправлене в картці", () => {
    const result = resolveOrderRequisites({ entities: [bonFruit], snapshot, signed: false });
    expect(result.legalEntityLabel).toBe("ТОВ «БОН ФРУКТ»");
    expect(result.iban).toBe("UA000000000000000000000000002");
    expect(result.legalAddress).toBe("Київ, вул. Нова, 2");
  });

  it("підписана СП друкується з тим, що підписали", () => {
    const result = resolveOrderRequisites({ entities: [bonFruit], snapshot, signed: true });
    expect(result.legalEntityLabel).toBe("ТОВ БОН ФРУКТ");
    expect(result.iban).toBe("UA000000000000000000000000001");
    expect(result.legalAddress).toBe("Київ, вул. Стара, 1");
  });

  it("підписаний, але в знімку порожньо — картка заповнює дірку", () => {
    const result = resolveOrderRequisites({
      entities: [bonFruit],
      snapshot: { ...snapshot, legalAddress: null },
      signed: true,
    });
    expect(result.legalAddress).toBe("Київ, вул. Нова, 2");
  });

  it("юрособи замовлення в картці вже немає — реквізити зі знімка, а не з чужої юрособи", () => {
    const other = entity({ legalName: "ТОВ «Інша»", taxId: "11111111", iban: "UA999", legalAddress: "Львів" });
    const another = entity({ legalName: "ТОВ «Третя»", taxId: "22222222", iban: "UA888" });
    const result = resolveOrderRequisites({ entities: [other, another], snapshot, signed: false });
    expect(result.entity).toBeNull();
    expect(result.legalEntityLabel).toBe("ТОВ БОН ФРУКТ");
    expect(result.taxId).toBe("41052689");
    expect(result.iban).toBe("UA000000000000000000000000001");
    expect(result.legalAddress).toBe("Київ, вул. Стара, 1");
  });

  it("новий підписант без посади не бере посаду й підставу попереднього", () => {
    const changed = { ...bonFruit, signatoryName: "Коваль Ірина Петрівна", signatoryPosition: "", signatoryAuthority: "" };
    const result = resolveOrderRequisites({ entities: [changed], snapshot, signed: false });
    expect(result.signatoryName).toBe("Коваль Ірина Петрівна");
    expect(result.signatoryPosition).toBeNull();
    expect(result.signatoryAuthority).toBeNull();
  });

  it("той самий підписант — порожню посаду в картці добирає зі знімка", () => {
    const partial = { ...bonFruit, signatoryPosition: "", signatoryAuthority: "" };
    const result = resolveOrderRequisites({ entities: [partial], snapshot, signed: false });
    expect(result.signatoryName).toBe("Петренко Олег Іванович");
    expect(result.signatoryPosition).toBe("директор");
    expect(result.signatoryAuthority).toBe("Статуту");
  });

  it("лід без картки — усе зі знімка, підписант з ліда як запас", () => {
    const result = resolveOrderRequisites({
      entities: [],
      snapshot: { taxId: "3012345678" },
      lead: { signatoryName: "Іванов Іван", signatoryPosition: "ФОП" },
      signed: false,
    });
    expect(result.taxId).toBe("3012345678");
    expect(result.signatoryName).toBe("Іванов Іван");
    expect(result.signatoryPosition).toBe("ФОП");
  });
});
