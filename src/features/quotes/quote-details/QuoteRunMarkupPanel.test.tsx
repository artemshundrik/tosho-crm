import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";

import { describe, expect, it, vi } from "vitest";

import { markupTrackMax, QuoteRunMarkupPanel, snapMarkupRate } from "./QuoteRunMarkupPanel";
import {
  resolveQuoteRunMarkupState,
  type QuoteMarkupApproval,
} from "@/lib/quoteMarkupApproval";
import { QUOTE_MARKUP_VIEWS } from "@/lib/quoteMarkupView";
import { computeRunSalePricingFromMarkup } from "@/lib/quoteRuns";

/**
 * Шість виглядів × стани погодження — рівно те, що ухвалив СЕО 30.08.2026
 * (REQ-149, пункти p10–p12).
 *
 * ЧОМУ ТЕСТОМ, А НЕ ОЧИМА В ПРЕВ'Ю. Три стани з шести — «на погодженні»,
 * «підтверджено», «відхилено» — щоб побачити живцем, треба ЗАВЕСТИ запит у
 * проді: дев-сервер ходить у продівську базу. Прототип і смуга перевірені в
 * браузері, а стани після рішення — тут, бо ціна перевірки очима там —
 * справжній запис у робочі дані.
 */

const COST = 119_300;
const RATE = 8.72;

const pricing = computeRunSalePricingFromMarkup({
  quantity: 36,
  costTotal: COST,
  markupRate: RATE,
  managerRate: 10,
  fixedCostRate: 30,
  vatRate: 20,
});

const approval = (overrides: Partial<QuoteMarkupApproval> = {}): QuoteMarkupApproval => ({
  id: "a1",
  quoteId: "q1",
  runId: "r1",
  status: "pending",
  markupRate: RATE,
  costTotal: COST,
  requestNote: null,
  requestedBy: "manager-1",
  requestedAt: "2026-08-30T12:19:00.000Z",
  decidedBy: "ceo-1",
  decidedAt: "2026-08-30T13:02:00.000Z",
  decisionNote: null,
  ...overrides,
});

function renderPanel(options: {
  view: keyof typeof QUOTE_MARKUP_VIEWS;
  approval?: QuoteMarkupApproval | null;
  canEditMarkup?: boolean;
  canApprove?: boolean;
}) {
  const state = resolveQuoteRunMarkupState({
        dealType: null,
    costTotal: COST,
    markupRate: RATE,
    approval: options.approval ?? null,
  });
  const onDecide = vi.fn();
  const onRequestApproval = vi.fn();
  render(
    <QuoteRunMarkupPanel
        dealType={null}
      view={QUOTE_MARKUP_VIEWS[options.view]}
      state={state}
      pricing={pricing}
      markupRate={RATE}
      currency="UAH"
      benchmark={{ rate: 54.08, sampleCount: 8, basis: "kind" }}
      canEditMarkup={options.canEditMarkup ?? true}
      canApprove={options.canApprove ?? false}
      managerName="Дар'я М."
      deciderName="Владислав"
      onChangeMarkupRate={vi.fn()}
      onRequestApproval={onRequestApproval}
      onDecide={onDecide}
    />
  );
  return { onDecide, onRequestApproval };
}

