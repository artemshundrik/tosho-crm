import { useState } from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { applyApprovedRunToggle } from "@/lib/quoteRuns";
import type { QuoteRun } from "@/lib/toshoApi";

import { QuoteItemChoiceDialog } from "./QuoteItemChoiceDialog";
import { useQuoteItemChoice, type QuoteItemChoiceInput } from "./useQuoteItemChoice";

/**
 * «Що погодив клієнт?» на живому випадку TS-0926-0053 (REQ-317).
 *
 * ЧОМУ ТЕСТОМ, А НЕ В ПРЕВ'Ю. Перемикач тиражу у вікні пише позначку «Погодив
 * клієнт» тим самим автозбереженням, що й кнопка на картці, а дев-сервер ходить
 * у продівську базу. Клацнути, щоб подивитись, — це запис у робочий прорахунок.
 *
 * Обв'язка нижче повторює сторінку рівно в тому, що важить: тиражі живуть у
 * стані, вибір тиражу йде через `applyApprovedRunToggle`, як `toggleApprovedRun`.
 */

const writes: { ids: string[]; isApproved: boolean }[] = [];

vi.mock("@/lib/supabaseClient", () => ({
  supabase: {
    schema: () => ({
      from: () => ({
        update: (patch: { is_approved: boolean }) => ({
          eq: () => ({
            in: (_column: string, ids: string[]) => {
              writes.push({ ids, isApproved: patch.is_approved });
              return Promise.resolve({ error: null });
            },
          }),
        }),
      }),
    }),
  },
}));

vi.mock("./queries", () => ({
  logQuoteActivity: vi.fn(async () => ({ ok: true })),
}));

const run = (id: string, itemId: string, quantity: number, approved = false): QuoteRun =>
  ({ id, quote_item_id: itemId, quantity, is_approved: approved }) as QuoteRun;

// Порядок створення той самий, що в базі: у футболки першою йде п'ятисотка.
const STAGE_RUNS: QuoteRun[] = [
  run("tee-500", "tee", 500),
  run("tee-100", "tee", 100),
  run("tee-1000", "tee", 1000, true),
  run("cap-100", "cap", 100),
  run("cap-500", "cap", 500),
  run("cap-1000", "cap", 1000),
];

const STAGE_ITEMS: QuoteItemChoiceInput[] = [
  { id: "tee", position: 1, title: "Футболка «STAGE» · Чорний", unit: "шт", is_approved: null },
  { id: "cap", position: 2, title: "Кепка Atlantis STAGE · Чорний, 58 см", unit: "шт", is_approved: null },
];

// Ціна тут не предмет перевірки — головне, щоб у кожного тиражу вона була своя.
const getRunPricing = (source: QuoteRun) => ({ saleTotal: (Number(source.quantity) || 0) * 10 });
const money = (value: number) => `${value} грн`;
// Тисячі вікно розділяє так, як форматує `uk-UA` — нерозривним пробілом.
const pcs = (qty: number) => `${qty.toLocaleString("uk-UA")} шт`;

function Harness({
  canPickRun = true,
  initialRuns = STAGE_RUNS,
  items = STAGE_ITEMS,
  onApprove = vi.fn(async () => {}),
}: {
  canPickRun?: boolean;
  initialRuns?: QuoteRun[];
  items?: QuoteItemChoiceInput[];
  onApprove?: (note: string) => Promise<void>;
}) {
  const [runs, setRuns] = useState(initialRuns);
  const choice = useQuoteItemChoice({
    quoteId: "quote-1",
    teamId: "team-1",
    userId: "user-1",
    items,
    runs,
    getRunPricing,
    onPickRun: (itemId, runId) => setRuns((prev) => applyApprovedRunToggle(prev, runId, itemId)),
    onSaved: async () => {},
    onApprove,
    onError: () => {},
  });
  return (
    <>
      <button type="button" onClick={() => choice.request("")}>
        Затвердити прорахунок
      </button>
      <output data-testid="approved-runs">
        {runs
          .filter((item) => item.is_approved)
          .map((item) => item.id)
          .join(",")}
      </output>
      <QuoteItemChoiceDialog
        open={choice.open}
        items={choice.dialogItems}
        selectedIds={choice.selectedIds}
        busy={choice.busy}
        canPickRun={canPickRun}
        currencyFormatter={money}
        onToggle={choice.toggle}
        onPickRun={choice.pickRun}
        onCancel={choice.cancel}
        onSubmit={() => void choice.confirm()}
      />
    </>
  );
}

function openDialog() {
  fireEvent.click(screen.getByRole("button", { name: "Затвердити прорахунок" }));
  return screen.getByRole("dialog");
}

const rowOf = (dialog: HTMLElement, title: string) => {
  const titleNode = within(dialog).getByText(title, { exact: false });
  const row = titleNode.closest("div.rounded-lg");
  if (!row) throw new Error(`немає рядка «${title}»`);
  return row as HTMLElement;
};

