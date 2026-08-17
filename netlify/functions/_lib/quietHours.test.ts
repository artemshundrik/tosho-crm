import { describe, expect, it } from "vitest";
import { isQuietHour, kyivHour } from "./quietHours";

// Крон ходить о :00 КОЖНОЇ години UTC. Перевіряємо кожен із 24 прогонів.
describe("тихі години", () => {
  it("нічний прогін 21:00 UTC = 00:00 Києва — мовчить", () => {
    const midnightKyiv = new Date("2026-08-02T21:00:00Z");
    expect(kyivHour(midnightKyiv)).toBe(0);
    expect(isQuietHour(midnightKyiv)).toBe(true);
  });

  it("о 05:00 UTC = 08:00 Києва — перший дозволений прогін", () => {
    const morning = new Date("2026-08-03T05:00:00Z");
    expect(kyivHour(morning)).toBe(8);
    expect(isQuietHour(morning)).toBe(false);
  });

  it("о 07:00 Києва ще тихо (щоб не випередити 8:00)", () => {
    expect(isQuietHour(new Date("2026-08-03T04:00:00Z"))).toBe(true);
  });

  it("о 20:00 Києва ще можна, о 21:00 вже ні", () => {
    expect(isQuietHour(new Date("2026-08-03T17:00:00Z"))).toBe(false);
    expect(isQuietHour(new Date("2026-08-03T18:00:00Z"))).toBe(true);
  });

  it("усі 24 прогони: рівно 13 дозволених, і всі підряд 8..20", () => {
    const allowed: number[] = [];
    for (let h = 0; h < 24; h += 1) {
      const at = new Date(Date.UTC(2026, 7, 3, h, 0));
      if (!isQuietHour(at)) allowed.push(kyivHour(at));
    }
    expect(allowed.sort((a, b) => a - b)).toEqual([8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
  });

  it("узимку (UTC+2) вікно те саме за київським часом", () => {
    expect(isQuietHour(new Date("2026-01-15T22:00:00Z"))).toBe(true);  // 00:00 Kyiv
    expect(isQuietHour(new Date("2026-01-15T05:00:00Z"))).toBe(true);  // 07:00 Kyiv
    expect(isQuietHour(new Date("2026-01-15T06:00:00Z"))).toBe(false); // 08:00 Kyiv
  });
});
