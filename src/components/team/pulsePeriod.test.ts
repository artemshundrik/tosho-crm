import { describe, expect, it } from "vitest";
import { bucketOf, formatPulsePeriod, getPulsePeriod, toDateOnly } from "@/components/team/pulsePeriod";

// Tuesday, 21 July 2026, 17:40 local.
const NOW = new Date(2026, 6, 21, 17, 40, 0);

function span(range: Parameters<typeof getPulsePeriod>[0], offset: number) {
  const period = getPulsePeriod(range, offset, NOW);
  return [toDateOnly(period.start), toDateOnly(period.end)];
}

describe("getPulsePeriod", () => {
  it("day covers exactly one calendar day, from local midnight", () => {
    const { start } = getPulsePeriod("day", 0, NOW);
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
    expect(span("day", 0)).toEqual(["2026-07-21", "2026-07-22"]);
  });

  it("steps back a day, a week, a month and a year", () => {
    expect(span("day", -1)).toEqual(["2026-07-20", "2026-07-21"]);
    expect(span("week", -1)).toEqual(["2026-07-13", "2026-07-20"]);
    expect(span("month", -1)).toEqual(["2026-06-01", "2026-07-01"]);
    expect(span("year", -1)).toEqual(["2025-01-01", "2026-01-01"]);
  });

  it("week starts on Monday, not on the current weekday", () => {
    // NOW is a Tuesday, so the week must start the day before.
    expect(span("week", 0)).toEqual(["2026-07-20", "2026-07-27"]);
  });

  it("treats Sunday as the last day of the week, not the first", () => {
    const sunday = new Date(2026, 6, 26, 12, 0, 0);
    const { start, end } = getPulsePeriod("week", 0, sunday);
    expect(toDateOnly(start)).toBe("2026-07-20");
    expect(toDateOnly(end)).toBe("2026-07-27");
  });

  it("month and year are whole calendar periods", () => {
    expect(span("month", 0)).toEqual(["2026-07-01", "2026-08-01"]);
    expect(span("year", 0)).toEqual(["2026-01-01", "2027-01-01"]);
  });

  it("rolls over year boundaries when stepping months back", () => {
    const january = new Date(2026, 0, 15, 9, 0, 0);
    const { start, end } = getPulsePeriod("month", -1, january);
    expect(toDateOnly(start)).toBe("2025-12-01");
    expect(toDateOnly(end)).toBe("2026-01-01");
  });

  it("produces a half-open range so periods never overlap", () => {
    const a = getPulsePeriod("day", -1, NOW);
    const b = getPulsePeriod("day", 0, NOW);
    expect(a.end.getTime()).toBe(b.start.getTime());
  });
});

describe("formatPulsePeriod", () => {
  function label(range: Parameters<typeof getPulsePeriod>[0], offset: number) {
    const { start, end } = getPulsePeriod(range, offset, NOW);
    return formatPulsePeriod(range, offset, start, end);
  }

  it("names the current and previous day", () => {
    expect(label("day", 0)).toBe("Сьогодні");
    expect(label("day", -1)).toBe("Вчора");
  });

  it("spells out older days", () => {
    expect(label("day", -3)).toContain("18");
  });

  it("shows a week as a date span", () => {
    expect(label("week", 0)).toBe("20–26 липня");
  });

  it("shows both months when a week straddles them", () => {
    const straddling = new Date(2026, 6, 2, 12, 0, 0); // week of 29 Jun – 5 Jul
    const { start, end } = getPulsePeriod("week", 0, straddling);
    expect(formatPulsePeriod("week", 0, start, end)).toBe("29 черв.–5 липня");
  });

  it("labels month and year", () => {
    expect(label("month", 0)).toContain("2026");
    expect(label("year", 0)).toBe("2026");
  });
});

describe("bucketOf", () => {
  it("picks a chart granularity that fits the period", () => {
    expect(bucketOf("day")).toBe("hour");
    expect(bucketOf("week")).toBe("day");
    expect(bucketOf("month")).toBe("day");
    expect(bucketOf("year")).toBe("month");
  });
});
