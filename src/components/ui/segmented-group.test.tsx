import * as React from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { SegmentedGroup } from "@/components/ui/segmented-group";

/**
 * Ковзна плашка сегментованого перемикача (REQ-202).
 *
 * ЧОМУ ЦЕ ТЕСТУЄТЬСЯ САМЕ ТУТ. Плашка їде двома різними способами, і другий
 * ламається мовчки. Звичайне перемикання рухає її `transition` по `transform`.
 * Але коли розділ міняється під перехресним згасанням, на екрані два нерухомі
 * знімки, а справжній DOM схований: перехід плашки йде, і його ніхто не
 * бачить. Тоді її веде `view-transition-name` — і саме він має два способи
 * зникнути беззвучно: недійсний ідентифікатор (стає `none`) і збіг імен у двох
 * груп (браузер скасовує перехід ЦІЛКОМ). Ні типи, ні лінт цього не ловлять, а
 * збоку це виглядає як «плашка стрибає».
 *
 * Розміри тут нульові (jsdom не рахує розкладку), тому положення плашки не
 * перевіряється — лише те, що взагалі робить її рух можливим.
 */
function Group({ label, active }: { label: string; active: string }) {
  return (
    <SegmentedGroup aria-label={label}>
      <button type="button" aria-pressed={active === "first"}>
        Перший
      </button>
      <button type="button" aria-pressed={active === "second"}>
        Другий
      </button>
    </SegmentedGroup>
  );
}

const indicatorName = (label: string) => {
  const group = screen.getByLabelText(label);
  const indicator = group.querySelector<HTMLElement>("[data-segmented-indicator]");
  return indicator?.style.viewTransitionName ?? null;
};

describe("ковзна плашка", () => {
  it("ім'я переходу — валідний CSS-ідентифікатор", () => {
    render(<Group label="Розділи" active="first" />);
    expect(indicatorName("Розділи")).toMatch(/^segmented-slider-[A-Za-z0-9_-]+$/);
  });

  it("дві групи на сторінці мають різні імена", () => {
    // На сторінці прорахунків їх дві, на картці замовника — теж. Однакові імена
    // в одному кадрі браузер вважає помилкою й скасовує перехід цілком, тобто
    // сусідні перемикачі позбавляли б анімації один одного.
    render(
      <>
        <Group label="Вигляд" active="first" />
        <Group label="Режим" active="second" />
      </>
    );
    expect(indicatorName("Вигляд")).not.toBe(indicatorName("Режим"));
  });
});
