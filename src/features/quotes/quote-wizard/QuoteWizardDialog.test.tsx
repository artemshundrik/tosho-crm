import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { QuoteImportItem } from "@/features/quotes/quote-import/types";

import { QuoteWizardDialog } from "./QuoteWizardDialog";

/**
 * Вікно «Новий прорахунок» на один екран (REQ-237).
 *
 * Перевіряється те, що бачить і натискає людина: три джерела на одному
 * екрані; ексель дає прев'ю БЕЗ прорахунку в базі; «руками» пише позицію
 * тим самим шляхом, що й імпорт; посилання перетворюється на позицію з назвою
 * зі сторінки. Порядок створення — головне: скільки разів покликали
 * створення до натиску «Створити».
 */

const items: QuoteImportItem[] = [
  {
    sourceRows: [2],
    name: "Футболка бавовна",
    comment: null,
    links: [],
    runs: [{ quantity: 100 }],
    flags: [],
    notes: null,
  },
];

vi.mock("@/features/quotes/quote-import/readWorkbook", async () => {
  const actual = await vi.importActual<typeof import("@/features/quotes/quote-import/readWorkbook")>(
    "@/features/quotes/quote-import/readWorkbook"
  );
  return {
    ...actual,
    readWorkbookSheets: vi.fn(async () => [{ name: "Запит", rows: [["Футболка бавовна", 100, 250]], links: [] }]),
  };
});

vi.mock("@/lib/supabaseClient", () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: { access_token: "token" } } }) } },
}));

const insertQuoteItemRow = vi.fn(async (payload: Record<string, unknown>) => {
  void payload;
  return { ok: true as const, data: { id: "item-1" } };
});
const persistQuoteRuns = vi.fn(async () => ({ ok: true as const }));

vi.mock("@/features/quotes/quote-details/queries", () => ({
  insertQuoteItemRow: (payload: Record<string, unknown>) => insertQuoteItemRow(payload),
  persistQuoteRuns: () => persistQuoteRuns(),
}));

const runDefaults = { markupRate: 40, managerRate: 10, fixedCostRate: 30, vatRate: 20 };

function renderWizard(overrides: Partial<React.ComponentProps<typeof QuoteWizardDialog>> = {}) {
  const prepareQuote = vi.fn(async () => "quote-1");
  const onCreated = vi.fn();
  render(
    <QuoteWizardDialog
      open
      onOpenChange={() => {}}
      teamId="team-1"
      header={<div>шапка прорахунку</div>}
      headerIssue={null}
      runDefaultsFor={() => runDefaults}
      onPrepareQuote={prepareQuote}
      onCreated={onCreated}
      {...overrides}
    />
  );
  return { prepareQuote, onCreated };
}

