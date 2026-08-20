import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CLOCK_TICK_MS, getClockNow, subscribeToClock } from "./useNow";

/**
 * Перевіряємо саме СХОВИЩЕ, а не хук: хук — це два рядки поверх
 * `useSyncExternalStore`, а вся поведінка, яку можна зламати (чи цокає, чи
 * гаситься таймер, чи один він на всіх), живе тут. Рендерера компонентів у
 * проєкті поки немає (REQ-60), тож це найдешевший спосіб отримати доказ.
 */
describe("годинник useNow", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("повідомляє підписника на кожному такті й віддає свіжий час", () => {
    const seen: number[] = [];
    const unsubscribe = subscribeToClock(() => seen.push(getClockNow()));
    const startedAt = getClockNow();

    vi.advanceTimersByTime(CLOCK_TICK_MS);
    expect(seen).toHaveLength(1);
    expect(seen[0] - startedAt).toBe(CLOCK_TICK_MS);

    vi.advanceTimersByTime(CLOCK_TICK_MS * 2);
    expect(seen).toHaveLength(3);
    expect(getClockNow() - startedAt).toBe(CLOCK_TICK_MS * 3);

    unsubscribe();
  });

  it("гасить таймер, коли пішов останній підписник", () => {
    const seen: number[] = [];
    const unsubscribe = subscribeToClock(() => seen.push(getClockNow()));

    vi.advanceTimersByTime(CLOCK_TICK_MS);
    expect(seen).toHaveLength(1);

    unsubscribe();
    vi.advanceTimersByTime(CLOCK_TICK_MS * 5);
    // Ані виклику більше: інакше кожна закрита сторінка лишала б по таймеру.
    expect(seen).toHaveLength(1);
  });

  it("тримає ОДИН таймер на всіх підписників", () => {
    const first: number[] = [];
    const second: number[] = [];
    const unsubscribeFirst = subscribeToClock(() => first.push(getClockNow()));
    const unsubscribeSecond = subscribeToClock(() => second.push(getClockNow()));

    vi.advanceTimersByTime(CLOCK_TICK_MS);

    // Обидва отримали рівно по одному повідомленню й побачили один і той самий
    // час: два таймери дали б різні значення й зайву роботу.
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
    expect(first[0]).toBe(second[0]);

    // Поки лишається хоч один підписник, годинник не спиняється.
    unsubscribeFirst();
    vi.advanceTimersByTime(CLOCK_TICK_MS);
    expect(second).toHaveLength(2);

    unsubscribeSecond();
  });

  it("знімок стабільний між тактами", () => {
    const unsubscribe = subscribeToClock(() => {});
    const first = getClockNow();
    expect(getClockNow()).toBe(first);

    vi.advanceTimersByTime(CLOCK_TICK_MS - 1);
    expect(getClockNow()).toBe(first);

    unsubscribe();
  });
});
