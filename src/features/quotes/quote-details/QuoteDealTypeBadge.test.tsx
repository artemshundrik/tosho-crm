import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { QuoteDealTypeBadge } from "./QuoteDealTypeBadge";

/**
 * Бейдж типу угоди в шапці картки (REQ-182). Він не просто підпис: тип
 * з'ясовується після розмови з клієнтом, і міняти його треба звідси, а не з
 * форми редагування — інакше він лишиться тим, який поставили наосліп.
 */
describe("QuoteDealTypeBadge", () => {
  it("називає тип і його відсоток", () => {
    render(<QuoteDealTypeBadge value="standard" onChange={vi.fn()} />);

    expect(screen.getByText("Стандартний виробничий")).toBeTruthy();
    expect(screen.getByText("53,8 %")).toBeTruthy();
  });

  it("дає обрати інший тип просто з шапки", async () => {
    const onChange = vi.fn();
    render(<QuoteDealTypeBadge value="standard" onChange={onChange} />);

    await userEvent.click(screen.getByRole("button"));
    await userEvent.click(screen.getByRole("menuitem", { name: /Тендер/ }));

    expect(onChange).toHaveBeenCalledWith("tender");
  });

  it("той самий тип повторно не зберігає", async () => {
    // Інакше кожне відкриття списку слало б запит і писало б у журнал картки
    // зміну, якої не було.
    const onChange = vi.fn();
    render(<QuoteDealTypeBadge value="tender" onChange={onChange} />);

    await userEvent.click(screen.getByRole("button"));
    // Через роль, а не текст: активний тип написаний і на кнопці, і в списку.
    await userEvent.click(screen.getByRole("menuitem", { name: /Тендер/ }));

    expect(onChange).not.toHaveBeenCalled();
  });

  it("без права правити лишається підписом, а не кнопкою", () => {
    render(<QuoteDealTypeBadge value="custom" onChange={vi.fn()} disabled />);

    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("Малий тираж / кастом")).toBeTruthy();
  });
});
