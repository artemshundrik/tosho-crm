import { describe, expect, it } from "vitest";

import {
  expandSchedulesToAbsences,
  isoWeekday,
  normalizeWorkMode,
  parseScheduleDays,
  scheduleForDate,
  type TeamWorkSchedule,
} from "./teamWorkSchedule";
import type { TeamAbsence } from "./teamAbsences";

/** Графік бухгалтерки з запиту REQ-166: пн, ср, чт — в офісі; вт і пт — з дому. */
const YULIA: TeamWorkSchedule = {
  id: "sched-1",
  userId: "yulia",
  days: { 1: "office", 2: "remote", 3: "office", 4: "office", 5: "remote" },
  effectiveFrom: "2026-09-01",
  effectiveTo: null,
};

const absence = (overrides: Partial<TeamAbsence> = {}): TeamAbsence => ({
  id: "abs-1",
  userId: "yulia",
  startDate: "2026-09-01",
  endDate: "2026-09-01",
  kind: "vacation",
  status: "approved",
  comment: null,
  requestedBy: null,
  decidedBy: null,
  decidedAt: null,
  createdAt: null,
  ...overrides,
});

describe("розбір графіка", () => {
  it("день тижня рахується за ISO: понеділок перший, неділя сьома", () => {
    expect(isoWeekday("2026-08-31")).toBe(1);
    expect(isoWeekday("2026-09-06")).toBe(7);
  });

  it("невідомий режим дня — це «немає запису», а не мовчазний офіс", () => {
    // Мовчазний дефолт ховав би одруку в даних: графік показував би офіс там,
    // де насправді ніхто нічого не задавав.
    expect(normalizeWorkMode("remote")).toBe("remote");
    expect(normalizeWorkMode("вдома")).toBeNull();
    expect(normalizeWorkMode(null)).toBeNull();
  });

  it("дні приймаються і числами, і рядками — jsonb віддає ключі рядками", () => {
    expect(parseScheduleDays({ "2": "remote", "8": "remote", "3": "офіс" })).toEqual({ 2: "remote" });
  });
});

describe("який графік діє на дату", () => {
  it("до дати початку графіка немає", () => {
    expect(scheduleForDate([YULIA], "2026-08-31")).toBeNull();
    expect(scheduleForDate([YULIA], "2026-09-01")).toBe(YULIA);
  });

  it("скасований графік не діє після дати завершення", () => {
    const ended = { ...YULIA, effectiveTo: "2026-09-30" };
    expect(scheduleForDate([ended], "2026-09-30")).toBe(ended);
    expect(scheduleForDate([ended], "2026-10-01")).toBeNull();
  });

  it("із двох чинних діє найновіший — графік міняють, а не накопичують", () => {
    const older = { ...YULIA, id: "old", effectiveFrom: "2026-01-01" };
    const newer = { ...YULIA, id: "new", effectiveFrom: "2026-09-01" };
    expect(scheduleForDate([older, newer], "2026-09-10")?.id).toBe("new");
  });
});

describe("розгортання графіка у дні", () => {
  const window = { from: "2026-09-01", to: "2026-09-07" };

  it("з дому — лише в дні графіка, офісні дні не малюються", () => {
    const rows = expandSchedulesToAbsences({ schedules: [YULIA], ...window });
    // Вівторок 01.09 і п'ятниця 04.09 — з дому; понеділок 07.09 в офісі.
    expect(rows.map((row) => row.startDate)).toEqual(["2026-09-01", "2026-09-04"]);
    expect(rows.every((row) => row.kind === "wfh")).toBe(true);
    expect(rows.every((row) => row.status === "approved")).toBe(true);
  });

  it("вихідні й свята сильніші за графік", () => {
    // 05.09 субота — вихідний; 04.09 оголошено неробочим (свято) винятком
    // календаря. Свято, що випало на день «з дому», лишається святом.
    const rows = expandSchedulesToAbsences({
      schedules: [{ ...YULIA, days: { 1: "remote", 2: "remote", 3: "remote", 4: "remote", 5: "remote", 6: "remote", 7: "remote" } }],
      ...window,
      exceptions: new Map([["2026-09-04", false]]),
    });
    expect(rows.map((row) => row.startDate)).toEqual([
      "2026-09-01",
      "2026-09-02",
      "2026-09-03",
      "2026-09-07",
    ]);
  });

  it("відпустка перекриває графік — людини немає, а не «вона з дому»", () => {
    const rows = expandSchedulesToAbsences({
      schedules: [YULIA],
      ...window,
      absences: [absence({ startDate: "2026-09-01", endDate: "2026-09-04" })],
    });
    expect(rows).toEqual([]);
  });

  it("разовий запис «з дому» не дублюється графіком", () => {
    const rows = expandSchedulesToAbsences({
      schedules: [YULIA],
      ...window,
      absences: [absence({ kind: "wfh", startDate: "2026-09-01", endDate: "2026-09-01" })],
    });
    expect(rows.map((row) => row.startDate)).toEqual(["2026-09-04"]);
  });

  it("заявка на погодженні графік НЕ перекриває — вона ще нічого не означає", () => {
    const rows = expandSchedulesToAbsences({
      schedules: [YULIA],
      ...window,
      absences: [absence({ status: "pending", startDate: "2026-09-01", endDate: "2026-09-04" })],
    });
    expect(rows).toHaveLength(2);
  });

  it("кожен день має власний стабільний id — інакше React перемішає рядки", () => {
    const first = expandSchedulesToAbsences({ schedules: [YULIA], ...window });
    const second = expandSchedulesToAbsences({ schedules: [YULIA], ...window });
    expect(first.map((row) => row.id)).toEqual(second.map((row) => row.id));
    expect(new Set(first.map((row) => row.id)).size).toBe(first.length);
  });
});
