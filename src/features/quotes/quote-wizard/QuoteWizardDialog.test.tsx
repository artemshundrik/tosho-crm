import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { QuoteImportItem } from "@/features/quotes/quote-import/types";
import type { SupplierPoolProduct } from "@/lib/supplierPoolRows";

import { QuoteWizardDialog } from "./QuoteWizardDialog";

/**
 * Вікно «Новий прорахунок» на один екран (REQ-237 → REQ-182#p14).
 *
 * Перевіряється те, що бачить і натискає людина: одне поле замість вкладок —
 * посилання стає позицією з назвою зі сторінки, назва шукає в каталозі й
 * лягає з `catalog_*_id`, а чого в базі немає — додається як нова позиція;
 * ексель дає прев'ю БЕЗ прорахунку в базі й живе в списку поруч із рештою.
 * Порядок створення — головне: скільки разів покликали створення до натиску
 * «Створити».
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

/**
 * Методи виду й історія їх уживання (REQ-182#p16): два запити з `useKindMethods`.
 * Ланцюжок PostgREST підроблено мінімально — відповідь залежить лише від таблиці.
 */
const kindMethodRows = [
  { id: "method-embroidery", name: "Вишивка" },
  { id: "method-dtf", name: "ДТФ" },
];
const methodHistoryRows = [
  { methods: [{ method_id: "method-dtf" }] },
  { methods: [{ method_id: "method-dtf" }, { method_id: "method-embroidery" }] },
];
function fakeTable(table: string) {
  const rows = table === "catalog_methods" ? kindMethodRows : table === "quote_items" ? methodHistoryRows : [];
  const chain: Record<string, unknown> = {};
  for (const name of ["select", "eq", "not", "order", "limit"]) chain[name] = () => chain;
  chain.then = (resolve: (value: { data: unknown; error: null }) => void) => resolve({ data: rows, error: null });
  return chain;
}

/**
 * «Схожі в пулі» (REQ-182#p27) шукає через `usePoolCandidates`, який кличе
 * `searchSupplierPool`. Мок — на рівні модуля, а не всередині тесту: без
 * нього КОЖЕН тест, що завантажує файл, стукав би в справжній RPC — а мок
 * supabase вище не має `rpc` узагалі, тож виклик впав би винятком. Порожній
 * список за замовчуванням: рядки файлу з інших тестів («Футболка бавовна»
 * тощо) не питали про кандидатів навмисно, і порожня відповідь для них —
 * саме те, що й мало бути.
 */
const searchSupplierPool = vi.fn(
  async (_term: string, _options?: { limit?: number; mustContain?: string[] }): Promise<SupplierPoolProduct[]> => []
);
vi.mock("@/lib/supplierPool", async () => {
  const actual = await vi.importActual<typeof import("@/lib/supplierPool")>("@/lib/supplierPool");
  return {
    ...actual,
    searchSupplierPool: (term: string, options?: { limit?: number; mustContain?: string[] }) =>
      searchSupplierPool(term, options),
  };
});

vi.mock("@/lib/supabaseClient", () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: { access_token: "token" } } }) },
    schema: () => ({ from: (table: string) => fakeTable(table) }),
  },
}));

const insertQuoteItemRow = vi.fn(async (payload: Record<string, unknown>) => {
  void payload;
  return { ok: true as const, data: { id: "item-1" } };
});
const persistQuoteRuns = vi.fn(async () => ({ ok: true as const }));
const insertCatalogModelRow = vi.fn(async (payload: Record<string, unknown>) => {
  void payload;
  return { ok: true as const, data: { id: "model-new" } };
});

const fetchCatalogBase = vi.fn(async () => ({
  ok: true as const,
  data: {
    typeRows: [
      { id: "t-cloth", name: "Одяг", quote_type: "merch" },
      { id: "t-paper", name: "Папір", quote_type: "print" },
    ],
    kindRows: [
      { id: "k-hoodie", type_id: "t-cloth", name: "Худі" },
      { id: "k-notebook", type_id: "t-paper", name: "Блокнот" },
      // Для кандидата з пулу (REQ-182#p27): «Жилетка флісова Mercury» мусить
      // вгадати вид «Жилетка», щоб нанесення з ТЗ мало на чому зіставитись.
      { id: "k-vest", type_id: "t-cloth", name: "Жилетка" },
    ],
    modelRows: [
      { id: "m-lenny", kind_id: "k-hoodie", name: "Реглан LENNY", image_url: "https://cdn/lenny.jpg" },
      { id: "m-a5", kind_id: "k-notebook", name: "Блокнот А5", image_url: null },
    ],
  },
}));

/**
 * Пошук за артикулом КОЛЬОРУ (REQ-250#p1): база віддає сам варіант, і його id
 * має долетіти до позиції прорахунку. Без цього моку хук просто не сходив би в
 * базу — решта тестів шукає кирилицею, а вона в базу не ходить.
 */
