import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { QuoteItemImprints } from "./QuoteItemImprints";

/**
 * Нанесення редагується в картці товару (REQ-157#p4).
 *
 * Перевіряється те, чого не подивитись у прев'ю: правка пише в базу живий
 * прорахунок, тож клікати руками там не можна. Тут — той самий рядок
 * `quote_items.methods`, що пишуть вікно створення й картка позиції.
 */

const updateQuoteItemRow = vi.fn(async (id: string, patch: Record<string, unknown>) => {
  void id;
  void patch;
  return { ok: true as const, data: null };
});
const insertPrintPositionRow = vi.fn(async (payload: Record<string, unknown>) => {
  void payload;
  return { ok: true as const, data: { id: "place-new" } };
});

vi.mock("./queries", () => ({
  updateQuoteItemRow: (id: string, patch: Record<string, unknown>) => updateQuoteItemRow(id, patch),
  fetchKindPrintPositions: async () => ({ ok: true as const, data: [{ id: "place-chest", label: "Груди" }] }),
  insertPrintPositionRow: (payload: Record<string, unknown>) => insertPrintPositionRow(payload),
}));

vi.mock("./useKindImprintOptions", () => ({
  useKindImprintOptions: () => ({
    byKind: {
      "k-cap": {
        methods: [
          { id: "m-dtf", name: "ДТФ" },
          { id: "m-emb", name: "Вишивка" },
        ],
        places: [{ id: "place-chest", label: "Груди" }],
      },
      // Три методи — щоб третій жив за «ще 1» і список мав що розгортати.
      "k-thermo": {
        methods: [
          { id: "m-decal", name: "Деколь" },
          { id: "m-engrave", name: "Гравіювання" },
          { id: "m-uv", name: "УФ" },
        ],
        places: [],
      },
    },
    reset: () => {},
    // «Інші методи…» (REQ-292) тут не перевіряються — лише щоб смуга рендерилась.
    directoryFor: () => ({ entries: [], failed: false, request: () => {}, attach: vi.fn() }),
  }),
}));

const renderRow = (methods: React.ComponentProps<typeof QuoteItemImprints>["methods"] = []) =>
  render(
    <QuoteItemImprints teamId="team-1" itemId="item-1" kindId="k-cap" methods={methods} />
  );

