import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Контракт запитів до tosho.team_absences із зарплатного шару.
 *
 * Тест навмисно перевіряє САМ ЗАПИТ, а не результат: відколи в таблиці
 * з'явився status, незапитаний фільтр `approved` тихо ріже норму дизайнера
 * за дні, яких людині ще ніхто не погодив. Помилка не падає — вона просто
 * дає меншу зарплату, тож ловимо її тут.
 */

type Call = { method: string; args: unknown[] };

function makeQueryRecorder() {
  const calls: Call[] = [];
  const builder: Record<string, unknown> = {};
  const chain = (method: string) => (...args: unknown[]) => {
    calls.push({ method, args });
    return builder;
  };
  ["select", "eq", "lte", "gte", "lt", "order", "in"].forEach((method) => {
    builder[method] = chain(method);
  });
  // Кінець ланцюга: код або await-ить білдер, або читає .data
  (builder as { then: unknown }).then = (resolve: (value: unknown) => unknown) =>
    resolve({ data: [], error: null });
  return { calls, builder };
}

const recorder = makeQueryRecorder();
const fromSpy = vi.fn(() => recorder.builder);

vi.mock("@/lib/supabaseClient", () => ({
  supabase: {
    schema: () => ({ from: fromSpy }),
    from: fromSpy,
  },
}));

const { loadAbsences } = await import("./designerPayroll");

describe("loadAbsences", () => {
  beforeEach(() => {
    recorder.calls.length = 0;
    fromSpy.mockClear();
  });

  it("бере лише погоджені відсутності — pending норму не ріже", async () => {
    await loadAbsences({ workspaceId: "ws-1", userId: "user-1", monthKey: "2026-07" });

    const eqCalls = recorder.calls.filter((call) => call.method === "eq");
    expect(eqCalls).toContainEqual({ method: "eq", args: ["status", "approved"] });
  });

  it("фільтрує по воркспейсу й людині та бере перетин діапазонів", async () => {
    await loadAbsences({ workspaceId: "ws-1", userId: "user-1", monthKey: "2026-07" });

    const eqCalls = recorder.calls.filter((call) => call.method === "eq");
    expect(eqCalls).toContainEqual({ method: "eq", args: ["workspace_id", "ws-1"] });
    expect(eqCalls).toContainEqual({ method: "eq", args: ["user_id", "user-1"] });

    // Перетин, а не «початок усередині місяця»: відпустка з червня в липень
    // мусить потрапити у липневу норму.
    expect(recorder.calls.some((call) => call.method === "lte" && call.args[0] === "start_date")).toBe(true);
    expect(recorder.calls.some((call) => call.method === "gte" && call.args[0] === "end_date")).toBe(true);
  });
});
