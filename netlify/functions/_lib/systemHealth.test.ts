import { describe, expect, it } from "vitest";
import { cronSignals, isRareSchedule, missedRareRun } from "../_systemHealth";

/**
 * Ці сигнали щоранку йдуть власнику в Telegram. Помилка тут не падає — вона
 * або кричить про справну систему (і звіт перестають читати), або мовчить про
 * зламану. Обидва боки перевіряємо на реальних розкладах із прода.
 */

const MONTH_CLOSE_SOFT = { jobname: "finance-month-close-soft", schedule: "0 6 25 * *", failures: 0, runs: 0, hours_since_last_run: null };
const MONTH_CLOSE_FINAL = { jobname: "finance-month-close-final", schedule: "0 6 5 * *", failures: 0, runs: 0, hours_since_last_run: null };
const DIGEST_TECH = { jobname: "digest-tech", schedule: "45 4 * * *", failures: 0, runs: 1, hours_since_last_run: 2 };

function texts(signals: Array<{ text: string }>) {
  return signals.map((signal) => signal.text).join(" | ");
}

describe("рідкісні розклади", () => {
  it("місячний розклад упізнається, щоденний — ні", () => {
    expect(isRareSchedule("0 6 25 * *")).toBe(true);
    expect(isRareSchedule("45 4 * * *")).toBe(false);
    expect(isRareSchedule("10 * * * *")).toBe(false);
  });

  it("день джоба ще не настав — це не пропуск", () => {
    // 11 серпня: до 25-го ще два тижні.
    expect(missedRareRun("0 6 25 * *", new Date("2026-08-11T04:45:00Z"))).toBe(false);
  });

  it("ранок після пропущеного дня — пропуск", () => {
    expect(missedRareRun("0 6 25 * *", new Date("2026-08-26T04:45:00Z"))).toBe(true);
  });

  it("давно минулий день не винен вічно", () => {
    // 5 серпня минуло майже тиждень тому: джоб могли завести вже після нього.
    expect(missedRareRun("0 6 5 * *", new Date("2026-08-11T04:45:00Z"))).toBe(false);
  });

  it("перше число: попередній запуск шукається в минулому місяці", () => {
    expect(missedRareRun("0 6 1 * *", new Date("2026-03-01T07:00:00Z"))).toBe(true);
    expect(missedRareRun("0 6 1 * *", new Date("2026-03-04T07:00:00Z"))).toBe(false);
  });
});

describe("сигнали cron", () => {
  it("місячні джоби, чий день не настав, у звіт не потрапляють", () => {
    const signals = cronSignals(
      [MONTH_CLOSE_SOFT, MONTH_CLOSE_FINAL, DIGEST_TECH],
      0,
      0,
      new Date("2026-08-11T04:45:00Z")
    );
    expect(texts(signals)).not.toContain("month-close");
    // Мовчання не означає «джоба немає»: він рахується здоровим.
    expect(texts(signals)).toContain("3/3");
  });

  it("пропущений місячний запуск таки видно", () => {
    const signals = cronSignals([MONTH_CLOSE_SOFT], 0, 0, new Date("2026-08-26T04:45:00Z"));
    expect(texts(signals)).toContain("finance-month-close-soft");
    expect(signals.some((signal) => signal.tone === "warning")).toBe(true);
  });

  it("місячний джоб, який відпрацював вчасно, не рахується протухлим", () => {
    // 26.08.2026 о 12:58 власнику прилетів ЧЕРВОНИЙ алерт «Cron
    // finance-month-close-soft: не запускався 27 год». Джоб відпрацював
    // 25-го о 06:00 і повернув «1 row» — тобто зробив рівно те, що мав.
    // Для місячного розкладу доба без запуску — норма 29 днів із 30, а стеля
    // в 24 години світила б червоним ЩОМІСЯЦЯ по шість днів поспіль, доки
    // запуск не випаде з семиденного вікна пошуку.
    const ranOnTime = { ...MONTH_CLOSE_SOFT, runs: 1, hours_since_last_run: 28.5 };
    const signals = cronSignals([ranOnTime], 0, 0, new Date("2026-08-26T10:30:00Z"));
    expect(texts(signals)).not.toContain("не запускався");
    expect(signals.every((signal) => signal.tone === "good")).toBe(true);
  });

  it("щоденний джоб протухає як і раніше — стеля доби нікуди не зникла", () => {
    const stale = { ...DIGEST_TECH, hours_since_last_run: 28.5 };
    const signals = cronSignals([stale], 0, 0, new Date("2026-08-26T10:30:00Z"));
    expect(texts(signals)).toContain("не запускався");
  });

  it("місячний джоб, який ПРОПУСТИВ свій день, лишається протухлим", () => {
    // Запуск є, але він старіший за останнє спрацювання за розкладом:
    // 25-те минуло, а джоб востаннє бігав 24-го.
    const missed = { ...MONTH_CLOSE_SOFT, runs: 1, hours_since_last_run: 60 };
    const signals = cronSignals([missed], 0, 0, new Date("2026-08-26T10:30:00Z"));
    expect(texts(signals)).toContain("не запускався");
  });

  it("поодинокі таймаути мовчать, регулярні — ні", () => {
    const quiet = cronSignals([DIGEST_TECH], 0, 3, new Date("2026-08-11T04:45:00Z"));
    expect(texts(quiet)).not.toContain("30 с");

    const loud = cronSignals([DIGEST_TECH], 0, 40, new Date("2026-08-11T04:45:00Z"));
    expect(texts(loud)).toContain("30 с");
  });

  it("справжня відмова 4xx/5xx показується завжди", () => {
    const signals = cronSignals([DIGEST_TECH], 1, 0, new Date("2026-08-11T04:45:00Z"));
    expect(texts(signals)).toContain("4xx/5xx");
  });
});
