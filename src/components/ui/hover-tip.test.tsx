import { describe, expect, it } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import { HoverTip } from "./hover-tip";

/**
 * Підказка заміняє системний `title` на сотні іконкових кнопок (REQ-175#p6),
 * тож перевіряємо рівно те, через що заміна взагалі має сенс: підказка
 * ПРИВ'ЯЗАНА до кнопки, а не просто намальована поруч, і в режимі `asChild`
 * зайвого вузла навколо кнопки не з'являється — інакше кнопка в flex-рядку
 * втратила б свої класи розкладки.
 */
describe("HoverTip", () => {
  it("asChild не додає обгортки навколо кнопки", () => {
    const { container } = render(
      <div data-testid="row">
        <HoverTip asChild label="Скинути фільтри">
          <button type="button" className="shrink-0">
            x
          </button>
        </HoverTip>
      </div>
    );
    const row = container.querySelector('[data-testid="row"]')!;
    expect(row.children).toHaveLength(1);
    expect(row.children[0].tagName).toBe("BUTTON");
    expect(row.children[0].className).toContain("shrink-0");
  });

  it("на наведенні показує підказку й вішає aria-describedby на саму кнопку", async () => {
    render(
      <HoverTip asChild label="Скинути фільтри">
        <button type="button" aria-label="Скинути фільтри" />
      </HoverTip>
    );
    const button = screen.getByRole("button", { name: "Скинути фільтри" });
    expect(button).not.toHaveAttribute("aria-describedby");

    fireEvent.mouseEnter(button);
    const tip = await screen.findByRole("tooltip");
    expect(tip).toHaveTextContent("Скинути фільтри");
    await waitFor(() => expect(button.getAttribute("aria-describedby")).toBe(tip.id));
  });

  it("без asChild підказка так само прив'язана до дитини", async () => {
    render(
      <HoverTip label="Копіювати">
        <button type="button" aria-label="Копіювати" />
      </HoverTip>
    );
    const button = screen.getByRole("button", { name: "Копіювати" });
    fireEvent.mouseEnter(button.parentElement!);
    const tip = await screen.findByRole("tooltip");
    await waitFor(() => expect(button.getAttribute("aria-describedby")).toBe(tip.id));
  });
});
