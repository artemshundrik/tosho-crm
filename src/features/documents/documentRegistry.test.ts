import { describe, expect, it } from "vitest";

import type { CustomerContract } from "@/features/orders/customerContracts";
import { DEFAULT_ORDER_EXECUTOR } from "@/features/orders/orderExecutor";
import type { DerivedOrderRecord } from "@/features/orders/orderRecords";

import { buildDocumentRegistry, countFlags, filterDocuments, kyivIsoDay, type DocumentFilters } from "./documentRegistry";

const TODAY = "2026-10-29";

const order = (patch: Partial<DerivedOrderRecord>): DerivedOrderRecord =>
  ({
    id: "o1",
    source: "stored",
    quoteNumber: "TO-1026-0006",
    customerId: "c1",
    customerName: "PÖTTINGER",
    customerLogoUrl: null,
    managerUserId: "m1",
    managerLabel: "Ігор С.",
    managerAvatarUrl: null,
    createdAt: "2026-10-20T09:00:00Z",
    currency: "UAH",
    total: 126300,
    items: [],
    approvals: [],
    designStatuses: [],
    paymentMethodId: "bank_uah",
    paymentRail: "Безготівкові, грн.",
    paymentTerms: "70/30",
    prepaymentPct: 70,
    balancePct: 30,
    balanceTiming: "before_shipment",
    balanceDaysAfterShipment: null,
    balanceDaysKind: "business",
    orderStatus: "in_production",
    paymentStatus: "not_paid",
    deliveryStatus: "not_shipped",
    contractCreatedAt: null,
    contractNumber: null,
    contractDate: null,
    contractSignedAt: null,
    contractSignedVia: null,
    specificationCreatedAt: null,
    specificationNumber: null,
    specificationSignedAt: null,
    specificationSignedVia: null,
    invoiceNumber: null,
    invoiceCreatedAt: null,
    invoiceDate: null,
    invoiceRequestedAt: null,
    invoiceRequestedBy: null,
    inheritedContractOrderId: null,
    inheritedContractOrderNumber: null,
    externalContract: null,
    executor: DEFAULT_ORDER_EXECUTOR,
    closingDocument: null,
    actNumber: null,
    actDate: null,
    waybillNumber: null,
    waybillDate: null,
    ...patch,
  }) as unknown as DerivedOrderRecord;

const contract = (patch: Partial<CustomerContract>): CustomerContract => ({
  id: "k1",
  customerId: "c1",
  ourLegalEntityId: null,
  number: "12/01/2026",
  date: "2026-01-12",
  validUntil: null,
  autoProlongation: false,
  signedVia: "paper",
  filePath: "contracts/k1.pdf",
  fileName: "k1.pdf",
  createdAt: "2026-10-26T14:12:00Z",
  ...patch,
});

const ALL: DocumentFilters = {
  section: "all",
  month: null,
  kind: null,
  managerUserId: null,
  customer: null,
  flag: null,
  search: "",
};

