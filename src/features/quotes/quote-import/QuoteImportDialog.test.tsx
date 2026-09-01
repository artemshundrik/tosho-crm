import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { QuoteImportDialog } from "./QuoteImportDialog";
import type { QuoteImportItem } from "./types";

/**
 * Стан, якого не побачити в браузері: розшифровка без відповіді про ПДВ.
 *
 * Прев'ю з живим файлом перевірене очима (05 — усі п'ять позицій, беджі,
 * діапазон двома тиражами). А от «модель не сказала, з ПДВ ціна чи без» на
 * реальному файлі не відтворити — там колонка підписана, — і водночас саме цей
 * стан тримає кнопку «Створити». Плюс перемикач ПДВ можна лише поставити, не
 * зняти, тож із прев'ю в цей стан не повернутись.
 *
 * Ціна перевірки очима тут — справжні позиції в робочому прорахунку.
 */

const parsed = (items: QuoteImportItem[]) => ({
  ok: true,
  json: async () => ({ items, warnings: [], model: "test", costUsd: 0, fileName: "zapyt.xlsx" }),
});

vi.mock("./readWorkbook", async () => {
  const actual = await vi.importActual<typeof import("./readWorkbook")>("./readWorkbook");
  return {
    ...actual,
    readWorkbookSheets: vi.fn(async () => [
      { name: "Запит", rows: [["Кухоль", 300, 119.5]], links: [] },
    ]),
  };
});

vi.mock("@/lib/supabaseClient", () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: { access_token: "token" } } }) } },
}));

const importItem = (overrides: Partial<QuoteImportItem> = {}): QuoteImportItem => ({
  sourceRows: [3],
  name: "Кухоль керамічний",
  comment: null,
  links: [],
  runs: [{ quantity: 300, unitPriceModel: 119.5, modelPriceIncludesVat: null, unitPricePrint: 0 }],
  flags: [],
  notes: null,
  ...overrides,
});

async function openWith(items: QuoteImportItem[]) {
  const user = userEvent.setup();
  vi.stubGlobal("fetch", vi.fn(async () => parsed(items) as unknown as Response));

  render(
    <QuoteImportDialog
      open
      onOpenChange={() => {}}
      quoteId="00000000-0000-0000-0000-000000000001"
      teamId="team-1"
      currency="UAH"
      nextPosition={1}
      runDefaults={{ markupRate: 40, managerRate: 10, fixedCostRate: 30, vatRate: 20 }}
      onImported={() => {}}
    />
  );

  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  await user.upload(input, new File(["x"], "zapyt.xlsx", { type: "application/vnd.ms-excel" }));
  await waitFor(() => expect(screen.getByRole("button", { name: /Створити/ })).toBeInTheDocument());
  return user;
}

describe("прев'ю імпорту: гейт ПДВ", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("не дає створити, поки не сказано, з ПДВ вартість товару чи без", async () => {
    await openWith([importItem()]);

    expect(screen.getByRole("button", { name: /Створити/ })).toBeDisabled();
    expect(screen.getByText(/не сказано, з\s*ПДВ вартість товару чи без/)).toBeInTheDocument();
  });

  it("відповідь у прев'ю відмикає кнопку", async () => {
    const user = await openWith([importItem()]);

    await user.click(screen.getByRole("button", { name: "Вартість товару без ПДВ" }));

    await waitFor(() => expect(screen.getByRole("button", { name: /Створити/ })).toBeEnabled());
  });

  it("позиція без ціни ПДВ не питає — там ще нема від чого", async () => {
    await openWith([
      importItem({
        runs: [{ quantity: 100, unitPriceModel: null, modelPriceIncludesVat: null, unitPricePrint: 0 }],
        flags: ["price_missing"],
      }),
    ]);

    expect(screen.getByRole("button", { name: /Створити/ })).toBeEnabled();
    expect(screen.getByText("без ціни")).toBeInTheDocument();
  });

  it("знята галочка виводить позицію з-під гейта", async () => {
    const user = await openWith([importItem()]);

    await user.click(screen.getByRole("checkbox", { name: /Імпортувати/ }));

    expect(screen.getByRole("button", { name: /Створити 0/ })).toBeDisabled();
    expect(screen.queryByText(/не сказано, з\s*ПДВ вартість товару чи без/)).not.toBeInTheDocument();
  });
});
