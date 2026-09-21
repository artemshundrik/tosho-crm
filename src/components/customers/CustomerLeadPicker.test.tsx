import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CustomerLeadPicker, type CustomerLeadOption } from "./CustomerLeadPicker";

/**
 * РОЗВИЛКА НА МІСЦІ НЕНАЙДЕНОГО (REQ-301).
 *
 * НАВІЩО ТЕСТ. Пікер стоїть у трьох місцях — білдер прорахунків, дизайн-задача
 * і візард, — і пропозиція завести нового живе у двох станах одночасно:
 * розвилка замість списку, коли збігів немає, і тихі кнопки в підвалі, коли
 * вони є. Двох однакових пропозицій в одному вікні бути не має, і саме це
 * найлегше зламати наступною правкою розмітки.
 */

const OPTIONS: CustomerLeadOption[] = [
  { id: "c-1", label: "Тепличка", entityType: "customer" },
];

const renderPicker = (
  props: Partial<React.ComponentProps<typeof CustomerLeadPicker>> = {}
) =>
  render(
    <CustomerLeadPicker
      open
      onOpenChange={() => {}}
      selectedLabel=""
      searchValue=""
      onSearchChange={() => {}}
      options={OPTIONS}
      onSelect={() => {}}
      onCreateCustomer={() => {}}
      onCreateLead={() => {}}
      {...props}
    />
  );

describe("пікер замовника: коли такого ще немає", () => {
  it("на порожній результат пропонує завести — і ховає кнопки підвалу", () => {
    renderPicker({ searchValue: "Невідома компанія", options: [] });

    expect(screen.getByText("«Невідома компанія»")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Створити ліда" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Створити замовника" })).toBeTruthy();
    // Підвал у цю мить мовчить: інакше в одному вікні було б чотири кнопки
    // про одне й те саме.
    expect(screen.queryByRole("button", { name: "Новий лід" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Новий замовник" })).toBeNull();
  });

  it("клік віддає набране імʼя, а не порожній рядок", () => {
    const onCreateLead = vi.fn();
    renderPicker({ searchValue: "  Тепличка Артемівська  ", options: [], onCreateLead });

    fireEvent.click(screen.getByRole("button", { name: "Створити ліда" }));

    expect(onCreateLead).toHaveBeenCalledWith("Тепличка Артемівська");
  });

  it("є збіги — розвилки немає, лишаються кнопки підвалу", () => {
    renderPicker({ searchValue: "Теп" });

    expect(screen.queryByRole("button", { name: "Створити ліда" })).toBeNull();
    expect(screen.getByRole("button", { name: "Новий лід" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Новий замовник" })).toBeTruthy();
  });

  it("без обробників створення підвал не малює саму лише лінію", () => {
    const { container } = renderPicker({
      searchValue: "Невідома компанія",
      options: [],
      onCreateCustomer: undefined,
      onCreateLead: undefined,
    });

    expect(screen.getByText("Замовників або лідів не знайдено")).toBeTruthy();
    expect(container.ownerDocument.querySelector(".border-t")).toBeNull();
  });
});
