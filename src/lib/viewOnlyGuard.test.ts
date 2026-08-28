import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { guardTableBuilder, isSilentWrite, setViewOnlyMode } from "@/lib/viewOnlyGuard";

/**
 * Тост «дії вимкнені» має пояснювати НАТИСНУТУ кнопку.
 *
 * 29.08.2026 він сипався лавиною: сам лише вхід у режим давав два повідомлення
 * про `member_seen_modules` (позначка «Нове» в меню), кожен перехід додавав ще,
 * а присутність стукала кожні кілька секунд. Людина не робила жодної дії — а
 * застосунок пояснював їй, чому дія не вдалась.
 *
 * Тут — рішення «про що мовчимо». Сам тост і його склеювання в один — у
 * ViewAsBar.test.tsx: там потрібен DOM.
 */

/** Найпростіша заглушка конструктора запиту: важливий лише виклик запису. */
const builder = { insert: () => "справжній запис", select: () => "читання" };

beforeEach(() => setViewOnlyMode(true));
afterEach(() => setViewOnlyMode(false));

describe("про що режим перегляду мовчить", () => {
  it("службова бухгалтерія — так, робота людини — ні", () => {
    // Перелік, а не «мовчимо про все»: тост потрібен саме там, де людина
    // натиснула кнопку й нічого не сталось.
    expect(isSilentWrite("member_seen_modules")).toBe(true);
    expect(isSilentWrite("user_presence")).toBe(true);
    expect(isSilentWrite("runtime_errors")).toBe(true);
    expect(isSilentWrite("acquire_entity_lock")).toBe(true);

    expect(isSilentWrite("quotes")).toBe(false);
    expect(isSilentWrite("orders")).toBe(false);
    expect(isSilentWrite("set_quote_status")).toBe(false);
  });

  it("мовчання не знімає гальма — запис однаково не відбувається", async () => {
    const result = await guardTableBuilder(builder, "user_presence").insert({});
    expect(result.data).toBeNull();
    expect(result.error?.code).toBe("VIEW_ONLY");
  });

  it("робота людини теж блокується, просто ще й із поясненням", async () => {
    const result = await guardTableBuilder(builder, "quotes").insert({});
    expect(result.error?.code).toBe("VIEW_ONLY");
  });

  it("поза режимом перегляду нічого не перехоплюється", () => {
    setViewOnlyMode(false);
    expect(guardTableBuilder(builder, "quotes").insert({})).toBe("справжній запис");
  });

  it("читання не чіпаємо навіть у режимі", () => {
    expect(guardTableBuilder(builder, "quotes").select()).toBe("читання");
  });
});
