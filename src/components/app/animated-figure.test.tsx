import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

import {
  AnimatedFigure,
  FIGURE_LOCALE,
  FIGURE_UAH_FORMAT,
  useFigureReveal,
} from "@/components/app/animated-figure";
import { formatOrderMoney } from "@/features/orders/orderRecords";

/**
 * Анімовані підсумки (REQ-200).
 *
 * ГОЛОВНЕ, ЩО ТУТ ПЕРЕВІРЯЄТЬСЯ, — НЕ АНІМАЦІЯ, А ТЕКСТ. Підсумок «Витрати»
 * доти складав `formatOrderMoney`, а тепер його друкує NumberFlow зі СВОГО
 * `Intl.NumberFormat`. Якщо формати розійдуться (інша валюта, інша кількість
 * знаків, інший роздільник), на сторінці мовчки з'явиться інша сума — і жоден
 * тип цього не спіймає, бо обидва рядки лишаються рядками.
 *
 * Саму анімацію тут не перевірити й перевіряти нема сенсу: у jsdom немає ні
 * `Element.animate`, ні промальовування, і бібліотека свідомо падає в
 * звичайний текст. Це заразом і є перевірка запасного шляху.
 */

/**
 * `Intl` для uk-UA розділяє розряди НЕРОЗРИВНИМ пробілом, а Testing Library
 * зводить будь-який пробіл у тексті вузла до звичайного — тож без цього
 * зведення обидва боки виглядають однаково, а не збігаються.
 */
const plain = (value: string) => value.replace(/\s/g, " ");

describe("AnimatedFigure", () => {
  it("друкує рівно те саме, що й formatOrderMoney", () => {
    render(<AnimatedFigure value={94307} ready />);
    const expected = formatOrderMoney(94307, "UAH");
    expect(screen.getByText(plain(expected))).toBeInTheDocument();
    // Контроль формату на випадок, якщо formatOrderMoney колись зміниться:
    // збіг має бути НЕ випадковим, а через ті самі опції.
    expect(new Intl.NumberFormat(FIGURE_LOCALE, FIGURE_UAH_FORMAT).format(94307)).toBe(expected);
  });

  it("до готовності показує нуль, а не справжнє значення", () => {
    render(<AnimatedFigure value={94307} ready={false} />);
    expect(screen.getByText(plain(formatOrderMoney(0, "UAH")))).toBeInTheDocument();
    expect(screen.queryByText(plain(formatOrderMoney(94307, "UAH")))).toBeNull();
  });

  it("суфікс і власний формат доїжджають (виплати рахують у гривнях без знака валюти)", () => {
    render(<AnimatedFigure value={22500} ready format={{ maximumFractionDigits: 0 }} suffix=" грн" />);
    expect(screen.getByText(plain(`${new Intl.NumberFormat(FIGURE_LOCALE).format(22500)} грн`))).toBeInTheDocument();
  });
});

/**
 * Розкриття при відкритті сторінки.
 *
 * ЦЕ І Є ТА ЧАСТИНА, ЯКУ НАЙЛЕГШЕ ЗЛАМАТИ НЕПОМІТНО. Якщо прапорець
 * підніметься надто рано (в тому ж кадрі, що й нулі), анімації не буде взагалі
 * — і жодна перевірка, крім цієї, про це не скаже: на сторінці стоятиме
 * правильне число, просто без руху.
 */
describe("useFigureReveal", () => {
  function Probe({ enabled = true }: { enabled?: boolean }) {
    const ready = useFigureReveal(enabled);
    return <span data-testid="ready">{String(ready)}</span>;
  }

  it("перший кадр — не готово, далі готово", async () => {
    render(<Probe />);
    // Кадр із нулями мусить бути НАМАЛЬОВАНИЙ окремо: інакше числу нема від
    // чого рухатись.
    expect(screen.getByTestId("ready")).toHaveTextContent("false");
    await waitFor(() => expect(screen.getByTestId("ready")).toHaveTextContent("true"));
  });

  it("поки вимкнено — не піднімається", async () => {
    const { rerender } = render(<Probe enabled={false} />);
    await Promise.resolve();
    expect(screen.getByTestId("ready")).toHaveTextContent("false");

    // Дані приїхали — відлік починається аж тепер. Саме тому в «Релізах»
    // лічильники не «встигають» стати готовими ще на каркасі.
    rerender(<Probe enabled />);
    await waitFor(() => expect(screen.getByTestId("ready")).toHaveTextContent("true"));
  });

  /**
   * Найдорожча з можливих поломок: на схованій вкладці `requestAnimationFrame`
   * не викликається взагалі, тож прапорець лишився б опущеним — і на місці
   * підсумку «Витрати» стояв би НУЛЬ. Не «анімації немає», а неправильна сума.
   */
  it("на схованій сторінці готово одразу — щоб не показати нуль замість суми", () => {
    const spy = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    try {
      render(<Probe />);
      expect(screen.getByTestId("ready")).toHaveTextContent("true");
    } finally {
      spy.mockRestore();
    }
  });
});
