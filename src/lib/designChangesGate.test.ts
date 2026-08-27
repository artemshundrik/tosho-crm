import { describe, expect, it } from "vitest";

import { hasFreshChangeRequest } from "./designTaskStatus";

/**
 * Гейт «Повернути на правки».
 *
 * Ціна помилки несиметрична, і саме тому тести суворі до пропуску, а не до
 * блокування. Хибно заблокований перехід — менеджер побурчить і опише правку,
 * тобто зробить рівно те, чого від нього й хочуть. Хибно пропущений — задача
 * йде дизайнеру порожня, він береться за неї через день і виявляє, що міняти
 * нема чого. Саме на це поскаржився Влад 27.08.2026.
 */
const cr = (requestedAt: string | null, extra: Record<string, unknown> = {}) => ({
  status: "pending",
  request_text: "Зменшити прапор",
  requested_at: requestedAt,
  ...extra,
});

describe("hasFreshChangeRequest", () => {
  it("правок немає — гейт закритий", () => {
    expect(hasFreshChangeRequest({ changeRequests: [], statusChangedAt: "2026-08-27T10:00:00Z" })).toBe(false);
    expect(hasFreshChangeRequest({ changeRequests: null, statusChangedAt: "2026-08-27T10:00:00Z" })).toBe(false);
    expect(hasFreshChangeRequest({ changeRequests: "сміття", statusChangedAt: null })).toBe(false);
  });

  it("правка з попереднього раунду не рахується", () => {
    // Головний випадок усього гейту: у проді ВСІ правки лишаються «pending»
    // назавжди, тож умова «є незакрита правка» пропускала б завжди.
    expect(
      hasFreshChangeRequest({
        changeRequests: [cr("2026-08-20T10:00:00Z")],
        statusChangedAt: "2026-08-27T10:00:00Z",
      })
    ).toBe(false);
  });

  it("правка, написана вже в цьому статусі, відчиняє гейт", () => {
    expect(
      hasFreshChangeRequest({
        changeRequests: [cr("2026-08-27T11:00:00Z")],
        statusChangedAt: "2026-08-27T10:00:00Z",
      })
    ).toBe(true);
  });

  it("досить ОДНІЄЇ свіжої серед старих", () => {
    expect(
      hasFreshChangeRequest({
        changeRequests: [cr("2026-07-01T10:00:00Z"), cr("2026-08-27T11:00:00Z"), cr("2026-08-01T10:00:00Z")],
        statusChangedAt: "2026-08-27T10:00:00Z",
      })
    ).toBe(true);
  });

  it("рівно та сама мить не рахується свіжою", () => {
    expect(
      hasFreshChangeRequest({
        changeRequests: [cr("2026-08-27T10:00:00Z")],
        statusChangedAt: "2026-08-27T10:00:00Z",
      })
    ).toBe(false);
  });

  it("задача без status_changed_at пропускається за будь-якою правкою", () => {
    // Так само поводиться сусідній гейт дедлайну. Заблокувати старі задачі
    // назавжди було б гірше за пропущений раунд.
    expect(hasFreshChangeRequest({ changeRequests: [cr("2026-02-01T10:00:00Z")], statusChangedAt: null })).toBe(true);
  });

  it("правка без дати не рахується — інакше сміття в метаданих відчиняло б гейт назавжди", () => {
    expect(
      hasFreshChangeRequest({ changeRequests: [cr(null)], statusChangedAt: "2026-08-27T10:00:00Z" })
    ).toBe(false);
    expect(
      hasFreshChangeRequest({ changeRequests: [cr(null)], statusChangedAt: null })
    ).toBe(false);
  });

  it("побита дата не рахується", () => {
    expect(
      hasFreshChangeRequest({ changeRequests: [cr("не дата")], statusChangedAt: "2026-08-27T10:00:00Z" })
    ).toBe(false);
  });

  it("побитий status_changed_at читається як «немає» — задача не блокується назавжди", () => {
    expect(hasFreshChangeRequest({ changeRequests: [cr("2026-08-27T11:00:00Z")], statusChangedAt: "щось" })).toBe(true);
  });
});
