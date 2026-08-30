import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildDeadlineTabBadge,
  deadlineDiffDays,
  isDesignDeadlineAfterAnswer,
  parseDeadlineDate,
} from "./deadlineLabels";

/**
 * Підпис вкладки «Дедлайни» — те місце, де раніше висіло обрізане
 * «Прострочено (…». Тепер він мусить лишатись коротким і однією мовою в
 * КОЖНОМУ стані: варто одній гілці повернути слово або дату, і коробка на
 * 96 px знову почне різати саме число.
 */

// Дедлайни — настінний час, тому й «сьогодні» ставимо настінне.
const setToday = (iso: string) => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(`${iso}T09:00:00`));
};

afterEach(() => {
  vi.useRealTimers();
});

describe("deadlineDiffDays", () => {
  it("рахує по добах, а не по годинах", () => {
    setToday("2026-08-29");
    // Дедлайн сьогодні о 10:00. О 9-й це «сьогодні», і об 11-й теж — доба та сама.
    expect(deadlineDiffDays("2026-08-29T10:00")).toBe(0);
    vi.setSystemTime(new Date("2026-08-29T23:30:00"));
    expect(deadlineDiffDays("2026-08-29T10:00")).toBe(0);
  });

  it("ігнорує пояс у хвості — дата настінна", () => {
    setToday("2026-08-29");
    expect(deadlineDiffDays("2026-08-30T10:00:00+00:00")).toBe(1);
    expect(deadlineDiffDays("2026-08-30T10:00:00Z")).toBe(1);
  });

  it("без дедлайну не рахує нічого", () => {
    setToday("2026-08-29");
    expect(deadlineDiffDays(null)).toBeNull();
    expect(deadlineDiffDays("")).toBeNull();
    expect(deadlineDiffDays("не дата")).toBeNull();
  });
});

describe("buildDeadlineTabBadge", () => {
  it("говорить однією мовою в усіх станах", () => {
    setToday("2026-08-29");
    const label = (value: string) => buildDeadlineTabBadge(value)?.label;

    expect(label("2026-08-05T10:00")).toBe("−24 дн");
    expect(label("2026-08-29T10:00")).toBe("Сьогодні");
    expect(label("2026-08-30T10:00")).toBe("+1 дн");
    expect(label("2026-11-13T10:00")).toBe("+76 дн");
  });

  it("тримається в межах коробки на 96 px", () => {
    setToday("2026-08-29");
    // Найдовший можливий підпис — «Сьогодні» (8 знаків). Числові — коротші за
    // «−999 дн». Старий «Прострочено (24 дн.) · 10:00» мав 28 знаків і різався.
    const longest = ["2020-01-01T10:00", "2026-08-29T10:00", "2030-12-31T10:00"]
      .map((v) => buildDeadlineTabBadge(v)?.label ?? "")
      .reduce((a, b) => (a.length >= b.length ? a : b));
    expect(longest.length).toBeLessThanOrEqual(9);
  });

  it("колір несе стан: прострочене червоне, близьке бурштинове, далеке без кольору", () => {
    setToday("2026-08-29");
    const tone = (value: string) => buildDeadlineTabBadge(value)?.toneClass;

    expect(tone("2026-08-05T10:00")).toBe("text-danger-foreground");
    expect(tone("2026-08-28T10:00")).toBe("text-danger-foreground");
    expect(tone("2026-08-29T10:00")).toBe("text-warning-foreground");
    expect(tone("2026-08-30T10:00")).toBe("text-warning-foreground");
    expect(tone("2026-08-31T10:00")).toBe("text-warning-foreground");
    // Третій день уже не «скоро» — той самий поріг, що в getDeadlineBadge.
    expect(tone("2026-09-01T10:00")).toBeNull();
  });

  it("без дедлайну підпису немає — про це говорить червона крапка", () => {
    setToday("2026-08-29");
    expect(buildDeadlineTabBadge(null)).toBeNull();
  });
});

describe("parseDeadlineDate", () => {
  it("читає настінний час, не перераховуючи в пояс браузера", () => {
    expect(parseDeadlineDate("2026-08-29T15:30:00+00:00")?.getHours()).toBe(15);
    expect(parseDeadlineDate("2026-08-29")?.getDate()).toBe(29);
  });
});

describe("isDesignDeadlineAfterAnswer", () => {
  it("макет після відповіді — попереджаємо", () => {
    expect(isDesignDeadlineAfterAnswer("2026-09-02T12:00", "2026-08-05T12:00")).toBe(true);
  });

  it("макет раніше або в один час — нічого не сталося", () => {
    expect(isDesignDeadlineAfterAnswer("2026-08-01T12:00", "2026-08-05T12:00")).toBe(false);
    expect(isDesignDeadlineAfterAnswer("2026-08-05T12:00", "2026-08-05T12:00")).toBe(false);
  });

  it("той самий день, але макет пізніше по годинах — теж пастка", () => {
    expect(isDesignDeadlineAfterAnswer("2026-08-05T18:00", "2026-08-05T10:00")).toBe(true);
  });

  it("однієї з дат немає — не порівнюємо", () => {
    expect(isDesignDeadlineAfterAnswer(null, "2026-08-05T12:00")).toBe(false);
    expect(isDesignDeadlineAfterAnswer("2026-08-05T12:00", null)).toBe(false);
    expect(isDesignDeadlineAfterAnswer(null, null)).toBe(false);
  });
});
