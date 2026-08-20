import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Видалення прорахунку: головне тут — НЕ ЗВІТУВАТИ ПРО УСПІХ, якщо рядок не
 * зник.
 *
 * PostgREST на видаленні, яке не зачепило жодного рядка (не той фільтр команди,
 * RLS не пустила), віддає успіх без помилки. Через це застосунок казав
 * «Прорахунок видалено», прибирав картку зі списку — а після оновлення вона
 * поверталась. Саме на це поскаржився власник 20.08.2026.
 */

/** Скільки рядків «видаляє» база у відповідь — керує кожен тест окремо. */
let deletedRows: Array<{ id: string }> = [];
let deleteError: { message: string } | null = null;

function makeBuilder() {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "delete", "eq", "in", "order", "limit"]) {
    builder[method] = vi.fn(() => builder);
  }
  (builder as { then: unknown }).then = (resolve: (value: unknown) => unknown) =>
    resolve({ data: deletedRows, error: deleteError });
  return builder;
}

const fromSpy = vi.fn(() => makeBuilder());

vi.mock("@/lib/supabaseClient", () => ({
  supabase: {
    schema: () => ({ from: fromSpy }),
    from: fromSpy,
    storage: { from: () => ({ remove: vi.fn(async () => ({ data: null, error: null })) }) },
  },
}));

const { deleteQuote } = await import("./toshoApi");

describe("deleteQuote", () => {
  beforeEach(() => {
    deletedRows = [];
    deleteError = null;
    fromSpy.mockClear();
  });

  it("рядок зник — тиха успішна відповідь", async () => {
    deletedRows = [{ id: "q-1" }];
    await expect(deleteQuote("q-1", "team-1")).resolves.toBeUndefined();
  });

  it("нічого не видалено — кидає помилку, а не вдає успіх", async () => {
    // Було саме так: жодного рядка, жодної помилки — і UI звітував «видалено».
    deletedRows = [];
    await expect(deleteQuote("q-1", "team-1")).rejects.toThrow(/не видалено/i);
  });

  it("заблокований іншою людиною — пояснює це людською мовою", async () => {
    deleteError = { message: "Quote is locked by another user" };
    await expect(deleteQuote("q-1", "team-1")).rejects.toThrow(/відкритий в іншої людини/i);
  });
});
