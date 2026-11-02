import { describe, expect, it } from "vitest";
import {
  buildDigestLinks,
  buildHeadDigest,
  buildManagerDigest,
  collectOrderReminders,
  headDigestHref,
  managerDigestHref,
  orderDocsDigestPause,
  type ReminderApprovalRow,
  type ReminderDispatchRow,
  type ReminderOrderRow,
} from "./orderDocumentReminders";

// Листопад 2026: 02.11 і 09.11 — понеділки, Київ = UTC+2. 02.11 — старт журналу надсилань.
const MONDAY = "2026-11-02";
const NEXT_MONDAY = "2026-11-09";

const order = (patch: Partial<ReminderOrderRow> = {}): ReminderOrderRow => ({
  id: "order-1",
  team_id: "team-1",
  quote_number: "TS-1026-0012",
  customer_name: "Рома",
  manager_user_id: "manager-1",
  payment_method_id: "bank_uah",
  payment_method_label: "Безготівка",
  order_status: "in_progress",
  payment_status: "unpaid",
  contract_created_at: "2026-10-20T10:00:00Z",
  specification_created_at: "2026-10-20T10:00:00Z",
  contract_signed_at: null,
  specification_signed_at: null,
  invoice_number: null,
  invoice_date: null,
  invoice_created_at: null,
  prepayment_pct: 50,
  balance_timing: "before_shipment",
  balance_days_after_shipment: null,
  balance_days_kind: null,
  closing_document: "waybill",
  act_date: null,
  waybill_date: null,
  ...patch,
});

const approved = (kind: string, decidedAt: string, stamp = `${kind}-stamp`): ReminderApprovalRow => ({
  order_id: "order-1",
  kind,
  status: "approved",
  document_stamp: stamp,
  requested_at: "2026-10-21T08:00:00Z",
  decided_at: decidedAt,
});

const dispatch = (
  document: string,
  event: string,
  createdAt: string,
  stamp: string | null = `${document}-stamp`
): ReminderDispatchRow => ({ order_id: "order-1", document, event, document_stamp: stamp, created_at: createdAt });

const sections = (items: ReturnType<typeof collectOrderReminders>) =>
  items.map((item) => `${item.document}:${item.section}:${item.detail}${item.escalate ? ":head" : ""}`);

