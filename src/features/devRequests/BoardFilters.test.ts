import { describe, expect, it } from "vitest";

import { EMPTY_BOARD_FILTERS, hasActiveFilters, matchesBoardFilters } from "./BoardFilters";
import type { DevRequest, RequestZone } from "./types";

function request(overrides: Partial<DevRequest> = {}): DevRequest {
  return {
    id: "1",
    number: 3,
    label: "REQ-3",
    teamId: "t",
    title: "Кнопка не відкриває картку",
    body: "",
    kind: "bug",
    status: "triage",
    moduleKey: "design",
    priority: null,
    zone: "polish",
    releasedAt: null,
    theme: null,
    checklist: [],
    autoClassified: false,
    isPrivate: false,
    authorUserId: null,
    tgUsername: null,
    displayName: null,
    askedByCount: 1,
    commitShas: [],
    todayBy: null,
    todayAt: null,
    createdAt: "2026-08-09T10:00:00Z",
    ...overrides,
  };
}

const zones = (...list: RequestZone[]) => new Set(list);

/**
 * Правило фільтрів: у межах групи АБО, між групами І. Воно однакове скрізь —
 * у пошті, у крамницях, у Linear, — і саме тому його не можна вигадувати своє:
 * людина не читатиме пояснень, вона просто очікує звичного.
 */
describe("matchesBoardFilters", () => {
  it("порожній фільтр пропускає все", () => {
    expect(matchesBoardFilters(request(), EMPTY_BOARD_FILTERS)).toBe(true);
    expect(matchesBoardFilters(request({ zone: null, moduleKey: null }), EMPTY_BOARD_FILTERS)).toBe(true);
  });

  it("кілька зон — це АБО", () => {
    const state = { ...EMPTY_BOARD_FILTERS, zones: zones("polish", "speed") };
    expect(matchesBoardFilters(request({ zone: "polish" }), state)).toBe(true);
    expect(matchesBoardFilters(request({ zone: "speed" }), state)).toBe(true);
    expect(matchesBoardFilters(request({ zone: "data" }), state)).toBe(false);
  });

  it("картка без зони під фільтр зони не підпадає", () => {
    const state = { ...EMPTY_BOARD_FILTERS, zones: zones("polish") };
    expect(matchesBoardFilters(request({ zone: null }), state)).toBe(false);
  });

  it("зона й тема разом — це І", () => {
    const state = { ...EMPTY_BOARD_FILTERS, zones: zones("polish"), themes: new Set(["навігація"]) };
    expect(matchesBoardFilters(request({ zone: "polish", theme: "навігація" }), state)).toBe(true);
    // Зона збіглась, тема ні — картка не проходить.
    expect(matchesBoardFilters(request({ zone: "polish", theme: "модалки" }), state)).toBe(false);
    // Тема збіглась, зона ні — теж не проходить.
    expect(matchesBoardFilters(request({ zone: "data", theme: "навігація" }), state)).toBe(false);
  });
});

describe("hasActiveFilters", () => {
  it("порожній стан не вважається активним", () => {
    expect(hasActiveFilters(EMPTY_BOARD_FILTERS)).toBe(false);
  });

  it("будь-який увімкнений фільтр робить стан активним", () => {
    expect(hasActiveFilters({ ...EMPTY_BOARD_FILTERS, zones: zones("data") })).toBe(true);
    expect(hasActiveFilters({ ...EMPTY_BOARD_FILTERS, themes: new Set(["AI"]) })).toBe(true);
  });
});
