import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { QuoteImportItem } from "@/features/quotes/quote-import/types";

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
  fetchKindPrintPositions: async () => ({ ok: true as const, data: [] }),
  insertPrintPositionRow: (payload: Record<string, unknown>) => insertPrintPositionRow(payload),
  fetchCatalogVariantsBySku: () => fetchCatalogVariantsBySku(),
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
      header={() => <div>шапка прорахунку</div>}
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
    expect(screen.getByRole("button", { name: "Обрати файл Excel" })).toBeInTheDocument();
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
    expect(screen.getByText("З бази")).toBeInTheDocument();
    const list = await screen.findByRole("listbox", { name: "Підказки з каталогу" });
    expect(within(list).getByText("У базі такого немає")).toBeInTheDocument();
    expect(within(list).getAllByRole("option")).toHaveLength(1);

    await user.keyboard("{Enter}");
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
    expect(create).toBeEnabled();
    await user.click(create);

    await waitFor(() => expect(prepareQuote).toHaveBeenCalledWith("print"));
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
    const option = await within(list).findByRole("option", { name: /Реглан LENNY/ });
    expect(within(option).getByText("Худі · Одяг")).toBeInTheDocument();
    expect(within(option).getByRole("img", { name: "Реглан LENNY" })).toHaveAttribute("src", "https://cdn/lenny.jpg");

    await user.click(option);
    expect(screen.getByDisplayValue("Реглан LENNY")).toBeInTheDocument();
    expect(screen.getByText("Худі · Одяг")).toBeInTheDocument();
    expect(field).toHaveValue("");

    await user.type(screen.getByRole("textbox", { name: "Кількість тиражу" }), "40");
    await user.click(screen.getByRole("button", { name: /Створити прорахунок/ }));

    await waitFor(() => expect(prepareQuote).toHaveBeenCalledWith("merch"));
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
    await user.click(await within(list).findByRole("option", { name: /Реглан LENNY/ }));

    const group = await screen.findByRole("group", { name: "Нанесення" });
    const chips = within(group).getAllByRole("button");
    // ДТФ уживали двічі, вишивку раз — ДТФ стоїть першим, хоч за абеткою був би другим.
    expect(chips.map((chip) => chip.textContent)).toEqual(["Без нанесення", "ДТФ", "Вишивка"]);
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

    // «Худі оверсайз Classic» → вид «Худі», підписаний як припущення, і методи цього виду поруч.
    const kindChip = await screen.findByRole("button", { name: "Вид товару: Худі, припущення" });
    expect(kindChip).toHaveTextContent("припущення");
    expect(screen.getByText("додасться в базу")).toBeInTheDocument();
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
    await user.type(screen.getByRole("combobox", { name: "Товар: посилання або назва" }), "Кепка six-panel{Enter}");
    await user.type(screen.getByRole("textbox", { name: "Кількість тиражу" }), "50");
    await user.click(screen.getByRole("button", { name: /Створити прорахунок/ }));
    await waitFor(() => expect(prepareQuote).toHaveBeenCalled());
    expect(insertCatalogModelRow).not.toHaveBeenCalled();
    expect(insertQuoteItemRow.mock.calls[0][0]).toMatchObject({ catalog_model_id: null, catalog_kind_id: null });
  });

  it("другий тираж не додається, поки перший порожній", async () => {
    const user = userEvent.setup();
    renderWizard();

    await user.type(screen.getByRole("combobox", { name: "Товар: посилання або назва" }), "Кепка six-panel{Enter}");
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
    expect(screen.getByRole("link", { name: "shop.example/hoodie" })).toBeInTheDocument();

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

    expect(screen.getByRole("link", { name: "shop.example/c" })).toBeInTheDocument();
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
    expect(screen.getByRole("button", { name: "Обрати файл Excel" })).toBeInTheDocument();
  });
});
