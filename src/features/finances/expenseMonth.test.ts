import { describe, expect, it } from "vitest";

import { expenseMonthCost, expenseRowsForMonths, isRecurringExpenseInMonth } from "./expenseMonth";
import { findMissingMonthEntries } from "./monthClose";
import type { ExpenseEntry, FinanceExpense } from "./types";
import type { FxRates } from "@/lib/fxRates";

const RATES: FxRates = { usdUah: 41, eurUah: 45, updatedAt: null, sourceLabel: null };
const NOW = "2026-08";

const expense = (over: Partial<FinanceExpense> = {}): FinanceExpense => ({
  id: "e1",
  teamId: "t1",
  legalEntityId: null,
  accountId: null,
  categoryId: null,
  supplierName: "Паливо",
  amount: 40302.65,
  currency: "UAH",
  fxRate: null,
  vatAmount: 0,
  expenseDate: "2026-07-31",
  isRecurring: true,
  recurrence: "monthly",
  amountVaries: true,
  objectGroup: null,
  reminderLeadDays: null,
  vendorOptions: [],
  eventType: null,
  nextChargeDate: null,
  vendorKey: null,
  logoUrl: null,
  archivedAt: null,
  notes: null,
  file: null,
  enteredBy: null,
  createdAt: null,
  updatedAt: null,
  allocations: [],
  ...over,
});

const entry = (entryDate: string, amount: number): ExpenseEntry => ({
  id: `en-${entryDate}-${amount}`,
  expenseId: "e1",
  entryDate,
  amount,
  vendor: null,
  eventLabel: null,
  note: null,
});

describe("expenseMonthCost", () => {
  it("журнальна витрата без записів коштує НУЛЬ, а не орієнтир", () => {
    // Той самий випадок, що надув червень на 40 302,65: витрату завели 27.08,
    // орієнтир підставлявся в кожен місяць історії.
    const cost = expenseMonthCost(expense(), [], "2026-08", RATES, NOW);
    expect(cost.uah).toBe(0);
    expect(cost.kind).toBe("empty");
    // Орієнтир не зникає — він лишається підказкою збоку.
    expect(cost.estimateUah).toBe(40302.65);
  });

  it("записи журналу за місяць складаються й вважаються фактом", () => {
    const cost = expenseMonthCost(
      expense(),
      [entry("2026-08-03", 1900), entry("2026-08-10", 500)],
      "2026-08",
      RATES,
      NOW
    );
    expect(cost.uah).toBe(2400);
    expect(cost.kind).toBe("fact");
    expect(cost.entriesCount).toBe(2);
  });

  it("у майбутньому місяці орієнтир — це план, і він рахується", () => {
    const cost = expenseMonthCost(expense(), [], "2026-09", RATES, NOW);
    expect(cost.uah).toBe(40302.65);
    expect(cost.kind).toBe("plan");
  });

  it("стала витрата коштує однаково щомісяця, річна ділиться на 12", () => {
    const yearly = expense({ amountVaries: false, recurrence: "yearly", amount: 12000 });
    const cost = expenseMonthCost(yearly, [], "2026-08", RATES, NOW);
    expect(cost.uah).toBe(1000);
    expect(cost.kind).toBe("fact");
  });

  it("валютна сума журналу переводиться за курсом", () => {
    const usd = expense({ currency: "USD" });
    const cost = expenseMonthCost(usd, [entry("2026-08-03", 10)], "2026-08", RATES, NOW);
    expect(cost.uah).toBe(410);
  });
});

describe("isRecurringExpenseInMonth", () => {
  it("до місяця «веду облік з» витрати не існує", () => {
    expect(isRecurringExpenseInMonth(expense(), "2026-06")).toBe(false);
    expect(isRecurringExpenseInMonth(expense(), "2026-07")).toBe(true);
    expect(isRecurringExpenseInMonth(expense(), "2026-08")).toBe(true);
  });

  it("запис у місяці до «веду облік з» усе одно видно — факт сильніший за межу", () => {
    // Уклон: запис за 01.06, а дата початку — 31.07. Чиста межа сховала б
    // справжні гроші червня (знайдено очима на живих даних).
    expect(isRecurringExpenseInMonth(expense(), "2026-06", true)).toBe(true);
  });

  it("архів діє з НАСТУПНОГО місяця — місяць архівації лишається як був", () => {
    const archived = expense({ archivedAt: "2026-08-27T10:00:00Z" });
    expect(isRecurringExpenseInMonth(archived, "2026-08")).toBe(true);
    expect(isRecurringExpenseInMonth(archived, "2026-09")).toBe(false);
  });
});

