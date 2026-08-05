import { describe, expect, it } from "vitest";
import { HINT_MAX_SHOWS, shouldShowHint, type HintState } from "./featureHintRules";

/**
 * Помилка в цих умовах не падає — вона просто щодня дратує шістнадцятьох
 * людей. Тому кожне правило зафіксоване окремо.
 */

const NOW = new Date("2026-08-05T12:00:00Z");
const daysAgo = (days: number) =>
  new Date(NOW.getTime() - days * 86_400_000).toISOString();

const fresh: HintState = { shownCount: 0, lastShownAt: null, dismissedAt: null };

describe("кому показуємо", () => {
  it("новачку, який фічу не пробував", () => {
    expect(shouldShowHint({ state: null, uses: 0, now: NOW })).toBe(true);
  });

  it("не показуємо тому, хто вже користується", () => {
    expect(shouldShowHint({ state: null, uses: 1, now: NOW })).toBe(false);
    expect(shouldShowHint({ state: null, uses: 42, now: NOW })).toBe(false);
  });

  it("поки дані вантажаться — мовчимо", () => {
    // Інакше підказка блимне тому, хто фічею давно користується.
    expect(shouldShowHint({ state: null, uses: undefined, now: NOW })).toBe(false);
  });
});

describe("як часто", () => {
  it("одразу після появи стану без показів", () => {
    expect(shouldShowHint({ state: fresh, uses: 0, now: NOW })).toBe(true);
  });

  it("наступного дня після показу — ще ні", () => {
    const state: HintState = { shownCount: 1, lastShownAt: daysAgo(1), dismissedAt: null };
    expect(shouldShowHint({ state, uses: 0, now: NOW })).toBe(false);
  });

  it("через тиждень — знову можна", () => {
    const state: HintState = { shownCount: 1, lastShownAt: daysAgo(7), dismissedAt: null };
    expect(shouldShowHint({ state, uses: 0, now: NOW })).toBe(true);
  });

  it("після трьох показів — ніколи", () => {
    const state: HintState = {
      shownCount: HINT_MAX_SHOWS,
      lastShownAt: daysAgo(400),
      dismissedAt: null,
    };
    expect(shouldShowHint({ state, uses: 0, now: NOW })).toBe(false);
  });
});

describe("закриття", () => {
  it("закрив — не повертаємось, навіть через рік", () => {
    const state: HintState = {
      shownCount: 1,
      lastShownAt: daysAgo(400),
      dismissedAt: daysAgo(400),
    };
    expect(shouldShowHint({ state, uses: 0, now: NOW })).toBe(false);
  });
});

describe("стійкість", () => {
  it("сміття замість дати не блокує показ назавжди", () => {
    const state: HintState = { shownCount: 1, lastShownAt: "не-дата", dismissedAt: null };
    expect(shouldShowHint({ state, uses: 0, now: NOW })).toBe(true);
  });
});
