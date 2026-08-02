import { describe, expect, it } from "vitest";
import { isQuietHour, kyivHour } from "./quietHours";

// Крон ходить о :05 КОЖНОЇ години UTC. Перевіряємо кожен із 24 прогонів.
describe("тихі години", () => {
  it("нічний прогін 21:05 UTC = 00:05 Києва — мовчить", () => {
    const midnightKyiv = new Date("2026-08-02T21:05:00Z");
    expect(kyivHour(midnightKyiv)).toBe(0);
    expect(isQuietHour(midnightKyiv)).toBe(true);
  });

  it("о 06:05 UTC = 09:05 Києва — перший дозволений прогін", () => {
    const morning = new Date("2026-08-03T06:05:00Z");
    expect(kyivHour(morning)).toBe(9);
    expect(isQuietHour(morning)).toBe(false);
  });

  it("о 08:05 Києва ще тихо (щоб не випередити 9:00)", () => {
    expect(isQuietHour(new Date("2026-08-03T05:05:00Z"))).toBe(true);
  });

  it("о 20:05 Києва ще можна, о 21:05 вже ні", () => {
    expect(isQuietHour(new Date("2026-08-03T17:05:00Z"))).toBe(false);
    expect(isQuietHour(new Date("2026-08-03T18:05:00Z"))).toBe(true);
  });

  it("усі 24 прогони: рівно 12 дозволених, і всі підряд 9..20", () => {
    const allowed: number[] = [];
    for (let h = 0; h < 24; h += 1) {
      const at = new Date(Date.UTC(2026, 7, 3, h, 5));
      if (!isQuietHour(at)) allowed.push(kyivHour(at));
    }
    expect(allowed.sort((a, b) => a - b)).toEqual([9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
  });

  it("узимку (UTC+2) вікно те саме за київським часом", () => {
    expect(isQuietHour(new Date("2026-01-15T22:05:00Z"))).toBe(true);  // 00:05 Kyiv
    expect(isQuietHour(new Date("2026-01-15T07:05:00Z"))).toBe(false); // 09:05 Kyiv
  });
});
