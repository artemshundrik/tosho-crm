import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { QuoteKindPickerDialog } from "@/components/quotes/QuoteKindPickerDialog";

/**
 * Єдиний екран вибору в тестовому візарді (REQ-134#p1, #p2).
 *
 * Перевіряється не наявність коду, а те, що бачить і натискає людина: три
 * плашки типу виробу, обидві двері мерчу — прямо на плашці, без другого
 * екрана, — і що кожен клік віддає СВІЙ вибір. Від нього далі залежить, чи
 * відкриється білдер, чи вікно імпорту.
 */
describe("QuoteKindPickerDialog", () => {
  it("показує три типи виробу", () => {
    render(<QuoteKindPickerDialog open onOpenChange={() => {}} onPick={() => {}} />);

    expect(screen.getByRole("button", { name: /Поліграфія/ })).toBeTruthy();
    expect(screen.getByText("Мерч")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Інше/ })).toBeTruthy();
  });

  it("поліграфія й інше ведуть у білдер одним кліком", async () => {
    const onPick = vi.fn();
    render(<QuoteKindPickerDialog open onOpenChange={() => {}} onPick={onPick} />);

    await userEvent.click(screen.getByRole("button", { name: /Поліграфія/ }));
    expect(onPick).toHaveBeenCalledWith({ kind: "print", source: "manual" });

    await userEvent.click(screen.getByRole("button", { name: /Інше/ }));
    expect(onPick).toHaveBeenLastCalledWith({ kind: "other", source: "manual" });
  });

  it("обидві двері мерчу стоять на першому ж екрані", async () => {
    const onPick = vi.fn();
    render(<QuoteKindPickerDialog open onOpenChange={() => {}} onPick={onPick} />);

    // Без жодного проміжного кроку: обидві кнопки видно одразу.
    const manual = screen.getByRole("button", { name: "Мерч: ввести позиції руками" });
    const excel = screen.getByRole("button", { name: "Мерч: імпорт позицій з Excel" });

    await userEvent.click(excel);
    expect(onPick).toHaveBeenCalledWith({ kind: "merch", source: "excel" });

    await userEvent.click(manual);
    expect(onPick).toHaveBeenLastCalledWith({ kind: "merch", source: "manual" });
  });

  it("до ексельки — один клік, а не три", async () => {
    const onPick = vi.fn();
    render(<QuoteKindPickerDialog open onOpenChange={() => {}} onPick={onPick} />);

    await userEvent.click(screen.getByRole("button", { name: "Мерч: імпорт позицій з Excel" }));

    expect(onPick).toHaveBeenCalledTimes(1);
  });
});