describe("buildDocumentRegistry", () => {
  it("розкладає замовлення на документи й ставить найсвіжіші першими", () => {
    const docs = buildDocumentRegistry(
      [
        order({
          contractCreatedAt: "2026-10-08T10:00:00Z",
          contractNumber: "08/10/2026-001",
          specificationCreatedAt: "2026-10-23T09:48:00Z",
          specificationNumber: 3,
          invoiceNumber: "407",
          invoiceCreatedAt: "2026-10-29T11:42:00Z",
          invoiceDate: "2026-10-29",
        }),
      ],
      [],
      TODAY
    );
    expect(docs.map((doc) => `${doc.kind}:${doc.number}`)).toEqual([
      "invoice:407",
      "specification:СП № 3",
      "contract:08/10/2026-001",
    ]);
    expect(docs[1].basis).toBe("До договору 08/10/2026-001");
    expect(docs[0].section).toBe("accounting");
  });

  it("успадкований договір не дублюється на кожному замовленні", () => {
    const docs = buildDocumentRegistry(
      [
        order({ id: "o1", contractCreatedAt: "2026-09-01T10:00:00Z", contractNumber: "01/09" }),
        order({ id: "o2", contractCreatedAt: "2026-09-01T10:00:00Z", contractNumber: "01/09", inheritedContractOrderId: "o1" }),
      ],
      [],
      TODAY
    );
    expect(docs.filter((doc) => doc.kind === "contract")).toHaveLength(1);
  });

  it("непідписана СП активного замовлення — у плитці «Не підписано», давня — червона", () => {
    const [spec] = buildDocumentRegistry([order({ specificationCreatedAt: "2026-10-23T09:00:00Z" })], [], TODAY);
    expect(spec.flag).toBe("unsigned");
    expect(spec.status).toMatchObject({ label: "Не підписано", tone: "danger", detail: "6 дн." });
    expect(spec.alert?.tone).toBe("danger");
  });

  it("СП, створена сьогодні, ще не «увага»: її ніхто не встиг підписати", () => {
    const [spec] = buildDocumentRegistry([order({ specificationCreatedAt: "2026-10-29T11:50:00Z" })], [], TODAY);
    expect(spec.flag).toBeNull();
    expect(spec.status).toMatchObject({ label: "Не підписано", tone: "warning", detail: "сьогодні" });
  });

  it("завершене замовлення не тягне непідписані документи в плитку", () => {
    const [spec] = buildDocumentRegistry(
      [order({ specificationCreatedAt: "2026-09-01T09:00:00Z", orderStatus: "completed", paymentStatus: "fully_paid" })],
      [],
      TODAY
    );
    expect(spec.flag).toBeNull();
  });

  it("відвантажене без ВН — «Без закривального»; оплачене, але не відвантажене, чи з номером ВН — ні", () => {
    const paid = { invoiceNumber: "412", invoiceCreatedAt: "2026-10-20T08:15:00Z", paymentStatus: "fully_paid" };
    const [waiting] = buildDocumentRegistry([order(paid)], [], TODAY);
    expect(waiting.flag).toBeNull();
    expect(waiting.alert).toBeNull();

    const shipped = { ...paid, orderStatus: "shipped", deliveryStatus: "shipped" };
    const [invoice] = buildDocumentRegistry([order(shipped)], [], TODAY);
    expect(invoice.flag).toBe("noClosing");
    expect(invoice.alert?.text).toBe("Відвантажено, а видаткової накладної ще немає.");

    const docs = buildDocumentRegistry([order({ ...shipped, waybillNumber: "РН-0000012", waybillDate: "2026-10-28" })], [], TODAY);
    expect(docs.find((doc) => doc.kind === "invoice")?.flag).toBeNull();
    expect(docs.find((doc) => doc.kind === "waybill")).toMatchObject({ number: "РН-0000012", createdAtPrecise: false });
  });

  it("готівковому замовленню закривальний не потрібен", () => {
    const [invoice] = buildDocumentRegistry(
      [order({ invoiceNumber: "1", invoiceCreatedAt: "2026-10-20T08:15:00Z", paymentStatus: "fully_paid", orderStatus: "shipped", paymentMethodId: "cash", paymentRail: "Готівкові / на карту" })],
      [],
      TODAY
    );
    expect(invoice.flag).toBeNull();
  });

  it("рахунок, що чекає оплату: до 5 днів сірий, з 5 жовтий, з 14 червоний з попередженням", () => {
    const invoiceAt = (createdAt: string) =>
      buildDocumentRegistry([order({ invoiceNumber: "9", invoiceCreatedAt: createdAt })], [], TODAY)[0];
    expect(invoiceAt("2026-10-26T09:00:00Z").status).toMatchObject({ tone: "neutral", detail: "3 дн." });
    expect(invoiceAt("2026-10-23T09:00:00Z").status).toMatchObject({ tone: "warning", detail: "6 дн." });
    const overdue = invoiceAt("2026-09-04T09:00:00Z");
    expect(overdue.status).toMatchObject({ tone: "danger", detail: "55 дн." });
    expect(overdue.alert).toEqual({ tone: "danger", text: "Рахунок чекає оплату 55 дн. від внесення номера." });
  });

  it("рахунок на 0 грн каже, що в замовленні немає суми", () => {
    const [invoice] = buildDocumentRegistry(
      [order({ total: 0, invoiceNumber: "003", invoiceCreatedAt: "2026-10-28T12:47:00Z" })],
      [],
      TODAY
    );
    expect(invoice.alert?.tone).toBe("warning");
    expect(invoice.alert?.text).toContain("немає суми");
  });

  it("договір поза CRM: закінчується за 63 дні без пролонгації — плитка; з пролонгацією — ні", () => {
    const records = [order({})];
    const [expiring] = buildDocumentRegistry(records, [contract({ validUntil: "2026-12-31" })], TODAY);
    expect(expiring).toMatchObject({ kind: "contract", flag: "expiring", customerName: "PÖTTINGER", managerUserId: "m1" });
    expect(expiring.alert?.text).toContain("63 дн.");

    const [prolonged] = buildDocumentRegistry(records, [contract({ validUntil: "2026-12-31", autoProlongation: true })], TODAY);
    expect(prolonged.flag).toBeNull();
    expect(prolonged.status.detail).toBe("з пролонгацією");
  });
});

describe("filterDocuments", () => {
  const docs = buildDocumentRegistry(
    [
      order({ id: "o1", specificationCreatedAt: "2026-10-23T09:00:00Z", invoiceNumber: "407", invoiceCreatedAt: "2026-10-29T11:42:00Z", invoiceDate: "2026-10-29" }),
      order({ id: "o2", quoteNumber: "TO-0926-0042", customerName: "Бадваси", managerUserId: "m2", invoiceNumber: "СФ-17", invoiceCreatedAt: "2026-09-27T10:00:00Z", invoiceDate: "2026-09-27" }),
    ],
    [],
    TODAY
  );

  it("місяць — за датою документа", () => {
    expect(filterDocuments(docs, { ...ALL, month: "2026-09" }).map((doc) => doc.number)).toEqual(["СФ-17"]);
  });

  it("пошук іде за весь час, повз місяць", () => {
    expect(filterDocuments(docs, { ...ALL, month: "2026-10", search: "0042" }).map((doc) => doc.number)).toEqual(["СФ-17"]);
  });

  it("розділ, тип, менеджер", () => {
    expect(filterDocuments(docs, { ...ALL, section: "legal" }).map((doc) => doc.kind)).toEqual(["specification"]);
    expect(filterDocuments(docs, { ...ALL, kind: "invoice", managerUserId: "m1" }).map((doc) => doc.number)).toEqual(["407"]);
  });

  it("лічильники плиток", () => {
    expect(countFlags(docs)).toEqual({ unsigned: 1, noClosing: 0, expiring: 0 });
  });
});

describe("kyivIsoDay", () => {
  it("пізній вечір за UTC — уже наступний київський день", () => {
    expect(kyivIsoDay("2026-10-28T22:30:00Z")).toBe("2026-10-29");
    expect(kyivIsoDay("2026-10-28")).toBe("2026-10-28");
  });
});