describe("Нанесення в картці товару", () => {
  beforeEach(() => {
    updateQuoteItemRow.mockClear();
    insertPrintPositionRow.mockClear();
  });

  it("клік по методу заводить пару й одразу пише її в позицію", async () => {
    const user = userEvent.setup();
    renderRow();

    const group = screen.getByRole("group", { name: "Нанесення" });
    await user.click(within(group).getByRole("button", { name: "ДТФ" }));

    await waitFor(() => expect(updateQuoteItemRow).toHaveBeenCalled());
    expect(updateQuoteItemRow.mock.calls[0][1]).toMatchObject({
      methods: [{ method_id: "m-dtf", count: 1, print_position_id: null, print_position_label: null }],
    });
  });

  it("клік по вже увімкненому «Без нанесення» не пише в базу й не просить сторінку перечитатись", async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    render(
      <QuoteItemImprints teamId="team-1" itemId="item-1" kindId="k-cap" methods={[]} onSaved={onSaved} />
    );

    const group = screen.getByRole("group", { name: "Нанесення" });
    const none = within(group).getByRole("button", { name: "Без нанесення" });
    expect(none).toHaveAttribute("aria-pressed", "true");
    await user.click(none);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(updateQuoteItemRow).not.toHaveBeenCalled();
    // `onSaved` — це перечитування всіх позицій сторінкою; саме через нього
    // смуга товарів блимала каркасом на клік, що нічого не міняє.
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("розмір давнього нанесення переживає правку місця", async () => {
    const user = userEvent.setup();
    renderRow([{ methodId: "m-emb", printWidthMm: 100, printHeightMm: 30, count: 2 }]);

    await user.click(screen.getByRole("button", { name: "Нанесення: Вишивка, місце не вказане" }));
    await user.click(await screen.findByRole("option", { name: "Груди" }));

    await waitFor(() => expect(updateQuoteItemRow).toHaveBeenCalled());
    expect(updateQuoteItemRow.mock.calls[0][1]).toMatchObject({
      print_position_id: "place-chest",
      methods: [
        {
          method_id: "m-emb",
          count: 2,
          print_position_id: "place-chest",
          print_position_label: "Груди",
          print_width_mm: 100,
          print_height_mm: 30,
        },
      ],
    });
    // Місце з довідника нового рядка не заводить.
    expect(insertPrintPositionRow).not.toHaveBeenCalled();
  });

  it("вписане місце заводить рядок довідника цього виду", async () => {
    const user = userEvent.setup();
    renderRow([{ methodId: "m-dtf" }]);

    await user.click(screen.getByRole("button", { name: "Нанесення: ДТФ, місце не вказане" }));
    await user.type(await screen.findByRole("textbox", { name: "Своє місце нанесення" }), "під горловиною{Enter}");

    await waitFor(() => expect(insertPrintPositionRow).toHaveBeenCalled());
    expect(insertPrintPositionRow.mock.calls[0][0]).toMatchObject({ kind_id: "k-cap", label: "під горловиною" });
    await waitFor(() =>
      expect(updateQuoteItemRow.mock.calls.at(-1)?.[1]).toMatchObject({
        methods: [{ method_id: "m-dtf", print_position_id: "place-new", print_position_label: "під горловиною" }],
      })
    );
  });
});

/**
 * Позиція без виду (REQ-324#p1). Товар за посиланням, чий вид не вгадався,
 * лягав без виду — і смуги нанесення в картці не було зовсім: менеджер писав
 * нанесення в коментар. Тепер вид обирається тут же, а нанесення пишеться
 * разом із ним, бо метод без виду ніхто не прочитає.
 */
describe("Нанесення позиції без виду", () => {
  const thermo = { kindId: "k-thermo", kindName: "Термо", typeId: "t-dish", typeName: "Посуд" };
  const cap = { kindId: "k-cap", kindName: "Кепка", typeId: "t-cloth", typeName: "Одяг" };
  const bind = vi.fn(async (kind: typeof thermo) => ({
    catalog_type_id: kind.typeId,
    catalog_kind_id: kind.kindId,
    catalog_model_id: `model-${kind.kindId}`,
  }));
  const renderKindless = (guess: typeof thermo | null) =>
    render(
      <QuoteItemImprints
        teamId="team-1"
        itemId="item-1"
        kindId={null}
        methods={[]}
        kindPicker={{ options: [thermo, cap], guess, bind }}
      />
    );

  beforeEach(() => {
    updateQuoteItemRow.mockClear();
    bind.mockClear();
  });

  it("здогад стоїть пунктиром, і перший метод пише вид і нанесення одним записом", async () => {
    const user = userEvent.setup();
    renderKindless(thermo);

    expect(screen.getByRole("button", { name: "Вид товару: Термо, припущення" })).toBeInTheDocument();
    const group = screen.getByRole("group", { name: "Нанесення" });
    await user.click(within(group).getByRole("button", { name: "Деколь" }));

    await waitFor(() => expect(updateQuoteItemRow).toHaveBeenCalledTimes(1));
    expect(bind).toHaveBeenCalledWith(thermo);
    expect(updateQuoteItemRow.mock.calls[0][1]).toMatchObject({
      catalog_type_id: "t-dish",
      catalog_kind_id: "k-thermo",
      catalog_model_id: "model-k-thermo",
      methods: [{ method_id: "m-decal" }],
    });
  });

  it("без здогаду «+ нанесення» веде через вид: вид пишеться одразу, методи розгортаються самі", async () => {
    const user = userEvent.setup();
    renderKindless(null);

    // Методів без виду немає — смуга не вдає, що вони є.
    expect(screen.queryByRole("group", { name: "Нанесення" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Додати нанесення" }));
    await user.click(await screen.findByRole("option", { name: "Термо" }));

    await waitFor(() => expect(updateQuoteItemRow).toHaveBeenCalledTimes(1));
    expect(updateQuoteItemRow.mock.calls[0][1]).toEqual({
      catalog_type_id: "t-dish",
      catalog_kind_id: "k-thermo",
      catalog_model_id: "model-k-thermo",
    });
    // Людина прийшла по нанесення — список методів уже відкритий, третій теж видно.
    expect(await screen.findByRole("option", { name: "УФ" })).toBeInTheDocument();
  });

  it("чужий здогад виправляється чипом виду — і тоді методи не розгортаються", async () => {
    const user = userEvent.setup();
    renderKindless(thermo);

    await user.click(screen.getByRole("button", { name: "Вид товару: Термо, припущення" }));
    await user.click(await screen.findByRole("option", { name: "Кепка" }));

    await waitFor(() => expect(updateQuoteItemRow).toHaveBeenCalledTimes(1));
    expect(updateQuoteItemRow.mock.calls[0][1]).toMatchObject({ catalog_kind_id: "k-cap" });
    expect(screen.getByRole("button", { name: "Вид товару: Кепка" })).toBeInTheDocument();
    expect(within(screen.getByRole("group", { name: "Нанесення" })).getByRole("button", { name: "ДТФ" })).toBeInTheDocument();
    expect(screen.queryByRole("option")).toBeNull();
  });
});
