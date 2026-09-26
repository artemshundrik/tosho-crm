import { describe, expect, it } from "vitest";

import { countOutstandingMonthEntries, findMissingMonthEntries, latestDueMonth } from "./monthClose";
import type { ExpenseEntry, FinanceExpense } from "./types";

// Реальний розклад вересня 2026 (REQ-314): комуналку за вересень виставляють
// 6–8 жовтня, воду й прибирання вносять у межах самого вересня.

const journal = (id: string, over: Partial<FinanceExpense> = {}): FinanceExpense => ({
  id,
  teamId: "t1",
  legalEntityId: null,
  accountId: null,
  categoryId: null,
  supplierName: id,
  amount: 0,
  currency: "UAH",
  fxRate: null,
  vatAmount: 0,
  expenseDate: "2026-07-01",
  isRecurring: true,
  recurrence: "monthly",
  amountVaries: true,
  billedNextMonth: false,
  objectGroup: "Богданівська 7",
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

const entry = (expenseId: string, entryDate: string): ExpenseEntry => ({
  id: `${expenseId}-${entryDate}`,
  expenseId,
  entryDate,
  amount: 1000,
  vendor: null,
  eventLabel: null,
  note: null,
});

const utilities = journal("utilities", { billedNextMonth: true });
const water = journal("water");

// Серпень комуналки внесено (31.08, як у проді), вересня ще немає — рахунку нема.
const entries = new Map<string, ExpenseEntry[]>([["utilities", [entry("utilities", "2026-08-31")]]]);

describe("latestDueMonth", () => {
  it("звичайна журнальна винна запис за поточний місяць від першого числа", () => {
    expect(latestDueMonth(water, "2026-09-01")).toBe("2026-09");
    expect(latestDueMonth(water, "2026-10-09")).toBe("2026-10");
  });

  it("витрата з рахунком наступного місяця закриває місяць лише 10-го числа наступного", () => {
    expect(latestDueMonth(utilities, "2026-09-26")).toBe("2026-08");
    expect(latestDueMonth(utilities, "2026-10-05")).toBe("2026-08");
    expect(latestDueMonth(utilities, "2026-10-09")).toBe("2026-08");
    expect(latestDueMonth(utilities, "2026-10-10")).toBe("2026-09");
  });

  it("правильно перегортає рік", () => {
    expect(latestDueMonth(utilities, "2027-01-05")).toBe("2026-11");
    expect(latestDueMonth(utilities, "2027-01-10")).toBe("2026-12");
  });
});

describe("findMissingMonthEntries для комуналки", () => {
  it("26 вересня вересень комуналки НЕ світиться «не внесеним» — вносити ще нічого", () => {
    expect(findMissingMonthEntries([utilities], entries, "2026-09", "2026-09-26").size).toBe(0);
  });

  it("5 жовтня теж ні: рахунок приходить 6–8-го", () => {
    expect(findMissingMonthEntries([utilities], entries, "2026-09", "2026-10-05").size).toBe(0);
  });

  it("з 10 жовтня вересень без запису — «не внесено»", () => {
    expect(findMissingMonthEntries([utilities], entries, "2026-09", "2026-10-10").has("utilities")).toBe(true);
  });

  it("внесений серпень не світиться ніколи", () => {
    expect(findMissingMonthEntries([utilities], entries, "2026-08", "2026-10-10").size).toBe(0);
  });

  it("вода живе за старим правилом: вересень без запису світиться вже у вересні", () => {
    expect(findMissingMonthEntries([water], entries, "2026-09", "2026-09-26").has("water")).toBe(true);
  });
});

describe("countOutstandingMonthEntries — мітка на підпункті «Витрати»", () => {
  it("рахує кожну витрату за її власний належний місяць", () => {
    // 26 вересня: вода винна за вересень, комуналка — ні (серпень внесено).
    expect(countOutstandingMonthEntries([utilities, water], entries, "2026-09-26")).toBe(1);
    // 10 жовтня: вода винна за жовтень, комуналка — за вересень.
    expect(countOutstandingMonthEntries([utilities, water], entries, "2026-10-10")).toBe(2);
  });

  it("не мовчить про комуналку лише тому, що в поточному місяці вона не винна", () => {
    expect(countOutstandingMonthEntries([utilities], entries, "2026-10-12")).toBe(1);
    const withSeptember = new Map(entries);
    withSeptember.set("utilities", [...(entries.get("utilities") ?? []), entry("utilities", "2026-09-30")]);
    expect(countOutstandingMonthEntries([utilities], withSeptember, "2026-10-12")).toBe(0);
  });
});
