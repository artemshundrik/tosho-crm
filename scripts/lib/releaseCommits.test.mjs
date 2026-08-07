import { describe, expect, it } from "vitest";
import { needsRewrite, parse } from "./releaseCommits.mjs";

/**
 * Ціна помилки тут — гроші й довіра. Хибне «так» шле в AI те, що й так
 * читається (плата ні за що плюс ризик перекрученого тексту). Хибне «ні»
 * лишає в звіті для керівника набір латинських літер.
 */

describe("розбір теми коміта", () => {
  it("тип, розділ і текст", () => {
    expect(parse("feat(team): нова вкладка")).toEqual({
      type: "feat",
      scope: "team",
      subject: "нова вкладка",
    });
  });

  it("без розділу", () => {
    expect(parse("build: перевірка імен")).toMatchObject({ type: "build", scope: null });
  });

  it("не за конвенцією — тип «other», текст цілий", () => {
    expect(parse("просто щось полагодив")).toEqual({
      type: "other",
      scope: null,
      subject: "просто щось полагодив",
    });
  });
});

describe("чи треба переказувати людською", () => {
  it("склеєні слова — треба", () => {
    expect(needsRewrite("DateTimeInput і DateTimePicker на спільну панель")).toBe(true);
    expect(needsRewrite("гоча teamId vs workspaceId у виплатах")).toBe(true);
  });

  it("службові імена й розширення — треба", () => {
    expect(needsRewrite("тест нагадувань переїхав у _lib")).toBe(true);
    expect(needsRewrite("оновлено database.types.ts під схему")).toBe(true);
  });

  it("латинські абревіатури — треба", () => {
    expect(needsRewrite("політика RLS на таблиці релізів")).toBe(true);
  });

  it("нормальна українська тема — НЕ треба", () => {
    // Саме цих 90%, за заміром, і не варто гнати через AI.
    expect(needsRewrite("«коли був» показує повну історію замість 30-хв вікна")).toBe(false);
    expect(needsRewrite("заявка власника більше не застрягає")).toBe(false);
    expect(needsRewrite("список прорахунків і список замовлень у боті")).toBe(false);
  });

  it("власні назви самі по собі не роблять тему технічною", () => {
    expect(needsRewrite("перевірка імен функцій Netlify перед кожною збіркою")).toBe(false);
    expect(needsRewrite("точки доставки Нової Пошти в картці підрядника")).toBe(false);
    expect(needsRewrite("сповіщення в Telegram про заявку")).toBe(false);
  });
});
