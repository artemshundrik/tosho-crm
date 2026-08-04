import { describe, expect, it } from "vitest";
import { isFreshFeature, resolveFeatureState } from "./featureState";

const NOW = new Date("2026-08-04T10:00:00Z");

describe("стан можливості", () => {
  it("незмірювану можливість не оцінюємо", () => {
    // undefined = проби в SQL немає. Краще не показати нічого, ніж збрехати
    // людині «не пробував» про фічу, використання якої ми не бачимо.
    expect(resolveFeatureState(undefined)).toBe("unknown");
  });

  it("проба є, записів немає — не пробував", () => {
    expect(resolveFeatureState(null)).toBe("untried");
    expect(resolveFeatureState({ uses: 0, lastUsedAt: null })).toBe("untried");
  });

  it("одне-два використання — куштував", () => {
    expect(resolveFeatureState({ uses: 1, lastUsedAt: "2026-07-01T09:00:00Z" })).toBe("tried");
    expect(resolveFeatureState({ uses: 2, lastUsedAt: "2026-07-01T09:00:00Z" })).toBe("tried");
  });

  it("від трьох використань — користується", () => {
    expect(resolveFeatureState({ uses: 3, lastUsedAt: "2026-08-01T09:00:00Z" })).toBe("using");
    expect(resolveFeatureState({ uses: 129, lastUsedAt: "2026-08-04T09:00:00Z" })).toBe("using");
  });

  it("відʼємне число не ламає логіку", () => {
    expect(resolveFeatureState({ uses: -1, lastUsedAt: null })).toBe("untried");
  });
});

describe("нові можливості", () => {
  it("молодша за 30 днів — нова", () => {
    expect(isFreshFeature({ since: "2026-07-20" }, NOW)).toBe(true);
  });

  it("рівно на межі 30 днів — ще нова", () => {
    // Момент рахуємо явно: since — це опівніч UTC, тож «рівно 30 днів»
    // настає теж опівночі. З NOW о 10:00 минуло б 30 днів і 10 годин.
    const exactly30 = new Date("2026-08-04T00:00:00Z");
    expect(isFreshFeature({ since: "2026-07-05" }, exactly30)).toBe(true);
    expect(isFreshFeature({ since: "2026-07-05" }, NOW)).toBe(false);
  });

  it("старша за 30 днів — не нова", () => {
    expect(isFreshFeature({ since: "2026-05-01" }, NOW)).toBe(false);
  });

  it("без дати появи — не нова", () => {
    expect(isFreshFeature({}, NOW)).toBe(false);
  });

  it("дата з майбутнього не вважається новою", () => {
    expect(isFreshFeature({ since: "2026-09-01" }, NOW)).toBe(false);
  });

  it("сміття замість дати не роняє", () => {
    expect(isFreshFeature({ since: "не-дата" }, NOW)).toBe(false);
  });
});
