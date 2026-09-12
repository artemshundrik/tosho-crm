import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { QuoteItemSpec } from "./QuoteItemSpec";

/**
 * Два рядки з ОДНАКОВИМ підписом в одній секції (REQ-178#p1).
 *
 * Так виглядали нанесення до REQ-157#p4: секція «Нанесення», де підпис — метод,
 * а значення — місце. «Вишивка · Груди» і «Вишивка · Спина» давали два поля з
 * підписом «Вишивка», і ключ `section.title + field.label` збігався — React
 * сипав у консоль попередження про однакові ключі, а друге поле могло зникнути
 * при перемальовуванні.
 *
 * Нанесення звідси пішли, тож сьогодні жоден виклик таких пар не дає. Але
 * ключування лишалось тим самим, тобто безпечним лише ВИПАДКОВО — перша ж нова
 * секція з повторюваним підписом повернула б ту саму помилку. Тест закриває
 * саме механізм, а не той конкретний випадок.
 */

const originalError = console.error;

afterEach(() => {
  console.error = originalError;
});

describe("специфікація позиції", () => {
  it("два поля з однаковим підписом малюються обидва й без скарги на ключі", () => {
    const spy = vi.fn();
    console.error = spy;

    render(
      <QuoteItemSpec
        sections={[
          {
            title: "Нанесення",
            fields: [
              { label: "Вишивка", value: "Груди · 100×30 мм" },
              { label: "Вишивка", value: "Спина · 200×250 мм" },
            ],
          },
        ]}
      />
    );

    expect(screen.getAllByText("Вишивка")).toHaveLength(2);
    expect(screen.getByText("Груди · 100×30 мм")).toBeInTheDocument();
    expect(screen.getByText("Спина · 200×250 мм")).toBeInTheDocument();

    const duplicateKeyWarning = spy.mock.calls.find((call) =>
      call.some((arg) => typeof arg === "string" && /same key|two children with the same key/i.test(arg))
    );
    expect(duplicateKeyWarning).toBeUndefined();
  });

  it("однакові підписи в РІЗНИХ секціях теж не конфліктують", () => {
    const spy = vi.fn();
    console.error = spy;

    render(
      <QuoteItemSpec
        sections={[
          { title: "Обкладинка", fields: [{ label: "Друк", value: "4+0" }] },
          { title: "Блок", fields: [{ label: "Друк", value: "1+1" }] },
        ]}
      />
    );

    expect(screen.getAllByText("Друк")).toHaveLength(2);
    expect(
      spy.mock.calls.find((call) =>
        call.some((arg) => typeof arg === "string" && /same key|two children with the same key/i.test(arg))
      )
    ).toBeUndefined();
  });
});