describe("QuoteItemChoiceDialog — що погодив клієнт", () => {
  beforeEach(() => {
    writes.length = 0;
  });

  /** Скарга Влада: галочка стояла й на кепці, де жоден тираж не погоджено. */
  it("ставить галочку лише позиції з погодженим тиражем", () => {
    render(<Harness />);
    const dialog = openDialog();

    const tee = within(rowOf(dialog, "Футболка")).getByRole("checkbox");
    const cap = within(rowOf(dialog, "Кепка")).getByRole("checkbox");
    expect(tee).toHaveAttribute("aria-checked", "true");
    expect(cap).toHaveAttribute("aria-checked", "false");
    expect(cap).toBeDisabled();
    expect(within(rowOf(dialog, "Кепка")).getByText(/Тираж не погоджено/)).toBeInTheDocument();
  });

  /**
   * Рядок і підсумок — із ПОГОДЖЕНОГО тиражу, тобто з того, що візьме
   * замовлення, а не з першого створеного (500) чи відкритої вкладки.
   */
  it("показує погоджений тираж і рахує підсумок лише за взятим", () => {
    render(<Harness />);
    const dialog = openDialog();

    expect(within(rowOf(dialog, "Футболка")).getByText("1 000 шт · 10000 грн")).toBeInTheDocument();
    expect(dialog).toHaveTextContent("У замовлення піде 1 із 2 на 10000 грн");
    expect(dialog).toHaveTextContent("не взяли 1");
  });

  it("обирає тираж просто у вікні — і позиція бере галочку", () => {
    render(<Harness />);
    const dialog = openDialog();
    const capRow = rowOf(dialog, "Кепка");

    // Шкала за кількістю, а не в порядку створення.
    const chips = within(capRow).getAllByRole("button");
    expect(chips.map((chip) => chip.textContent)).toEqual([pcs(100), pcs(500), pcs(1000)]);
    expect(chips.every((chip) => chip.getAttribute("aria-pressed") === "false")).toBe(true);

    fireEvent.click(within(capRow).getByRole("button", { name: pcs(1000) }));

    expect(screen.getByTestId("approved-runs")).toHaveTextContent("tee-1000,cap-1000");
    const capAfter = rowOf(dialog, "Кепка");
    expect(within(capAfter).getByRole("checkbox")).toHaveAttribute("aria-checked", "true");
    expect(within(capAfter).getByText("1 000 шт · 10000 грн")).toBeInTheDocument();
    expect(dialog).toHaveTextContent("У замовлення піде 2 із 2 на 20000 грн");
  });

  /** На картці повторний клік знімає позначку; у вікні перемикач — вибір одного з кількох. */
  it("повторний клік по обраному тиражу не знімає позначку", () => {
    render(<Harness />);
    const dialog = openDialog();

    fireEvent.click(within(rowOf(dialog, "Футболка")).getByRole("button", { name: pcs(1000) }));

    expect(screen.getByTestId("approved-runs")).toHaveTextContent("tee-1000");
    expect(within(rowOf(dialog, "Футболка")).getByRole("checkbox")).toHaveAttribute("aria-checked", "true");
  });

  it("перемикає погоджений тираж на інший у межах позиції", () => {
    render(<Harness />);
    const dialog = openDialog();

    fireEvent.click(within(rowOf(dialog, "Футболка")).getByRole("button", { name: pcs(500) }));

    expect(screen.getByTestId("approved-runs")).toHaveTextContent(/^tee-500$/);
    expect(within(rowOf(dialog, "Футболка")).getByText("500 шт · 5000 грн")).toBeInTheDocument();
  });

  it("без права на тиражі перемикач вимкнено, а пояснення каже, хто позначає", () => {
    render(<Harness canPickRun={false} />);
    const dialog = openDialog();
    const capRow = rowOf(dialog, "Кепка");

    expect(within(capRow).getByRole("button", { name: pcs(1000) })).toBeDisabled();
    expect(within(capRow).getByText(/позначити його може менеджер прорахунку/)).toBeInTheDocument();
  });

  it("нічого не обрано, бо тиражі не погоджені — просить обрати тираж, а не скасувати", () => {
    render(
      <Harness
        initialRuns={STAGE_RUNS.map((item) => ({ ...item, is_approved: false }))}
      />
    );
    const dialog = openDialog();

    expect(dialog).toHaveTextContent("Оберіть тираж, який погодив клієнт");
    expect(dialog).not.toHaveTextContent("це «Скасовано»");
    expect(within(dialog).getByRole("button", { name: "Затвердити" })).toBeDisabled();
  });

  /**
   * Галочка позиції без тиражу вимкнена, і Radix віддавав фокус першому
   * тиражу — один Enter «погоджував» найменший. Фокус має стояти на вікні.
   */
  it("не ставить фокус на перемикач тиражу при відкритті", () => {
    render(<Harness />);
    const dialog = openDialog();

    expect(dialog).toHaveFocus();
  });

  /** Найчастіший випадок — різні товари по одному тиражу — і далі один клік. */
  it("позиції з одним тиражем стоять із галочкою, перемикача немає", () => {
    render(
      <Harness
        initialRuns={[run("tee-100", "tee", 100), run("cap-100", "cap", 100)]}
      />
    );
    const dialog = openDialog();

    for (const title of ["Футболка", "Кепка"]) {
      const row = rowOf(dialog, title);
      expect(within(row).getByRole("checkbox")).toHaveAttribute("aria-checked", "true");
      expect(within(row).queryAllByRole("button")).toHaveLength(0);
    }
    expect(dialog).toHaveTextContent("У прорахунку 2 позиції");
  });

  it("раніше відхилену позицію не воскрешає", () => {
    render(
      <Harness
        items={STAGE_ITEMS.map((item) => (item.id === "tee" ? { ...item, is_approved: false } : item))}
      />
    );
    const dialog = openDialog();

    expect(within(rowOf(dialog, "Футболка")).getByRole("checkbox")).toHaveAttribute("aria-checked", "false");
  });

  it("записує в базу саме те, що видно у вікні", async () => {
    const onApprove = vi.fn(async () => {});
    render(<Harness onApprove={onApprove} />);
    const dialog = openDialog();

    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Затвердити" }));
    });

    expect(writes).toEqual([
      { ids: ["tee"], isApproved: true },
      { ids: ["cap"], isApproved: false },
    ]);
    expect(onApprove).toHaveBeenCalledOnce();
  });
});
