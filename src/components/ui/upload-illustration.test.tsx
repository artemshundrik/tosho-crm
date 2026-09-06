import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

import { UploadIllustration } from "@/components/ui/upload-illustration";

/**
 * Ілюстрація завантаження: чи вимикається рух за настройкою системи.
 *
 * ЧОМУ ЦЕ ВЗАГАЛІ ТЕСТУЄТЬСЯ, А НЕ ВИДНО ОКОМ. Рух тут — SMIL, теги `<animate>`
 * всередині SVG. Наш загальний медіазапит `prefers-reduced-motion` в index.css
 * до них не дістає: CSS вимикає властивість `animation`, а тегами SVG не керує.
 * Тому вимикання зроблено в JS — і зламати його можна непомітно, бо в браузері
 * розробника настройка майже завжди вимкнена. Тест тримає саме цю гілку.
 *
 * ЧОМУ ЧЕРЕЗ `matchMedia`, А НЕ ЧЕРЕЗ МОК ХЕЛПЕРА. Перевіряємо разом із
 * `prefersReducedMotion` — інакше тест пройшов би й тоді, коли хелпер зламано.
 */
function stubMatchMedia(reduce: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: reduce && query.includes("prefers-reduced-motion"),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("UploadIllustration", () => {
  it("рухається, коли система руху не забороняє", () => {
    stubMatchMedia(false);
    const { container } = render(<UploadIllustration />);

    expect(container.querySelectorAll("animate, animateTransform")).toHaveLength(4);
  });

  it("завмирає при prefers-reduced-motion, але лишається на місці", () => {
    stubMatchMedia(true);
    const { container } = render(<UploadIllustration />);

    expect(container.querySelectorAll("animate, animateTransform")).toHaveLength(0);
    // Картинка нікуди не дівається — гасне лише рух.
    expect(container.querySelector("svg")).not.toBeNull();
    expect(container.querySelectorAll("path")).toHaveLength(2);
  });
});
