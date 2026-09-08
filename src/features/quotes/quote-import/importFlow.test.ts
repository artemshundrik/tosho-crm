import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Запис чернеток у прорахунок. Перевіряється те, що вже двічі ламалось тихо:
 * позиція створюється, а тираж або модель каталогу мовчки не з'являються.
 */

type SaveOutcome = { ok: true; data: null } | { ok: false; message: string };
const persistQuoteRuns = vi.fn(
  async (_quoteId: string, runs: Array<Record<string, unknown>>): Promise<SaveOutcome> => {
    void _quoteId;
    void runs;
    return { ok: true, data: null };
  }
);
const setQuoteRunCostFromPool = vi.fn(async (_runId: string, _poolId: string) => {
  void _runId;
  void _poolId;
  return 190.43;
});

const insertQuoteItemRow = vi.fn(async () => ({ ok: true as const, data: { id: "item-1" } }));

vi.mock("@/features/quotes/quote-details/queries", () => ({
  insertQuoteItemRow: () => insertQuoteItemRow(),
  persistQuoteRuns: (quoteId: string, runs: Array<Record<string, unknown>>) => persistQuoteRuns(quoteId, runs),
  insertCatalogModelRow: async () => ({ ok: false as const, message: "не потрібно" }),
  setQuoteRunCostFromPool: (runId: string, poolId: string) => setQuoteRunCostFromPool(runId, poolId),
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

describe("writeDraftsToQuote — вартість ставить база, а не браузер", () => {
  beforeEach(() => {
    persistQuoteRuns.mockClear();
    setQuoteRunCostFromPool.mockClear();
  });

  it("тираж їде без ціни, а потім база ставить її з рядка пулу", async () => {
    // Число, надіслане браузером, — це число від людини, і гейт посад його
    // зупиняє: через це в позиції колись не лишалось ЖОДНОГО тиражу.
    const result = await write({ supplierProductId: "pool-row-1" });

    expect(result.ok).toBe(true);
    expect(persistQuoteRuns.mock.calls[0][1][0].unit_price_model).toBe(0);
    expect(persistQuoteRuns.mock.calls[0][1][0].unit_price_model_vat).toBeNull();
    // Ціну ставить окремий крок, і саме тому тиражу потрібен відомий id.
    const runId = persistQuoteRuns.mock.calls[0][1][0].id;
    expect(setQuoteRunCostFromPool).toHaveBeenCalledWith(runId, "pool-row-1");
  });

  it("товар не з пулу бази про ціну не питає", async () => {
    const result = await write({});

    expect(result.ok).toBe(true);
    expect(setQuoteRunCostFromPool).not.toHaveBeenCalled();
  });

  it("відмова на тиражах лишається відмовою — її не ховаємо", async () => {
    persistQuoteRuns.mockImplementationOnce(async () => ({ ok: false as const, message: "Прорахунок заблоковано" }));

    const result = await write({ supplierProductId: "pool-row-1" });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("Прорахунок заблоковано");
    // Ціну ставити нема кому: тиражу не з'явилось.
    expect(setQuoteRunCostFromPool).not.toHaveBeenCalled();
  });
});
