import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { QuoteItemModelSwap } from "./QuoteItemModelSwap";

/**
 * Заміна товару в картці позиції (REQ-157#p5). Клацати це в прев'ю не можна —
 * запис іде в живий прорахунок, тож правило «нанесення стирається разом зі
 * зміною виду» перевіряється тут.
 */

const updateQuoteItemRow = vi.fn(async (id: string, patch: Record<string, unknown>) => {
  void id;
  void patch;
  return { ok: true as const, data: null };
});

vi.mock("./queries", () => ({
  updateQuoteItemRow: (id: string, patch: Record<string, unknown>) => updateQuoteItemRow(id, patch),
}));

vi.mock("@/features/quotes/quote-wizard/useCatalogSuggestions", () => ({
  useCatalogSuggestions: () => ({
    kinds: [],
    loading: false,
    suggestions: [
      { modelId: "m-athletic", kindId: "k-cap", typeId: "t-cloth", kindName: "Кепка", typeName: "Одяг", imageUrl: null, name: "Кепка «ATHLETIC»", quoteType: "merch" },
      { modelId: "m-hoodie", kindId: "k-hoodie", typeId: "t-cloth", kindName: "Худі", typeName: "Одяг", imageUrl: null, name: "Худі оверсайз", quoteType: "merch" },
    ],
  }),
}));

const open = async (user: ReturnType<typeof userEvent.setup>, query: string) => {
  await user.click(screen.getByRole("button", { name: "замінити товар" }));
  await user.type(await screen.findByRole("textbox", { name: "Пошук товару в каталозі" }), query);
};

describe("Заміна товару в позиції", () => {
  beforeEach(() => updateQuoteItemRow.mockClear());

  it("той самий вид — нанесення лишається на місці", async () => {
    const user = userEvent.setup();
    render(
      <QuoteItemModelSwap teamId="team-1" itemId="item-1" currentModelId="m-other" currentKindId="k-cap" />
    );
    await open(user, "кепка");
    await user.click(await screen.findByRole("option", { name: /ATHLETIC/ }));

    await waitFor(() => expect(updateQuoteItemRow).toHaveBeenCalled());
    const patch = updateQuoteItemRow.mock.calls[0][1];
    expect(patch).toMatchObject({ catalog_model_id: "m-athletic", catalog_kind_id: "k-cap", name: "Кепка «ATHLETIC»" });
    expect(patch).not.toHaveProperty("methods");
  });

  it("інший вид — нанесення стирається разом із ним", async () => {
    const user = userEvent.setup();
    render(
      <QuoteItemModelSwap teamId="team-1" itemId="item-1" currentModelId="m-athletic" currentKindId="k-cap" />
    );
    await open(user, "худі");
    await user.click(await screen.findByRole("option", { name: /Худі/ }));

    await waitFor(() => expect(updateQuoteItemRow).toHaveBeenCalled());
    expect(updateQuoteItemRow.mock.calls[0][1]).toMatchObject({
      catalog_kind_id: "k-hoodie",
      methods: null,
      print_position_id: null,
    });
  });
});