describe("договір і СП", () => {
  it("погоджено в п'ятницю й не надіслано — у понеділок нагадати менеджеру", () => {
    const items = collectOrderReminders(order(), [approved("contract", "2026-11-06T12:00:00Z")], [], NEXT_MONDAY);
    expect(sections(items)).toEqual(["contract:unsent:1 р.д."]);
  });

  it("погоджено сьогодні — ще рано", () => {
    expect(collectOrderReminders(order(), [approved("contract", "2026-11-09T07:00:00Z")], [], NEXT_MONDAY)).toEqual([]);
  });

  it("5 р.д. не надіслано — і керівнику", () => {
    const items = collectOrderReminders(order(), [approved("specification", "2026-11-02T12:00:00Z")], [], NEXT_MONDAY);
    expect(sections(items)).toEqual(["specification:unsent:5 р.д.:head"]);
  });

  it("погоджене до старту журналу рахується від старту: у перший день мовчимо, керівнику — не одразу", () => {
    const approvals = [approved("specification", "2026-10-26T12:00:00Z")];
    expect(collectOrderReminders(order(), approvals, [], MONDAY)).toEqual([]);
    expect(sections(collectOrderReminders(order(), approvals, [], "2026-11-03"))).toEqual(["specification:unsent:1 р.д."]);
    expect(sections(collectOrderReminders(order(), approvals, [], NEXT_MONDAY))).toEqual(["specification:unsent:5 р.д.:head"]);
  });

  it("підписано або не погоджено — мовчимо", () => {
    expect(
      collectOrderReminders(
        order({ contract_signed_at: "2026-10-29T10:00:00Z" }),
        [approved("contract", "2026-10-26T12:00:00Z")],
        [],
        MONDAY
      )
    ).toEqual([]);
    expect(
      collectOrderReminders(order(), [{ ...approved("contract", "2026-10-26T12:00:00Z"), status: "pending" }], [], MONDAY)
    ).toEqual([]);
  });

  it("відкликане пізніше погодження не перекриває чинне", () => {
    const withdrawn = { ...approved("contract", "2026-11-06T12:00:00Z"), status: "withdrawn", requested_at: "2026-10-31T00:00:00Z" };
    const items = collectOrderReminders(order(), [approved("contract", "2026-11-06T12:00:00Z"), withdrawn], [], NEXT_MONDAY);
    expect(sections(items)).toEqual(["contract:unsent:1 р.д."]);
  });

  it("надіслано 1 р.д. тому — ще чекаємо; 2 р.д. — не підписано", () => {
    const approvals = [approved("contract", "2026-10-27T12:00:00Z")];
    expect(
      collectOrderReminders(order(), approvals, [dispatch("contract", "sent", "2026-10-30T09:00:00Z")], MONDAY)
    ).toEqual([]);
    const items = collectOrderReminders(order(), approvals, [dispatch("contract", "sent", "2026-10-29T09:00:00Z")], MONDAY);
    expect(sections(items)).toEqual(["contract:unsigned:2 р.д."]);
  });

  it("надіслано старий документ (інший відбиток) — вважаємо не надісланим", () => {
    const items = collectOrderReminders(
      order(),
      [approved("contract", "2026-11-06T12:00:00Z", "new")],
      [dispatch("contract", "sent", "2026-11-05T09:00:00Z", "old")],
      NEXT_MONDAY
    );
    expect(sections(items)).toEqual(["contract:unsent:1 р.д."]);
  });

  it("позначка Вчасно без відбитка — чинна", () => {
    const items = collectOrderReminders(
      order(),
      [approved("contract", "2026-10-26T12:00:00Z")],
      [dispatch("contract", "sent", "2026-10-26T13:00:00Z", null)],
      MONDAY
    );
    expect(sections(items)).toEqual(["contract:unsigned:5 р.д.:head"]);
  });

  it("повернули з правками — хід менеджера, одразу", () => {
    const items = collectOrderReminders(
      order(),
      [approved("contract", "2026-10-29T12:00:00Z")],
      [dispatch("contract", "sent", "2026-10-29T13:00:00Z"), dispatch("contract", "customer_returned", "2026-11-02T07:30:00Z")],
      MONDAY
    );
    expect(sections(items)).toEqual(["contract:returned:з 02.11"]);
  });

  it("готівка й закриті замовлення — нічого", () => {
    const approvals = [approved("contract", "2026-10-26T12:00:00Z")];
    expect(
      collectOrderReminders(order({ payment_method_id: "cash", payment_method_label: "Готівка" }), approvals, [], MONDAY)
    ).toEqual([]);
    expect(collectOrderReminders(order({ order_status: "cancelled" }), approvals, [], MONDAY)).toEqual([]);
  });
});

describe("рахунок", () => {
  const invoiced = (patch: Partial<ReminderOrderRow> = {}) =>
    order({ invoice_number: "123", invoice_date: "2026-10-27", invoice_created_at: "2026-10-27T10:00:00Z", ...patch });
  const sentInvoice = dispatch("invoice", "sent", "2026-10-27T11:00:00Z", "invoice|123|2026-10-27");

  it("виписаний і не надісланий — від старту журналу", () => {
    expect(collectOrderReminders(invoiced(), [], [], MONDAY)).toEqual([]);
    expect(sections(collectOrderReminders(invoiced(), [], [], "2026-11-05"))).toEqual(["invoice:unsent:3 р.д."]);
  });

  it("надісланий: за день до кінця 5 р.д. — менеджеру", () => {
    // 27.10 + 5 р.д. = 03.11; попередження з 02.11.
    expect(sections(collectOrderReminders(invoiced(), [], [sentInvoice], MONDAY))).toEqual(["invoice:unpaid:до 03.11"]);
  });

  it("прострочений — і керівнику", () => {
    expect(sections(collectOrderReminders(invoiced(), [], [sentInvoice], "2026-11-04"))).toEqual([
      "invoice:unpaid:строк минув 03.11:head",
    ]);
  });

  it("оплату почато — рахунок відпрацював", () => {
    expect(collectOrderReminders(invoiced({ payment_status: "partially_paid" }), [], [sentInvoice], "2026-11-04")).toEqual([]);
  });

  it("перевиписали з іншим номером — надсилати наново", () => {
    expect(
      sections(collectOrderReminders(invoiced({ invoice_number: "124" }), [], [sentInvoice], "2026-11-05"))
    ).toEqual(["invoice:unsent:3 р.д."]);
  });
});