const fetchCatalogVariantsBySku = vi.fn(async () => ({
  ok: true as const,
  data: [{ modelId: "m-lenny", variantId: "v-green", variantName: "Зелений", sku: "U0102-Green" }],
}));

const insertPrintPositionRow = vi.fn(async (payload: Record<string, unknown>) => {
  void payload;
  return { ok: true as const, data: { id: "place-new" } };
});

vi.mock("@/features/quotes/quote-details/queries", () => ({
  insertQuoteItemRow: (payload: Record<string, unknown>) => insertQuoteItemRow(payload),
  persistQuoteRuns: () => persistQuoteRuns(),
  fetchCatalogBase: () => fetchCatalogBase(),
  insertCatalogModelRow: (payload: Record<string, unknown>) => insertCatalogModelRow(payload),
  // Пошук наявної моделі за видом і назвою — щоб той самий товар удруге не
  // впирався в унікальний індекс (kind_id, name). Тут його немає завжди:
  // сценарії заводять товар уперше.
  findCatalogModelByKindAndName: () => findCatalogModelByKindAndName(),
  updateCatalogModelImage: async () => undefined,
  setQuoteRunCostFromPool: async () => null,
  fetchKindPrintPositions: async () => ({ ok: true as const, data: [] }),
  insertPrintPositionRow: (payload: Record<string, unknown>) => insertPrintPositionRow(payload),
  fetchCatalogVariantsBySku: () => fetchCatalogVariantsBySku(),
}));

const findCatalogModelByKindAndName = vi.fn(async () => null);

const runDefaults = { markupRate: 40, managerRate: 10, fixedCostRate: 30, vatRate: 20 };

function renderWizard(overrides: Partial<React.ComponentProps<typeof QuoteWizardDialog>> = {}) {
  const prepareQuote = vi.fn(async () => "quote-1");
  const onCreated = vi.fn();
  /**
   * Клієнт React Query потрібен, відколи поле позиції шукає ще й у пулі
   * постачальників (REQ-250#p3). Свій на кожен рендер — щоб кеш не перетікав
   * між тестами; retry вимкнено, інакше невдалий запит тягнув би тест у таймаут.
   */
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <QuoteWizardDialog
        open
        onOpenChange={() => {}}
        teamId="team-1"
        header={() => <div>шапка прорахунку</div>}
        headerIssue={null}
        runDefaultsFor={() => runDefaults}
        onPrepareQuote={prepareQuote}
        onCreated={onCreated}
        {...overrides}
      />
    </QueryClientProvider>
  );
  return { prepareQuote, onCreated };
}

