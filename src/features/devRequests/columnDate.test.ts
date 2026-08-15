import { describe, expect, it } from "vitest";

import { columnDate, columnDateLabel, dateBucket, sortColumn } from "./columnDate";
import type { DevRequest } from "./types";

const NOW = new Date("2026-08-15T12:00:00Z");

function make(number: number, createdAt: string, releasedAt: string | null = null): DevRequest {
  return {
    number,
    createdAt,
    releasedAt,
    status: "released",
  } as unknown as DevRequest;
}

describe("columnDate", () => {
  it("у «Викочено» бере дату викочування, а не створення", () => {
    const request = make(9, "2026-08-09T10:00:00Z", "2026-08-15T17:04:00Z");
    expect(columnDate(request, "released")).toBe("2026-08-15T17:04:00Z");
    expect(columnDate(request, "triage")).toBe("2026-08-09T10:00:00Z");
  });

  it("для «В роботі» дати немає — updated_at не показуємо", () => {
    // Дати переходу в статус у схемі немає, а updated_at змінюється від будь-якої
    // правки. Мітка «в роботі 5 днів» була б вигадкою.
    expect(columnDate(make(1, "2026-08-01T10:00:00Z"), "in_progress")).toBeNull();
    expect(columnDate(make(1, "2026-08-01T10:00:00Z"), "done_local")).toBeNull();
  });
});

describe("sortColumn", () => {
  it("ставить сьогоднішні релізи вгору, хоч заведені вони давно", () => {
    // Точний випадок, який і зламався: REQ-9 та REQ-11 заведені 9 серпня,
    // викочені 15-го разом із REQ-48, і за датою створення падали в кінець.
    const items = [
      make(48, "2026-08-14T09:00:00Z", "2026-08-15T17:04:00Z"),
      make(45, "2026-08-13T09:00:00Z", "2026-08-13T18:00:00Z"),
      make(9, "2026-08-09T09:00:00Z", "2026-08-15T17:04:00Z"),
    ];
    expect(sortColumn(items, "released").map((r) => r.number)).toEqual([48, 9, 45]);
  });

  it("при однаковій даті тримає сталий порядок за номером", () => {
    const same = "2026-08-15T17:04:00Z";
    const items = [make(9, "2026-08-09T09:00:00Z", same), make(49, "2026-08-15T09:00:00Z", same)];
    expect(sortColumn(items, "released").map((r) => r.number)).toEqual([49, 9]);
  });

  it("у чергових колонках сортує за створенням", () => {
    const items = [make(1, "2026-08-10T09:00:00Z"), make(2, "2026-08-14T09:00:00Z")];
    expect(sortColumn(items, "triage").map((r) => r.number)).toEqual([2, 1]);
  });
});

describe("columnDateLabel", () => {
  it("каже «викочено сьогодні» для сьогоднішнього релізу", () => {
    const request = make(9, "2026-08-09T09:00:00Z", "2026-08-15T06:00:00Z");
    expect(columnDateLabel(request, "released", NOW)).toBe("викочено сьогодні");
  });

  it("рахує дні календарно, а не «менш ніж 24 години»", () => {
    // Реліз 14-го вдень і «зараз» 15-го опівдні — це менше доби, але вчора.
    //
    // Час у тесті свідомо не нічний: 14.08 23:30 UTC — це вже 15 серпня за
    // Києвом, і календарно воно «сьогодні». Межа доби тут місцева, бо людина
    // читає підпис у своєму часі, а не в UTC.
    const request = make(9, "2026-08-09T09:00:00Z", "2026-08-14T12:00:00Z");
    expect(columnDateLabel(request, "released", NOW)).toBe("викочено вчора");
  });

  it("у черзі показує вік картки", () => {
    expect(columnDateLabel(make(1, "2026-08-12T09:00:00Z"), "triage", NOW)).toBe("лежить 3 дні");
  });

  it("мовчить там, де чесної дати немає", () => {
    expect(columnDateLabel(make(1, "2026-08-12T09:00:00Z"), "in_progress", NOW)).toBeNull();
  });
});

describe("dateBucket", () => {
  it("розкладає у людські корзини, а не по кожному дню", () => {
    const bucket = (released: string) =>
      dateBucket(make(1, "2026-08-01T09:00:00Z", released), "released", NOW).label;
    expect(bucket("2026-08-15T06:00:00Z")).toBe("Сьогодні");
    expect(bucket("2026-08-14T06:00:00Z")).toBe("Учора");
    expect(bucket("2026-08-11T06:00:00Z")).toBe("Цього тижня");
    expect(bucket("2026-07-25T06:00:00Z")).toBe("Цього місяця");
    expect(bucket("2026-05-01T06:00:00Z")).toBe("Раніше");
  });
});
