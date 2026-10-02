import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Правило передачі редагування (02.10.2026): без прохання тримач віддає лок
 * після 5 хв простою, після «Попросити звільнити» — після 1 хв. Перевіряємо
 * саме час, коли йде `releaseEntityLock`, бо саме він і є «передав».
 */

const lockApi = vi.hoisted(() => ({
  requestedBy: null as string | null,
  acquire: vi.fn(),
  release: vi.fn(async () => undefined),
}));

vi.mock("@/lib/entityLock", () => ({
  acquireEntityLock: lockApi.acquire,
  releaseEntityLock: lockApi.release,
  readEntityLock: vi.fn(async () => null),
  requestEntityLockRelease: vi.fn(async () => ({ requested: true, lockedBy: null, lockedByName: null })),
  forceReleaseEntityLock: vi.fn(async () => true),
}));

vi.mock("@/lib/supabaseClient", () => {
  const channel = { on: () => channel, subscribe: () => channel };
  return { supabase: { channel: () => channel, removeChannel: async () => undefined } };
});

vi.mock("@/lib/currentUser", () => ({ getCurrentUser: async () => null }));

import { useEntityLock } from "./useEntityLock";

const holdLock = () =>
  renderHook(() =>
    useEntityLock({ teamId: "t", entityType: "quote", entityId: "q", userId: "u", userLabel: "Влад" })
  );

beforeEach(() => {
  vi.useFakeTimers();
  lockApi.requestedBy = null;
  lockApi.release.mockClear();
  lockApi.acquire.mockImplementation(async () => ({
    acquired: true,
    lockedBy: "u",
    lockedByName: "Влад",
    expiresAt: null,
    releaseRequestedBy: lockApi.requestedBy ? "i" : null,
    releaseRequestedByName: lockApi.requestedBy,
    releaseRequestedAt: null,
  }));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("передача редагування після простою", () => {
  it("без прохання хвилина простою нічого не віддає — лише п'ять", async () => {
    const { result } = holdLock();
    await act(async () => {});
    expect(result.current.acquired).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(61_000);
    });
    expect(lockApi.release).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4 * 60_000);
    });
    expect(lockApi.release).toHaveBeenCalledTimes(1);
    expect(result.current.releasedReason).toBe("idle");
  });

  it("після прохання тримач, що вже пішов, віддає лок одразу", async () => {
    const { result } = holdLock();
    await act(async () => {});

    // Тримач 2 хв нічого не робить, а тоді хтось просить звільнити.
    lockApi.requestedBy = "Ілля";
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2 * 60_000);
    });
    // Прохання доїхало з heartbeat (кожні 30 с) — і лок пішов, не чекаючи п'ятої хвилини.
    expect(lockApi.release).toHaveBeenCalledTimes(1);
    expect(result.current.releasedReason).toBe("idle");
  });

  it("після прохання тримач, який працює, лок не втрачає", async () => {
    lockApi.requestedBy = "Ілля";
    const { result } = holdLock();
    await act(async () => {});
    expect(result.current.releaseRequestedByName).toBe("Ілля");

    for (let i = 0; i < 6; i += 1) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(20_000);
        window.dispatchEvent(new Event("keydown"));
      });
    }
    expect(lockApi.release).not.toHaveBeenCalled();
  });

  it("після прохання відлік іде лише останні 30 с, а не з першої секунди", async () => {
    lockApi.requestedBy = "Ілля";
    const { result } = holdLock();
    await act(async () => {});

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect(result.current.idleSecondsLeft).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect(result.current.idleSecondsLeft).toBeGreaterThan(0);
    expect(result.current.idleSecondsLeft).toBeLessThanOrEqual(30);
  });
});
