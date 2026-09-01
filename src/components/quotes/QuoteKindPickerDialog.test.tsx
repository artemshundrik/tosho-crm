import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { QuoteKindPickerDialog, TestQuoteEntryButton } from "@/components/quotes/QuoteKindPickerDialog";

/**
 * Перший крок тестового візарда (REQ-134#p1).
 *
 * Перевіряється не наявність коду, а те, що бачить і натискає людина: три
 * плашки з підписами й те, що клік по плашці віддає СВІЙ тип виробу — саме
 * від нього далі залежить, з чим відкриється білдер.
 */
describe("QuoteKindPickerDialog", () => {
  it("показує три типи виробу", () => {
    render(<QuoteKindPickerDialog open onOpenChange={() => {}} onPick={() => {}} />);

    expect(screen.getByRole("button", { name: /Поліграфія/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Мерч/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Інше/ })).toBeTruthy();
  });

  it("віддає обраний тип, а не перший-ліпший", async () => {
    const onPick = vi.fn();
    render(<QuoteKindPickerDialog open onOpenChange={() => {}} onPick={onPick} />);

    await userEvent.click(screen.getByRole("button", { name: /Поліграфія/ }));
    expect(onPick).toHaveBeenCalledWith("print");

    await userEvent.click(screen.getByRole("button", { name: /Інше/ }));
    expect(onPick).toHaveBeenLastCalledWith("other");
  });
});

describe("TestQuoteEntryButton", () => {
  it("відкриває вибір і закриває його разом із вибором", async () => {
    const onPick = vi.fn();
    render(<TestQuoteEntryButton onPick={onPick} />);

    // До кліку вікна немає — саме заради цього кнопка й вікно живуть разом.
    expect(screen.queryByText("Що рахуємо?")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: /Тестовий прорахунок/ }));
    expect(screen.getByText("Що рахуємо?")).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: /Мерч/ }));
    expect(onPick).toHaveBeenCalledWith("merch");
    expect(screen.queryByText("Що рахуємо?")).toBeNull();
  });
});
