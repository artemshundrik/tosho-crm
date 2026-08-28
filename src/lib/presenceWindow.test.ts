import { describe, expect, it } from "vitest";

import {
  CLOCK_SKEW_TOLERANCE_MS,
  derivePresence,
  IDLE_WINDOW_MS,
  ONLINE_WINDOW_MS,
} from "./presenceWindow";

const MINUTE = 60_000;

describe("derivePresence", () => {
  it("себе людина бачить онлайн завжди — вкладка ж відкрита", () => {
    // Симптом власника 20.08.2026: «я зараз онлайн, а мені пише, що був
    // хвилину тому». Позначка в базі стара — сам факт роботи в CRM свіжий.
    expect(derivePresence({ hasRealtime: false, ageMs: 4 * MINUTE, isSelf: true })).toEqual({
      online: true,
      idle: false,
    });
  });

  it("realtime — миттєвий онлайн, без огляду на вік позначки", () => {
    expect(derivePresence({ hasRealtime: true, ageMs: 30 * MINUTE, isSelf: false }).online).toBe(true);
  });

  it("вікно переживає пропущений удар серця в запасному режимі", () => {
    // Запасний режим пише раз на 60 с. Стара межа 45 с гасила людину між
    // ударами — саме через це присутність блимала.
    expect(derivePresence({ hasRealtime: false, ageMs: 70_000, isSelf: false }).online).toBe(true);
    expect(ONLINE_WINDOW_MS).toBeGreaterThan(2 * 60_000);
  });

  it("після вікна — «щойно відлучився», а не зникнення зі списку", () => {
    const state = derivePresence({ hasRealtime: false, ageMs: 5 * MINUTE, isSelf: false });
    expect(state).toEqual({ online: false, idle: true });
  });

  it("давно не було — ні онлайн, ні idle", () => {
    expect(derivePresence({ hasRealtime: false, ageMs: IDLE_WINDOW_MS + 1, isSelf: false })).toEqual({
      online: false,
      idle: false,
    });
  });

  it("позначка з майбутнього НЕ робить людину онлайн назавжди", () => {
    // REQ-184: last_seen_at пише клієнт своїм годинником. Годинник, що спішить
    // на три години, кладе в базу час на три години вперед — і всі інші бачать
    // людину онлайн доти, доки реальний час його не наздожене. Вік позначки
    // при цьому від'ємний, а «менше за вікно» від'ємне число проходить завжди.
    const state = derivePresence({ hasRealtime: false, ageMs: -3 * 60 * MINUTE, isSelf: false });
    expect(state).toEqual({ online: false, idle: false });
  });

  it("дрібний розбіг годинників — це свіжа позначка, а не збій", () => {
    // Кілька секунд уперед набігає на будь-якій машині без NTP. Гасити через це
    // присутність означало б лікувати здорових.
    expect(derivePresence({ hasRealtime: false, ageMs: -20_000, isSelf: false }).online).toBe(true);
    expect(CLOCK_SKEW_TOLERANCE_MS).toBeGreaterThanOrEqual(60_000);
  });

  it("живий канал і власна вкладка сильніші за будь-який годинник", () => {
    // Обидва не спираються на час у базі: realtime — це відкрите з'єднання,
    // а себе людина бачить онлайн, поки дивиться на екран.
    const skew = { ageMs: -5 * 60 * MINUTE };
    expect(derivePresence({ ...skew, hasRealtime: true, isSelf: false }).online).toBe(true);
    expect(derivePresence({ ...skew, hasRealtime: false, isSelf: true }).online).toBe(true);
  });
});
