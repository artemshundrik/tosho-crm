import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ModalMount, useModalMount } from "@/components/ui/modal-mount";

/**
 * Поведінка `<ModalMount>` — прапорця вікна, який живе поза тілом сторінки.
 *
 * ЧОМУ САМЕ ЦІ ТЕСТИ. Кожен стоїть на конкретній помилці, яку я вже зробив
 * 24.08.2026, коли заводив цей примітив:
 *
 *   1. Три місця закривали вікно НАПРЯМУ (`setXOpen(false)` після збереження,
 *      кнопка «Скасувати») — після переносу прапорця вони міняли лише дзеркало
 *      сторінки, і вікно не закривалось. `tsc` мовчав: типи там ті самі.
 *   2. Дзеркало сторінки має отримати ОБИДВА напрямки. Якщо забути false,
 *      ефекти сторінки лишаються думати, що вікно відкрите.
 *
 * Обидві помилки видно лише тому, що тест справді рендерить компонент і
 * натискає кнопки.
 */

function Harness({ onOpenChange }: { onOpenChange?: (open: boolean) => void }) {
  const modal = useModalMount();
  return (
    <>
      <button onClick={modal.open}>відкрити</button>
      <button onClick={modal.close}>закрити ручкою</button>
      <ModalMount ref={modal.ref} onOpenChange={onOpenChange}>
        {(open, setOpen) => (
          <>
            <span data-testid="стан">{open ? "відкрито" : "закрито"}</span>
            {open ? <button onClick={() => setOpen(false)}>закрити зсередини</button> : null}
          </>
        )}
      </ModalMount>
    </>
  );
}

const стан = () => screen.getByTestId("стан").textContent;

describe("ModalMount", () => {
  it("стартує закритим і сторінку не смикає", () => {
    const mirror = vi.fn();
    render(<Harness onOpenChange={mirror} />);

    expect(стан()).toBe("закрито");
    expect(mirror).not.toHaveBeenCalled();
  });

  it("кнопка відкриває вікно й повідомляє сторінці", async () => {
    const mirror = vi.fn();
    const user = userEvent.setup();
    render(<Harness onOpenChange={mirror} />);

    await user.click(screen.getByRole("button", { name: "відкрити" }));

    expect(стан()).toBe("відкрито");
    expect(mirror).toHaveBeenCalledWith(true);
  });

  it("ручка `close()` справді закриває вікно, а не лише дзеркало", async () => {
    // Саме тут я й обпікся: після переносу прапорця три місця в коді закривали
    // вікно через `setState` сторінки — і воно лишалось відкритим.
    const mirror = vi.fn();
    const user = userEvent.setup();
    render(<Harness onOpenChange={mirror} />);

    await user.click(screen.getByRole("button", { name: "відкрити" }));
    await user.click(screen.getByRole("button", { name: "закрити ручкою" }));

    expect(стан()).toBe("закрито");
    expect(mirror).toHaveBeenLastCalledWith(false);
  });

  it("закриття зсередини вікна працює так само", async () => {
    const mirror = vi.fn();
    const user = userEvent.setup();
    render(<Harness onOpenChange={mirror} />);

    await user.click(screen.getByRole("button", { name: "відкрити" }));
    await user.click(screen.getByRole("button", { name: "закрити зсередини" }));

    expect(стан()).toBe("закрито");
    expect(mirror).toHaveBeenLastCalledWith(false);
  });

  it("дзеркало отримує обидва напрямки рівно по разу", async () => {
    const mirror = vi.fn();
    const user = userEvent.setup();
    render(<Harness onOpenChange={mirror} />);

    await user.click(screen.getByRole("button", { name: "відкрити" }));
    await user.click(screen.getByRole("button", { name: "закрити ручкою" }));

    expect(mirror.mock.calls).toEqual([[true], [false]]);
  });

  it("живе без `onOpenChange` — сторінці дзеркало може бути не потрібне", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "відкрити" }));
    expect(стан()).toBe("відкрито");

    await user.click(screen.getByRole("button", { name: "закрити ручкою" }));
    expect(стан()).toBe("закрито");
  });
});
