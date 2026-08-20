import { describe, expect, it } from "vitest";

import { formatPulsePresence } from "./pulsePresence";

const NOW = new Date("2026-08-20T12:00:00Z");
const agoMinutes = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString();

describe("formatPulsePresence", () => {
  it("онлайн ніколи не описується через «тому»", () => {
    // Позначка присутності пишеться раз на кілька хвилин, тож у людини за
    // клавіатурою вона завжди «стара». Зелена крапка й підпис не мають сперечатись.
    expect(
      formatPulsePresence(
        { online: true, actions: 0, minutes: 30, lastSeenAt: agoMinutes(1) },
        NOW
      )
    ).toBe("Зараз онлайн");
  });

  it("онлайн із діями показує ще й останню дію", () => {
    expect(
      formatPulsePresence(
        { online: true, actions: 4, minutes: 30, lastActiveAt: agoMinutes(12) },
        NOW
      )
    ).toBe("Зараз онлайн · остання дія 12 хв тому");
  });

  it("присутність без дій тепер каже КОЛИ, а не просто «без дій»", () => {
    expect(
      formatPulsePresence(
        { online: false, actions: 0, minutes: 45, lastSeenAt: agoMinutes(95) },
        NOW
      )
    ).toBe("Остання присутність 1 год 35 хв тому, без дій");
  });

  it("жоден підпис не має роду — CRM не знає, «був» це чи «була»", () => {
    const variants = [
      formatPulsePresence({ online: false, actions: 0, minutes: 45, lastSeenAt: agoMinutes(95) }, NOW),
      formatPulsePresence({ online: false, actions: 0, minutes: 0, lastSeenAt: agoMinutes(95) }, NOW),
      formatPulsePresence({ online: false, actions: 0, minutes: 0 }, NOW),
      formatPulsePresence({ online: true, actions: 0, minutes: 5 }, NOW),
    ];
    for (const text of variants) {
      expect(text).not.toMatch(/\bбув\b|\bбула\b|заходив|заходила/i);
    }
  });

  it("немає дій і хвилин — беремо час візиту з присутності", () => {
    expect(
      formatPulsePresence({ online: false, actions: 0, minutes: 0, lastSeenAt: agoMinutes(200) }, NOW)
    ).toBe("Остання присутність 3 год 20 хв тому");
  });

  it("дії є — рахуємо від останньої дії, а не від візиту", () => {
    expect(
      formatPulsePresence(
        { online: false, actions: 7, minutes: 60, lastActiveAt: agoMinutes(91), lastSeenAt: agoMinutes(5) },
        NOW
      )
    ).toBe("Остання дія 1 год 31 хв тому");
  });

  it("жодного сліду — так і кажемо, без вигаданого часу", () => {
    expect(formatPulsePresence({ online: false, actions: 0, minutes: 0 }, NOW)).toBe("Візитів ще не було");
  });
});