describe("QuoteWizardDialog — один екран", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    insertQuoteItemRow.mockClear();
    persistQuoteRuns.mockClear();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).includes("link-preview")) {
          return {
            ok: true,
            json: async () => ({
              status: "done",
              imageUrl: "https://shop.example/hoodie.jpg",
              title: "Худі оверсайз Classic",
              description: "Бавовна 80 %, начіс усередині.",
            }),
          };
        }
        return {
          ok: true,
          json: async () => ({ items, warnings: [], model: "test", costUsd: 0, fileName: "zapyt.csv" }),
        };
      }) as unknown as typeof fetch
    );
  });

  it("шапка, тип виробу і три джерела стоять на одному екрані", () => {
    renderWizard();
    expect(screen.getByText("шапка прорахунку")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Поліграфія/ })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Мерч/ })).toBeChecked();
    const sources = screen.getByRole("tablist", { name: "Джерело позицій" });
    expect(within(sources).getAllByRole("tab")).toHaveLength(3);
    expect(within(sources).getByRole("tab", { name: /Excel/ })).toHaveAttribute("aria-selected", "true");
  });

  it("ексель: прев'ю є, а прорахунку до «Створити» немає", async () => {
    const user = userEvent.setup();
    const { prepareQuote, onCreated } = renderWizard();

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, new File(["x"], "zapyt.csv", { type: "text/csv" }));
    await waitFor(() => expect(screen.getByDisplayValue("Футболка бавовна")).toBeInTheDocument());

    expect(prepareQuote).not.toHaveBeenCalled();
    expect(insertQuoteItemRow).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /Створити прорахунок/ }));

    await waitFor(() => expect(prepareQuote).toHaveBeenCalledWith("merch"));
    expect(insertQuoteItemRow).toHaveBeenCalledTimes(1);
    expect(insertQuoteItemRow.mock.calls[0][0]).toMatchObject({ quote_id: "quote-1", name: "Футболка бавовна" });
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith("quote-1"));
  });

  it("без замовника файл беруть, а створити не дають", () => {
    // Дропзона відкрита навмисно: прорахунок з'являється лише на «Створити»,
    // тож розібрати файл раніше нічим не шкодить. Замовника вимагає саме
    // створення, і підвал каже про це словами — мовчазна сіра кнопка читалась
    // би як поломка.
    renderWizard({ headerIssue: "Оберіть замовника — прорахунок створюється на нього." });

    expect(screen.getByRole("button", { name: "Обрати файл Excel" })).not.toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText(/Оберіть замовника/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Створити прорахунок/ })).toBeDisabled();
  });

  it("руками: порожній рядок одразу, створення тим самим шляхом", async () => {
    const user = userEvent.setup();
    const { prepareQuote } = renderWizard();

    await user.click(screen.getByRole("tab", { name: /Руками/ }));
    const create = screen.getByRole("button", { name: /Створити прорахунок/ });
    // Рядок є, але без назви створювати нема чого.
    expect(create).toBeDisabled();

    await user.type(screen.getByRole("textbox", { name: "Назва позиції" }), "Кепка six-panel");
    await user.click(screen.getByRole("radio", { name: /Поліграфія/ }));
    expect(create).toBeEnabled();
    await user.click(create);

    await waitFor(() => expect(prepareQuote).toHaveBeenCalledWith("print"));
    expect(insertQuoteItemRow.mock.calls[0][0]).toMatchObject({ name: "Кепка six-panel", qty: 100 });
  });

  it("за посиланням: назва й опис зі сторінки стають позицією", async () => {
    const user = userEvent.setup();
    renderWizard();

    await user.click(screen.getByRole("tab", { name: /Посилання/ }));
    await user.type(screen.getByRole("textbox", { name: "Посилання на товар" }), "https://shop.example/hoodie{Enter}");

    await waitFor(() => expect(screen.getByDisplayValue("Худі оверсайз Classic")).toBeInTheDocument());
    expect(screen.getByDisplayValue("Бавовна 80 %, начіс усередині.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "shop.example/hoodie" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Створити прорахунок/ })).toBeEnabled();
  });

  it("за посиланням: товари накопичуються, кілька посилань за раз", async () => {
    // Прорахунок на кілька товарів — звичайна справа; те, що в базі їх мало,
    // каже лише про те, що складне досі рахують у телеграмі.
    const user = userEvent.setup();
    renderWizard();

    await user.click(screen.getByRole("tab", { name: /Посилання/ }));
    const input = screen.getByRole("textbox", { name: "Посилання на товар" });

    await user.type(input, "https://shop.example/a{Enter}");
    await waitFor(() => expect(screen.getAllByRole("textbox", { name: "Назва позиції" })).toHaveLength(1));

    // Поле не блокується: наступне посилання вставляють, не чекаючи сайту.
    expect(input).toBeEnabled();

    // Два посилання одним рядком — дві позиції.
    await user.type(input, "https://shop.example/b https://shop.example/c{Enter}");
    await waitFor(() => expect(screen.getAllByRole("textbox", { name: "Назва позиції" })).toHaveLength(3));

    expect(screen.getByRole("link", { name: "shop.example/c" })).toBeInTheDocument();
  });
});
