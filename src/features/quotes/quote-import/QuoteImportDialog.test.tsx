import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { QuoteImportDialog } from "./QuoteImportDialog";
import type { QuoteImportItem } from "./types";

/**
 * Прев'ю не приносить собівартості (REQ-235).
 *
 * ЧОМУ ЦЕ ТЕСТ, А НЕ ОКО. Довести браузером, що число НЕ доїхало, можна лише
 * одним способом — імпортувавши по-справжньому в робочий прорахунок і
 * подивившись на тираж. Тест ставить те саме питання задарма: чи є в прев'ю
 * поля, куди ціна з файлу могла б лягти.
 *
 * Фікстура навмисно «жирна»: модель повертає і вартість товару, і нанесення.
 * Саме на такому файлі імпорт колись поклав ціну товару ще й у нанесення —
 * прорахунок вийшов удвічі дорожчим, і з цього виросла картка.
 */

const parsed = (items: QuoteImportItem[]) => ({
  ok: true,
  json: async () => ({ items, warnings: [], model: "test", costUsd: 0, fileName: "zapyt.xlsx" }),
});

/** Відповідь розвідки посилання — те, що функція віддає на кожне фото окремо. */
const linkPreview = (payload: Record<string, unknown>) => ({ ok: true, json: async () => payload });

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
  runs: [{ quantity: 300 }],
  flags: [],
  notes: null,
  ...overrides,
});

async function openWith(items: QuoteImportItem[], photo?: Record<string, unknown>) {
  const user = userEvent.setup();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      (String(url).includes("link-preview")
        ? linkPreview(photo ?? { status: "no_image", reason: "На сторінці немає фото товару" })
        : parsed(items)) as unknown as Response
    )
  );

  render(
    <QuoteImportDialog
      open
      onOpenChange={() => {}}
      quoteId="00000000-0000-0000-0000-000000000001"
      teamId="team-1"
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

describe("прев'ю імпорту: тираж без собівартості", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("показує кількість і жодного поля ціни", async () => {
    await openWith([importItem()]);

    expect(screen.getByRole("textbox", { name: "Кількість тиражу" })).toHaveValue("300");
    expect(screen.queryByLabelText("Вартість товару за штуку")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Вартість нанесення за штуку")).not.toBeInTheDocument();
    expect(screen.queryByText("Нанесення")).not.toBeInTheDocument();
  });

  it("не питає про ПДВ і не тримає через нього кнопку", async () => {
    await openWith([importItem()]);

    expect(screen.queryByText("З ПДВ чи без")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Вартість товару (з|без) ПДВ/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/не сказано, з\s*ПДВ вартість товару чи без/)).not.toBeInTheDocument();
    // Раніше саме тут кнопка була заблокована, поки не оберуть ПДВ.
    expect(screen.getByRole("button", { name: /Створити/ })).toBeEnabled();
  });

  it("прохання запитати підрядника доїжджає коментарем, а не беджем", async () => {
    await openWith([
      importItem({ runs: [{ quantity: 100 }], comment: "Тут прохання запитати підрядника вартість" }),
    ]);

    // Раніше цей текст перетворювався на бедж «спитати підрядника» — тобто
    // найцінніше в рядку губилось, лишалась сама позначка.
    expect(screen.getByRole("textbox", { name: "Коментар замовника" })).toHaveValue(
      "Тут прохання запитати підрядника вартість"
    );
    expect(screen.queryByText("спитати підрядника")).not.toBeInTheDocument();
    expect(screen.queryByText("без ціни")).not.toBeInTheDocument();
  });

  it("два варіанти одного номера підписані зв'язком, а не беджем «альтернатива»", async () => {
    await openWith([
      importItem({ name: "Дзен сад 9 см", variantGroup: "30", links: ["https://tree-story.com.ua/a"] }),
      importItem({ name: "Дзен сад 10 см", variantGroup: "30", links: ["https://tree-story.com.ua/b"] }),
    ]);

    expect(screen.getByText("варіант 1 з 2 того самого товару")).toBeInTheDocument();
    expect(screen.getByText("варіант 2 з 2 того самого товару")).toBeInTheDocument();
    expect(screen.queryByText("альтернатива")).not.toBeInTheDocument();
  });

  it("фото з посилання стає картинкою позиції", async () => {
    await openWith([importItem({ links: ["https://totobi.com.ua/mug"] })], {
      status: "done",
      imageUrl: "https://totobi.com.ua/img/mug.jpg",
      title: "Кухоль Stella",
    });

    const photo = await screen.findByRole("img", { name: "Кухоль керамічний" });
    expect(photo).toHaveAttribute("src", "https://totobi.com.ua/img/mug.jpg");
  });

  it("коли сайт не пустив — причина словами, а не мовчазний квадрат", async () => {
    await openWith([importItem({ links: ["https://rozetka.com.ua/x"] })], {
      status: "blocked",
      reason: "Сайт не пускає роботів",
    });

    expect(await screen.findByText("Сайт не пускає роботів")).toBeInTheDocument();
    // Позиція від цього не страждає: створити її можна й без фото.
    expect(screen.getByRole("button", { name: /Створити/ })).toBeEnabled();
  });

  it("знята галочка виводить позицію з-під створення", async () => {
    const user = await openWith([importItem()]);

    await user.click(screen.getByRole("checkbox", { name: /Імпортувати/ }));

    expect(screen.getByRole("button", { name: /Створити 0/ })).toBeDisabled();
  });
});
