import { beforeAll, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

import { QuoteKanbanProducts, type QuoteKanbanProduct } from "./QuoteKanbanProducts";

/**
 * Товари на картці дошки — ОДИН ряд мініатюр (до чотирьох і «+N») і один рядок
 * «перша позиція і ще N · кількість» (хвиля Б4).
 *
 * ЧОМУ ЦЕ ВАРТО ТЕСТУ. Зламати межу непомітно легко: досить змінити константу
 * чи повернути `flex-wrap` — і картка знову виростає, а ряд мініатюр їде на
 * другий рядок. Ані `tsc`, ані лінт про це не знають, а на дошці більшість
 * прорахунків має один-два товари, тож поломка спливе не одразу.
 */

// Мініатюри вантажаться за появою в полі зору, а jsdom спостерігача не має.
beforeAll(() => {
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
});

const product = (index: number): QuoteKanbanProduct => ({
  id: `item-${index}`,
  name: `Товар ${index}`,
  sku: null,
  variantName: null,
  variantImageUrl: null,
  qtyLabel: "100 шт.",
  runLabels: [],
  imageUrl: `https://example.test/${index}.png`,
  zoomImageUrl: null,
});

const preview = (count: number) => ({
  itemCount: count,
  itemName: "Товар 1",
  qtyLabel: "100 шт.",
  imageUrl: null,
  products: Array.from({ length: count }, (_, index) => product(index + 1)),
});

function renderPreview(count: number) {
  const { container } = render(
    <QuoteKanbanProducts preview={preview(count)} isLoading={false} imageLoadStrategy="eager" />
  );
  const strip = container.querySelector<HTMLElement>(".flex-nowrap");
  return {
    strip,
    thumbTitles: strip
      ? Array.from(strip.querySelectorAll<HTMLElement>(":scope > div[title]")).map((node) => node.title)
      : [],
    overflowLabel: strip?.querySelector("span")?.textContent ?? null,
    summary: container.querySelector<HTMLElement>(".truncate")?.textContent ?? null,
  };
}

describe("QuoteKanbanProducts", () => {
  it("один товар — одна мініатюра й назва з кількістю", () => {
    const { thumbTitles, overflowLabel, summary } = renderPreview(1);
    expect(thumbTitles).toEqual(["Товар 1 · 100 шт."]);
    expect(overflowLabel).toBeNull();
    expect(summary).toBe("Товар 1 · 100 шт.");
  });

  it("до чотирьох товарів — усі мініатюрами, без лічильника", () => {
    const { thumbTitles, overflowLabel, summary } = renderPreview(4);
    expect(thumbTitles).toHaveLength(4);
    expect(overflowLabel).toBeNull();
    expect(summary).toBe("Товар 1 і ще 3 · 100 шт.");
  });

  it("більше чотирьох — чотири мініатюри й «+N» в тому самому ряду", () => {
    const { strip, thumbTitles, overflowLabel } = renderPreview(12);
    expect(thumbTitles).toHaveLength(4);
    expect(overflowLabel).toBe("+8");
    expect(strip?.className).not.toContain("flex-wrap");
  });
});
