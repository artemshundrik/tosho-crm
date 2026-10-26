import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const overview = vi.hoisted(() => vi.fn(async () => []));

vi.mock("@/lib/designTaskTimer", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/designTaskTimer")>()),
  getDesignerTimerTaskOverview: overview,
}));

import { useDesignerTimerController } from "./DesignerTimerWidget";

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
  document.dispatchEvent(new Event("visibilitychange"));
}

describe("useDesignerTimerController — опитування бази", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    overview.mockClear();
    setVisibility("visible");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("у прихованій вкладці не опитує, а повернувшись — оновлює одразу", async () => {
    renderHook(() => useDesignerTimerController({ teamId: "team", userId: "user", enabled: true }));
    await act(async () => {});
    const initial = overview.mock.calls.length;

    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    expect(overview.mock.calls.length).toBe(initial + 1);

    await act(async () => {
      setVisibility("hidden");
      vi.advanceTimersByTime(10 * 60_000);
    });
    expect(overview.mock.calls.length).toBe(initial + 1);

    await act(async () => {
      setVisibility("visible");
    });
    expect(overview.mock.calls.length).toBe(initial + 2);
  });
});
