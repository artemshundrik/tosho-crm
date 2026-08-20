import { describe, expect, it } from "vitest";

import { derivePresence, IDLE_WINDOW_MS, ONLINE_WINDOW_MS } from "./presenceWindow";

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
});
