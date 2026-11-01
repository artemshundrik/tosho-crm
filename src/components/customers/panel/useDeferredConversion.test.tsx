import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useDeferredConversion } from "./useDeferredConversion";

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("useDeferredConversion", () => {
  it("виконує переведення рівно через 6 с і лише раз", () => {
    const run = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useDeferredConversion(run));

    act(() => result.current.start());
    expect(result.current.pending).toBe(true);
    act(() => vi.advanceTimersByTime(5_999));
    expect(run).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(run).toHaveBeenCalledTimes(1);
    expect(result.current.pending).toBe(false);
    act(() => vi.advanceTimersByTime(60_000));
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("«Скасувати» до строку — переведення не відбувається ніколи", () => {
    const run = vi.fn().mockResolvedValue(undefined);
    const { result, unmount } = renderHook(() => useDeferredConversion(run));

    act(() => result.current.start());
    act(() => vi.advanceTimersByTime(3_000));
    act(() => result.current.cancel());
    expect(result.current.pending).toBe(false);
    act(() => vi.advanceTimersByTime(60_000));
    unmount();
    expect(run).not.toHaveBeenCalled();
  });

  it("панель закрили посеред очікування — переведення виконується одразу", () => {
    const run = vi.fn().mockResolvedValue(undefined);
    const { result, unmount } = renderHook(() => useDeferredConversion(run));

    act(() => result.current.start());
    act(() => vi.advanceTimersByTime(2_000));
    unmount();
    expect(run).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(60_000));
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("бере найсвіжіший run, а не той, що був на старті", () => {
    const first = vi.fn().mockResolvedValue(undefined);
    const second = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = renderHook(({ run }) => useDeferredConversion(run, 1_000), {
      initialProps: { run: first },
    });

    act(() => result.current.start());
    rerender({ run: second });
    act(() => vi.advanceTimersByTime(1_000));
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
