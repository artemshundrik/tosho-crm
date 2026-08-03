import { describe, expect, it } from "vitest";
import { countQuotaDaysInYear } from "./teamAbsenceCalendar";

// Свята, реально внесені в прод (2026 хвіст + 2027 робочі дні).
const prodHolidays = new Map<string, boolean>([
  ["2026-08-24", false], ["2026-10-01", false], ["2026-12-25", false],
  ["2027-01-01", false], ["2027-03-08", false], ["2027-06-28", false],
  ["2027-07-15", false], ["2027-08-24", false], ["2027-10-01", false],
]);

// Очікування взяті з ПРОДА: SQL tosho.count_absence_quota_days на тих самих
// діапазонах. Тест ловить розбіжність фронтової та серверної математики.
const cases: Array<[string, "vacation" | "day_off" | "sick_leave", string, string, number]> = [
  ["Марина, відпустка 03–16.08", "vacation", "2026-08-03", "2026-08-16", 14],
  ["Лєна, day-off 03.08", "day_off", "2026-08-03", "2026-08-03", 1],
  ["Лєна, лікарняний 13.07", "sick_leave", "2026-07-13", "2026-07-13", 1],
  ["відпустка через свято 21–26.08", "vacation", "2026-08-21", "2026-08-26", 5],
];

describe("паритет із БД: count_absence_quota_days", () => {
  it.each(cases)("%s", (_label, kind, from, to, expected) => {
    expect(countQuotaDaysInYear(kind, { startDate: from, endDate: to }, Number(from.slice(0, 4)), prodHolidays))
      .toBe(expected);
  });
});
