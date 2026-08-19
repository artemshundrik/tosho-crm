import { expect, it, vi } from "vitest";

/**
 * Фальшивий canvas: рівно 7 px на символ.
 *
 * Заміри картки живуть у canvas, якого в node немає, — а перевіряти треба саме
 * правило «текст влазить», а не шрифтові метрики Safari. Лінійна ширина робить
 * очікування арифметичними: колонка тексту 424 px, отже 60 символів у рядок.
 */
const fakeCtx = {
  font: "",
  measureText: (text: string) => ({ width: text.length * 7 }),
};
vi.stubGlobal("document", { createElement: () => ({ getContext: () => fakeCtx }) });

const { CARD_ROW_LINES, fitToRow, measureCardRow, suggestAfter, suggestBefore, suggestHowToCheck } =
  await import("./releaseCardImage");

const sentence = (n: number) => `Речення номер ${n} рівно на п'ятдесят символів тут.`;

it("розділ КАПСОМ без двокрапки читається так само, як «Як має бути:»", () => {
  const body = "ЩО НЕ ТАК\n\nБуло погано.\n\nЯК МАЄ БУТИ\n\nСтало добре.\n\nДЕ ВИДНО\n\nПрорахунки → КП.";
  expect(suggestBefore(body)).toBe("Було погано.");
  expect(suggestAfter(body)).toBe("Стало добре.");
  expect(suggestHowToCheck("quotes", body)).toBe("Прорахунки → КП.");
});

it("без розділу «Як має бути» поле лишається порожнім — вигадувати результат не можна", () => {
  expect(suggestAfter("Просто опис проблеми одним абзацом.")).toBe("");
});

it("«Де видно» перебиває шлях модуля, бо називає саме те місце", () => {
  expect(suggestHowToCheck("quotes", "ДЕ ВИДНО\n\nКартка прорахунку, блок тиражів.")).toBe(
    "Картка прорахунку, блок тиражів."
  );
  expect(suggestHowToCheck("quotes", "опис без розділів")).toContain("Прорахунки");
});

it("довгий розділ ріжеться по реченнях і влазить у картку цілими реченнями", () => {
  const body = `ЩО НЕ ТАК\n\n${[1, 2, 3, 4, 5, 6].map(sentence).join(" ")}`;
  const draft = suggestBefore(body);

  expect(measureCardRow("before", draft)?.overflow).toBe(0);
  expect(draft.endsWith(".")).toBe(true);
  expect(draft).not.toContain("…");
  // Три рядки по 60 символів — це три речення з шести, а не «скільки влізло».
  expect(draft).toBe([1, 2, 3].map(sentence).join(" "));
});

it("заміри кажуть, скільки символів зайві, а не просто «задовго»", () => {
  const text = [1, 2, 3, 4, 5].map(sentence).join(" ");
  const fit = measureCardRow("before", text);

  expect(fit).not.toBeNull();
  expect(fit?.limit).toBe(CARD_ROW_LINES.before);
  expect(fit?.lines).toBeGreaterThan(CARD_ROW_LINES.before);
  expect(fit?.overflow).toBeGreaterThan(0);
  // Прибрали, скільки сказали — влазить.
  expect(measureCardRow("before", text.slice(0, text.length - (fit?.overflow ?? 0)))?.overflow).toBe(0);
});

it("одне довжелезне речення лишається цілим — обірвана думка гірша за вищу картку", () => {
  const long = `Одне речення без жодної крапки всередині, яке тягнеться далеко за межу трьох рядків ${"і далі ".repeat(20)}кінець.`;
  expect(fitToRow("before", long)).toBe(long);
  expect(measureCardRow("before", long)?.overflow).toBeGreaterThan(0);
});
