import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { QuoteImportDialog } from "./QuoteImportDialog";
import type { QuoteImportItem } from "./types";

/**
 * Порядок створення у тестовому візарді (REQ-134#p4).
 *
 * ЧОМУ ЦЕ ПЕРЕВІРЯЄТЬСЯ ТЕСТОМ, А НЕ ОЧИМА. Довести браузером, що прорахунок
 * НЕ створився, можна лише одним способом — створивши його по-справжньому в
 * робочій базі й подивившись, чи він там зайвий. Тест ставить те саме питання
 * задарма: скільки разів покликали створення до натиску «Створити».
 *
 * А питання це головне в усій задачі: сенс візарда саме в тому, що передумати
 * на прев'ю нічого не коштує.
 */

const items: QuoteImportItem[] = [
  {
    sourceRows: [2],
    name: "Футболка бавовна",
    comment: null,
    links: [],
    runs: [{ quantity: 100, unitPriceModel: 250, modelPriceIncludesVat: false, unitPricePrint: 0 }],
    flags: [],
    notes: null,
  },
];

vi.mock("./readWorkbook", async () => {
  const actual = await vi.importActual<typeof import("./readWorkbook")>("./readWorkbook");
  return {
    ...actual,
    readWorkbookSheets: vi.fn(async () => [
      { name: "Запит", rows: [["Футболка бавовна", 100, 250]], links: [] },
    ]),
  };
});

vi.mock("@/lib/supabaseClient", () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: { access_token: "token" } } }) } },
}));

const insertQuoteItemRow = vi.fn(async (payload: Record<string, unknown>) => {
  void payload;
  return { ok: true as const, data: { id: "item-1" } };
});
const persistQuoteRuns = vi.fn(async (quoteId: string, runs: unknown[], removed: unknown[]) => {
  void runs;
  void removed;
  void quoteId;
  return { ok: true as const };
});

vi.mock("@/features/quotes/quote-details/queries", () => ({
  insertQuoteItemRow: (payload: Record<string, unknown>) => insertQuoteItemRow(payload),
  persistQuoteRuns: (quoteId: string, runs: unknown[], removed: unknown[]) =>
    persistQuoteRuns(quoteId, runs, removed),
}));

describe("імпорт як спосіб СТВОРИТИ прорахунок", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    insertQuoteItemRow.mockClear();
    persistQuoteRuns.mockClear();
  });

  it("до натиску «Створити» прорахунку не існує", async () => {
    const user = userEvent.setup();
    const prepareQuote = vi.fn(async () => "quote-1");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ items, warnings: [], model: "test", costUsd: 0, fileName: "zapyt.csv" }),
      })) as unknown as typeof fetch
    );

    render(
      <QuoteImportDialog
        open
        onOpenChange={() => {}}
        quoteId={null}
        teamId="team-1"
        currency="UAH"
        nextPosition={1}
        runDefaults={{ markupRate: 40, managerRate: 10, fixedCostRate: 30, vatRate: 20 }}
        header={<div>шапка прорахунку</div>}
        onPrepareQuote={prepareQuote}
        onImported={() => {}}
      />
    );

    // Крок 3: спершу шапка, і лише під нею файл.
    expect(screen.getByText("шапка прорахунку")).toBeInTheDocument();

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, new File(["x"], "zapyt.csv", { type: "text/csv" }));
    await waitFor(() => expect(screen.getByRole("button", { name: /Створити/ })).toBeEnabled());

    // Файл розібраний, прев'ю на екрані — а прорахунку ще немає.
    expect(prepareQuote).not.toHaveBeenCalled();
    expect(insertQuoteItemRow).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /Створити/ }));

    await waitFor(() => expect(prepareQuote).toHaveBeenCalledTimes(1));
    expect(insertQuoteItemRow).toHaveBeenCalledTimes(1);
    // Позиції лягають саме в щойно створений прорахунок.
    expect(insertQuoteItemRow.mock.calls[0][0]).toMatchObject({ quote_id: "quote-1" });
    expect(persistQuoteRuns.mock.calls[0][0]).toBe("quote-1");
  });

  it("шапка без замовника не пускає до файлу", () => {
    render(
      <QuoteImportDialog
        open
        onOpenChange={() => {}}
        quoteId={null}
        teamId="team-1"
        currency="UAH"
        nextPosition={1}
        runDefaults={{ markupRate: 40, managerRate: 10, fixedCostRate: 30, vatRate: 20 }}
        canPick={false}
        pickBlockedHint="Спершу оберіть замовника"
        onPrepareQuote={async () => "quote-1"}
        onImported={() => {}}
      />
    );

    expect(screen.getByRole("button", { name: /Обрати файл/ })).toBeDisabled();
    expect(screen.getByText("Спершу оберіть замовника")).toBeInTheDocument();
  });

  it("відмова за посадою не валить імпорт: тиражі йдуть без собівартості", async () => {
    const user = userEvent.setup();
    persistQuoteRuns.mockImplementationOnce(async () => ({
      ok: false as const,
      message: "Собівартість заповнює менеджер або проєктний менеджер",
    }) as never);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ items, warnings: [], model: "test", costUsd: 0, fileName: "zapyt.csv" }),
      })) as unknown as typeof fetch
    );
    const onImported = vi.fn();

    render(
      <QuoteImportDialog
        open
        onOpenChange={() => {}}
        quoteId={null}
        teamId="team-1"
        currency="UAH"
        nextPosition={1}
        runDefaults={{ markupRate: 40, managerRate: 10, fixedCostRate: 30, vatRate: 20 }}
        onPrepareQuote={async () => "quote-1"}
        onImported={onImported}
      />
    );

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, new File(["x"], "zapyt.csv", { type: "text/csv" }));
    await waitFor(() => expect(screen.getByRole("button", { name: /Створити/ })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: /Створити/ }));

    await waitFor(() => expect(onImported).toHaveBeenCalledWith(["item-1"], "quote-1", true));
    // Друга спроба — ті самі тиражі, але з обнуленою собівартістю.
    const retried = persistQuoteRuns.mock.calls[1][1] as Array<Record<string, unknown>>;
    expect(retried[0]).toMatchObject({ quantity: 100, unit_price_model: 0, unit_price_print: 0 });
  });

  it("невдале створення лишає людину на прев'ю, а не ковтає клік", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ items, warnings: [], model: "test", costUsd: 0, fileName: "zapyt.csv" }),
      })) as unknown as typeof fetch
    );

    render(
      <QuoteImportDialog
        open
        onOpenChange={() => {}}
        quoteId={null}
        teamId="team-1"
        currency="UAH"
        nextPosition={1}
        runDefaults={{ markupRate: 40, managerRate: 10, fixedCostRate: 30, vatRate: 20 }}
        onPrepareQuote={async () => {
          throw new Error("Оберіть менеджера прорахунку.");
        }}
        onImported={() => {}}
      />
    );

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, new File(["x"], "zapyt.csv", { type: "text/csv" }));
    await waitFor(() => expect(screen.getByRole("button", { name: /Створити/ })).toBeEnabled());

    await user.click(screen.getByRole("button", { name: /Створити/ }));

    await waitFor(() => expect(screen.getByText("Оберіть менеджера прорахунку.")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /Створити/ })).toBeEnabled();
    expect(insertQuoteItemRow).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /Створити/ })).toBeEnabled();
  });
});
