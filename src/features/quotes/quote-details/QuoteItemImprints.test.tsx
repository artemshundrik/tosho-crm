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
    },
    reset: () => {},
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
