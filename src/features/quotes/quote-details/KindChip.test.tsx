import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { KindChip, type KindOption } from "./KindChip";

/**
 * Вибір виду: пошук живе, поки список відкритий. Скидання переїхало з ефекту
 * в рендер (борг компілятора, 29.10.2026) — тут перевіряється, що відкритий
 * знову список починається з порожнього пошуку, а фільтр працює.
 */

const OPTIONS: KindOption[] = [
  { kindId: "k-polo", kindName: "Поло", typeId: "t-wear", typeName: "Одяг" },
  { kindId: "k-cap", kindName: "Кепка", typeId: "t-wear", typeName: "Одяг" },
  { kindId: "k-mug", kindName: "Чашка", typeId: "t-dish", typeName: "Посуд" },
];

const kindNames = () => screen.getAllByRole("option").map((option) => option.textContent);

describe("KindChip", () => {
  it("фільтрує види, а відкритий знову список починає з порожнього пошуку", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<KindChip value={null} options={OPTIONS} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "Вид товару" }));
    await user.type(screen.getByPlaceholderText("Пошук виду"), "посуд");
    expect(kindNames()).toEqual(["Чашка"]);

    await user.keyboard("{Escape}");
    expect(screen.queryByPlaceholderText("Пошук виду")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Вид товару" }));
    expect(screen.getByPlaceholderText("Пошук виду")).toHaveValue("");
    expect(kindNames()).toEqual(["Поло", "Кепка", "Чашка"]);

    await user.click(screen.getByRole("option", { name: "Кепка" }));
    expect(onChange).toHaveBeenCalledWith(OPTIONS[1]);
  });
});
