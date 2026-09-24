import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";

import type { QuoteImportDraftImprint } from "@/features/quotes/quote-import/types";

import { ImprintChips } from "./ImprintChips";
import { getImprintSheet } from "./imprintSheets";
import type { DirectoryMethodOption, MethodDirectorySource } from "./useKindImprintOptions";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

/**
 * «Інші методи…» у смузі нанесення (REQ-292).
 *
 * Мультитул мав один метод — «Лазерне гравіювання», — і ДТФ на чохлі
 * менеджер поставити не міг ніяк. Тут перевіряється шлях до решти
 * довідника з кожних дверей смуги: чип поруч із методами, «+ нанесення»,
 * чип пари і вікно з ескізом. Запис у базу підроблено: сам він перевіряється
 * в useKindImprintOptions.test.ts.
 */

const DIRECTORY: DirectoryMethodOption[] = [
  { id: "d-emb", name: "Вишивка" },
  { id: "d-dtf", name: "ДТФ" },
  { id: "d-laser", name: "Лазерне гравіювання" },
  { id: "d-uv", name: "УФ-друк" },
  { id: "d-uvdtf", name: "УФ-ДТФ" },
];
const LASER = { id: "m-laser", name: "Лазерне гравіювання" };

function makeDirectory(overrides: Partial<MethodDirectorySource> = {}) {
  const attach = vi.fn(async (entry: DirectoryMethodOption) => ({ id: `m-${entry.id}`, name: entry.name }));
  return { entries: DIRECTORY, failed: false, request: vi.fn(), attach, ...overrides } satisfies MethodDirectorySource;
}

function renderChips({
  methods = [LASER],
  imprints = [],
  directory = makeDirectory(),
}: {
  methods?: Array<{ id: string; name: string }>;
  imprints?: QuoteImportDraftImprint[];
  directory?: MethodDirectorySource;
} = {}) {
  const onChange = vi.fn();
  render(
    <ImprintChips imprints={imprints} methods={methods} places={[]} onChange={onChange} directory={directory} />
  );
  return { onChange, directory };
}

const optionNames = (listName: string) =>
  within(screen.getByRole("listbox", { name: listName }))
    .getAllByRole("option")
    .map((option) => option.textContent);

