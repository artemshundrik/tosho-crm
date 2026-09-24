import { describe, expect, it } from "vitest";

import { buildNotificationKeyboard } from "../_notificationDelivery";
import {
  absenceDecisionActions,
  absenceDecisionCallbackData,
  decisionKeyboard,
  declineConfirmKeyboard,
  parseAbsenceDecisionCallback,
} from "./absenceDecisionButtons";

const ID = "5f0d1c2b-3a4e-4f56-9876-0123456789ab";
const CRM = "https://tosho.pro/team?tab=requests";

describe("кнопки рішення по заявці в Telegram", () => {
  it("під заявкою — «Підтвердити» і «Відхилити»", () => {
    expect(absenceDecisionActions(ID)).toEqual([
      { text: "✅ Підтвердити", callbackData: `absd:a:${ID}` },
      { text: "✖️ Відхилити", callbackData: `absd:d:${ID}` },
    ]);
  });

  it("перший «Відхилити» не відхиляє, а питає: «Так, відхилити» чи «Назад»", () => {
    expect(declineConfirmKeyboard(ID, CRM)).toEqual([
      [
        { text: "❌ Так, відхилити", callback_data: `absd:dy:${ID}` },
        { text: "← Назад", callback_data: `absd:b:${ID}` },
      ],
      [{ text: "Перейти в CRM", url: CRM }],
    ]);
  });

  it("«Назад» повертає рівно ту клавіатуру, що прийшла зі сповіщенням", () => {
    const fromNotification = buildNotificationKeyboard(
      { user_id: "u", title: "t", body: "b", href: "/team", type: "info", telegramActions: absenceDecisionActions(ID) },
      CRM
    );
    expect(decisionKeyboard(ID, CRM)).toEqual(fromNotification);
  });

  it("callback_data влазить у 64 байти Telegram", () => {
    for (const action of ["approve", "ask_decline", "decline", "back"] as const) {
      expect(new TextEncoder().encode(absenceDecisionCallbackData(action, ID)).length).toBeLessThanOrEqual(64);
    }
  });

  it("кожна дія розбирається назад", () => {
    expect(parseAbsenceDecisionCallback(`absd:a:${ID}`)).toEqual({ action: "approve", absenceId: ID });
    expect(parseAbsenceDecisionCallback(`absd:d:${ID}`)).toEqual({ action: "ask_decline", absenceId: ID });
    expect(parseAbsenceDecisionCallback(`absd:dy:${ID}`)).toEqual({ action: "decline", absenceId: ID });
    expect(parseAbsenceDecisionCallback(`absd:b:${ID}`)).toEqual({ action: "back", absenceId: ID });
  });

  it("чуже й зіпсоване не розбирається — до бази такий id не доходить", () => {
    for (const data of [
      `absd:x:${ID}`,
      `absd:a:${ID}:зайве`,
      "absd:a:5f0d",
      "absd:a:1' or '1'='1",
      `abs:a:${ID}`,
      "absd:a:",
      // Успадковані ключі звичайного об'єкта — не дії.
      `absd:constructor:${ID}`,
      `absd:__proto__:${ID}`,
      `absd:toString:${ID}`,
    ]) {
      expect(parseAbsenceDecisionCallback(data), data).toBeNull();
    }
  });
});
