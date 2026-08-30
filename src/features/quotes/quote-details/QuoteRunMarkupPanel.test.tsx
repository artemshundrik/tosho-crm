import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { QuoteRunMarkupPanel } from "./QuoteRunMarkupPanel";
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
    costTotal: COST,
    markupRate: RATE,
    approval: options.approval ?? null,
  });
  const onDecide = vi.fn();
  const onRequestApproval = vi.fn();
  render(
    <QuoteRunMarkupPanel
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
    expect(screen.getByText("твій заробіток")).toBeTruthy();
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
    // Ані надіслати, ані відкликати: рішення вже є.
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("заморозка знімає повзунок навіть у СЕО — інакше рішення стосувалось би іншого числа", () => {
    renderPanel({ view: "seo", approval: approval({ decidedBy: null, decidedAt: null }) });
    expect(screen.queryByLabelText("Накрутка на собівартість, відсотки")).toBeNull();
  });
});

describe("колір заливки несе стан дверей, а не «нижче дна»", () => {
  const fillClass = (container: HTMLElement) =>
    container.querySelector('[class*="border-r-2"]')?.className ?? "";

  it("замкнені двері — бурштинова: та сама мова, що в бейджі й у полі", () => {
    for (const status of ["pending", "rejected"] as const) {
      const { container, unmount } = render(
        <QuoteRunMarkupPanel
          view={QUOTE_MARKUP_VIEWS.manager}
          state={resolveQuoteRunMarkupState({
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
      expect(fillClass(container)).toContain("bg-warning-soft");
      unmount();
    }
  });

  it("підтверджена накрутка — синя, хоч і нижче дна: бити тривогу вже нема за що", () => {
    const { container } = render(
      <QuoteRunMarkupPanel
        view={QUOTE_MARKUP_VIEWS.manager}
        state={resolveQuoteRunMarkupState({
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
    expect(fillClass(container)).toContain("bg-primary/30");
    expect(fillClass(container)).not.toContain("bg-warning-soft");
  });
});

describe("відмітка-орієнтир", () => {
  it("замало даних — так і написано, а не намальовано число", () => {
    render(
      <QuoteRunMarkupPanel
        view={QUOTE_MARKUP_VIEWS.seo}
        state={resolveQuoteRunMarkupState({ costTotal: COST, markupRate: 40 })}
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
    expect(screen.getByText("замало даних")).toBeTruthy();
    expect(screen.getByText("орієнтира немає")).toBeTruthy();
  });
});
