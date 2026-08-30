import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Порядок рядків в одному upsert тиражів.
 *
 * `is_approved` стереже частковий унікальний індекс «один погоджений тираж на
 * позицію». Postgres перевіряє його ПОРЯДКОВО в межах одного запиту, і
 * відкласти перевірку не можна: частковий індекс не буває DEFERRABLE. Тож коли
 * позначка переїжджає з одного тиражу на інший, а той, хто її ОТРИМУЄ, стоїть
 * у масиві раніше за того, хто ВТРАЧАЄ, — запис падає з 23505, і вибір
 * менеджера мовчки не зберігається.
 *
 * Відтворено на живих даних 25.08.2026 (270 → 180 давало duplicate key), тому
 * тут не «про всяк випадок», а слід від справжньої вади.
 */

let lastPayload: Array<Record<string, unknown>> = [];

function makeBuilder() {
  const builder: Record<string, unknown> = {};
  builder.upsert = vi.fn((rows: Array<Record<string, unknown>>) => {
    lastPayload = rows;
    return builder;
  });
  builder.select = vi.fn(() => builder);
  (builder as { then: unknown }).then = (resolve: (value: unknown) => unknown) =>
    resolve({ data: lastPayload, error: null });
  return builder;
}

const fromSpy = vi.fn(() => makeBuilder());

vi.mock("@/lib/supabaseClient", () => ({
  supabase: { schema: () => ({ from: fromSpy }), from: fromSpy },
}));

const { upsertQuoteRuns } = await import("./toshoApi");

const run = (quantity: number, isApproved: boolean) => ({
  id: `run-${quantity}`,
  quote_id: "quote-1",
  quote_item_id: "item-1",
  quantity,
  unit_price_model: 25.8,
  unit_price_print: 0,
  logistics_cost: 0,
  desired_manager_income: 350,
  markup_rate: 0,
  manager_rate: 15,
  fixed_cost_rate: 30,
  vat_rate: 20,
  is_approved: isApproved,
});

describe("upsertQuoteRuns: позначка «погоджено клієнтом»", () => {
  beforeEach(() => {
    lastPayload = [];
    fromSpy.mockClear();
  });

  it("той, хто позначку втрачає, їде попереду того, хто її отримує", async () => {
    // 180 отримує позначку, 270 її втрачає — і в масиві 180 стоїть ПЕРШИМ.
    await upsertQuoteRuns("quote-1", [run(180, true), run(270, false)]);
    expect(lastPayload.map((row) => [row.id, row.is_approved])).toEqual([
      ["run-270", false],
      ["run-180", true],
    ]);
  });

  it("не перемішує рядки, коли позначки ні на кому немає", async () => {
    await upsertQuoteRuns("quote-1", [run(180, false), run(270, false)]);
    expect(lastPayload.map((row) => row.id)).toEqual(["run-180", "run-270"]);
  });

  it("не перемішує рядки, коли позначка вже стоїть на останньому", async () => {
    await upsertQuoteRuns("quote-1", [run(180, false), run(270, true)]);
    expect(lastPayload.map((row) => row.id)).toEqual(["run-180", "run-270"]);
  });

  it("несе прапорець у базу, а не губить його при записі", async () => {
    await upsertQuoteRuns("quote-1", [run(180, true)]);
    expect(lastPayload[0]).toMatchObject({ id: "run-180", is_approved: true, quantity: 180 });
  });
});
