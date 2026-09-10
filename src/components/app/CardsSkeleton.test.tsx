import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CardsSkeleton, ENTITY_CARD_FRAME, ENTITY_CARD_ROWS } from "./CardsSkeleton";

/**
 * Сторожа проти повернення тієї самої вади, з якої цей файл і виріс.
 *
 * Було так: «Сервісам» і «Постачальникам» проставили найближчі наявні форми
 * каркаса — `list` і `grid`. Перша малювала стрічку вузьких рядків, друга —
 * фотогалерею на 4-5 колонок із місцем під картинку 4:3. Обидві сторінки
 * насправді роблять сітку текстових карток у 2/3 колонки, тож у момент
 * готовності даних екран перебудовувався повністю.
 *
 * Помітити це можна було лише очима, бо жодна перевірка не звіряла форму з
 * реєстру з тим, що сторінка справді малює. Тести нижче звіряють рівно те, що
 * тоді розійшлось: сітку й рамку картки.
 */
describe("CardsSkeleton", () => {
  it("малює ту саму сітку, що й самі сторінки — 2 колонки на планшеті, 3 на широкому", () => {
    const { container } = render(<CardsSkeleton count={3} />);
    const grid = container.firstElementChild;
    expect(grid?.className).toContain("sm:grid-cols-2");
    expect(grid?.className).toContain("xl:grid-cols-3");
    expect(grid?.children).toHaveLength(3);
  });

  it("плитка носить ту саму рамку й ті самі рядки, що справжня картка", () => {
    const { container } = render(<CardsSkeleton count={1} />);
    const tile = container.firstElementChild?.firstElementChild;
    // Висота картки тримається на жорстких рядках; варто їх загубити — і
    // заглушка знову буде іншої висоти за справжню картку.
    expect(tile?.className).toContain(ENTITY_CARD_ROWS);
    for (const cls of ENTITY_CARD_FRAME.split(" ")) expect(tile?.className).toContain(cls);
  });

  it("рядки картки лишаються п'ятьма — саме їх повторює заглушка", () => {
    expect(ENTITY_CARD_ROWS).toBe("grid-rows-[36px_18px_46px_65px_32px]");
    const { container } = render(<CardsSkeleton count={1} />);
    expect(container.firstElementChild?.firstElementChild?.children).toHaveLength(5);
  });
});
