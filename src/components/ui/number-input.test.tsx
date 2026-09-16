import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { NumberInput } from "./number-input";

/**
 * ENTER ЗАВЕРШУЄ ВВІД (REQ-278).
 *
 * До цього Enter у цих полях не робив НІЧОГО: форми навколо немає, тож натиск
 * провалювався в порожнечу. Проєктний менеджер набирав 1000 шт у кількості
 * тиражу, тиснув Enter, бачив своє число в полі — і йшов далі, вважаючи ввід
 * завершеним. Тест тримає саме цей жест: Enter має проходити ту саму дорогу,
 * що й клік повз поле, — з межами й порожнім значенням.
 */

function Host({ min, emptyValue }: { min?: number; emptyValue?: number }) {
  const [value, setValue] = useState<number | null>(12);
  return (
    <>
      <NumberInput
        aria-label="Кількість"
        value={value}
        onValueChange={setValue}
        min={min}
        emptyValue={emptyValue}
      />
      <output data-testid="committed">{value === null ? "—" : String(value)}</output>
    </>
  );
}

describe("NumberInput", () => {
  it("Enter закріплює набране й знімає фокус", async () => {
    const user = userEvent.setup();
    render(<Host />);
    const field = screen.getByLabelText("Кількість");

    await user.click(field);
    await user.clear(field);
    await user.keyboard("1000");
    await user.keyboard("{Enter}");

    expect(field).not.toHaveFocus();
    expect(screen.getByTestId("committed")).toHaveTextContent(/^1000$/);
    expect(field).toHaveValue("1000");
  });

  it("Enter застосовує межі так само, як клік повз поле", async () => {
    const user = userEvent.setup();
    render(<Host min={1} emptyValue={1} />);
    const field = screen.getByLabelText("Кількість");

    await user.click(field);
    await user.clear(field);
    await user.keyboard("0");
    await user.keyboard("{Enter}");

    expect(screen.getByTestId("committed")).toHaveTextContent(/^1$/);
  });

  it("порожнє поле на Enter віддає emptyValue, а не нуль мовчки", async () => {
    const user = userEvent.setup();
    render(<Host min={1} emptyValue={1} />);
    const field = screen.getByLabelText("Кількість");

    await user.click(field);
    await user.clear(field);
    await user.keyboard("{Enter}");

    expect(screen.getByTestId("committed")).toHaveTextContent(/^1$/);
  });
});
