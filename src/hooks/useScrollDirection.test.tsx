import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useScrollDirection } from "./useScrollDirection";

/**
 * Прокрутка в тесті — це підміна `window.scrollY` плюс справжня подія `scroll`.
 *
 * Хук навмисно не читає нічого, крім цих двох речей, тож перевірка йде тим самим
 * шляхом, що й у браузері: подія → requestAnimationFrame → замір.
 */
function scrollTo(y: number) {
  Object.defineProperty(window, "scrollY", { value: y, writable: true, configurable: true });
  act(() => {
    window.dispatchEvent(new Event("scroll"));
    // rAF у jsdom виконується таймером — прокручуємо його вручну.
    vi.advanceTimersByTime(32);
  });
}

describe("useScrollDirection", () => {
  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(window, "scrollY", { value: 0, writable: true, configurable: true });
  });

  function mount() {
    vi.useFakeTimers();
    Object.defineProperty(window, "scrollY", { value: 0, writable: true, configurable: true });
    return renderHook(() => useScrollDirection());
  }

  it("на початку сторінки обв'язка видима", () => {
    expect(mount().result.current).toBe("shown");
  });

  it("прокрутка вниз ховає", () => {
    const { result } = mount();
    scrollTo(400);
    expect(result.current).toBe("hidden");
  });

  it("прокрутка вгору показує одразу, не чекаючи верху сторінки", () => {
    // Половина патерна: намір «хочу назад до пошуку» людина висловлює рухом
    // угору, і затримувати відповідь до самого початку списку не можна.
    const { result } = mount();
    scrollTo(800);
    expect(result.current).toBe("hidden");
    scrollTo(700);
    expect(result.current).toBe("shown");
  });

  it("біля верху сторінки не ховає нічого", () => {
    // Поріг: інакше шапка зникала б від найменшого руху на початку списку.
    const { result } = mount();
    scrollTo(60);
    expect(result.current).toBe("shown");
  });

  it("тремтіння на кілька пікселів не рахується за зміну напрямку", () => {
    // Інерційна прокрутка тачпада міняє знак зміщення по кілька разів на
    // секунду. Без порога чутливості смуга миготіла б.
    const { result } = mount();
    scrollTo(400);
    expect(result.current).toBe("hidden");
    scrollTo(396);
    expect(result.current).toBe("hidden");
  });

  it("після відписки подія більше нічого не міняє", () => {
    const { result, unmount } = mount();
    scrollTo(400);
    expect(result.current).toBe("hidden");
    unmount();
    scrollTo(100);
    expect(result.current).toBe("hidden");
  });
});
