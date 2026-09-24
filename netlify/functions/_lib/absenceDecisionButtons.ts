/**
 * Кнопки рішення по заявці на відсутність у Telegram (REQ-310).
 *
 * Під повідомленням про заявку — дві кнопки: «Підтвердити» і «Відхилити».
 * Шлють їх два місця (подання заявки — absenceSubmit.ts, нагадування —
 * team-events-reminders-background.ts), а розбирає одне (telegram-webhook.ts),
 * тож і підписи, і формат callback_data живуть тут, щоб не розійтись.
 *
 * «ВІДХИЛИТИ» НЕ ВІДХИЛЯЄ З ПЕРШОГО НАТИСКУ. У CRM відмову теж підтверджують
 * у вікні, а випадковий тап у чаті одразу написав би людині «заявку
 * відхилено» — і назад це не повертається: рішення приймається лише по заявці
 * в статусі pending. Тож перший натиск міняє кнопки на «Так, відхилити» /
 * «Назад».
 *
 * ПРИЧИНУ бот не питає: у CRM вона необов'язкова, а збирати її в чаті — окремий
 * діалог зі станом. Кому треба пояснити — відхиляє в CRM, там є поле.
 *
 * callback_data: `absd:<дія>:<id заявки>` — a (погодити), d (спитати про
 * відмову), dy (відхилити), b (назад). Telegram дає на неї 64 байти; з uuid
 * найдовша — 44.
 */

import type { InlineKeyboard } from "../_telegram";

export type AbsenceDecisionAction = "approve" | "ask_decline" | "decline" | "back";

export type AbsenceDecisionCallback = { action: AbsenceDecisionAction; absenceId: string };

const ACTION_TO_VERB: Record<AbsenceDecisionAction, string> = {
  approve: "a",
  ask_decline: "d",
  decline: "dy",
  back: "b",
};

// Map, а не звичайний об'єкт: у об'єкта є успадковані ключі («constructor»,
// «toString»), і підроблена кнопка `absd:constructor:<id>` розбиралась би в
// «дію», яка далі тихо ставала відмовою без кроку підтвердження.
const VERB_TO_ACTION = new Map<string, AbsenceDecisionAction>([
  ["a", "approve"],
  ["d", "ask_decline"],
  ["dy", "decline"],
  ["b", "back"],
]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function absenceDecisionCallbackData(action: AbsenceDecisionAction, absenceId: string): string {
  return `absd:${ACTION_TO_VERB[action]}:${absenceId}`;
}

/**
 * Кнопку може натиснути будь-хто, кому переслали повідомлення, і дані в ній —
 * від клієнта. Тож тут лише форма; права й стан заявки перевіряє
 * decideAbsenceRequest, а id, що не схожий на uuid, до бази не доходить.
 */
export function parseAbsenceDecisionCallback(data: string): AbsenceDecisionCallback | null {
  const parts = data.split(":");
  if (parts.length !== 3 || parts[0] !== "absd") return null;
  const action = VERB_TO_ACTION.get(parts[1]);
  const absenceId = parts[2].trim();
  if (!action || !UUID_RE.test(absenceId)) return null;
  return { action, absenceId };
}

/** Дії під сповіщенням про заявку — поле `telegramActions` у deliverNotifications. */
export function absenceDecisionActions(absenceId: string): Array<{ text: string; callbackData: string }> {
  return [
    { text: "✅ Підтвердити", callbackData: absenceDecisionCallbackData("approve", absenceId) },
    { text: "✖️ Відхилити", callbackData: absenceDecisionCallbackData("ask_decline", absenceId) },
  ];
}

/** Після першого «Відхилити»: питання замість двох кнопок. */
export function declineConfirmKeyboard(absenceId: string, crmUrl: string): InlineKeyboard {
  return [
    [
      { text: "❌ Так, відхилити", callback_data: absenceDecisionCallbackData("decline", absenceId) },
      { text: "← Назад", callback_data: absenceDecisionCallbackData("back", absenceId) },
    ],
    [{ text: "Перейти в CRM", url: crmUrl }],
  ];
}

/** «Назад» — ті самі кнопки й той самий порядок, що в сповіщенні (buildNotificationKeyboard). */
export function decisionKeyboard(absenceId: string, crmUrl: string): InlineKeyboard {
  return [
    absenceDecisionActions(absenceId).map((action) => ({ text: action.text, callback_data: action.callbackData })),
    [{ text: "Перейти в CRM", url: crmUrl }],
  ];
}