describe("QuoteWizardDialog — один екран", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    insertQuoteItemRow.mockClear();
    fetchCatalogVariantsBySku.mockClear();
    persistQuoteRuns.mockClear();
    insertCatalogModelRow.mockClear();
    insertPrintPositionRow.mockClear();
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

  it("шапка, два типи виробу, одне поле і плитка файлу стоять на одному екрані", () => {
    renderWizard();
    expect(screen.getByText("шапка прорахунку")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Поліграфія/ })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Товар/ })).toBeChecked();
    // «Інше» прибрано (REQ-182): це був дефолт при заведенні категорії, а не вибір.
    expect(screen.queryByRole("radio", { name: /Інше/ })).not.toBeInTheDocument();
    // Вкладок джерела більше немає (REQ-182#p14): поле саме розуміє, що набрали.
    expect(screen.queryByRole("tablist", { name: "Джерело позицій" })).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Товар: посилання або назва" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Обрати файл Excel чи Word" })).toBeInTheDocument();
  });

  it("у «Поліграфії» поле позицій більше не просить товар (REQ-178#p11)", async () => {
    const user = userEvent.setup();
    renderWizard();

    await user.click(screen.getByRole("radio", { name: /Поліграфія/ }));

    expect(screen.getByRole("combobox", { name: "Позиція: посилання або назва" })).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Товар: посилання або назва" })).not.toBeInTheDocument();
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

    await waitFor(() => expect(prepareQuote).toHaveBeenCalledWith("merch", null));
    expect(insertQuoteItemRow).toHaveBeenCalledTimes(1);
    expect(insertQuoteItemRow.mock.calls[0][0]).toMatchObject({ quote_id: "quote-1", name: "Футболка бавовна" });
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith("quote-1"));
  });

  it("шапка пропущеного рахує рядки файлу, а не зауваги моделі", async () => {
    // ТЗ на жилетку (24.09.2026): одна заувага «пропущено заголовки, критерії й
    // документи» показувалась як «1 рядок з файлу не став позицією», хоча поза
    // позицією лишилось 46 рядків із 59.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          items: [
            {
              sourceRows: [2],
              name: "Флісова жилетка",
              comment: "Фліс від 260 г/м²",
              links: [],
              runs: [{ quantity: 650 }],
              flags: [],
              notes: null,
              variantGroup: null,
            },
          ],
          warnings: ["Пропущено заголовки, критерії оцінки й перелік документів."],
          model: "test",
          costUsd: 0,
          fileName: "tz.csv",
        }),
      })) as unknown as typeof fetch
    );
    // Читання файлу в цьому наборі підмінене одним рядком — тут потрібні чотири.
    const { readWorkbookSheets } = await import("@/features/quotes/quote-import/readWorkbook");
    vi.mocked(readWorkbookSheets).mockResolvedValueOnce([
      { name: "ТЗ", rows: [["Позиція", "К-сть"], ["Флісова жилетка", 650], ["Критерії оцінки"], ["Документи"]], links: [] },
    ]);
    const user = userEvent.setup();
    renderWizard();

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, new File(["x"], "tz.csv", { type: "text/csv" }));
    await waitFor(() => expect(screen.getByDisplayValue("Флісова жилетка")).toBeInTheDocument());

    expect(screen.getByText("3 рядки з файлу не стали позиціями")).toBeInTheDocument();
  });

  it("без замовника файл беруть, а створити не дають", () => {
    // Дропзона відкрита навмисно: прорахунок з'являється лише на «Створити»,
    // тож розібрати файл раніше нічим не шкодить. Замовника вимагає саме
    // створення, і підвал каже про це словами — мовчазна сіра кнопка читалась
    // би як поломка.
    renderWizard({ headerIssue: "Оберіть замовника — прорахунок створюється на нього." });

    expect(screen.getByRole("button", { name: "Обрати файл Excel чи Word" })).not.toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText(/Оберіть замовника/)).toBeInTheDocument();
    // Кнопка не мовчить: без позицій вона вимкнена, а з позиціями натиск
    // покаже, чого бракує, замість того щоб не робити нічого.
    expect(screen.getByRole("button", { name: /Створити прорахунок/ })).toBeDisabled();
  });

  it("назви немає в базі: останній рядок підказок додає її як нову позицію, без каталогу", async () => {
    const user = userEvent.setup();
    const { prepareQuote } = renderWizard();
    const field = screen.getByRole("combobox", { name: "Товар: посилання або назва" });

    await user.type(field, "Кепка six-panel");
    // Поле каже, як воно це прочитало.
    expect(screen.getByText("Шукаю за назвою")).toBeInTheDocument();
    const list = await screen.findByRole("listbox", { name: "Підказки з каталогу" });
    // findBy, а не getBy: «нічого немає» тепер чекає на КІНЕЦЬ пошуку, разом із
    // паузою перед запитом до пулу. Сказати «немає» посеред тієї паузи означало
    // б збрехати рівно тим, хто ще друкує.
    expect(await within(list).findByText("Ні в каталозі, ні в постачальників")).toBeInTheDocument();
    expect(within(list).getAllByRole("option")).toHaveLength(1);

    // Enter сюди більше не веде — рядок «додати як нову» вимагає свідомого
    // кліку (REQ-250, 08.09.2026): поки пул шукається, він лишається єдиним у
    // списку, і випадковий Enter робив із набраного тексту позицію.
    await user.keyboard("{Enter}");
    expect(field).toHaveValue("Кепка six-panel");

    await user.click(within(list).getByRole("option", { name: /як нову позицію/ }));
    expect(screen.getByDisplayValue("Кепка six-panel")).toBeInTheDocument();
    // Поле очистилось і лишилось у фокусі — далі набирають наступний товар.
    expect(field).toHaveValue("");
    expect(field).toHaveFocus();

    const create = screen.getByRole("button", { name: /Створити прорахунок/ });
    // Тираж порожній навмисно. Кнопка при цьому НЕ мовчить: натиск називає,
    // чого бракує, замість того щоб не робити нічого.
    await user.click(create);
    expect(prepareQuote).not.toHaveBeenCalled();
    expect(screen.getByText(/Впишіть тираж/)).toBeInTheDocument();

    await user.type(screen.getByRole("textbox", { name: "Кількість тиражу" }), "250");
    await user.click(screen.getByRole("radio", { name: /Поліграфія/ }));
    // Поліграфія вимагає типу угоди — від нього залежить дно ціни (REQ-182#p25).
    await user.click(screen.getByRole("button", { name: /Оберіть тип угоди/ }));
    await user.click(await screen.findByRole("menuitem", { name: /Стандартний виробничий/ }));
    expect(create).toBeEnabled();
    await user.click(create);

    await waitFor(() => expect(prepareQuote).toHaveBeenCalledWith("print", "standard"));
    expect(insertQuoteItemRow.mock.calls[0][0]).toMatchObject({
      name: "Кепка six-panel",
      qty: 250,
      catalog_model_id: null,
    });
  });

  it("назва з бази: підказка з фото й категорією, позиція лягає з catalog_*_id", async () => {
    const user = userEvent.setup();
    const { prepareQuote } = renderWizard();
    const field = screen.getByRole("combobox", { name: "Товар: посилання або назва" });

    // «худі» знаходить реглан за ВИДОМ — слова «худі» в назві моделі немає.
    await user.type(field, "худі");
    const list = await screen.findByRole("listbox", { name: "Підказки з каталогу" });
    // Каталог тепер під постачальниками і згорнутий — розкриваємо його,
    // перш ніж шукати модель (REQ-250, 08.09.2026).
    await user.click(await within(list).findByRole("button", { name: /Уже в каталозі/ }));
    const option = await within(list).findByRole("option", { name: /Реглан LENNY/ });
    expect(within(option).getByText("Худі · Одяг")).toBeInTheDocument();
    expect(within(option).getByRole("img", { name: "Реглан LENNY" })).toHaveAttribute("src", "https://cdn/lenny.jpg");

    await user.click(option);
    // Назва з бази — підпис, а не поле (REQ-250#p34): товар прийшов із готовою.
    expect(screen.getByText("Реглан LENNY")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Назва позиції" })).not.toBeInTheDocument();
    expect(screen.getByText("Худі · Одяг")).toBeInTheDocument();
    expect(field).toHaveValue("");

    await user.type(screen.getByRole("textbox", { name: "Кількість тиражу" }), "40");
    await user.click(screen.getByRole("button", { name: /Створити прорахунок/ }));

    await waitFor(() => expect(prepareQuote).toHaveBeenCalledWith("merch", null));
    expect(insertQuoteItemRow.mock.calls[0][0]).toMatchObject({
      name: "Реглан LENNY",
      catalog_model_id: "m-lenny",
      catalog_kind_id: "k-hoodie",
      catalog_type_id: "t-cloth",
    });
  });

  it("артикул кольору: позиція запам'ятовує САМЕ той колір, а не перший варіант моделі", async () => {
    // До REQ-250#p1 позиція знала лише модель, і в замовлення їхав артикул
    // першого кольору. Тепер база віддає сам варіант, і його id лягає в рядок.
    const user = userEvent.setup();
    const { prepareQuote } = renderWizard();
    const field = screen.getByRole("combobox", { name: "Товар: посилання або назва" });

    await user.type(field, "U0102-Green");
    const list = await screen.findByRole("listbox", { name: "Підказки з каталогу" });
    // Каталог тепер під постачальниками і згорнутий — розкриваємо його,
    // перш ніж шукати модель (REQ-250, 08.09.2026).
    await user.click(await within(list).findByRole("button", { name: /Уже в каталозі/ }));
    const option = await within(list).findByRole("option", { name: /Реглан LENNY/ });
    // У підказці видно ТОЙ артикул, який шукали.
    expect(within(option).getByText(/U0102-Green/)).toBeInTheDocument();

    await user.click(option);
    await user.type(screen.getByRole("textbox", { name: "Кількість тиражу" }), "40");
    await user.click(screen.getByRole("button", { name: /Створити прорахунок/ }));

    await waitFor(() => expect(prepareQuote).toHaveBeenCalled());
    expect(insertQuoteItemRow.mock.calls[0][0]).toMatchObject({
      catalog_model_id: "m-lenny",
      catalog_variant_id: "v-green",
    });
  });

  it("позиція з каталогу: метод чипом за історією виду, місце вписується руками й стає рядком довідника", async () => {
    const user = userEvent.setup();
    const { prepareQuote } = renderWizard();

    await user.type(screen.getByRole("combobox", { name: "Товар: посилання або назва" }), "худі");
    const list = await screen.findByRole("listbox", { name: "Підказки з каталогу" });
    // Каталог тепер під постачальниками і згорнутий — розкриваємо його,
    // перш ніж шукати модель (REQ-250, 08.09.2026).
    await user.click(await within(list).findByRole("button", { name: /Уже в каталозі/ }));
    await user.click(await within(list).findByRole("option", { name: /Реглан LENNY/ }));

    const group = await screen.findByRole("group", { name: "Нанесення" });
    const chips = within(group).getAllByRole("button");
    // ДТФ уживали двічі, вишивку раз — ДТФ стоїть першим, хоч за абеткою був би другим.
    // «інші» — дорога до решти довідника методів (REQ-292): є навіть тоді, коли
    // всі методи виду вже видно чипами.
    expect(chips.map((chip) => chip.textContent)).toEqual(["Без нанесення", "ДТФ", "Вишивка", "інші"]);
    expect(chips[0]).toHaveAttribute("aria-pressed", "true");

    // Клік по методу створює ПАРУ, і рядок одразу питає про місце.
    await user.click(within(group).getByRole("button", { name: "ДТФ" }));
    const pair = await within(group).findByRole("button", { name: "Нанесення: ДТФ, місце не вказане" });
    expect(pair).toHaveTextContent("місце?");

    // Довідник місць цього виду порожній (так у 89 видів із 92) — місце вписують.
    await user.click(pair);
    await user.type(await screen.findByRole("textbox", { name: "Своє місце нанесення" }), "По центру спини{Enter}");
    await within(group).findByRole("button", { name: "Нанесення: ДТФ, місце По центру спини" });

    await user.type(screen.getByRole("textbox", { name: "Кількість тиражу" }), "40");
    await user.click(screen.getByRole("button", { name: /Створити прорахунок/ }));
    await waitFor(() => expect(prepareQuote).toHaveBeenCalled());

    // Вписане місце стало рядком довідника ЦЬОГО виду, а не текстом у json.
    expect(insertPrintPositionRow).toHaveBeenCalledTimes(1);
    expect(insertPrintPositionRow.mock.calls[0][0]).toMatchObject({ kind_id: "k-hoodie", label: "По центру спини" });
    expect(insertQuoteItemRow.mock.calls[0][0]).toMatchObject({
      print_position_id: "place-new",
      methods: [
        {
          method_id: "method-dtf",
          count: 1,
          print_position_id: "place-new",
          print_position_label: "По центру спини",
        },
      ],
    });
  });

  it("нанесення прибирається — позиція повертається до «Без нанесення» й пише methods: null", async () => {
    const user = userEvent.setup();
    const { prepareQuote } = renderWizard();

    await user.type(screen.getByRole("combobox", { name: "Товар: посилання або назва" }), "худі");
    const list = await screen.findByRole("listbox", { name: "Підказки з каталогу" });
    // Каталог тепер під постачальниками і згорнутий — розкриваємо його,
    // перш ніж шукати модель (REQ-250, 08.09.2026).
    await user.click(await within(list).findByRole("button", { name: /Уже в каталозі/ }));
    await user.click(await within(list).findByRole("option", { name: /Реглан LENNY/ }));

    const group = await screen.findByRole("group", { name: "Нанесення" });
    await user.click(within(group).getByRole("button", { name: "ДТФ" }));
    await user.click(await within(group).findByRole("button", { name: "Прибрати нанесення ДТФ" }));
    expect(within(group).getByRole("button", { name: "Без нанесення" })).toHaveAttribute("aria-pressed", "true");

    await user.type(screen.getByRole("textbox", { name: "Кількість тиражу" }), "40");
    await user.click(screen.getByRole("button", { name: /Створити прорахунок/ }));
    await waitFor(() => expect(prepareQuote).toHaveBeenCalled());
    expect(insertQuoteItemRow.mock.calls[0][0]).toMatchObject({ methods: null });
    expect(insertPrintPositionRow).not.toHaveBeenCalled();
  });

  it("за посиланням: вид вгадується з назви сторінки, на «Створити» товар стає рядком каталогу", async () => {
    const user = userEvent.setup();
    const { prepareQuote } = renderWizard();
    await user.type(screen.getByRole("combobox", { name: "Товар: посилання або назва" }), "https://shop.example/hoodie{Enter}");
    await waitFor(() => expect(screen.getByDisplayValue("Худі оверсайз Classic")).toBeInTheDocument());

    // «Худі оверсайз Classic» → вид «Худі», і методи цього виду поруч.
    const kindChip = await screen.findByRole("button", { name: "Вид товару: Худі, припущення" });
    // Здогад підписаний рамкою й доступною назвою, а не словом у чипі: «додасться
    // в базу» під назвою каже те саме, і третій раз забирав ширину (REQ-250#p36).
    expect(kindChip).toHaveTextContent("Худі");
    expect(kindChip).not.toHaveTextContent("припущення");
    // Пунктир — єдина ознака, що моделі ще немає: службову помітку «додасться
    // в базу» прибрано, вона описувала нашу кухню, а не товар (REQ-250#p43).
    expect(kindChip.className).toContain("border-dashed");
    expect(screen.queryByText("додасться в базу")).not.toBeInTheDocument();
    expect(await screen.findByRole("group", { name: "Нанесення" })).toBeInTheDocument();

    await user.type(screen.getByRole("textbox", { name: "Кількість тиражу" }), "50");
    await user.click(screen.getByRole("button", { name: /Створити прорахунок/ }));
    await waitFor(() => expect(prepareQuote).toHaveBeenCalled());

    // Рядок каталогу заводиться лише на «Створити», з видом, назвою і посиланням постачальника.
    expect(insertCatalogModelRow).toHaveBeenCalledTimes(1);
    expect(insertCatalogModelRow.mock.calls[0][0]).toMatchObject({
      team_id: "team-1",
      kind_id: "k-hoodie",
      name: "Худі оверсайз Classic",
      image_url: null,
      metadata: { source: { vendor: "link", url: "https://shop.example/hoodie" }, supplierUrl: "https://shop.example/hoodie" },
    });
    expect(insertQuoteItemRow.mock.calls[0][0]).toMatchObject({
      catalog_model_id: "model-new",
      catalog_kind_id: "k-hoodie",
      catalog_type_id: "t-cloth",
    });
  });

  it("вид не вгадали — чипів нанесення немає, а людина ставить вид сама й рядок іде в каталог", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ status: "done", imageUrl: "https://shop.example/x.jpg", title: "Реглан LENNY" }),
      })) as unknown as typeof fetch
    );
    const { prepareQuote } = renderWizard();
    await user.type(screen.getByRole("combobox", { name: "Товар: посилання або назва" }), "https://shop.example/a{Enter}");
    await waitFor(() => expect(screen.getByDisplayValue("Реглан LENNY")).toBeInTheDocument());
    expect(screen.queryByRole("group", { name: "Нанесення" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Вид товару" }));
    await user.click(await screen.findByRole("option", { name: "Худі" }));
    expect(await screen.findByRole("group", { name: "Нанесення" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Вид товару: Худі" })).toBeInTheDocument();

    await user.type(screen.getByRole("textbox", { name: "Кількість тиражу" }), "50");
    await user.click(screen.getByRole("button", { name: /Створити прорахунок/ }));
    await waitFor(() => expect(prepareQuote).toHaveBeenCalled());
    expect(insertCatalogModelRow).toHaveBeenCalledTimes(1);
    expect(insertQuoteItemRow.mock.calls[0][0]).toMatchObject({ catalog_model_id: "model-new", catalog_kind_id: "k-hoodie" });
  });

  it("назва руками без виду — каталог не чіпається", async () => {
    const user = userEvent.setup();
    const { prepareQuote } = renderWizard();
    await user.type(screen.getByRole("combobox", { name: "Товар: посилання або назва" }), "Кепка six-panel");
    await user.click(await screen.findByRole("option", { name: /як нову позицію/ }));
    await user.type(screen.getByRole("textbox", { name: "Кількість тиражу" }), "50");
    await user.click(screen.getByRole("button", { name: /Створити прорахунок/ }));
    await waitFor(() => expect(prepareQuote).toHaveBeenCalled());
    expect(insertCatalogModelRow).not.toHaveBeenCalled();
    expect(insertQuoteItemRow.mock.calls[0][0]).toMatchObject({ catalog_model_id: null, catalog_kind_id: null });
  });

  it("другий тираж не додається, поки перший порожній", async () => {
    const user = userEvent.setup();
    renderWizard();

    await user.type(screen.getByRole("combobox", { name: "Товар: посилання або назва" }), "Кепка six-panel");
    await user.click(await screen.findByRole("option", { name: /як нову позицію/ }));
    const add = screen.getByRole("button", { name: "Додати ще тираж" });
    // Порожній тираж — це незадане питання, а не варіант: додавати другий нема сенсу.
    expect(add).toBeDisabled();
    expect(screen.getAllByRole("textbox", { name: "Кількість тиражу" })).toHaveLength(1);

    await user.type(screen.getByRole("textbox", { name: "Кількість тиражу" }), "100");
    expect(add).toBeEnabled();
    await user.click(add);
    expect(screen.getAllByRole("textbox", { name: "Кількість тиражу" })).toHaveLength(2);
    // Новий порожній знову замикає кнопку, доки в нього не впишуть число.
    expect(add).toBeDisabled();
  });

  it("перший товар із поліграфічного типу перемикає «Рахуємо» на поліграфію", async () => {
    const user = userEvent.setup();
    renderWizard();

    await user.type(screen.getByRole("combobox", { name: "Товар: посилання або назва" }), "блокнот");
    const list = await screen.findByRole("listbox", { name: "Підказки з каталогу" });
    // Каталог тепер під постачальниками і згорнутий — розкриваємо його,
    // перш ніж шукати модель (REQ-250, 08.09.2026).
    await user.click(await within(list).findByRole("button", { name: /Уже в каталозі/ }));
    await user.click(await within(list).findByRole("option", { name: /Блокнот А5/ }));

    expect(screen.getByRole("radio", { name: /Поліграфія/ })).toBeChecked();
  });

  it("за посиланням: назва зі сторінки стає позицією, поле впізнає адресу", async () => {
    const user = userEvent.setup();
    renderWizard();

    const field = screen.getByRole("combobox", { name: "Товар: посилання або назва" });
    await user.type(field, "https://shop.example/hoodie");
    expect(screen.getByText("Посилання")).toBeInTheDocument();
    // На адресу підказок із бази немає — нема чого шукати.
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    await user.keyboard("{Enter}");

    await waitFor(() => expect(screen.getByDisplayValue("Худі оверсайз Classic")).toBeInTheDocument());
    // Опис зі сторінки не тягнемо: у магазинів це рекламний абзац.
    expect(screen.queryByDisplayValue("Бавовна 80 %, начіс усередині.")).not.toBeInTheDocument();
    // Джерело підписане САЙТОМ, а не адресою (REQ-250#p34); повна лишилась у title.
    const source = screen.getByRole("link", { name: "Shop" });
    expect(source).toHaveAttribute("href", "https://shop.example/hoodie");

    await user.type(screen.getByRole("textbox", { name: "Кількість тиражу" }), "300");
    expect(screen.getByRole("button", { name: /Створити прорахунок/ })).toBeEnabled();
  });

  it("за посиланням: товари накопичуються, кілька посилань за раз", async () => {
    // Прорахунок на кілька товарів — звичайна справа; те, що в базі їх мало,
    // каже лише про те, що складне досі рахують у телеграмі.
    const user = userEvent.setup();
    renderWizard();

    const input = screen.getByRole("combobox", { name: "Товар: посилання або назва" });

    await user.type(input, "https://shop.example/a{Enter}");
    await waitFor(() => expect(screen.getAllByRole("textbox", { name: "Назва позиції" })).toHaveLength(1));

    // Поле не блокується: наступне посилання вставляють, не чекаючи сайту.
    expect(input).toBeEnabled();

    // Два посилання одним рядком — дві позиції.
    await user.type(input, "https://shop.example/b https://shop.example/c{Enter}");
    await waitFor(() => expect(screen.getAllByRole("textbox", { name: "Назва позиції" })).toHaveLength(3));

    // Три позиції — три джерела; підпис у всіх один, бо сайт справді один.
    expect(screen.getAllByRole("link", { name: "Shop" })).toHaveLength(3);
  });

  it("файл і поле живуть в одному списку: «Інший файл» прибирає лише рядки файлу", async () => {
    const user = userEvent.setup();
    renderWizard();

    await user.type(screen.getByRole("combobox", { name: "Товар: посилання або назва" }), "https://shop.example/a{Enter}");
    await waitFor(() => expect(screen.getAllByRole("textbox", { name: "Назва позиції" })).toHaveLength(1));

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(fileInput, new File(["x"], "zapyt.csv", { type: "text/csv" }));
    await waitFor(() => expect(screen.getByDisplayValue("Футболка бавовна")).toBeInTheDocument());
    expect(screen.getAllByRole("textbox", { name: "Назва позиції" })).toHaveLength(2);

    await user.click(screen.getByRole("button", { name: "Інший файл" }));
    expect(screen.queryByDisplayValue("Футболка бавовна")).not.toBeInTheDocument();
    expect(screen.getAllByRole("textbox", { name: "Назва позиції" })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Обрати файл Excel чи Word" })).toBeInTheDocument();
  });
});

/**
 * Тип угоди задає накрутку в тиражах і дно, нижче якого ціну погоджує СЕО. До
 * 11.09.2026 візард його не передавав узагалі, тож поліграфічний прорахунок
 * мовчки лягав на дефолт бази — і помилку було видно лише в грошах.
 */
describe("тип угоди при створенні", () => {
  it("питають лише на поліграфії", async () => {
    const user = userEvent.setup();
    renderWizard();

    // На товарі чинна стара шкала СЕО — питати там нема про що.
    expect(screen.queryByText("Тип угоди")).toBeNull();

    await user.click(screen.getByRole("radio", { name: /Поліграфія/ }));
    expect(screen.getByText("Тип угоди")).toBeInTheDocument();

    /*
      Перша версія поля взяла `Chip`, а той загортає всіх дітей в один
      `<span class="font-medium">` без flex — шеврон перенісся під текст, а
      підпис відірвався від лівого краю. Очима це видно одразу, а tsc і лінт
      мовчать, тож тримаємо структуру тестом: підпис і шеврон — ПРЯМІ діти
      кнопки, і вона не кругла.
    */
    const trigger = screen.getByRole("button", { name: /Оберіть тип угоди/ });
    expect(trigger.className).toContain("rounded-lg");
    expect(trigger.className).not.toContain("rounded-full");
    const kids = Array.from(trigger.children);
    expect(kids).toHaveLength(3);
    expect(kids[1].textContent).toBe("Оберіть тип угоди");
    expect(kids[2].tagName.toLowerCase()).toBe("svg");
  });

  it("поліграфію без типу угоди не створює, а з обраним — передає його далі", async () => {
    const user = userEvent.setup();
    const { prepareQuote } = renderWizard();

    const field = screen.getByRole("combobox", { name: "Товар: посилання або назва" });
    await user.type(field, "Щоденник А5");
    const list = await screen.findByRole("listbox", { name: "Підказки з каталогу" });
    await user.click(await within(list).findByRole("option", { name: /як нову позицію/ }));
    await user.type(screen.getByRole("textbox", { name: "Кількість тиражу" }), "100");
    await user.click(screen.getByRole("radio", { name: /Поліграфія/ }));

    const create = screen.getByRole("button", { name: /Створити прорахунок/ });
    await user.click(create);
    expect(prepareQuote).not.toHaveBeenCalled();
    expect(screen.getByText(/Тип угоди не обрано/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Оберіть тип угоди/ }));
    await user.click(await screen.findByRole("menuitem", { name: /Тендер/ }));
    await user.click(create);
    await waitFor(() => expect(prepareQuote).toHaveBeenCalledWith("print", "tender"));
  });
});

/**
 * Позиція з файлу пропонує схожі товари з пулу, а нанесення з ТЗ стає чипами
 * (REQ-182#p27, #p28). Кандидати шукаються за назвою файлу; клік прив'язує
 * товар тим самим набором полів, що й вибір у полі («Товар»), а слова
 * клієнта лишаються першим рядком опису. Нанесення з ТЗ («Вишивка · груди
 * ліворуч») стає чипом позиції, щойно в неї з'являється вид і його методи.
 */
describe("«Схожі в пулі» і нанесення з ТЗ (REQ-182#p27, #p28)", () => {
  const poolProduct: SupplierPoolProduct = {
    key: "pool-1",
    supplierSlug: "totobi.com.ua",
    article: "M-123",
    name: "Жилетка флісова Mercury",
    vendor: null,
    category: null,
    isKids: false,
    url: "https://totobi.com.ua/mercury",
    imageUrl: "https://totobi.com.ua/mercury.jpg",
    currency: "UAH",
    priceKind: "wholesale",
    priceMin: 480,
    priceMax: 480,
    variantCount: 1,
    variants: [],
    variantsAreColors: false,
    variantsHaveSizes: false,
    sources: [],
    priceRowId: "pr-1",
  };

  beforeEach(() => {
    searchSupplierPool.mockReset();
    searchSupplierPool.mockResolvedValue([poolProduct]);
  });

  it("клік по кандидату прив'язує товар, а нанесення з ТЗ стає чипом позиції", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          items: [
            {
              sourceRows: [2],
              name: "Флісова жилетка",
              comment: null,
              links: [],
              runs: [{ quantity: 650 }],
              flags: [],
              notes: null,
              imprint: { method: "Вишивка", place: "груди ліворуч", size: null, colors: null },
            },
          ],
          warnings: [],
          model: "test",
          costUsd: 0,
          fileName: "tz.csv",
        }),
      })) as unknown as typeof fetch
    );
    const user = userEvent.setup();
    const { prepareQuote } = renderWizard();

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, new File(["x"], "tz.csv", { type: "text/csv" }));
    await waitFor(() => expect(screen.getByDisplayValue("Флісова жилетка")).toBeInTheDocument());

    // «Схожі в пулі» шукає СТЕМОМ головного слова назви, а не цілою фразою
    // (REQ-182#p27, `poolQueryPlan.ts`): «Флісова жилетка» → термін «жиле»
    // (останнє значуще слово — «жилетка»), «фліс» — обов'язкова домішка.
    // Картка кандидата з'являється, коли пошук пулу завершився.
    const pick = await screen.findByRole("button", { name: "Обрати «Жилетка флісова Mercury»" });
    expect(searchSupplierPool).toHaveBeenCalledWith("жиле", { limit: 5, mustContain: ["фліс"] });
    await user.click(pick);

    // Клік прив'язує товар: назва стає назвою товару, кандидатів більше нема.
    expect(screen.getByText("Жилетка флісова Mercury")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Обрати «Жилетка флісова Mercury»" })).not.toBeInTheDocument();

    // Нанесення з ТЗ («Вишивка · груди ліворуч») стає чипом, щойно в позиції
    // з'явився вид і методи цього виду доїхали (REQ-182#p28) — похідно, без
    // ефекту: `withHintImprints` рахується просто на кожному рендері наново.
    const group = await screen.findByRole("group", { name: "Нанесення" });
    expect(
      within(group).getByRole("button", { name: "Нанесення: Вишивка, місце груди ліворуч" })
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Створити прорахунок/ }));
    await waitFor(() => expect(prepareQuote).toHaveBeenCalled());

    expect(insertQuoteItemRow.mock.calls[0][0]).toMatchObject({
      name: "Жилетка флісова Mercury",
      // Слова клієнта лишаються першим рядком опису — незалежно від того, що
      // саме модель написала в comment/requirements/imprint далі.
      description: expect.stringMatching(/^За ТЗ: Флісова жилетка/),
      methods: [expect.objectContaining({ method_id: "method-embroidery", print_position_label: "груди ліворуч" })],
    });
  });

  it("перший план пустий — пробує наступний, а не здається одразу", async () => {
    // «жиле» + mustContain «фліс» нічого не дав (наприклад, пул звужений під
    // інший бренд) — план №2 («фліс» + mustContain «жиле») мусить піти сам,
    // без додаткової дії людини.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          items: [
            {
              sourceRows: [2],
              name: "Флісова жилетка",
              comment: null,
              links: [],
              runs: [{ quantity: 650 }],
              flags: [],
              notes: null,
              imprint: null,
            },
          ],
          warnings: [],
          model: "test",
          costUsd: 0,
          fileName: "tz.csv",
        }),
      })) as unknown as typeof fetch
    );
    searchSupplierPool.mockReset();
    searchSupplierPool.mockResolvedValueOnce([]);
    searchSupplierPool.mockResolvedValueOnce([poolProduct]);
    const user = userEvent.setup();
    renderWizard();

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, new File(["x"], "tz.csv", { type: "text/csv" }));

    await screen.findByRole("button", { name: "Обрати «Жилетка флісова Mercury»" });
    expect(searchSupplierPool).toHaveBeenNthCalledWith(1, "жиле", { limit: 5, mustContain: ["фліс"] });
    expect(searchSupplierPool).toHaveBeenNthCalledWith(2, "фліс", { limit: 5, mustContain: ["жиле"] });
  });
});
