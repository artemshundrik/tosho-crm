import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

import { IDLE_BLUR_MS, IdleBlurOverlay } from "@/components/app/IdleBlurOverlay";

/**
 * Розмиття, що спрацьовує зарано, дратує всіх щодня; розмиття, що не знімається,
 * блокує роботу. Обидві помилки тихі — тому ловимо їх тут.
 */

const BUTTON = "Продовжити працювати в CRM";

beforeEach(() => {
  vi.useFakeTimers();
  window.localStorage.clear();
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: query === "(pointer: fine)", media: query }));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("IdleBlurOverlay", () => {
  it("не з'являється, поки людина рухає мишкою", () => {
    render(<IdleBlurOverlay />);
    for (let i = 0; i < 12; i += 1) {
      act(() => {
        vi.advanceTimersByTime(60_000);
        fireEvent.pointerMove(window);
      });
    }
    expect(screen.queryByText(BUTTON)).toBeNull();
  });

  it("з'являється після 10 хв без руху й не знімається рухом — лише кнопкою", () => {
    render(<IdleBlurOverlay />);
    act(() => {
      vi.advanceTimersByTime(IDLE_BLUR_MS + 30_000);
    });
    expect(screen.getByText(BUTTON)).toBeTruthy();

    act(() => {
      fireEvent.pointerMove(window);
      fireEvent.keyDown(window, { key: "Escape" });
    });
    expect(screen.getByText(BUTTON)).toBeTruthy();

    act(() => {
      fireEvent.click(screen.getByText(BUTTON));
    });
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(screen.queryByText(BUTTON)).toBeNull();
  });

  it("свіжа активність в іншій вкладці не дає розмити цю", () => {
    render(<IdleBlurOverlay />);
    for (let i = 0; i < 12; i += 1) {
      act(() => {
        vi.advanceTimersByTime(60_000);
        window.localStorage.setItem("tosho:last-input-at", String(Date.now()));
      });
    }
    expect(screen.queryByText(BUTTON)).toBeNull();
  });

  it("на телефоні не вмикається зовсім", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: false, media: query }));
    render(<IdleBlurOverlay />);
    act(() => {
      vi.advanceTimersByTime(IDLE_BLUR_MS * 2);
    });
    expect(screen.queryByText(BUTTON)).toBeNull();
  });
});
