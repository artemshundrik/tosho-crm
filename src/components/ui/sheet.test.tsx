import * as React from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";

/**
 * Клік повз дровер (REQ-60).
 *
 * ЧОМУ ОКРЕМИМ ФАЙЛОМ ВІД МОДАЛКИ. DrawerFixture і модалка мають однакові правила, але
 * РІЗНИЙ код: `SheetContent` і `DialogContent` кожен зі своїм `onInteractOutside`.
 * Одного разу правку внесли лише в один із них — тож перевіряємо обидва.
 *
 * ПРО ІСТОРІЮ ЦЬОГО ШЛЯХУ. Спершу клік повз не робив НІЧОГО: беззастережний
 * `preventDefault` ігнорував і порожню форму, і заповнену. Це читалось як
 * зламана взаємодія (REQ-5). Правильна поведінка така сама, як в Esc: порожнє
 * закриваємо, заповнене — питаємо.
 */

function DrawerFixture({ dismissible }: { dismissible?: boolean } = {}) {
  const [open, setOpen] = React.useState(true);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent dismissible={dismissible}>
        <SheetTitle>Картка замовника</SheetTitle>
        <SheetDescription>Контакти й реквізити.</SheetDescription>
        <label>
          Телефон
          <input />
        </label>
      </SheetContent>
    </Sheet>
  );
}

const дроверВідкритий = () => screen.queryByText("Картка замовника") !== null;
const питанняПоказане = () => screen.queryByText("Закрити без збереження?") !== null;

/**
 * Клік «повз» — по сторінці під дровером.
 *
 * `pointerEventsCheck: 0` тут обов'язковий і НЕ є обходом перевірки: поки вікно
 * відкрите, Radix ставить сторінці `pointer-events: none`, і user-event чесно
 * відмовляється клікати по «незклікабельному». У живому браузері цей клік
 * доходить — його ловить власний слухач Radix на документі, а не сторінка.
 */
function людина() {
  return userEvent.setup({ pointerEventsCheck: 0 });
}

async function клікнутиПовз(user: ReturnType<typeof userEvent.setup>) {
  await user.click(document.body);
}

describe("клік повз дровер", () => {
  it("порожній дровер закривається", async () => {
    const user = людина();
    render(<DrawerFixture />);

    await клікнутиПовз(user);

    expect(питанняПоказане()).toBe(false);
    expect(дроверВідкритий()).toBe(false);
  });

  it("заповнений дровер питає, а не зникає з введеним", async () => {
    const user = людина();
    render(<DrawerFixture />);

    await user.type(screen.getByLabelText("Телефон"), "0501234567");
    await клікнутиПовз(user);

    expect(питанняПоказане()).toBe(true);
    expect(дроверВідкритий()).toBe(true);
  });

  it("dismissible закриває навіть заповнений — там втрачати нічого", async () => {
    const user = людина();
    render(<DrawerFixture dismissible />);

    await user.type(screen.getByLabelText("Телефон"), "0501234567");
    await клікнутиПовз(user);

    expect(питанняПоказане()).toBe(false);
    expect(дроверВідкритий()).toBe(false);
  });
});
