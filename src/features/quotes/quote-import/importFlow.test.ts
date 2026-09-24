import * as XLSX from "xlsx";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
type UploadOutcome = { ok: true; data: Record<string, never> } | { ok: false; message: string };
const uploadQuoteAttachmentFile = vi.fn(async (_input: Record<string, unknown>): Promise<UploadOutcome> => {
  void _input;
  return { ok: true, data: {} };
});

vi.mock("@/features/quotes/quote-details/queries", () => ({
  insertQuoteItemRow: () => insertQuoteItemRow(),
  persistQuoteRuns: (quoteId: string, runs: Array<Record<string, unknown>>) => persistQuoteRuns(quoteId, runs),
  insertCatalogModelRow: async () => ({ ok: false as const, message: "не потрібно" }),
  setQuoteRunCostFromPool: (runId: string, poolId: string) => setQuoteRunCostFromPool(runId, poolId),
  findCatalogModelByKindAndName: async () => null,
  updateCatalogModelImage: async () => undefined,
  uploadQuoteAttachmentFile: (input: Record<string, unknown>) => uploadQuoteAttachmentFile(input),
}));

vi.mock("@/features/quotes/quote-details/imprintPlaces", () => ({
  resolveImprintPlaces: async (imprints: unknown) => imprints,
}));

vi.mock("@/lib/supabaseClient", () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: { access_token: "token" } } }) } },
}));

const getCurrentUserId = vi.fn(async () => "u-1");
vi.mock("@/lib/currentUser", () => ({
  getCurrentUserId: () => getCurrentUserId(),
}));

const insertThreadMessage = vi.fn(async (_threadKey: string, _input: Record<string, unknown>) => {
  void _threadKey;
  void _input;
  return {} as never;
});
const notifyThreadMessage = vi.fn(async (_threadKey: string, _body: string) => {
  void _threadKey;
  void _body;
});
vi.mock("@/features/taskChat/queries", () => ({
  insertThreadMessage: (threadKey: string, input: Record<string, unknown>) => insertThreadMessage(threadKey, input),
  notifyThreadMessage: (threadKey: string, body: string) => notifyThreadMessage(threadKey, body),
}));

const { parseImportFile, writeDraftsToQuote, attachImportExtras } = await import("./importFlow");
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

describe("parseImportFile — які файли беремо (REQ-308)", () => {
  const docx = (body: string) => {
    const container = XLSX.CFB.utils.cfb_new();
    XLSX.CFB.utils.cfb_add(
      container,
      "word/document.xml",
      new TextEncoder().encode(
        `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`
      )
    );
    const bytes = XLSX.CFB.write(container, { type: "array", fileType: "zip" }) as unknown as ArrayLike<number>;
    return new File([new Uint8Array(Array.from(bytes))], "ТЗ клієнта.docx");
  };

  it("старий .doc — не «не підтримується», а що саме зробити", async () => {
    const outcome = await parseImportFile(new File(["x"], "ТЗ.doc"));
    expect(outcome).toMatchObject({ ok: false, error: expect.stringContaining("збережіть як .docx") });
  });

  it("чужий формат називає й Word серед підтримуваних", async () => {
    const outcome = await parseImportFile(new File(["x"], "ТЗ.pdf"));
    expect(outcome).toMatchObject({ ok: false, error: "Підтримуються лише xlsx, xls, xlsm, csv і docx." });
  });

  it(".docx іде в розбір Word: порожній документ так і названо", async () => {
    const outcome = await parseImportFile(docx("<w:p/>"));
    expect(outcome).toMatchObject({ ok: false, error: "У документі немає тексту." });
  });

  describe("успішний розбір", () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("conditions з відповіді моделі доходять в успіх (REQ-182#p26)", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({
          ok: true,
          json: async () => ({
            items: [
              { sourceRows: [1], name: "Флісова жилетка", comment: null, links: [], runs: [{ quantity: 650 }], flags: [], notes: null },
            ],
            warnings: [],
            conditions: ["Доставка до РЦ Луцьк"],
            model: "test",
            costUsd: 0,
            fileName: "ТЗ.docx",
          }),
        })) as unknown as typeof fetch
      );

      const outcome = await parseImportFile(docx("<w:p><w:r><w:t>Флісова жилетка 650</w:t></w:r></w:p>"));

      expect(outcome).toMatchObject({ ok: true, conditions: ["Доставка до РЦ Луцьк"] });
    });

    it("без conditions у відповіді — порожній список, а не збій", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({
          ok: true,
          json: async () => ({
            items: [
              { sourceRows: [1], name: "Кухоль", comment: null, links: [], runs: [{ quantity: 100 }], flags: [], notes: null },
            ],
            warnings: [],
            model: "test",
            costUsd: 0,
            fileName: "ТЗ.docx",
          }),
        })) as unknown as typeof fetch
      );

      const outcome = await parseImportFile(docx("<w:p><w:r><w:t>Кухоль 100</w:t></w:r></w:p>"));

      expect(outcome).toMatchObject({ ok: true, conditions: [] });
    });
  });
});

describe("attachImportExtras — файл у «Файли прорахунку», умови в обговорення (REQ-182#p30, #p31)", () => {
  beforeEach(() => {
    uploadQuoteAttachmentFile.mockClear();
    insertThreadMessage.mockClear();
    notifyThreadMessage.mockClear();
    getCurrentUserId.mockClear();
  });

  it("без файлу й умов не питає сесію — інакше створення з каталогу чи посилань ловило б «Сесія застаріла»", async () => {
    const result = await attachImportExtras({ quoteId: "q-1", teamId: "t-1", file: null, conditions: [] });

    expect(getCurrentUserId).not.toHaveBeenCalled();
    expect(uploadQuoteAttachmentFile).not.toHaveBeenCalled();
    expect(insertThreadMessage).not.toHaveBeenCalled();
    expect(result).toEqual({ fileAttached: false, conditionsPosted: false, errors: [] });
  });

  it("файл лягає у «Файли прорахунку», умови — одним повідомленням в обговорення", async () => {
    const file = new File(["x"], "ТЗ.docx");
    const result = await attachImportExtras({
      quoteId: "q-1",
      teamId: "t-1",
      file,
      conditions: ["Доставка до РЦ Луцьк", "Зразок за 5 робочих днів"],
    });

    expect(uploadQuoteAttachmentFile).toHaveBeenCalledWith(
      expect.objectContaining({ quoteId: "q-1", teamId: "t-1", file, uploadedBy: "u-1", audience: "project" })
    );
    expect(insertThreadMessage).toHaveBeenCalledWith(
      "quote:q-1",
      expect.objectContaining({
        body: "Умови з ТЗ:\n• Доставка до РЦ Луцьк\n• Зразок за 5 робочих днів",
        visibility: "team",
        quoteId: "q-1",
        teamId: "t-1",
        userId: "u-1",
      })
    );
    expect(result).toEqual({ fileAttached: true, conditionsPosted: true, errors: [] });
  });

  it("без умов повідомлення немає; невдалий файл — помилка словами, а не виняток", async () => {
    uploadQuoteAttachmentFile.mockResolvedValueOnce({ ok: false, message: "квота" });
    const result = await attachImportExtras({
      quoteId: "q-1",
      teamId: "t-1",
      file: new File(["x"], "a.xlsx"),
      conditions: [],
    });

    expect(insertThreadMessage).not.toHaveBeenCalled();
    expect(result.fileAttached).toBe(false);
    expect(result.errors[0]).toContain("a.xlsx");
  });
});