describe("Інші методи зі спільного довідника", () => {
  beforeEach(() => {
    vi.mocked(toast.error).mockClear();
  });

  it("вид з одним методом: «інші» відкриває довідник без методів виду, а «DTF» і «UV» шукають кирилицю", async () => {
    const user = userEvent.setup();
    renderChips();

    await user.click(screen.getByRole("button", { name: "Інші методи нанесення" }));
    expect(optionNames("Методи з довідника")).toEqual(["Вишивка", "ДТФ", "УФ-друк", "УФ-ДТФ"]);

    const search = screen.getByRole("textbox", { name: "Пошук методу" });
    await user.type(search, "DTF");
    expect(optionNames("Методи з довідника")).toEqual(["ДТФ", "УФ-ДТФ"]);

    await user.clear(search);
    await user.type(search, "UV");
    expect(optionNames("Методи з довідника")).toEqual(["УФ-друк", "УФ-ДТФ"]);
    expect(screen.getByText("Немає в списку? Нову назву додають у Каталозі.")).toBeInTheDocument();
  });

  it("обраний метод спершу стає методом виду, і лише тоді — нанесенням позиції", async () => {
    const user = userEvent.setup();
    const { onChange, directory } = renderChips();

    await user.click(screen.getByRole("button", { name: "Інші методи нанесення" }));
    await user.click(screen.getByRole("option", { name: "ДТФ" }));

    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    expect(directory.attach).toHaveBeenCalledWith({ id: "d-dtf", name: "ДТФ" });
    expect(onChange.mock.calls[0][0]).toEqual([
      expect.objectContaining({ methodId: "m-d-dtf", positionId: null, positionLabel: null }),
    ]);
  });

  it("не вдалося прив'язати — тост із причиною, і фантомного нанесення немає", async () => {
    const user = userEvent.setup();
    const attach = vi.fn(async () => {
      throw { code: "42501", message: "new row violates row-level security policy" };
    });
    const { onChange } = renderChips({ directory: makeDirectory({ attach }) });

    await user.click(screen.getByRole("button", { name: "Інші методи нанесення" }));
    await user.click(screen.getByRole("option", { name: "УФ-ДТФ" }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Не вдалося додати метод «УФ-ДТФ»", {
        description: "new row violates row-level security policy",
      })
    );
    expect(onChange).not.toHaveBeenCalled();
    // Список лишається відкритим — можна спробувати інший метод.
    expect(screen.getByRole("option", { name: "УФ-ДТФ" })).toBeEnabled();
  });

  it("вид без методів — не глухий кут: «обрати метод» веде в довідник", async () => {
    const user = userEvent.setup();
    renderChips({ methods: [] });

    const group = screen.getByRole("group", { name: "Нанесення" });
    const more = within(group).getByRole("button", { name: "Інші методи нанесення" });
    expect(more).toHaveTextContent("обрати метод");

    await user.click(more);
    expect(optionNames("Методи з довідника")).toHaveLength(DIRECTORY.length);
  });

  it("Enter бере перший знайдений", async () => {
    const user = userEvent.setup();
    const { directory } = renderChips();

    await user.click(screen.getByRole("button", { name: "Інші методи нанесення" }));
    await user.type(screen.getByRole("textbox", { name: "Пошук методу" }), "uv{Enter}");

    await waitFor(() => expect(directory.attach).toHaveBeenCalledWith({ id: "d-uv", name: "УФ-друк" }));
  });

  it("метод, що вже є у виду, пошук теж знаходить — окремою групою і без запису в каталог", async () => {
    const user = userEvent.setup();
    const { onChange, directory } = renderChips({ methods: [LASER, { id: "m-dtf", name: "ДТФ" }] });

    await user.click(screen.getByRole("button", { name: "Інші методи нанесення" }));
    await user.type(screen.getByRole("textbox", { name: "Пошук методу" }), "dtf");

    expect(optionNames("Уже є у виду")).toEqual(["ДТФ"]);
    expect(optionNames("Методи з довідника")).toEqual(["УФ-ДТФ"]);

    await user.click(within(screen.getByRole("listbox", { name: "Уже є у виду" })).getByRole("option"));
    expect(directory.attach).not.toHaveBeenCalled();
    expect(onChange.mock.calls[0][0]).toEqual([expect.objectContaining({ methodId: "m-dtf" })]);
  });

  it("«+ нанесення»: під методами виду — «Інші методи…», звідти можна й назад", async () => {
    const user = userEvent.setup();
    const pair = { key: "a", methodId: "m-laser", positionId: null, positionLabel: null };
    const { onChange } = renderChips({ imprints: [pair] });

    await user.click(screen.getByRole("button", { name: "Додати нанесення" }));
    await user.click(screen.getByRole("button", { name: "Інші методи…" }));
    expect(screen.getByRole("textbox", { name: "Пошук методу" })).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "Назад до методів виду" }));
    expect(screen.getByRole("option", { name: "Лазерне гравіювання" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Інші методи…" }));
    await user.click(screen.getByRole("option", { name: "Вишивка" }));
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    expect(onChange.mock.calls[0][0]).toEqual([pair, expect.objectContaining({ methodId: "m-d-emb" })]);
  });

  it("чип пари: метод міняється і на метод із довідника", async () => {
    const user = userEvent.setup();
    const pair = { key: "a", methodId: "m-laser", positionId: null, positionLabel: "Чохол" };
    const { onChange } = renderChips({ imprints: [pair] });

    await user.click(screen.getByRole("button", { name: "Нанесення: Лазерне гравіювання, місце Чохол" }));
    await user.click(screen.getByRole("button", { name: "Інші методи…" }));
    await user.type(screen.getByRole("textbox", { name: "Пошук методу" }), "дтф");
    await user.click(screen.getByRole("option", { name: "ДТФ" }));

    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    expect(onChange.mock.calls[0][0]).toEqual([{ ...pair, methodId: "m-d-dtf" }]);
  });

  it("вікно з ескізом: «Інші методи…» в рейці ставлять метод пари", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const sheet = getImprintSheet("Футболка");
    expect(sheet).not.toBeNull();
    render(
      <ImprintChips
        imprints={[]}
        methods={[{ id: "m-print", name: "Шовкодрук" }]}
        places={[]}
        onChange={onChange}
        directory={makeDirectory()}
        sheet={sheet}
        product={{ name: "Футболка Classic", kindName: "Футболка", sku: null, color: null, imageUrl: null }}
      />
    );

    await user.click(screen.getByRole("button", { name: "Нанесення" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Інші методи…" }));
    await user.click(within(dialog).getByRole("option", { name: "ДТФ" }));
    await user.click(within(dialog).getAllByRole("button", { name: "Груди" })[0]);
    await user.click(within(dialog).getByRole("button", { name: "Готово" }));

    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ methodId: "m-d-dtf", positionLabel: "Груди" }),
    ]);
  });

  it("довідник не завантажився — видно це й можна спробувати ще", async () => {
    const user = userEvent.setup();
    const request = vi.fn();
    renderChips({ directory: makeDirectory({ entries: null, failed: true, request }) });

    await user.click(screen.getByRole("button", { name: "Інші методи нанесення" }));
    expect(screen.getByText(/Довідник методів не завантажився/)).toBeInTheDocument();
    request.mockClear();
    await user.click(screen.getByRole("button", { name: "Спробувати ще" }));
    expect(request).toHaveBeenCalledTimes(1);
  });

  /**
   * Довгий підпис місця (REQ-175#p107). Чип «Вишивка · ліва частина грудей»
   * вилазив за рамку: місце тепер обрізається з «…», а повний текст лишається
   * доступним через title — саме на нього спирається людина, що наводить
   * курсор на обрізаний чип, і скрінрідер через aria-label.
   */
  it("довге місце: title і aria-label несуть повну пару навіть коли видима частина обріже", () => {
    const pair = { key: "a", methodId: "m-laser", positionId: null, positionLabel: "ліва частина грудей" };
    renderChips({ imprints: [pair] });

    const chip = screen.getByRole("button", {
      name: "Нанесення: Лазерне гравіювання, місце ліва частина грудей",
    });
    expect(chip).toHaveAttribute("title", "Лазерне гравіювання · ліва частина грудей");
  });
});
