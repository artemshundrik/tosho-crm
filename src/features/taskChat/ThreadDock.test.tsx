import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ThreadDock,
  ThreadDockButton,
  ThreadDockProvider,
  type ThreadDockHandle,
  type ThreadDockMode,
  type ThreadRailSlot,
} from "./ThreadDock";

/**
 * Замість справжньої рейки — заглушка, що показує, з яким `active` її
 * змонтували, і сама повідомляє лічильник. Поле вводу НЕКЕРОВАНЕ: його
 * значення живе лише доти, доки живе той самий вузол, — саме так і видно,
 * чи рейку не перемонтували.
 */
function FakeRail({ active, headerAction, onUnreadChange }: ThreadRailSlot) {
  React.useEffect(() => {
    onUnreadChange(3);
  }, [onUnreadChange]);
  return (
    <section data-testid="rail" data-active={String(active)}>
      {headerAction}
      <textarea aria-label="Текст повідомлення" />
    </section>
  );
}

function renderDock(options: { onModeChange?: (mode: ThreadDockMode) => void } = {}) {
  const handleRef = React.createRef<ThreadDockHandle>();
  const view = render(
    <ThreadDockProvider handleRef={handleRef} onModeChange={options.onModeChange}>
      <ThreadDockButton />
      <ThreadDock renderRail={(slot) => <FakeRail {...slot} />} />
    </ThreadDockProvider>
  );
  return { ...view, handleRef };
}

const drawer = () => screen.getByRole("dialog", { hidden: true, name: "Обговорення" });

afterEach(() => {
  vi.restoreAllMocks();
});

// У jsdom немає верстки: гніздо колонки не має жодного прямокутника, тож док
// бачить вузький вигляд — рейка йде в шторку. Двоколонковий — нижче, з підміною.
describe("ThreadDock — вузький вигляд (REQ-294)", () => {
  it("рейка одна, у закритій шторці й неактивна — лічильник на кнопці живий", () => {
    renderDock();

    expect(screen.getAllByTestId("rail")).toHaveLength(1);
    expect(screen.getByTestId("rail").dataset.active).toBe("false");
    expect(drawer().dataset.state).toBe("closed");
    expect(screen.getByRole("button", { name: "Обговорення, нових: 3" })).toBeInTheDocument();
  });

  it("кнопка відкриває шторку й робить рейку активною, фокус іде в шторку", () => {
    renderDock();

    fireEvent.click(screen.getByRole("button", { name: "Обговорення, нових: 3" }));

    expect(drawer().dataset.state).toBe("open");
    expect(screen.getByTestId("rail").dataset.active).toBe("true");
    expect(document.activeElement).toBe(drawer());
  });

  it("закрили й відкрили — той самий примірник, набране лишилось", () => {
    renderDock();
    const button = screen.getByRole("button", { name: "Обговорення, нових: 3" });

    fireEvent.click(button);
    fireEvent.change(screen.getByLabelText("Текст повідомлення"), { target: { value: "чернетка" } });
    fireEvent.click(screen.getByRole("button", { name: "Закрити обговорення" }));
    expect(drawer().dataset.state).toBe("closed");

    fireEvent.click(button);
    expect(screen.getByLabelText("Текст повідомлення")).toHaveValue("чернетка");
    expect(screen.getAllByTestId("rail")).toHaveLength(1);
  });

  it("Esc закриває шторку — але не тоді, коли його вже забрало меню всередині", () => {
    renderDock();
    fireEvent.click(screen.getByRole("button", { name: "Обговорення, нових: 3" }));

    // Так поводиться Radix: ловить Esc у фазі захоплення й скасовує подію.
    const swallow = (event: KeyboardEvent) => event.preventDefault();
    document.addEventListener("keydown", swallow, { capture: true });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(drawer().dataset.state).toBe("open");

    document.removeEventListener("keydown", swallow, { capture: true });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(drawer().dataset.state).toBe("closed");
  });

  it("шторку відкриває й сторінка — через ручку (кнопка «Написати в розмову»)", () => {
    const { handleRef } = renderDock();

    act(() => handleRef.current?.open());

    expect(drawer().dataset.state).toBe("open");
  });
});

describe("ThreadDock — дві колонки", () => {
  it("гніздо видно — рейка стоїть у колонці, шторки немає, сторінка знає вигляд", () => {
    // Гніздо «має прямокутник» — те саме, що бачить док, коли умова
    // контейнера `record-split` його показала.
    vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue([{}] as unknown as DOMRectList);
    const onModeChange = vi.fn();

    renderDock({ onModeChange });

    expect(onModeChange).toHaveBeenCalledWith("split");
    expect(screen.queryByRole("dialog", { hidden: true })).toBeNull();
    expect(screen.getAllByTestId("rail")).toHaveLength(1);
    expect(screen.getByTestId("rail").dataset.active).toBe("true");
    expect(screen.queryByRole("button", { name: "Закрити обговорення" })).toBeNull();
  });
});
