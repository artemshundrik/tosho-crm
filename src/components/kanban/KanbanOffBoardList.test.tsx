import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { KanbanOffBoardList, type KanbanOffBoardEntry } from "./KanbanOffBoardList";

/**
 * Поведінка списку карток, виведених із канбан-дошки (REQ-138).
 *
 * ЧОМУ ТЕСТ КОМПОНЕНТА, А НЕ КЛІК У ЗАСТОСУНКУ. Кнопка «Повернути» пише в
 * прод: міняє статус картки й будить сповіщення живим людям. Перевірити її
 * живцем на «Прорахунках» вийшло (і вона працює), а на «Дизайні» кожен клік
 * розсилає сповіщення менеджеру прорахунку — тож поведінку самої кнопки
 * стереже цей тест, однаково для обох дошок.
 *
 * `tsc` тут не помічник: тип у `onSelect` той самий, хай кнопка й не клікається
 * зовсім, а `busyId` міг би не гасити повторний клік — і подвійне натискання
 * відправило б два записи.
 */

const entry = (over: Partial<KanbanOffBoardEntry> = {}): KanbanOffBoardEntry => ({
  id: "1",
  code: "TS-0826-0034",
  title: "Travel Comm",
  subtitle: "Інше",
  ...over,
});

describe("список виведених із дошки карток", () => {
  it("порожній список каже про це словами, а не порожнечею", () => {
    render(<KanbanOffBoardList entries={[]} emptyText="Скасованих прорахунків немає." />);
    expect(screen.getByText("Скасованих прорахунків немає.")).toBeInTheDocument();
  });

  it("показує номер, назву й підзаголовок картки", () => {
    render(<KanbanOffBoardList entries={[entry()]} emptyText="порожньо" />);
    expect(screen.getByText("TS-0826-0034")).toBeInTheDocument();
    expect(screen.getByText("Travel Comm")).toBeInTheDocument();
    expect(screen.getByText("Інше")).toBeInTheDocument();
  });

  it("«Повернути» кличе дію рівно один раз", async () => {
    const onSelect = vi.fn();
    render(
      <KanbanOffBoardList
        entries={[entry({ restore: { label: "Повернути", onSelect } })]}
        emptyText="порожньо"
      />
    );
    await userEvent.click(screen.getByRole("button", { name: "Повернути" }));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  /**
   * Дорога назад мусить бути видимою: без неї список — пастка, з якої видно,
   * але не вийти. Перетягнути звідси нікуди — колонки в цього стану немає.
   */
  it("без права на повернення кнопки немає зовсім, а не сірої", () => {
    render(<KanbanOffBoardList entries={[entry({ restore: null })]} emptyText="порожньо" />);
    expect(screen.queryByRole("button", { name: "Повернути" })).not.toBeInTheDocument();
  });

  it("поки картку повертають, повторний клік не проходить", async () => {
    const onSelect = vi.fn();
    render(
      <KanbanOffBoardList
        entries={[entry({ restore: { label: "Повернути", onSelect } })]}
        emptyText="порожньо"
        busyId="1"
      />
    );
    const button = screen.getByRole("button", { name: "Повернути" });
    expect(button).toBeDisabled();
    await userEvent.click(button);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("зайнята одна картка не блокує сусідню", () => {
    render(
      <KanbanOffBoardList
        entries={[
          entry({ id: "1", restore: { label: "Повернути", onSelect: vi.fn() } }),
          entry({ id: "2", code: "TS-0826-0035", restore: { label: "Повернути", onSelect: vi.fn() } }),
        ]}
        emptyText="порожньо"
        busyId="1"
      />
    );
    const [first, second] = screen.getAllByRole("button", { name: "Повернути" });
    expect(first).toBeDisabled();
    expect(second).toBeEnabled();
  });

  /**
   * Клік по кнопці НЕ має відкривати картку: дії різні, і людина, яка
   * повертає рядок на дошку, не мала на увазі «покажи мені цю сторінку».
   */
  it("«Повернути» не відкриває картку заразом", async () => {
    const onOpen = vi.fn();
    const onSelect = vi.fn();
    render(
      <KanbanOffBoardList
        entries={[entry({ onOpen, restore: { label: "Повернути", onSelect } })]}
        emptyText="порожньо"
      />
    );
    await userEvent.click(screen.getByRole("button", { name: "Повернути" }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("рядок відкривається кліком і з клавіатури", async () => {
    const onOpen = vi.fn();
    render(<KanbanOffBoardList entries={[entry({ onOpen })]} emptyText="порожньо" />);
    const row = screen.getByRole("button", { name: /Travel Comm/ });
    await userEvent.click(row);
    expect(onOpen).toHaveBeenCalledTimes(1);
    row.focus();
    await userEvent.keyboard("{Enter}");
    expect(onOpen).toHaveBeenCalledTimes(2);
  });

  it("рядок без дії відкриття кнопкою не прикидається", () => {
    render(<KanbanOffBoardList entries={[entry({ onOpen: undefined })]} emptyText="порожньо" />);
    expect(screen.queryByRole("button", { name: /Travel Comm/ })).not.toBeInTheDocument();
  });
});
