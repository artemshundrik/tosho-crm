import { describe, expect, it } from "vitest";

import { formatLastSeen, isOnline } from "./_teamAssistant";

const NOW = new Date("2026-08-28T12:00:00Z");
const MINUTE = 60_000;
const at = (offsetMs: number) => new Date(NOW.getTime() + offsetMs).toISOString();

/**
 * Присутність у боті рахується окремо від CRM — тими самими даними, але своїм
 * кодом. Саме тому дірка з годинником була ТУТ теж: правило, полагоджене в
 * одному модулі, захищає лише тих, хто його кличе.
 */
describe("присутність в асистенті", () => {
  it("свіжа позначка — онлайн, стара — ні", () => {
    expect(isOnline(at(-MINUTE), NOW)).toBe(true);
    expect(isOnline(at(-30 * MINUTE), NOW)).toBe(false);
    expect(isOnline(null, NOW)).toBe(false);
  });

  it("позначка з майбутнього не робить людину вічно онлайн", () => {
    // REQ-184: годинник клієнта спішить на добу — «менше за 5 хвилин» від'ємне
    // число проходило завжди, і звіт казав «зараз онлайн» про вчорашню людину.
    expect(isOnline(at(24 * 60 * MINUTE), NOW)).toBe(false);
    expect(formatLastSeen(at(24 * 60 * MINUTE), NOW)).not.toContain("онлайн");
  });

  it("дрібний дрейф годинника лишається онлайном", () => {
    expect(isOnline(at(30_000), NOW)).toBe(true);
    expect(formatLastSeen(at(30_000), NOW)).toBe("зараз онлайн");
  });
});
