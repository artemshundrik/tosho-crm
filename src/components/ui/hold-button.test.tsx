import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

import { HoldButton } from "@/components/ui/hold-button";

/**
 * Затиск замість натиску: тут перевіряється рівно те, заради чого він існує —
 * що коротким рухом дію НЕ запустити.
 *
 * ЧОМУ ТЕСТОМ, А НЕ ОКОМ. Пороги часу й клавіатурна гілка в браузері не
 * перевіряються поглядом: відпустити «трохи раніше» руками неможливо
 * відтворити двічі однаково. А зламати це легко — досить перезапустити відлік
 * на автоповторі клавіші, і затиск перестане спрацьовувати взагалі.
 */
describe("HoldButton", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function setup() {
    const onConfirm = vi.fn();
    render(
      <HoldButton holdMs={900} holdingLabel="Не відпускайте…" onConfirm={onConfirm}>
        Видалити
      </HoldButton>
    );
    return { onConfirm, button: screen.getByRole("button") };
  }

  it("короткий натиск нічого не робить", () => {
    const { onConfirm, button } = setup();

    fireEvent.pointerDown(button);
    act(() => void vi.advanceTimersByTime(400));
    fireEvent.pointerUp(button);
    act(() => void vi.advanceTimersByTime(2000));

    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("затиск до кінця запускає дію рівно раз", () => {
    const { onConfirm, button } = setup();

    fireEvent.pointerDown(button);
    act(() => void vi.advanceTimersByTime(900));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("підпис міняється на затиску й повертається, коли відпустили", () => {
    const { button } = setup();

    expect(button).toHaveTextContent("Видалити");
    fireEvent.pointerDown(button);
    expect(button).toHaveTextContent("Не відпускайте…");
    fireEvent.pointerUp(button);
    expect(button).toHaveTextContent("Видалити");
  });

  it("курсор пішов із кнопки — відлік скасовано", () => {
    const { onConfirm, button } = setup();

    fireEvent.pointerDown(button);
    act(() => void vi.advanceTimersByTime(500));
    fireEvent.pointerLeave(button);
    act(() => void vi.advanceTimersByTime(2000));

    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("клавіатура тримає так само, і автоповтор відліку не перезапускає", () => {
    const { onConfirm, button } = setup();

    fireEvent.keyDown(button, { key: "Enter" });
    // Утримана клавіша сипле повторами — вони не мають зсувати відлік.
    act(() => void vi.advanceTimersByTime(500));
    fireEvent.keyDown(button, { key: "Enter", repeat: true });
    act(() => void vi.advanceTimersByTime(400));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("без захисту це звичайна кнопка: натиснув — сталося одразу", () => {
    const onConfirm = vi.fn();
    render(
      <HoldButton guard={false} onConfirm={onConfirm}>
        Скасувати
      </HoldButton>
    );

    fireEvent.click(screen.getByRole("button"));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("без захисту затиск нічого не запускає — щоб дія не сталася двічі", () => {
    const onConfirm = vi.fn();
    render(
      <HoldButton guard={false} onConfirm={onConfirm}>
        Скасувати
      </HoldButton>
    );
    const button = screen.getByRole("button");

    fireEvent.pointerDown(button);
    act(() => void vi.advanceTimersByTime(2000));

    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("відпущена клавіша скасовує так само, як відпущена кнопка миші", () => {
    const { onConfirm, button } = setup();

    fireEvent.keyDown(button, { key: " " });
    act(() => void vi.advanceTimersByTime(300));
    fireEvent.keyUp(button, { key: " " });
    act(() => void vi.advanceTimersByTime(2000));

    expect(onConfirm).not.toHaveBeenCalled();
  });
});
