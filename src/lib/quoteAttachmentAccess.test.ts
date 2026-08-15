import { describe, expect, it } from "vitest";

import { canDeleteOwnAttachment } from "./quoteAttachmentAccess";

const ME = "11111111-1111-1111-1111-111111111111";
const COLLEAGUE = "22222222-2222-2222-2222-222222222222";

describe("canDeleteOwnAttachment", () => {
  it("автор видаляє своє — незалежно від того, чий це прорахунок", () => {
    // Суть REQ-33: раніше тут ще перевірялось «і я менеджер прорахунку», через
    // що файл, помилково прикріплений до чужого прорахунку, не міг прибрати
    // ніхто. Прорахунок у це рішення більше не входить взагалі.
    expect(canDeleteOwnAttachment(ME, ME)).toBe(true);
  });

  it("чуже вкладення не видаляє", () => {
    expect(canDeleteOwnAttachment(COLLEAGUE, ME)).toBe(false);
  });

  it("невідомий автор не збігається з невідомим користувачем", () => {
    // У старих рядків автор бував порожній. Без цієї перевірки null === null
    // зробило б такі файли видалимими для будь-кого, хто не авторизований.
    expect(canDeleteOwnAttachment(null, null)).toBe(false);
    expect(canDeleteOwnAttachment(undefined, ME)).toBe(false);
    expect(canDeleteOwnAttachment(ME, null)).toBe(false);
  });

  it("порожній рядок не вважається автором", () => {
    expect(canDeleteOwnAttachment("", "")).toBe(false);
  });
});
