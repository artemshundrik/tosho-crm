import { describe, expect, it } from "vitest";
import {
  businessReleaseBullets,
  summarizeDay,
  summarizeWeek,
  techReleaseLine,
  weeklyReleaseLine,
} from "./releasesDigest";
import type { ScopedChange } from "../../../src/lib/releaseHistory";

/**
 * Ці рядки йдуть у Telegram власнику й SEO. Помилка не падає — вона просто
 * показує неправильні цифри або, гірше, цифри тому, кому їх слати не мали.
 */

function change(patch: Partial<ScopedChange>): ScopedChange {
  return {
    sha: patch.sha ?? "abc12345",
    type: patch.type ?? "feat",
    scope: patch.scope ?? null,
    subject: patch.subject ?? "щось зроблено",
    releasedAt: patch.releasedAt ?? "2026-08-07T12:00:00+03:00",
    ...(patch.plain ? { plain: patch.plain } : {}),
  };
}

describe("рядок у тех-звіт", () => {
  it("цифри + людська назва топ-справи", () => {
    const summary = summarizeDay([
      change({ sha: "1", releasedAt: "2026-08-07T11:58:00+03:00" }),
      change({
        sha: "2",
        releasedAt: "2026-08-07T12:30:00+03:00",
        subject: "DateTimeInput на панель",
        plain: "поля дати на спільній панелі",
      }),
    ]);
    const line = techReleaseLine(summary);
    expect(line).toContain("2 змін");
    expect(line).toContain("≈");
    // Переказ важливіший за технічну тему.
    expect(summarizeDay([change({ plain: "людська назва" })]).topTitle).toBe("людська назва");
  });

  it("день без релізів — рядка немає взагалі, а не «0 змін»", () => {
    expect(techReleaseLine(summarizeDay([]))).toBeNull();
  });
});

describe("справи для SEO", () => {
  it("до трьох справ, людською, без цифр", () => {
    const bullets = businessReleaseBullets([
      change({ sha: "1", subject: "перша", releasedAt: "2026-08-07T10:00:00+03:00" }),
      change({ sha: "2", subject: "друга інша", releasedAt: "2026-08-07T11:00:00+03:00" }),
      change({ sha: "3", subject: "третя окрема", releasedAt: "2026-08-07T12:00:00+03:00" }),
      change({ sha: "4", subject: "четверта зайва", releasedAt: "2026-08-07T13:00:00+03:00" }),
    ]);
    expect(bullets).toHaveLength(3);
    expect(bullets.join(" ")).not.toMatch(/\d+ змін/);
  });

  it("порожній день — порожній список", () => {
    expect(businessReleaseBullets([])).toEqual([]);
  });
});

describe("тижневий рядок", () => {
  it("сумує дні й називає найбільші розділи", () => {
    const day = (dayKey: string, scope: string, n: number) =>
      Array.from({ length: n }, (_, i) =>
        change({ sha: `${dayKey}-${i}`, scope, releasedAt: `${dayKey}T1${i}:00:00+03:00` })
      );
    const summary = summarizeWeek([
      day("2026-08-04", "team", 3),
      day("2026-08-05", "chat", 2),
      [],
    ]);
    expect(summary.count).toBe(5);
    expect(summary.topScopes[0]).toBe("Команда");
    expect(weeklyReleaseLine(summary)).toContain("5 змін");
  });

  it("тиждень без релізів — рядка немає", () => {
    expect(weeklyReleaseLine(summarizeWeek([[], []]))).toBeNull();
  });
});
