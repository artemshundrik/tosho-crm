import { describe, expect, it } from "vitest";
import {
  IN_PROGRESS_STALE_DAYS,
  TRIAGE_STALE_DAYS,
  type BoardCard,
  inProgressLine,
  inboxLine,
  summarizeInbox,
  todayLine,
} from "./devRequestsDigest";

/**
 * Цей рядок щодня читає власник. Помилка тут не падає — вона або мовчить, коли
 * кошик уже гниє, або навпаки щодня показує зайве, і тоді рядок перестають
 * читати ще до того, як він знадобиться.
 */

const NOW = new Date("2026-08-08T09:00:00+03:00");

/** Картка, заведена `days` діб тому (+ година, щоб доба була повною). */
function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000 - 60 * 60 * 1000).toISOString();
}

describe("зріз кошика", () => {
  it("порожній кошик — нулі, а не ділення на нуль", () => {
    expect(summarizeInbox([], NOW)).toEqual({ total: 0, oldestDays: 0, stale: 0 });
  });

  it("рахує кількість, вік найстарішої й скільки перетнули поріг", () => {
    const summary = summarizeInbox([daysAgo(12), daysAgo(4), daysAgo(0), daysAgo(1)], NOW);
    expect(summary.total).toBe(4);
    expect(summary.oldestDays).toBe(12);
    expect(summary.stale).toBe(2);
  });

  it("рівно на порозі — вже залежалась, не «майже»", () => {
    expect(summarizeInbox([daysAgo(TRIAGE_STALE_DAYS)], NOW).stale).toBe(1);
    expect(summarizeInbox([daysAgo(TRIAGE_STALE_DAYS - 1)], NOW).stale).toBe(0);
  });

  it("картка з майбутнього не дає від'ємного віку", () => {
    const summary = summarizeInbox([new Date(NOW.getTime() + 5 * 60 * 1000).toISOString()], NOW);
    expect(summary.oldestDays).toBe(0);
    expect(summary.stale).toBe(0);
  });

  it("бита дата не з'їдає картку з підрахунку", () => {
    const summary = summarizeInbox(["не дата", daysAgo(9)], NOW);
    expect(summary.total).toBe(2);
    expect(summary.oldestDays).toBe(9);
  });
});

describe("рядок про кошик", () => {
  it("порожній кошик — рядка немає взагалі, а не «0 запитів»", () => {
    expect(inboxLine(summarizeInbox([], NOW))).toBeNull();
  });

  it("усе свіже — лише кількість, про вік ані слова", () => {
    const line = inboxLine(summarizeInbox([daysAgo(0), daysAgo(1), daysAgo(2)], NOW));
    expect(line).toBe("📥 Кошик запитів: 3 нові");
    expect(line).not.toContain("чекає");
  });

  it("десять свіжих карток — це робота, а не тривога", () => {
    const line = inboxLine(summarizeInbox(Array.from({ length: 10 }, () => daysAgo(1)), NOW));
    expect(line).toBe("📥 Кошик запитів: 10 нових");
  });

  it("одна свіжа — «1 нова», не «1 нові»", () => {
    expect(inboxLine(summarizeInbox([daysAgo(0)], NOW))).toBe("📥 Кошик запитів: 1 нова");
  });

  it("є залежані — вік найстарішої видно, і в правильному відмінку", () => {
    const line = inboxLine(summarizeInbox([daysAgo(12), daysAgo(5), daysAgo(0), daysAgo(1), daysAgo(2)], NOW));
    expect(line).toBe("📥 Кошик запитів: 5, з них 2 без руху · найстаріша чекає 12 днів");
  });

  it("залежалось усе — кваліфікатор «з них N» не повторює загальне число", () => {
    const line = inboxLine(summarizeInbox([daysAgo(21), daysAgo(9)], NOW));
    expect(line).toBe("📥 Кошик запитів: 2 · найстаріша чекає 21 день");
  });

  it("відмінювання днів на межових значеннях", () => {
    const oldest = (days: number) => inboxLine({ total: 1, oldestDays: days, stale: 1 });
    expect(oldest(1)).toContain("чекає 1 день");
    expect(oldest(2)).toContain("чекає 2 дні");
    expect(oldest(4)).toContain("чекає 4 дні");
    expect(oldest(5)).toContain("чекає 5 днів");
    expect(oldest(11)).toContain("чекає 11 днів");
    expect(oldest(12)).toContain("чекає 12 днів");
    expect(oldest(21)).toContain("чекає 21 день");
    expect(oldest(22)).toContain("чекає 22 дні");
  });

  it("відмінювання кількості на межових значеннях", () => {
    const fresh = (total: number) => inboxLine({ total, oldestDays: 0, stale: 0 });
    expect(fresh(1)).toBe("📥 Кошик запитів: 1 нова");
    expect(fresh(2)).toBe("📥 Кошик запитів: 2 нові");
    expect(fresh(5)).toBe("📥 Кошик запитів: 5 нових");
    expect(fresh(11)).toBe("📥 Кошик запитів: 11 нових");
    expect(fresh(21)).toBe("📥 Кошик запитів: 21 нова");
  });
});