describe("вигляд за посадою", () => {
  it("менеджер бачить свій заробіток і не бачить розкладу ціни", () => {
    renderPanel({ view: "manager" });
    // З великої: REQ-155 p3 звів обидва написи заробітку в один — той, що стоїть
    // у виносці внизу. До того їх було два, з різним написанням: «твій заробіток»
    // праворуч від великого числа й «Твій заробіток» у стовпчику під смугою.
    expect(screen.getByText(/^Твій заробіток/)).toBeTruthy();
    expect(screen.queryByText(/^ПДВ/)).toBeNull();
  });

  it("проджект бачить розклад, але НЕ бачить заробітку менеджера", () => {
    renderPanel({ view: "pm", canEditMarkup: false });
    expect(screen.getByText(/ПДВ/)).toBeTruthy();
    expect(screen.queryByText(/Заробіток менеджера/)).toBeNull();
    expect(screen.queryByText("твій заробіток")).toBeNull();
  });

  it("бухгалтерія бачить заробіток менеджера — він потрібен для нарахування", () => {
    renderPanel({ view: "back", canEditMarkup: false });
    expect(screen.getByText(/Заробіток менеджера \(Дар'я М\.\)/)).toBeTruthy();
  });

  it("молодший бухгалтер — вигляд менеджера, але без чужих грошей і без повзунка", () => {
    renderPanel({ view: "junior", canEditMarkup: false });
    expect(screen.queryByText(/Заробіток менеджера/)).toBeNull();
    expect(screen.queryByLabelText("Накрутка на собівартість, відсотки")).toBeNull();
  });

  it("повзунок є лише там, де вигляд його дає І поле належить глядачеві", () => {
    renderPanel({ view: "seo" });
    expect(screen.getByLabelText("Накрутка на собівартість, відсотки")).toBeTruthy();
  });

  it("бухгалтер повзунка не отримує навіть із правом на поле", () => {
    renderPanel({ view: "chief", canEditMarkup: true });
    expect(screen.queryByLabelText("Накрутка на собівартість, відсотки")).toBeNull();
  });
});

describe("стани погодження", () => {
  it("нижче дна без запиту — менеджеру пояснюють, що саме замкнено", () => {
    renderPanel({ view: "manager" });
    expect(screen.getByText(/КП клієнту й перехід у «Затверджено» відкриються/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Надіслати на погодження" })).toBeTruthy();
  });

  it("на погодженні: менеджер чекає, погоджувач бачить чиє й на скільки", () => {
    renderPanel({ view: "manager", approval: approval({ decidedBy: null, decidedAt: null }) });
    expect(screen.getByText(/Чекаємо на будь-кого з трьох/)).toBeTruthy();
    // Поки чекаємо — надсилати нема чого вдруге.
    expect(screen.queryByRole("button", { name: /Надіслати/ })).toBeNull();
  });

  it("погоджувач на погодженні отримує дві кнопки й ім'я прохача", () => {
    const { onDecide } = renderPanel({
      view: "seo",
      canApprove: true,
      approval: approval({ decidedBy: null, decidedAt: null }),
    });
    expect(screen.getByText(/Дар'я М\. просить/)).toBeTruthy();
    screen.getByRole("button", { name: /Підтвердити/ }).click();
    expect(onDecide).toHaveBeenCalledWith("approved");
    screen.getByRole("button", { name: "Відхилити" }).click();
    expect(onDecide).toHaveBeenCalledWith("rejected");
  });

  it("відхилено: число лишається, двері закриті, є з чим повернутись", () => {
    renderPanel({
      view: "manager",
      approval: approval({ status: "rejected", decisionNote: "Не бачу причини" }),
    });
    expect(screen.getByText("Відхилено")).toBeTruthy();
    expect(screen.getByText(/Число не відкочується саме/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Надіслати запит наново" })).toBeTruthy();
  });

  it("підтверджено: сказано, хто і на яке число, і коли запит відкриється наново", () => {
    renderPanel({ view: "manager", approval: approval({ status: "approved" }) });
    expect(screen.getByText("Погоджено")).toBeTruthy();
    expect(screen.getByText(/Зміна собівартості або накрутки вниз відкриє запит наново/)).toBeTruthy();
    // Ані надіслати, ані відкликати: рішення вже є. «Що це означає» кнопкою є,
    // але це не дія над тиражем, а розкриття подробиць рішення (REQ-175#p54).
    expect(screen.queryByRole("button", { name: /Надіслати|Підтвердити|Відхилити/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Що це означає/ })).toBeTruthy();
  });

  it("заморозка знімає повзунок навіть у СЕО — інакше рішення стосувалось би іншого числа", () => {
    renderPanel({ view: "seo", approval: approval({ decidedBy: null, decidedAt: null }) });
    expect(screen.queryByLabelText("Накрутка на собівартість, відсотки")).toBeNull();
  });
});

describe("колір заливки несе стан дверей, а не «нижче дна»", () => {
  // Заливка — єдиний елемент рейки, ширина якого задана відсотком.
  const fillClass = (container: HTMLElement) =>
    container.querySelector('[style*="width"]')?.className ?? "";
  const thumbClass = (container: HTMLElement) =>
    container.querySelector(".rounded-full.border-2")?.className ?? "";

  it("замкнені двері — бурштинова: та сама мова, що в бейджі й у полі", () => {
    for (const status of ["pending", "rejected"] as const) {
      const { container, unmount } = render(
        <QuoteRunMarkupPanel
        dealType={null}
          view={QUOTE_MARKUP_VIEWS.manager}
          state={resolveQuoteRunMarkupState({
        dealType: null,
            costTotal: COST,
            markupRate: RATE,
            approval: approval({ status }),
          })}
          pricing={pricing}
          markupRate={RATE}
          currency="UAH"
          benchmark={null}
          canEditMarkup={false}
          canApprove={false}
          onChangeMarkupRate={vi.fn()}
          onRequestApproval={vi.fn()}
          onDecide={vi.fn()}
        />
      );
      expect(fillClass(container)).toContain("bg-warning-solid");
      // Обідок повзунка йде за заливкою: синій кружечок на бурштиновій рейці
      // читався б як чужа деталь.
      expect(thumbClass(container)).toContain("border-warning-solid");
      unmount();
    }
  });

  it("підтверджена накрутка — синя, хоч і нижче дна: бити тривогу вже нема за що", () => {
    const { container } = render(
      <QuoteRunMarkupPanel
        dealType={null}
        view={QUOTE_MARKUP_VIEWS.manager}
        state={resolveQuoteRunMarkupState({
        dealType: null,
          costTotal: COST,
          markupRate: RATE,
          approval: approval({ status: "approved" }),
        })}
        pricing={pricing}
        markupRate={RATE}
        currency="UAH"
        benchmark={null}
        canEditMarkup={false}
        canApprove={false}
        onChangeMarkupRate={vi.fn()}
        onRequestApproval={vi.fn()}
        onDecide={vi.fn()}
      />
    );
    expect(fillClass(container)).toContain("bg-primary");
    expect(fillClass(container)).not.toContain("bg-warning-solid");
    expect(thumbClass(container)).toContain("border-primary");
  });
});

describe("відмітка-орієнтир", () => {
  it("орієнтира немає — сказано один раз, на смузі, а не двічі", () => {
    render(
      <QuoteRunMarkupPanel
        dealType={null}
        view={QUOTE_MARKUP_VIEWS.seo}
        state={resolveQuoteRunMarkupState({
        dealType: null, costTotal: COST, markupRate: 40 })}
        pricing={pricing}
        markupRate={40}
        currency="UAH"
        benchmark={null}
        canEditMarkup
        canApprove
        onChangeMarkupRate={vi.fn()}
        onRequestApproval={vi.fn()}
        onDecide={vi.fn()}
      />
    );
    // Шапка про орієнтир МОВЧИТЬ, коли його немає (REQ-175#p59): підпис без
    // числа стояв упритул до бейджа стану й читався як його продовження.
    // Чесна відповідь лишається одна — підпис на самій смузі.
    expect(screen.queryByText(/орієнтир на цій позиції/)).toBeNull();
    expect(screen.getByText("орієнтира немає")).toBeTruthy();
  });

  it("на поліграфії нотатка поступається підпису дна — вони стоять в одному місці", () => {
    // Дно 53,8 % падає на 44,9 % смуги, а «орієнтира немає» приколочене до
    // середини: підписи наїжджали один на одного (помічено в прев'ю
    // 01.09.2026). Ховається саме нотатка: дно — правило, за яким ціна йде на
    // погодження, а відсутність орієнтира вже видно з порожньої смуги.
    render(
      <QuoteRunMarkupPanel
        dealType="standard"
        view={QUOTE_MARKUP_VIEWS.seo}
        state={resolveQuoteRunMarkupState({ dealType: "standard", costTotal: COST, markupRate: 60 })}
        pricing={pricing}
        markupRate={60}
        currency="UAH"
        benchmark={null}
        canEditMarkup
        canApprove
        onChangeMarkupRate={vi.fn()}
        onRequestApproval={vi.fn()}
        onDecide={vi.fn()}
      />
    );
    expect(screen.queryByText("орієнтира немає")).toBeNull();
    // Саме підпис ПОЗНАЧКИ на смузі: у виносці внизу дно теж названо, але там
    // воно частина фрази про тип угоди.
    expect(screen.getByText("дно 53,8 %")).toBeTruthy();
  });
});

describe("прилипання повзунка накрутки", () => {
  // Дно 20 % і орієнтир 43,3 % — єдині дві відмітки на смузі, що несуть зміст.
  const marks = [20, 43.3];

  it("без відміток поруч — цілий відсоток, жодних сотих", () => {
    expect(snapMarkupRate(28.4, marks)).toBe(28);
    expect(snapMarkupRate(28.6, marks)).toBe(29);
    expect(snapMarkupRate(0.2, marks)).toBe(0);
  });

  it("біля дна прилипає до нього — саме тут вмикається погодження", () => {
    expect(snapMarkupRate(19.5, marks)).toBe(20);
    expect(snapMarkupRate(20.55, marks)).toBe(20);
    // Точна межа зони: повзунок ходить кроком 0,1, і 20,6 − 20 у подвійній
    // точності більше за 0,6. Без похибки в порівнянні зона коротшала на крок.
    expect(snapMarkupRate(20.6, marks)).toBe(20);
    expect(snapMarkupRate(19.4, marks)).toBe(20);
  });

  it("сусіди дна лишаються досяжні — інакше 19 % не поставити взагалі", () => {
    expect(snapMarkupRate(19.3, marks)).toBe(19);
    expect(snapMarkupRate(20.9, marks)).toBe(21);
  });

  it("до дробового орієнтира прилипає точно, без сотих", () => {
    expect(snapMarkupRate(43.0, marks)).toBe(43.3);
    expect(snapMarkupRate(43.27, [20, 43.27])).toBe(43.3);
  });

  it("без орієнтира магнітне лише дно", () => {
    expect(snapMarkupRate(43.0, [20, null])).toBe(43);
    expect(snapMarkupRate(19.6, [20, undefined])).toBe(20);
  });
});

describe("права межа смуги розсувається за числом", () => {
  it("щоденні числа лишають шкалу як була — 0–120", () => {
    expect(markupTrackMax(0)).toBe(120);
    expect(markupTrackMax(40)).toBe(120);
    expect(markupTrackMax(119.9)).toBe(120);
  });

  it("край ЗАВЖДИ строго вищий за число — кружечок на краю читається як стіна", () => {
    // Саме звідси виросла скарга: 120 у полі давало повзунок, прибитий до
    // правого кінця, і менеджер прочитала це як межу дозволеного.
    expect(markupTrackMax(120)).toBe(200);
    expect(markupTrackMax(200)).toBe(300);
  });

  it("сходинки по сто — 150 живе на шкалі 0–200, 332 на 0–400", () => {
    expect(markupTrackMax(150)).toBe(200);
    expect(markupTrackMax(199.9)).toBe(200);
    expect(markupTrackMax(332.6)).toBe(400);
  });

  it("відмітка вище числа теж розсуває край — інакше орієнтир прилипне до кінця", () => {
    expect(markupTrackMax(40, [20, 130])).toBe(200);
    expect(markupTrackMax(40, [20, null, undefined])).toBe(120);
  });

  it("сміття замість числа не ламає шкалу", () => {
    expect(markupTrackMax(Number.NaN)).toBe(120);
    expect(markupTrackMax(-50)).toBe(120);
  });

  const renderAtRate = (rate: number) =>
    render(
      <QuoteRunMarkupPanel
        dealType={null}
        view={QUOTE_MARKUP_VIEWS.seo}
        state={resolveQuoteRunMarkupState({ dealType: null, costTotal: COST, markupRate: rate })}
        pricing={pricing}
        markupRate={rate}
        currency="UAH"
        benchmark={null}
        canEditMarkup
        canApprove
        onChangeMarkupRate={vi.fn()}
        onRequestApproval={vi.fn()}
        onDecide={vi.fn()}
      />
    );

  it("на 150 % смуга каже «200 %», а повзунок стоїть на трьох чвертях", () => {
    const { container } = renderAtRate(150);
    expect(screen.getByText("200 %")).toBeTruthy();
    expect(screen.queryByText("120 %")).toBeNull();
    // Заливка — єдине, чия ширина задана відсотком: 150 із 200 це три чверті,
    // а не прибитий до краю кадр, який до 11.09.2026 однаково малював 121 і 332.
    expect(
      (container.querySelector('[style*="width"]') as HTMLElement | null)?.style.width
    ).toBe("75%");
    expect((screen.getByLabelText("Накрутка на собівартість, відсотки") as HTMLInputElement).max).toBe(
      "200"
    );
  });

  it("на широкій шкалі нуль поступається дну — вони стоять в одному місці", () => {
    // Дно 20 % на шкалі 0–400 падає на 5 % ширини, і підпис наїжджав на «0 %»
    // (побачено в прев'ю 11.09.2026 на TS-0426-0061). На 0–200 дно вже на 10 %,
    // і обидва підписи стоять із зазором у 31 px — там нуль лишається.
    const { unmount } = renderAtRate(332.6);
    expect(screen.getByText("400 %")).toBeTruthy();
    expect(screen.getByText("дно 20 %")).toBeTruthy();
    expect(screen.queryByText("0 %")).toBeNull();
    unmount();

    renderAtRate(180.1);
    expect(screen.getByText("200 %")).toBeTruthy();
    expect(screen.getByText("0 %")).toBeTruthy();
  });

  it("на звичайних 40 % усе лишається як було", () => {
    renderAtRate(40);
    expect(screen.getByText("120 %")).toBeTruthy();
    expect((screen.getByLabelText("Накрутка на собівартість, відсотки") as HTMLInputElement).max).toBe(
      "120"
    );
  });
});

describe("край смуги замирає на час жесту", () => {
  /**
   * ЧОМУ ЦЕ ТЕСТОМ, А НЕ ОЧИМА. Щоб потягати повзунок з накрутки вище 120 %,
   * у проді має лежати такий тираж із живим повзунком — а всі 14 таких
   * прорахунків скасовані, і повзунка там немає. Поставити 150 % руками
   * означало б ЗАПИСАТИ чуже число в робочі дані: тиражі автозберігаються.
   * Тут же йде той самий react-dom, що й у браузері.
   */
  function Harness() {
    const [rate, setRate] = useState(150);
    return (
      <QuoteRunMarkupPanel
        dealType={null}
        view={QUOTE_MARKUP_VIEWS.seo}
        state={resolveQuoteRunMarkupState({ dealType: null, costTotal: COST, markupRate: rate })}
        pricing={pricing}
        markupRate={rate}
        currency="UAH"
        benchmark={null}
        canEditMarkup
        canApprove
        onChangeMarkupRate={setRate}
        onRequestApproval={vi.fn()}
        onDecide={vi.fn()}
      />
    );
  }

  it("драг зі 150 вниз не переміряє шкалу під курсором — і міряє після відпускання", () => {
    render(<Harness />);
    const slider = screen.getByLabelText(
      "Накрутка на собівартість, відсотки"
    ) as HTMLInputElement;
    expect(slider.max).toBe("200");

    fireEvent.pointerDown(slider);
    fireEvent.change(slider, { target: { value: "40" } });
    // Найважливіший рядок у файлі: без заморозки край схлопнувся б до 120, і
    // кружечок відлетів би з-під курсора вдвічі далі, ніж його везли.
    expect(slider.max).toBe("200");
    expect(slider.value).toBe("40");

    // Відпускають регулярно за межами смуги, тому слухач висить на вікні.
    fireEvent.pointerUp(window);
    expect(slider.max).toBe("120");
  });
});
