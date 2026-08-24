import * as React from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

/**
 * Поведінка захисту «закрити без збереження?» (REQ-60).
 *
 * ЧОМУ ЦЕ ВАЖЛИВО ПЕРЕВІРЯТИ САМЕ РЕНДЕРОМ. Історія цього захисту — це список
 * помилок, яких не побачив жоден зелений `tsc`:
 *
 *   - слухачі висіли на документі й тоді, коли вікно закрите, тож клік, яким
 *     вікно ВІДКРИВАЛИ, позначав форму зміненою — і порожня форма питала;
 *   - детектор ловив лише ARIA-ролі, а 12 форм будують дропдауни зі звичайних
 *     кнопок — вибір замовника захист не бачив, і введене губилось;
 *   - я сам «полагодив» шлях, який не був зламаний, бо не відкрив застосунок:
 *     кнопка «Скасувати» захисту НЕ ПИТАЄ за побудовою.
 *
 * Тому тут перевіряється не наявність коду, а що саме бачить людина.
 *
 * ЧОГО ТУТ НЕМАЄ. Анімацій відкриття й зникання: у jsdom вони не крутяться
 * взагалі. Усе, що про кадри й плавність, лишається за прев'ю й замірами.
 */

function FormFixture({ dismissible }: { dismissible?: boolean } = {}) {
  const [open, setOpen] = React.useState(true);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent dismissible={dismissible}>
        <DialogTitle>Нова позиція</DialogTitle>
        <DialogDescription>Заповніть поля й збережіть.</DialogDescription>
        <label>
          Назва
          <input />
        </label>
        {/* Саморобний пікер: звичайна кнопка без ARIA-ролі — рівно те, що
            детектор колись не бачив. */}
        <button type="button">Обрати замовника</button>
        <button type="button" onClick={() => setOpen(false)}>
          Скасувати
        </button>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Навмисно НЕ `getByRole("dialog")`: коли зверху відкривається питання, Radix
 * ставить основному вікну `aria-hidden`, і за роллю воно вже не знаходиться —
 * хоча нікуди не зникло й людина його бачить під підкладкою. Перевіряємо
 * наявність у DOM, а не в дереві доступності.
 */
const вікноВідкрите = () => screen.queryByText("Нова позиція") !== null;
const питанняПоказане = () => screen.queryByText("Закрити без збереження?") !== null;
const хрестик = () => screen.getByRole("button", { name: "Close" });

describe("захист незбережених змін у модалці", () => {
  it("порожню форму хрестик закриває без питання", async () => {
    const user = userEvent.setup();
    render(<FormFixture />);

    await user.click(хрестик());

    expect(питанняПоказане()).toBe(false);
    expect(вікноВідкрите()).toBe(false);
  });

  it("після введення тексту хрестик питає, а вікно лишається", async () => {
    const user = userEvent.setup();
    render(<FormFixture />);

    await user.type(screen.getByLabelText("Назва"), "Худі");
    await user.click(хрестик());

    expect(питанняПоказане()).toBe(true);
    expect(вікноВідкрите()).toBe(true);
  });

  it("клацання по саморобному пікеру теж рахується зміною", async () => {
    // Кнопка без ARIA-ролі: колись детектор бачив лише [role=option] і подібні,
    // тож вибір замовника проходив повз захист.
    const user = userEvent.setup();
    render(<FormFixture />);

    await user.click(screen.getByRole("button", { name: "Обрати замовника" }));
    await user.click(хрестик());

    expect(питанняПоказане()).toBe(true);
    expect(вікноВідкрите()).toBe(true);
  });

  it("«Продовжити редагування» повертає до форми", async () => {
    const user = userEvent.setup();
    render(<FormFixture />);

    await user.type(screen.getByLabelText("Назва"), "Худі");
    await user.click(хрестик());
    await user.click(screen.getByRole("button", { name: "Продовжити редагування" }));

    expect(питанняПоказане()).toBe(false);
    expect(вікноВідкрите()).toBe(true);
    expect(screen.getByLabelText("Назва")).toHaveValue("Худі");
  });

  it("«Закрити без збереження» закриває вікно", async () => {
    const user = userEvent.setup();
    render(<FormFixture />);

    await user.type(screen.getByLabelText("Назва"), "Худі");
    await user.click(хрестик());
    await user.click(screen.getByRole("button", { name: "Закрити без збереження" }));

    expect(вікноВідкрите()).toBe(false);
  });

  it("кнопка «Скасувати» не питає нічого, навіть якщо форму заповнили", async () => {
    // Так і має бути: форма закриває себе програмно, а захист перехоплює лише
    // хрестик і Esc. Я вже одного разу «полагодив» цей шлях, не відкривши
    // застосунок, — тест стоїть саме проти цього.
    const user = userEvent.setup();
    render(<FormFixture />);

    await user.type(screen.getByLabelText("Назва"), "Худі");
    await user.click(screen.getByRole("button", { name: "Скасувати" }));

    expect(питанняПоказане()).toBe(false);
    expect(вікноВідкрите()).toBe(false);
  });

  it("Esc на заповненій формі питає так само, як хрестик", async () => {
    const user = userEvent.setup();
    render(<FormFixture />);

    await user.type(screen.getByLabelText("Назва"), "Худі");
    await user.keyboard("{Escape}");

    expect(питанняПоказане()).toBe(true);
    expect(вікноВідкрите()).toBe(true);
  });

  it("Esc на порожній формі закриває одразу", async () => {
    const user = userEvent.setup();
    render(<FormFixture />);

    await user.keyboard("{Escape}");

    expect(питанняПоказане()).toBe(false);
    expect(вікноВідкрите()).toBe(false);
  });

  it("dismissible вимикає захист: втрачати нічого", async () => {
    const user = userEvent.setup();
    render(<FormFixture dismissible />);

    await user.type(screen.getByLabelText("Назва"), "Худі");
    await user.keyboard("{Escape}");

    expect(питанняПоказане()).toBe(false);
    expect(вікноВідкрите()).toBe(false);
  });
});