describe("findMissingMonthEntries", () => {
  const entries = (pairs: Array<[string, ExpenseEntry[]]>) => new Map(pairs);

  it("ловить НОВУ витрату з нулем записів — раніше вона мовчала", () => {
    const missing = findMissingMonthEntries([expense()], entries([]), "2026-08", NOW);
    expect(missing.has("e1")).toBe(true);
  });

  it("мовчить там, де записи є", () => {
    const missing = findMissingMonthEntries(
      [expense()],
      entries([["e1", [entry("2026-08-10", 500)]]]),
      "2026-08",
      NOW
    );
    expect(missing.size).toBe(0);
  });

  it("не чіпає місяці до «веду облік з», архівні витрати й майбутнє", () => {
    expect(findMissingMonthEntries([expense()], entries([]), "2026-06", NOW).size).toBe(0);
    expect(
      findMissingMonthEntries([expense({ archivedAt: "2026-07-31T10:00:00Z" })], entries([]), "2026-08", NOW).size
    ).toBe(0);
    expect(findMissingMonthEntries([expense()], entries([]), "2026-09", NOW).size).toBe(0);
  });

  it("подія не «ведеться щомісяця», тож у чекліст не йде", () => {
    const party = expense({ eventType: "Корпоратив" });
    expect(findMissingMonthEntries([party], entries([]), "2026-08", NOW).size).toBe(0);
  });

  it("«по потребі» не буває «не внесеним» — воно або сталось, або ні", () => {
    // Паливо, таксі, Нова Пошта, подарунки, кондиціонери: місяць без запису для
    // них НОРМА, а не забутий обовʼязок.
    const asNeeded = expense({ recurrence: "as_needed" });
    expect(findMissingMonthEntries([asNeeded], entries([]), "2026-08", NOW).size).toBe(0);
    // А те, що ходить щомісяця (комуналка, вода, прибирання), — світиться.
    expect(findMissingMonthEntries([expense()], entries([]), "2026-08", NOW).size).toBe(1);
  });
});

describe("«по потребі» в підрахунку місяця", () => {
  it("у майбутньому місяці не показує орієнтир як план", () => {
    const asNeeded = expense({ recurrence: "as_needed" });
    const cost = expenseMonthCost(asNeeded, [], "2026-09", RATES, NOW);
    expect(cost.uah).toBe(0);
    expect(cost.kind).toBe("empty");
    // Для щомісячної той самий вересень — план (орієнтир).
    expect(expenseMonthCost(expense(), [], "2026-09", RATES, NOW).kind).toBe("plan");
  });

  it("факт рахується так само, як у щомісячної", () => {
    const asNeeded = expense({ recurrence: "as_needed" });
    const cost = expenseMonthCost(asNeeded, [entry("2026-08-10", 1440)], "2026-08", RATES, NOW);
    expect(cost.uah).toBe(1440);
    expect(cost.kind).toBe("fact");
  });
});

describe("expenseRowsForMonths (Звіти)", () => {
  const months = ["2026-06", "2026-07", "2026-08"];
  const total = (rows: Array<{ uah: number }>) => rows.reduce((sum, r) => sum + r.uah, 0);

  it("річна підписка розкладається по місяцях, а не рахується раз", () => {
    const yearly = expense({
      id: "sub",
      amountVaries: false,
      recurrence: "yearly",
      amount: 12000,
      expenseDate: "2026-06-01",
    });
    const rows = expenseRowsForMonths([yearly], new Map(), months, RATES, NOW);
    expect(rows).toHaveLength(3);
    expect(total(rows)).toBe(3000);
  });

  it("журнальна витрата дає факт своїх записів, а не орієнтир у кожному місяці", () => {
    const rows = expenseRowsForMonths(
      [expense()],
      new Map([["e1", [entry("2026-08-10", 500)]]]),
      months,
      RATES,
      NOW
    );
    // Липень і серпень (з «веду облік з 31.07»), червня немає взагалі.
    expect(rows.map((r) => r.monthKey)).toEqual(["2026-07", "2026-08"]);
    expect(total(rows)).toBe(500);
  });

  it("місяць із записом рахується, навіть якщо він раніший за «веду облік з»", () => {
    const rows = expenseRowsForMonths(
      [expense()],
      new Map([["e1", [entry("2026-06-01", 17699.65)]]]),
      months,
      RATES,
      NOW
    );
    expect(rows.find((r) => r.monthKey === "2026-06")?.uah).toBe(17699.65);
    expect(total(rows)).toBe(17699.65);
  });

  it("разова витрата рахується рівно у своєму місяці", () => {
    const oneOff = expense({ isRecurring: false, amountVaries: false, amount: 900, expenseDate: "2026-07-15" });
    const rows = expenseRowsForMonths([oneOff], new Map(), months, RATES, NOW);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ monthKey: "2026-07", uah: 900 });
  });

  it("архівна витрата зникає з місяців після архівації", () => {
    const archived = expense({
      amountVaries: false,
      amount: 1000,
      expenseDate: "2026-06-01",
      archivedAt: "2026-07-20T09:00:00Z",
    });
    const rows = expenseRowsForMonths([archived], new Map(), months, RATES, NOW);
    expect(rows.map((r) => r.monthKey)).toEqual(["2026-06", "2026-07"]);
  });
});
