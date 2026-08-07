import { describe, expect, it } from "vitest";

import { buildNotificationKeyboard, toDbRow } from "./_notificationDelivery";

const baseRow = {
  user_id: "u-1",
  title: "Заявка: відпустка — Ілля",
  body: "12.08 – 20.08 · 9 кал. дн.",
  href: "/team?tab=requests",
  type: "info" as const,
};

describe("toDbRow", () => {
  it("не пускає кнопки Telegram у INSERT", () => {
    // У notifications такої колонки немає: якби поле поїхало в базу, PostgREST
    // завалив би ВЕСЬ батч — тобто розсилка мовчки зникла б для всіх адресатів.
    const dbRow = toDbRow({
      ...baseRow,
      telegramActions: [{ text: "✅ Підтвердити", callbackData: "absd:a:5f0d" }],
    });
    expect(dbRow).not.toHaveProperty("telegramActions");
    expect(Object.keys(dbRow).sort()).toEqual(["body", "href", "title", "type", "user_id"]);
  });

  it("рядок без кнопок лишається таким, як був", () => {
    expect(toDbRow(baseRow)).toEqual(baseRow);
  });
});

describe("buildNotificationKeyboard", () => {
  it("без дій — рівно те, що було роками: одна кнопка", () => {
    expect(buildNotificationKeyboard(baseRow, "https://tosho.pro/team")).toEqual([
      [{ text: "Відкрити в CRM", url: "https://tosho.pro/team" }],
    ]);
  });

  it("з дією — «Підтвердити» першим рядком, посилання другим", () => {
    const keyboard = buildNotificationKeyboard(
      { ...baseRow, telegramActions: [{ text: "✅ Підтвердити", callbackData: "absd:a:5f0d" }] },
      "https://tosho.pro/team?tab=requests"
    );
    expect(keyboard).toEqual([
      [{ text: "✅ Підтвердити", callback_data: "absd:a:5f0d" }],
      [{ text: "Перейти в CRM", url: "https://tosho.pro/team?tab=requests" }],
    ]);
  });

  it("callback_data вкладається в ліміт Telegram (64 байти)", () => {
    const data = `absd:a:${"5f0d1c2b-3a4e-4f56-9876-0123456789ab"}`;
    expect(Buffer.byteLength(data, "utf8")).toBeLessThanOrEqual(64);
  });
});
