import { describe, expect, it } from "vitest";

import {
  RELEASE_WINDOW_MINUTES,
  findReleaseBefore,
  formatMinutesAfter,
  formatReleaseAttribution,
  releaseTitle,
  type ReleaseLike,
} from "./releaseAttribution";

const release = (releasedAt: string, ref: string, changes: unknown = null): ReleaseLike => ({
  released_at: releasedAt,
  commit_ref: ref,
  changes,
});

describe("releaseTitle", () => {
  it("бере переказ — саме його читає керівництво в «Релізах»", () => {
    expect(
      releaseTitle([{ sha: "a", subject: "fix(quotes): memo", plain: "Великі вікна відкриваються швидше" }])
    ).toBe("Великі вікна відкриваються швидше");
  });

  it("переказу немає — лишається тема коміта як є", () => {
    expect(releaseTitle([{ sha: "a", subject: "fix(quotes): memo" }])).toBe("fix(quotes): memo");
  });

  it("перші рядки без тексту пропускаються, а не роблять назву порожньою", () => {
    expect(releaseTitle([{ sha: "a" }, { sha: "b", subject: "  " }, { sha: "c", subject: "Друге" }])).toBe(
      "Друге"
    );
  });

  it("не масив і порожній масив — назви немає", () => {
    expect(releaseTitle(null)).toBeNull();
    expect(releaseTitle([])).toBeNull();
  });
});

describe("findReleaseBefore", () => {
  const errorAt = "2026-09-02T14:32:00+00:00";

  it("бере НАЙБЛИЖЧИЙ попередній, а не найновіший зі списку", () => {
    const found = findReleaseBefore(errorAt, [
      release("2026-09-02T10:00:00+00:00", "1111111"),
      release("2026-09-02T14:20:00+00:00", "48eab51"),
      release("2026-09-02T12:00:00+00:00", "2222222"),
    ]);
    expect(found?.shortRef).toBe("48eab51");
    expect(found?.minutesAfter).toBe(12);
  });

  /**
   * Найдорожча помилка тут — показати реліз, якого на момент падіння в проді
   * ще не було: підказка виглядала б переконливо й вела б не туди.
   */
  it("реліз ПІСЛЯ помилки не розглядається взагалі", () => {
    expect(findReleaseBefore(errorAt, [release("2026-09-02T14:40:00+00:00", "3333333")])).toBeNull();
  });

  it("за межами вікна — нічого, навіть якщо це найближчий", () => {
    const outside = new Date(Date.parse(errorAt) - (RELEASE_WINDOW_MINUTES + 1) * 60_000).toISOString();
    expect(findReleaseBefore(errorAt, [release(outside, "4444444")])).toBeNull();
  });

  it("рівно на межі вікна ще зараховується", () => {
    const edge = new Date(Date.parse(errorAt) - RELEASE_WINDOW_MINUTES * 60_000).toISOString();
    expect(findReleaseBefore(errorAt, [release(edge, "5555555")])?.minutesAfter).toBe(
      RELEASE_WINDOW_MINUTES
    );
  });

  /**
   * Обидва боки — timestamptz, тож той самий момент у різних зсувах має дати
   * ту саму відповідь. Інакше київський час релізу «зсував» би підказку на три
   * години — саме та пастка, про яку просила картка.
   */
  it("зсув у рядку часу нічого не змінює: рахуємо моменти, а не цифри", () => {
    const kyiv = findReleaseBefore("2026-09-02T17:32:00+03:00", [
      release("2026-09-02T17:20:00+03:00", "48eab51"),
    ]);
    expect(kyiv?.minutesAfter).toBe(12);
  });

  it("порожній список і зіпсований час — null, а не викид", () => {
    expect(findReleaseBefore(errorAt, [])).toBeNull();
    expect(findReleaseBefore("не дата", [release("2026-09-02T14:20:00+00:00", "a")])).toBeNull();
    expect(findReleaseBefore(errorAt, [release("не дата", "a")])).toBeNull();
  });
});

describe("formatMinutesAfter", () => {
  it("нуль і від'ємне — «одразу», без «0 хв»", () => {
    expect(formatMinutesAfter(0)).toBe("одразу");
    expect(formatMinutesAfter(-3)).toBe("одразу");
  });

  it("години не пишуться хвилинами", () => {
    expect(formatMinutesAfter(12)).toBe("через 12 хв");
    expect(formatMinutesAfter(60)).toBe("через 1 год");
    expect(formatMinutesAfter(65)).toBe("через 1 год 5 хв");
  });
});

describe("formatReleaseAttribution", () => {
  it("рядок такий, як просила картка", () => {
    const found = findReleaseBefore("2026-09-02T14:32:00+00:00", [
      release("2026-09-02T14:20:00+00:00", "48eab51abcdef", [
        { sha: "48eab51", plain: "Великі вікна в Прорахунках відкриваються швидше" },
      ]),
    ]);
    // Час викочування — київський настінний: 14:20 UTC = 17:20 у Києві.
    expect(formatReleaseAttribution(found)).toBe(
      "Почалось через 12 хв після релізу: Великі вікна в Прорахунках відкриваються швидше (48eab51, 17:20)"
    );
  });

  it("релізу поруч немає — кажемо це вголос, а не мовчимо", () => {
    expect(formatReleaseAttribution(null)).toBe("Релізу поруч немає — почалось не після викочування.");
  });

  it("реліз без опису змін усе одно лишається впізнаваним за sha й часом", () => {
    const found = findReleaseBefore("2026-09-02T14:32:00+00:00", [
      release("2026-09-02T14:20:00+00:00", "48eab51abcdef", []),
    ]);
    expect(formatReleaseAttribution(found)).toContain("без опису змін (48eab51, 17:20)");
  });
});
