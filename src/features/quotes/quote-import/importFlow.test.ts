import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Запис чернеток у прорахунок. Перевіряється те, що вже двічі ламалось тихо:
 * позиція створюється, а тираж або модель каталогу мовчки не з'являються.
 */

const persistQuoteRuns = vi.fn(async (_quoteId: string, runs: Array<Record<string, unknown>>) => {
  void _quoteId;
  // Тригер бази: ненульову вартість товару має право вписати лише pm/менеджер.
  if (runs.some((run) => Number(run.unit_price_model) > 0)) {
    return { ok: false as const, message: "Собівартість заповнює менеджер або проєктний менеджер" };
  }
  return { ok: true as const, data: null };
});

const insertQuoteItemRow = vi.fn(async () => ({ ok: true as const, data: { id: "item-1" } }));

vi.mock("@/features/quotes/quote-details/queries", () => ({
  insertQuoteItemRow: () => insertQuoteItemRow(),
  persistQuoteRuns: (quoteId: string, runs: Array<Record<string, unknown>>) => persistQuoteRuns(quoteId, runs),
  insertCatalogModelRow: async () => ({ ok: false as const, message: "не потрібно" }),
  findCatalogModelByKindAndName: async () => null,
  updateCatalogModelImage: async () => undefined,
}));

vi.mock("@/features/quotes/quote-details/imprintPlaces", () => ({
  resolveImprintPlaces: async (imprints: unknown) => imprints,
}));

vi.mock("@/lib/supabaseClient", () => ({ supabase: {} }));

const { writeDraftsToQuote } = await import("./importFlow");
const { toDraftItems } = await import("./mapping");

const draft = (patch: Record<string, unknown>) => ({
  ...toDraftItems([
    { sourceRows: [], name: "Кепка «POLO» · Білий", comment: null, links: [], runs: [{ quantity: 100 }], flags: [], notes: null },
  ])[0],
  ...patch,
});

const write = (patch: Record<string, unknown>) =>
  writeDraftsToQuote({
    drafts: [draft(patch)],
    quoteId: "quote-1",
    teamId: "team-1",
    nextPosition: 1,
    runDefaults: { markupRate: 40, managerRate: 10, fixedCostRate: 30, vatRate: 20 },
    trace: { fileName: "з каталогу", importedAt: "2026-09-08T15:37:00.000Z" },
  });

describe("writeDraftsToQuote — тираж не губиться через ціну", () => {
  beforeEach(() => {
    persistQuoteRuns.mockClear();
  });

  it("не пустили вартість — тираж усе одно записується, просто без неї", async () => {
    // Живий випадок 08.09.2026: посада it_specialist не має права на
    // собівартість, і разом із ціною зникав ВЕСЬ тираж — позиція
    // відкривалась із «собівартість не внесена» й без жодного тиражу.
    const result = await write({ unitCost: 190.43 });

    expect(result.ok).toBe(true);
    expect(persistQuoteRuns).toHaveBeenCalledTimes(2);
    expect(persistQuoteRuns.mock.calls[0][1][0].unit_price_model).toBe(190.43);
    expect(persistQuoteRuns.mock.calls[1][1][0].unit_price_model).toBe(0);
    // Кількість від повтору не страждає — гине лише ціна.
    expect(persistQuoteRuns.mock.calls[1][1][0].quantity).toBe(100);
  });

  it("тираж без нашої ціни не повторюємо: причина відмови інша, і ховати її не можна", async () => {
    persistQuoteRuns.mockImplementationOnce(async () => ({ ok: false as const, message: "Прорахунок заблоковано" }));

    const result = await write({});

    expect(result.ok).toBe(false);
    expect(persistQuoteRuns).toHaveBeenCalledTimes(1);
    if (!result.ok) expect(result.error).toContain("Прорахунок заблоковано");
  });
});
