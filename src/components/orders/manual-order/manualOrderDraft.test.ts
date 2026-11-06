import { describe, expect, it } from "vitest";

import {
  buildManualOrderItems,
  createManualOrderDraft,
  createManualOrderService,
  findManualOrderIssue,
  manualOrderItemName,
  type ManualOrderIssueInput,
} from "./manualOrderDraft";

const amountOf = (raw: string) => Number(raw.replace(",", ".")) || 0;

const ready = (partial: Partial<ManualOrderIssueInput> = {}): ManualOrderIssueInput => ({
  hasCustomer: true,
  items: [createManualOrderDraft({ key: "a", name: "Футболка", qty: "10", unitPrice: "100" })],
  services: [],
  previews: {},
  amountOf,
  isCashless: false,
  orderTotal: 1000,
  hasPrint: false,
  designMode: "none",
  selectedDesignTaskId: "",
  deliveryIssue: null,
  pricesConfirmed: false,
  ...partial,
});

const variant = (id: string) => ({
  id,
  priceRowId: null,
  article: null,
  label: id,
  price: null,
  imageUrl: null,
  url: null,
});

describe("findManualOrderIssue", () => {
  it("пропускає заповнене вікно", () => {
    expect(findManualOrderIssue(ready())).toBeNull();
  });

  it("спершу питає замовника, навіть коли бракує всього", () => {
    expect(findManualOrderIssue(ready({ hasCustomer: false, items: [] }))?.id).toBe("customer");
  });

  it("без позицій веде до поля товару", () => {
    expect(findManualOrderIssue(ready({ items: [] }))?.id).toBe("items");
  });

  it("поки сторінка читається, не питає назву, якої ще немає", () => {
    const items = [createManualOrderDraft({ key: "a" })];
    const issue = findManualOrderIssue(ready({ items, previews: { a: { status: "pending" } } }));
    expect(issue?.id).toBe("pending:a");
  });

  it("сайт не пустив: просить вписати назву", () => {
    const items = [createManualOrderDraft({ key: "a", qty: "1" })];
    expect(findManualOrderIssue(ready({ items }))?.id).toBe("name:a");
  });

  it("колір із кількох обов'язковий, з одного ні", () => {
    const base = { key: "a", name: "Футболка", qty: "1" };
    const many = createManualOrderDraft({ ...base, colorOptions: [variant("x"), variant("y")] });
    const one = createManualOrderDraft({ ...base, colorOptions: [variant("x")] });
    expect(findManualOrderIssue(ready({ items: [many] }))?.id).toBe("color:a");
    expect(findManualOrderIssue(ready({ items: [one] }))).toBeNull();
  });

  it("кількість порожня за замовчуванням і її вимагаємо", () => {
    const items = [createManualOrderDraft({ key: "a", name: "Футболка" })];
    expect(findManualOrderIssue(ready({ items }))?.id).toBe("qty:a");
  });

  it("послуга: спершу назва, потім кількість", () => {
    const service = { ...createManualOrderService(), key: "s" };
    expect(findManualOrderIssue(ready({ items: [], services: [service] }))?.id).toBe("service:s");
    const named = { ...service, name: "Доставка", qty: "" };
    expect(findManualOrderIssue(ready({ items: [], services: [named] }))?.id).toBe("service-qty:s");
  });

  it("за рахунком без суми веде до ціни першої позиції, а послугу до її ціни", () => {
    expect(findManualOrderIssue(ready({ isCashless: true, orderTotal: 0 }))?.id).toBe("price:a");
    const service = { ...createManualOrderService(), key: "s", name: "Доставка" };
    expect(findManualOrderIssue(ready({ items: [], services: [service], isCashless: true, orderTotal: 0 }))?.id).toBe(
      "service-price:s"
    );
  });

  it("готовий дизайн вимагаємо лише коли є нанесення", () => {
    expect(findManualOrderIssue(ready({ hasPrint: true, designMode: "existing" }))?.id).toBe("design");
    expect(findManualOrderIssue(ready({ hasPrint: false, designMode: "existing" }))).toBeNull();
    expect(findManualOrderIssue(ready({ hasPrint: true, designMode: "create" }))).toBeNull();
  });

  it("логістика віддає текст пропуску", () => {
    const issue = findManualOrderIssue(ready({ deliveryIssue: "вкажіть місто" }));
    expect(issue).toEqual({ id: "delivery", text: "Логістика: вкажіть місто" });
  });

  it("галочка цін лише за рахунком", () => {
    expect(findManualOrderIssue(ready({ isCashless: true }))?.id).toBe("check");
    expect(findManualOrderIssue(ready({ isCashless: true, pricesConfirmed: true }))).toBeNull();
    expect(findManualOrderIssue(ready({ isCashless: false }))).toBeNull();
  });
});

describe("manualOrderItemName", () => {
  it("дописує колір, але не двічі", () => {
    expect(manualOrderItemName({ name: "Футболка", color: "Чорний" })).toBe("Футболка · Чорний");
    expect(manualOrderItemName({ name: "Футболка чорний", color: "Чорний" })).toBe("Футболка чорний");
    expect(manualOrderItemName({ name: " Футболка ", color: null })).toBe("Футболка");
  });
});

describe("buildManualOrderItems", () => {
  const helpers = {
    amountOf,
    storedUnitPrice: (entered: string) => amountOf(entered) * 1.2,
    methodName: () => "Шовкодрук",
    placeLabel: () => "Груди",
    images: () => ({ imageUrl: "https://cdn/i.jpg", thumbUrl: "https://cdn/t.jpg" }),
  };

  it("кладе артикул і посилання в metadata, а не в опис, і не несе закупку", () => {
    const [item] = buildManualOrderItems(
      [
        createManualOrderDraft({
          name: "Футболка",
          color: "Чорний",
          sku: "ART-1",
          links: ["https://site/x"],
          qty: "10",
          unitPrice: "100",
          poolPrice: { amount: 55, currency: "UAH" },
        }),
      ],
      [],
      helpers
    );
    expect(item.name).toBe("Футболка · Чорний");
    expect(item.qty).toBe(10);
    expect(item.unitPrice).toBe(120);
    expect(item.catalogModelId).toBeNull();
    expect(item.metadata).toMatchObject({ sku: "ART-1", color: "Чорний", sourceUrl: "https://site/x" });
    expect(JSON.stringify(item)).not.toContain("55");
  });

  it("розмір нанесення з коми стає крапкою, вписане місце лишається підписом", () => {
    const [item] = buildManualOrderItems(
      [
        createManualOrderDraft({
          name: "Футболка",
          qty: "1",
          catalog: { modelId: null, variantId: null, kindId: "k", typeId: "t", kindName: "К", typeName: "Т", imageUrl: null },
          imprints: [{ key: "i", methodId: "m", positionId: null, positionLabel: "На спині" }],
          sizes: { i: { width: "10,5", height: " 20 " } },
        }),
      ],
      [],
      helpers
    );
    expect(item.printApplications?.[0]).toMatchObject({
      methodLabel: "Шовкодрук",
      positionLabel: "На спині",
      width: "10.5",
      height: "20",
    });
  });

  it("послуги йдуть після товарів і без metadata", () => {
    const items = buildManualOrderItems(
      [createManualOrderDraft({ name: "Футболка", qty: "1" })],
      [{ key: "s", name: "Доставка ", qty: "1", unitPrice: "50" }],
      helpers
    );
    expect(items[1]).toMatchObject({ name: "Доставка", kind: "service", unit: "посл.", unitPrice: 60 });
    expect(items[1].metadata).toBeUndefined();
  });
});
