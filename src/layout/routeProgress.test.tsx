import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";

import { RouteProgressBar, RouteProgressProvider, useRouteLoadingSignal } from "@/layout/routeProgress";

/**
 * Смуга переходу під шапкою. Тести тримають ЧОТИРИ поламані місця, кожне з
 * яких було видно оком, але жодного не бачив `tsc`:
 *
 *   1. Смуга кліпала на миттєвих переходах — потрібна затримка перед показом.
 *   2. Крок (220 мс) був коротшим за перехід (240 мс), тож кожен новий крок
 *      обривав незавершену анімацію попереднього: замість руху — смикання.
 *   3. Другий перехід, початий поки смуга ще гасне, тягнув її НАЗАД: значення
 *      падало з 1 на 0.08 із переходом, і смуга їхала справа наліво.
 *   4. Смуга росла через `scaleX`, а разом із нею розтягувався градієнт і
 *      плющилось сяйво — колір мінявся по дорозі.
 */

function Signal({ active }: { active: boolean }) {
  useRouteLoadingSignal(active);
  return null;
}

function Harness({ loading }: { loading: boolean }) {
  return (
    <RouteProgressProvider>
      <Signal active={loading} />
      <RouteProgressBar />
    </RouteProgressProvider>
  );
}

/** Скільки відсотків смуги видно: 0 — нічого, 100 — уся. */
function shown(container: HTMLElement) {
  const bar = container.querySelector('div[aria-hidden="true"] > div') as HTMLElement;
  const match = bar.style.transform.match(/translate3d\((-?[\d.]+)%/);
  return { percent: 100 + Number(match?.[1] ?? -100), transition: bar.style.transition };
}

function opacity(container: HTMLElement) {
  const wrap = container.querySelector('div[aria-hidden="true"]') as HTMLElement;
  return wrap.style.opacity;
}

const tick = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("поки вантажиться", () => {
  it("миттєвий перехід смуги не показує взагалі", () => {
    const { container, rerender } = render(<Harness loading />);
    tick(120);
    expect(opacity(container)).toBe("0");
    rerender(<Harness loading={false} />);
    tick(40);
    expect(opacity(container)).toBe("0");
  });

  it("після затримки з'являється й починає рух", () => {
    const { container } = render(<Harness loading />);
    tick(150 + 20);
    expect(opacity(container)).toBe("1");
    const state = shown(container);
    expect(state.percent).toBeCloseTo(8, 5);
    // Лінійно й рівно на крок: наступний крок підхоплює там, де скінчився цей.
    expect(state.transition).toBe("transform 200ms linear");
  });

  it("підповзає до стелі й ніколи не доходить до кінця сам", () => {
    const { container } = render(<Harness loading />);
    tick(150 + 20);
    const first = shown(container).percent;
    tick(200 * 5);
    const later = shown(container).percent;
    expect(later).toBeGreaterThan(first);
    expect(later).toBeLessThan(90);

    tick(200 * 100);
    expect(shown(container).percent).toBeLessThan(90);
  });
});

describe("коли дані приїхали", () => {
  it("добігає до кінця з гальмуванням, і аж потім гасне", () => {
    const { container, rerender } = render(<Harness loading />);
    tick(150 + 20 + 400);

    rerender(<Harness loading={false} />);
    const finish = shown(container);
    expect(finish.percent).toBe(100);
    expect(finish.transition).toBe("transform 180ms cubic-bezier(0.22, 1, 0.36, 1)");
    // Смуга ще на екрані: спершу її треба ПОБАЧИТИ повною.
    expect(opacity(container)).toBe("1");

    tick(180 + 90);
    expect(opacity(container)).toBe("0");
  });

  it("на нуль повертається без анімації — інакше поїхала б назад", () => {
    const { container, rerender } = render(<Harness loading />);
    tick(150 + 20 + 400);
    rerender(<Harness loading={false} />);
    tick(180 + 90 + 220);

    const state = shown(container);
    expect(state.percent).toBe(0);
    expect(state.transition).toBe("none");
  });
});

describe("другий перехід поверх першого", () => {
  it("не тягне смугу назад: скидання на нуль іде кадром без анімації", () => {
    const { container, rerender } = render(<Harness loading />);
    tick(150 + 20 + 400);

    // Дані приїхали — смуга добігає й ще не встигла зникнути…
    rerender(<Harness loading={false} />);
    tick(100);
    expect(shown(container).percent).toBe(100);

    // …і тут починається наступний перехід.
    rerender(<Harness loading />);
    tick(150);
    const reset = shown(container);
    expect(reset.percent).toBe(0);
    expect(reset.transition).toBe("none");

    tick(20);
    expect(shown(container).percent).toBeCloseTo(8, 5);
    expect(shown(container).transition).toBe("transform 200ms linear");
  });
});

describe("геометрія", () => {
  it("росте зсувом, а не розтягом — інакше градієнт і сяйво пливуть", () => {
    const { container } = render(<Harness loading />);
    tick(150 + 20);
    const bar = container.querySelector('div[aria-hidden="true"] > div') as HTMLElement;
    expect(bar.style.transform).toContain("translate3d");
    expect(bar.style.transform).not.toContain("scale");
    expect(bar.className).toContain("w-full");
  });
});
