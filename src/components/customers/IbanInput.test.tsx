import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { IbanInput } from "./IbanInput";

/**
 * Банк з IBAN — лише підказка. Поле банку порожнє — пропонуємо «Підставити»,
 * але самі нічого не пишемо: банк у картці міг бути вписаний свідомо інакше.
 */

const PRIVAT = "UA303052990000026007000000000";

describe("IbanInput: банк з IBAN", () => {
  it("відомий МФО — назва й код під полем", () => {
    render(<IbanInput value={PRIVAT} onChange={() => {}} />);
    expect(screen.getByText("Банк: АТ КБ «ПриватБанк» · МФО 305299")).toBeTruthy();
  });

  it("поле банку порожнє — «Підставити» віддає назву, але не пише сам", () => {
    const onUseBank = vi.fn();
    render(<IbanInput value={PRIVAT} onChange={() => {}} bankName="" onUseBank={onUseBank} />);
    expect(onUseBank).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Підставити" }));
    expect(onUseBank).toHaveBeenCalledWith("АТ КБ «ПриватБанк»");
  });

  it("банк уже вписано — кнопки немає", () => {
    render(<IbanInput value={PRIVAT} onChange={() => {}} bankName="ПриватБанк" onUseBank={() => {}} />);
    expect(screen.queryByRole("button", { name: "Підставити" })).toBeNull();
  });

  it("невідомий МФО чи неповний IBAN — нічого не вигадуємо", () => {
    const { rerender } = render(<IbanInput value="UA309999990000026007000000000" onChange={() => {}} />);
    expect(screen.queryByText(/Банк:/)).toBeNull();
    rerender(<IbanInput value="UA3030" onChange={() => {}} />);
    expect(screen.queryByText(/Банк:/)).toBeNull();
  });
});
