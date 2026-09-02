import { beforeAll, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

import { QuoteKanbanProducts, type QuoteKanbanProduct } from "./QuoteKanbanProducts";

/**
 * Довгий список товарів мусить згортатись, і згортатись у ПЕРЕДБАЧУВАНОМУ
 * місці: три повні рядки, далі один — саме один — ряд мініатюр.
 *
 * ЧОМУ ЦЕ ВАРТО ТЕСТУ. Зламати межу непомітно легко: досить змінити константу
 * чи повернути `flex-wrap` — і картка знову виростає вище за екран або ряд
 * мініатюр їде на другий рядок. Ані `tsc`, ані лінт про це не знають, а на
 * дошці більшість прорахунків має один-два товари, тож у щоденній роботі
 * поломка спливе не одразу.
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
    container,
    fullRowNames: Array.from(container.querySelectorAll<HTMLElement>("[title]"))
      .filter((node) => node.className.includes("truncate"))
      .map((node) => node.textContent),
    strip,
    thumbTitles: strip
      ? Array.from(strip.querySelectorAll<HTMLElement>(":scope > div[title]")).map((node) => node.title)
      : [],
    overflowLabel: strip?.querySelector("span")?.textContent ?? null,
  };
}

describe("QuoteKanbanProducts", () => {
  it("до трьох товарів показує повними рядками й не малює смуги", () => {
    const { fullRowNames, strip } = renderPreview(3);
    expect(fullRowNames).toEqual(["Товар 1", "Товар 2", "Товар 3"]);
    expect(strip).toBeNull();
  });

  it("решту згортає в мініатюри, поки вони вміщаються в один ряд", () => {
    const { fullRowNames, thumbTitles, overflowLabel } = renderPreview(8);
    expect(fullRowNames).toEqual(["Товар 1", "Товар 2", "Товар 3"]);
    expect(thumbTitles).toHaveLength(5);
    expect(thumbTitles[0]).toBe("Товар 4 · 100 шт.");
    // Рівно п'ять мініатюр — лічильник зайвий.
    expect(overflowLabel).toBeNull();
  });

  it("коли мініатюр більше за ряд — звільняє місце під «+N»", () => {
    const { thumbTitles, overflowLabel } = renderPreview(12);
    // 3 повні + 4 мініатюри + «+5»: ряд лишається один.
    expect(thumbTitles).toHaveLength(4);
    expect(overflowLabel).toBe("+5");
  });

  it("показує загальну кількість у заголовку, лише коли список обрізаний", () => {
    expect(renderPreview(3).container.textContent).not.toContain("· 3");
    expect(renderPreview(12).container.textContent).toContain("· 12");
  });
});
