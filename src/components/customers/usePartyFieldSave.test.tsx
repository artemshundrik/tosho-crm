import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { FieldWriteResult } from "./partyFieldWrite";
import { usePartyFieldSave } from "./usePartyFieldSave";

const mocks = vi.hoisted(() => ({ toastError: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: mocks.toastError } }));

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
  it("поле пишеться по черзі: поки летить запит, чекає лише остання правка, і вона йде останньою", async () => {
    const { write, pending } = controlledWrite();
    const { result } = renderHook(() => usePartyFieldSave(write));

    act(() => result.current.save("payment_type", { payment_type: "cash" }));
    act(() => result.current.save("payment_type", { payment_type: "invoice" }));
    act(() => result.current.save("payment_type", { payment_type: "cash" }));
    expect(write).toHaveBeenCalledTimes(1);
    expect(result.current.stateOf("payment_type").state).toBe("saving");

    await act(async () => pending[0].resolve({ ok: true }));
    expect(write).toHaveBeenCalledTimes(2);
    expect(pending[1].patch).toEqual({ payment_type: "cash" });
    expect(result.current.stateOf("payment_type").state).toBe("saving");

    await act(async () => pending[1].resolve({ ok: true }));
    expect(write).toHaveBeenCalledTimes(2);
    expect(result.current.stateOf("payment_type").state).toBe("saved");
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

  it("правки різних стовпців у черзі зливаються, а не заміняють одна одну", async () => {
    const { write, pending } = controlledWrite();
    const { result } = renderHook(() => usePartyFieldSave(write));

    act(() => result.current.save("requisites", { tax_id: "12345678" }));
    act(() => result.current.save("requisites", { iban: "UA1" }));
    act(() => result.current.save("requisites", { legal_address: "Київ" }));
    await act(async () => pending[0].resolve({ ok: true }));
    expect(pending[1].patch).toEqual({ iban: "UA1", legal_address: "Київ" });
  });

  it("невдала правка їде з наступною, і помилка гасне лише тоді, коли база прийняла все", async () => {
    const { write, pending } = controlledWrite();
    const { result } = renderHook(() => usePartyFieldSave(write));
    const offline = { ok: false as const, reason: "network" as const, message: "Немає звʼязку" };

    act(() => result.current.save("requisites", { tax_id: "12345678" }));
    await act(async () => pending[0].resolve(offline));
    expect(result.current.stateOf("requisites").state).toBe("error");

    act(() => result.current.save("requisites", { iban: "UA1" }));
    expect(pending[1].patch).toEqual({ tax_id: "12345678", iban: "UA1" });
    await act(async () => pending[1].resolve({ ok: true }));
    expect(result.current.stateOf("requisites").state).toBe("saved");

    act(() => result.current.save("requisites", { legal_address: "Київ" }));
    expect(pending[2].patch).toEqual({ legal_address: "Київ" });
  });

  it("збій запиту, за яким у черзі чекала правка, не зникає мовчки", async () => {
    const { write, pending } = controlledWrite();
    const { result } = renderHook(() => usePartyFieldSave(write));

    act(() => result.current.save("requisites", { tax_id: "12345678" }));
    act(() => result.current.save("requisites", { iban: "UA1" }));
    await act(async () => pending[0].resolve({ ok: false, reason: "network", message: "Немає звʼязку" }));
    expect(pending[1].patch).toEqual({ tax_id: "12345678", iban: "UA1" });
  });

  it("панель закрили до відповіді, а запис не вдався: людина про це дізнається", async () => {
    const { write, pending } = controlledWrite();
    const { result, unmount } = renderHook(() => usePartyFieldSave(write));

    act(() => result.current.save("notes", { notes: "x" }));
    unmount();
    await act(async () => pending[0].resolve({ ok: false, reason: "network", message: "Немає звʼязку" }));
    expect(mocks.toastError).toHaveBeenCalledWith("Зміна не збереглась", { description: "Немає звʼязку" });
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
