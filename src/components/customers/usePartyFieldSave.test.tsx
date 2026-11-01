import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { FieldWriteResult } from "./partyFieldWrite";
import { usePartyFieldSave } from "./usePartyFieldSave";

/**
 * Ланцюг правок під час повільної мережі (Review Focus 2): «Рахунок → Готівка»
 * швидше, ніж приходить відповідь. Відповідь першого запиту, що прийшла
 * ПІЗНІШЕ за другу, не має перезаписати стан поля.
 */

type Deferred = { resolve: (value: FieldWriteResult) => void; patch: unknown };

function controlledWrite() {
  const pending: Deferred[] = [];
  const write = vi.fn(
    (patch: unknown) =>
      new Promise<FieldWriteResult>((resolve) => {
        pending.push({ resolve, patch });
      }),
  );
  return { write, pending };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("usePartyFieldSave", () => {
  it("пізня відповідь старого запиту не перезаписує стан нового", async () => {
    const { write, pending } = controlledWrite();
    const { result } = renderHook(() => usePartyFieldSave(write));

    act(() => result.current.save("payment_type", { payment_type: "cash" }));
    act(() => result.current.save("payment_type", { payment_type: "invoice" }));
    expect(result.current.stateOf("payment_type").state).toBe("saving");

    await act(async () => pending[1].resolve({ ok: true }));
    expect(result.current.stateOf("payment_type").state).toBe("saved");

    await act(async () => pending[0].resolve({ ok: false, reason: "network", message: "Не зберіглось" }));
    expect(result.current.stateOf("payment_type")).toEqual({ state: "saved", message: null });
  });

  it("помилка — «error» з текстом, а retry повторює той самий патч", async () => {
    const { write, pending } = controlledWrite();
    const { result } = renderHook(() => usePartyFieldSave(write));

    act(() => result.current.save("notes", { notes: "дзвонити після 14" }));
    await act(async () => pending[0].resolve({ ok: false, reason: "network", message: "Немає звʼязку" }));
    expect(result.current.stateOf("notes")).toEqual({ state: "error", message: "Немає звʼязку" });

    act(() => result.current.retry("notes"));
    expect(write).toHaveBeenCalledTimes(2);
    expect(write).toHaveBeenLastCalledWith({ notes: "дзвонити після 14" });
    expect(result.current.stateOf("notes").state).toBe("saving");
  });

  it("«saved» гасне в «idle» за 1,5 с; поля не заважають одне одному", async () => {
    vi.useFakeTimers();
    const { write, pending } = controlledWrite();
    const { result } = renderHook(() => usePartyFieldSave(write));

    act(() => result.current.save("notes", { notes: "x" }));
    act(() => result.current.save("accountant_email", { accountant_email: "a@b.ua" }));
    await act(async () => pending[0].resolve({ ok: true }));
    expect(result.current.stateOf("notes").state).toBe("saved");
    expect(result.current.stateOf("accountant_email").state).toBe("saving");

    act(() => vi.advanceTimersByTime(1499));
    expect(result.current.stateOf("notes").state).toBe("saved");
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.stateOf("notes").state).toBe("idle");
    expect(result.current.stateOf("unknown")).toEqual({ state: "idle", message: null });
  });
});
