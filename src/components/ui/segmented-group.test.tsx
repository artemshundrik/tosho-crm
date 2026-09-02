import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { SegmentedGroup, useSegmentedSlider } from "@/components/ui/segmented-group";

/**
 * Ковзна плашка й ковзна риска — одна механіка на два види.
 *
 * ЩО ТУТ МОЖНА ПЕРЕВІРЯТИ, А ЩО НІ. Положення міряється через `offsetLeft` і
 * `offsetWidth`, а jsdom розкладки не рахує — там усе нулі. Тому координати тут
 * не перевіряються (і не мають: це робота ока в браузері). Перевіряється те, що
 * ламається логікою: чи взагалі з'являється індикатор, чи зникає він без
 * активного тригера, і чи риска не тягне на собі оформлення плашки.
 *
 * ЧОМУ ЦЕ ВАЖЛИВО. Індикатор один на групу, і саме тому група з ДВОМА
 * активними тригерами — помилка розмітки: підсвітку забере перший, а другий
 * лишиться зовсім без неї, бо власний фон у нього погашено.
 */
function Group({ active }: { active: string | null }) {
  return (
    <SegmentedGroup aria-label="Вигляд">
      <button type="button" aria-pressed={active === "first"}>
        Перший
      </button>
      <button type="button" aria-pressed={active === "second"}>
        Другий
      </button>
    </SegmentedGroup>
  );
}

const indicator = (label = "Вигляд") =>
  screen.getByLabelText(label).querySelector<HTMLElement>("[data-segmented-indicator]");

function UnderlineBar() {
  const { ref, indicator: bar } = useSegmentedSlider<HTMLDivElement>("underline");
  return (
    <div ref={ref} aria-label="Вкладки" className="relative">
      {bar}
      <button type="button" aria-pressed>
        Товари
      </button>
    </div>
  );
}

describe("ковзний індикатор", () => {
  it("з'являється під активним тригером", () => {
    render(<Group active="first" />);
    expect(indicator()).not.toBeNull();
  });

  it("без активного тригера індикатора немає", () => {
    // Інакше плашка зависла б там, де щойно був активний елемент, і показувала
    // б вибір, якого вже немає.
    render(<Group active={null} />);
    expect(indicator()).toBeNull();
  });

  it("риска монохромна й не тягне на собі рамку й фон плашки", () => {
    // Кольором ТЕКСТУ, а не бренду (REQ-175#p44): активна вкладка — це місце, де
    // ти стоїш, а не дія. Синє в цьому інтерфейсі означає дію або посилання.
    render(<UnderlineBar />);
    const bar = screen.getByLabelText("Вкладки").querySelector<HTMLElement>("[data-segmented-indicator]");
    expect(bar).not.toBeNull();
    expect(bar!.className).toContain("bg-foreground");
    expect(bar!.className).not.toContain("bg-primary");
    expect(bar!.className).not.toContain("border-border");
  });
});