/** Картка «в роботі», яку востаннє чіпали `days` діб тому. */
function card(label: string, days: number | null): BoardCard {
  return {
    label,
    updatedAt: days === null ? null : daysAgo(days),
  };
}

describe("рядок про полицю «Сьогодні»", () => {
  it("набрано — перелічує картки в порядку кладення", () => {
    expect(todayLine([card("REQ-205", 0), card("REQ-210", 0)], 20)).toBe(
      "🎯 Сьогодні: REQ-205 · REQ-210"
    );
  });

  it("не набрано, але черга є — каже, скільки лежить напоготові", () => {
    expect(todayLine([], 20)).toBe("🎯 Сьогодні: не набрано · у черзі 20");
  });

  it("порожньо і в полиці, і в черзі — рядка немає взагалі", () => {
    expect(todayLine([], 0)).toBeNull();
  });
});

describe("рядок про роботу в русі", () => {
  it("нічого не взято — рядка немає", () => {
    expect(inProgressLine([], NOW)).toBeNull();
  });

  it("усе рухається — лише кількість, про застій ані слова", () => {
    const line = inProgressLine([card("REQ-1", 0), card("REQ-2", 3)], NOW);
    expect(line).toBe("🔧 В роботі: 2 картки");
    expect(line).not.toContain("без змін");
  });

  it("частина застигла — видно скільки саме", () => {
    const line = inProgressLine([card("REQ-1", 0), card("REQ-2", 9), card("REQ-3", 30)], NOW);
    expect(line).toBe("🔧 В роботі: 3 картки, з них 2 без змін понад тиждень");
  });

  it("застигло все — кваліфікатор не повторює загальне число", () => {
    expect(inProgressLine([card("REQ-1", 9), card("REQ-2", 30)], NOW)).toBe(
      "🔧 В роботі: 2 картки — усі без змін понад тиждень"
    );
  });

  it("рівно на порозі — вже застигла, не «майже»", () => {
    expect(inProgressLine([card("REQ-1", IN_PROGRESS_STALE_DAYS)], NOW)).toContain("без змін");
    expect(inProgressLine([card("REQ-1", IN_PROGRESS_STALE_DAYS - 1)], NOW)).not.toContain("без змін");
  });

  it("картка без дати зміни не рахується застиглою — це незнання, а не застій", () => {
    expect(inProgressLine([card("REQ-1", null)], NOW)).toBe("🔧 В роботі: 1 картка");
  });

  it("відмінювання карток на межових значеннях", () => {
    const count = (n: number) =>
      inProgressLine(Array.from({ length: n }, (_, i) => card(`REQ-${i}`, 0)), NOW);
    expect(count(1)).toBe("🔧 В роботі: 1 картка");
    expect(count(3)).toBe("🔧 В роботі: 3 картки");
    expect(count(5)).toBe("🔧 В роботі: 5 карток");
    expect(count(11)).toBe("🔧 В роботі: 11 карток");
    expect(count(21)).toBe("🔧 В роботі: 21 картка");
  });
});
