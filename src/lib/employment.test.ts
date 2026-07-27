import { describe, expect, it } from "vitest";

import { getWorkAnniversaryInsight } from "./employment";

/**
 * Річниця роботи рахується від дати старту, і найтонше місце — перший день.
 * Раніше нульовий стаж примусово підтягувався до «1 рік», і людина, яка вийшла
 * сьогодні, отримувала в картці плашку «Сьогодні 1 рік».
 */
describe("getWorkAnniversaryInsight", () => {
  const today = new Date(2026, 6, 27); // 27.07.2026, локальна дата

  it("у перший день не святкує річницю, а веде до першої — через рік", () => {
    const insight = getWorkAnniversaryInsight("2026-07-27", today);

    expect(insight?.years).toBe(1);
    expect(insight?.daysUntil).toBe(365);
    expect(insight?.label).toBe("До 1 року");
    expect(insight?.dateLabel).toBe("27.07.2027");
  });

  it("у справжню річницю показує рівно стільки років, скільки відпрацьовано", () => {
    const insight = getWorkAnniversaryInsight("2024-07-27", today);

    expect(insight?.years).toBe(2);
    expect(insight?.daysUntil).toBe(0);
    expect(insight?.label).toBe("Сьогодні 2 роки");
  });

  it("рахує найближчу річницю, коли цьогорічна вже минула", () => {
    const insight = getWorkAnniversaryInsight("2025-01-15", today);

    expect(insight?.years).toBe(2);
    expect(insight?.dateLabel).toBe("15.01.2027");
  });

  it("для дати старту в майбутньому веде до річниці, а не до самого виходу", () => {
    const insight = getWorkAnniversaryInsight("2026-09-01", today);

    expect(insight?.years).toBe(1);
    expect(insight?.dateLabel).toBe("01.09.2027");
  });

  it("без дати старту нічого не показує", () => {
    expect(getWorkAnniversaryInsight(null, today)).toBeNull();
    expect(getWorkAnniversaryInsight("", today)).toBeNull();
  });
});