describe("доплата після ВН (p10)", () => {
  const deferred = (patch: Partial<ReminderOrderRow> = {}) =>
    order({
      balance_timing: "after_shipment",
      balance_days_after_shipment: 3,
      balance_days_kind: "working",
      waybill_date: "2026-10-29",
      ...patch,
    });

  it("рахується від дати ВН у робочих днях", () => {
    // 29.10 (чт) + 3 р.д. = 03.11 (вт); попередження з 02.11.
    expect(sections(collectOrderReminders(deferred(), [], [], MONDAY))).toEqual(["balance:unpaid:до 03.11"]);
    expect(collectOrderReminders(deferred(), [], [], "2026-10-30")).toEqual([]);
  });

  it("акт, а не ВН, коли закривається актом", () => {
    const items = collectOrderReminders(
      deferred({ closing_document: "act", act_date: "2026-10-26", waybill_date: null }),
      [],
      [],
      MONDAY
    );
    expect(sections(items)).toEqual(["balance:unpaid:строк минув 29.10:head"]);
  });

  it("календарні дні", () => {
    // 29.10 + 3 к.д. = 01.11 (неділя) — у понеділок уже прострочено.
    expect(sections(collectOrderReminders(deferred({ balance_days_kind: "calendar" }), [], [], MONDAY))).toEqual([
      "balance:unpaid:строк минув 01.11:head",
    ]);
  });

  it("без дати ВН чи вже оплачено — мовчимо", () => {
    expect(collectOrderReminders(deferred({ waybill_date: null }), [], [], MONDAY)).toEqual([]);
    expect(collectOrderReminders(deferred({ payment_status: "fully_paid" }), [], [], MONDAY)).toEqual([]);
  });
});

describe("коли слати", () => {
  it("лише о 10-й за Києвом у робочий день", () => {
    expect(orderDocsDigestPause(new Date("2026-11-02T08:05:00Z"))).toBeNull();
    expect(orderDocsDigestPause(new Date("2026-11-02T07:55:00Z"))).toBe("not-digest-hour");
    expect(orderDocsDigestPause(new Date("2026-11-02T09:00:00Z"))).toBe("not-digest-hour");
    expect(orderDocsDigestPause(new Date("2026-11-01T08:05:00Z"))).toBe("weekend");
  });
});

describe("тексти", () => {
  const items = [
    ...collectOrderReminders(order(), [approved("contract", "2026-11-06T12:00:00Z")], [], NEXT_MONDAY),
    ...collectOrderReminders(
      order({ id: "order-2", quote_number: "TS-1026-0020", customer_name: null, invoice_number: "9", invoice_date: "2026-11-03" }),
      [],
      [],
      NEXT_MONDAY
    ),
  ];

  it("менеджеру — одне повідомлення, розділами", () => {
    const digest = buildManagerDigest(items);
    expect(digest.title).toBe("Документи замовникам: 2 потребують дії");
    expect(digest.body).toBe(
      "Не надіслано:\n• TS-1026-0012 Рома — договір, 1 р.д.\n• TS-1026-0020 — рахунок, 4 р.д."
    );
  });

  it("однина в заголовку", () => {
    expect(buildManagerDigest(items.slice(0, 1)).title).toBe("Документи замовникам: 1 потребує дії");
  });

  it("кнопка на кожен документ веде на замовлення", () => {
    expect(buildDigestLinks(items)).toEqual([
      { text: "TS-1026-0012 · договір", href: "/orders/production/order-1" },
      { text: "TS-1026-0020 · рахунок", href: "/orders/production/order-2" },
    ]);
  });

  it("керівнику — за менеджерами", () => {
    const digest = buildHeadDigest(items, () => "Олена");
    expect(digest.title).toBe("Затримки з документами: 2");
    expect(digest.body).toContain("Олена — 2:");
    expect(digest.body).toContain("(не надіслано)");
  });

  it("ключ дня в посиланні — для дедуплікації", () => {
    expect(managerDigestHref("u1", MONDAY)).toBe("/orders/production?reminder=order-docs%3Au1%3A2026-11-02");
    expect(headDigestHref("u1", MONDAY)).toBe("/documents?reminder=order-docs-head%3Au1%3A2026-11-02");
  });
});
