import { describe, expect, it } from "vitest";

import { scheduleRowsForDates } from "./workSchedules";
import type { TeamWorkSchedule } from "../../../src/lib/teamWorkSchedule";

/** Графік із запиту REQ-166: вівторок і п'ятниця — з дому. */
const YULIA: TeamWorkSchedule = {
  id: "s1",
  userId: "yulia",
  days: { 1: "office", 2: "remote", 3: "office", 4: "office", 5: "remote" },
  effectiveFrom: "2026-01-01",
  effectiveTo: null,
};

// 01.09.2026 — вівторок, 02.09 — середа, 04.09 — п'ятниця.
describe("графік для звіту й бота", () => {
  it("домашній день стає звичайним рядком «з дому»", () => {
    const rows = scheduleRowsForDates({
      schedules: [YULIA],
      dateKeys: ["2026-09-01"],
      absences: [],
    });
    expect(rows).toEqual([
      { user_id: "yulia", start_date: "2026-09-01", end_date: "2026-09-01", kind: "wfh" },
    ]);
  });

  it("офісний день не породжує нічого", () => {
    expect(
      scheduleRowsForDates({ schedules: [YULIA], dateKeys: ["2026-09-02"], absences: [] })
    ).toEqual([]);
  });

  it("відпустка з журналу перекриває графік — звіт не скаже «з дому» про людину у відпустці", () => {
    const rows = scheduleRowsForDates({
      schedules: [YULIA],
      dateKeys: ["2026-09-01"],
      absences: [
        { user_id: "yulia", start_date: "2026-08-28", end_date: "2026-09-10", kind: "vacation", status: "approved" },
      ],
    });
    expect(rows).toEqual([]);
  });

  it("свято сильніше за графік", () => {
    const rows = scheduleRowsForDates({
      schedules: [YULIA],
      dateKeys: ["2026-09-01"],
      absences: [],
      exceptions: new Map([["2026-09-01", false]]),
    });
    expect(rows).toEqual([]);
  });

  it("питали один день — відповідаємо про один, а не про весь тиждень", () => {
    // Розгортання працює діапазоном, тож без фільтра «п'ятниця» приїхала б у
    // звіт, замовлений на вівторок.
    const rows = scheduleRowsForDates({
      schedules: [YULIA],
      dateKeys: ["2026-09-01"],
      absences: [],
    });
    expect(rows.map((row) => row.start_date)).toEqual(["2026-09-01"]);
  });

  it("без графіків — порожньо, і жодного запиту в базу не знадобилось", () => {
    expect(scheduleRowsForDates({ schedules: [], dateKeys: ["2026-09-01"], absences: [] })).toEqual([]);
  });
});
