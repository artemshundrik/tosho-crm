import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Сповіщення про зміну статусу прорахунку — рівно одне на ОДИН перехід.
 *
 * 25.08.2026 в Telegram прилетіло чотири однакові «Прорахунок затверджено»
 * підряд, тоді як у `quote_status_history` за той день рівно один перехід
 * `awaiting_approval → approved`. Причина: база порожню зміну статусу ковтає
 * (обидва тригери мають `when (old.status is distinct from new.status)`), а
 * застосунок слав сповіщення після КОЖНОГО запису статусу — включно з тими,
 * де статус не змінився (картку кинули в ту саму колонку, натиснули ще раз).
 *
 * Тест тримає найдешевший рубіж — той, що всередині самої функції.
 */

const notifyUsers = vi.fn(async (_payload: { title: string; body?: string | null }) => undefined);

vi.mock("@/lib/designTaskActivity", () => ({ notifyUsers }));

vi.mock("@/lib/supabaseClient", () => {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "in", "order", "limit"]) {
    builder[method] = vi.fn(() => builder);
  }
  builder.maybeSingle = vi.fn(async () => ({
    data: { team_id: null, created_by: "manager-1", assigned_to: "manager-1", number: "TS-0826-0026" },
    error: null,
  }));
  (builder as { then: unknown }).then = (resolve: (value: unknown) => unknown) =>
    resolve({ data: [], error: null });
  const from = vi.fn(() => builder);
  return { supabase: { schema: () => ({ from }), from } };
});

const { notifyQuoteInitiatorOnStatusChange } = await import("./workflowNotifications");

const quoteId = "11111111-2222-4333-8444-555555555555";

describe("сповіщення про статус прорахунку", () => {
  beforeEach(() => {
    notifyUsers.mockClear();
  });

  it("мовчить, коли статус не змінився", async () => {
    await notifyQuoteInitiatorOnStatusChange({
      quoteId,
      fromStatus: "approved",
      toStatus: "approved",
      actorUserId: "someone-else",
    });
    expect(notifyUsers).not.toHaveBeenCalled();
  });

  it("мовчить і на різному регістрі того самого статусу", async () => {
    await notifyQuoteInitiatorOnStatusChange({
      quoteId,
      fromStatus: "Approved",
      toStatus: "approved",
      actorUserId: "someone-else",
    });
    expect(notifyUsers).not.toHaveBeenCalled();
  });

  it("надсилає на справжньому переході", async () => {
    await notifyQuoteInitiatorOnStatusChange({
      quoteId,
      fromStatus: "awaiting_approval",
      toStatus: "approved",
      actorUserId: "someone-else",
    });
    expect(notifyUsers).toHaveBeenCalledTimes(1);
    expect(notifyUsers.mock.calls[0][0]).toMatchObject({
      title: "Прорахунок затверджено",
      body: "Прорахунок #TS-0826-0026 затверджено.",
    });
  });

  it("не сповіщає того, хто сам змінив статус", async () => {
    await notifyQuoteInitiatorOnStatusChange({
      quoteId,
      fromStatus: "awaiting_approval",
      toStatus: "approved",
      actorUserId: "manager-1",
    });
    expect(notifyUsers).not.toHaveBeenCalled();
  });
});

/**
 * ВІДКАТ СТАТУСУ — ТАКА САМА ПОДІЯ, ЯК І РУХ УПЕРЕД (REQ-287).
 *
 * 17.09.2026 менеджер отримав «Прорахунок готовий» по TS-0926-0027 і за
 * 28 секунд відкрив порожню картку в статусі «На прорахунку»: проджект
 * перевів прорахунок у «Пораховано» о 10:41:42 (ціни тоді справді стояли),
 * а о 10:42:17 повернув назад і обнулив собівартість. Сповіщення не
 * збрехало — воно описало справжній перехід; брехнею його зробило
 * МОВЧАННЯ про скасування.
 *
 * Причина: `getQuoteStatusAlert` знала лише рух уперед. Тепер будь-який рух
 * назад по порядку колонок дошки прорахунків — теж подія.
 */
describe("відкат статусу прорахунку", () => {
  beforeEach(() => {
    notifyUsers.mockClear();
  });

  it("сповіщає, коли «Пораховано» повернули на прорахунок", async () => {
    await notifyQuoteInitiatorOnStatusChange({
      quoteId,
      fromStatus: "estimated",
      toStatus: "estimating",
      actorUserId: "someone-else",
    });
    expect(notifyUsers).toHaveBeenCalledTimes(1);
    expect(notifyUsers.mock.calls[0][0]).toMatchObject({
      title: "Прорахунок повернули назад",
      body: "Прорахунок #TS-0826-0026 повернули у статус «На прорахунку».",
    });
  });

  it("сповіщає і про відкат із «Затверджено»", async () => {
    await notifyQuoteInitiatorOnStatusChange({
      quoteId,
      fromStatus: "approved",
      toStatus: "awaiting_approval",
      actorUserId: "someone-else",
    });
    expect(notifyUsers).toHaveBeenCalledTimes(1);
    expect(notifyUsers.mock.calls[0][0]).toMatchObject({
      title: "Прорахунок повернули назад",
      body: "Прорахунок #TS-0826-0026 повернули у статус «На погодженні».",
    });
  });

  // Скасування — не відкат: воно виведене з дошки (kanbanBoards.offBoard) і
  // сповіщень не мало й не має. Інакше «Скасовано» читалось би як крок назад
  // по конвеєру, яким воно не є.
  it("мовчить про скасування", async () => {
    await notifyQuoteInitiatorOnStatusChange({
      quoteId,
      fromStatus: "estimated",
      toStatus: "cancelled",
      actorUserId: "someone-else",
    });
    expect(notifyUsers).not.toHaveBeenCalled();
  });

  // Повернення зі «Скасованих» на дошку (restoreQuote) `fromStatus` не
  // передає — і не мусить стати «відкатом» через це.
  it("мовчить, коли попередній статус невідомий", async () => {
    await notifyQuoteInitiatorOnStatusChange({
      quoteId,
      toStatus: "new",
      actorUserId: "someone-else",
    });
    expect(notifyUsers).not.toHaveBeenCalled();
  });

  it("не плутає взяття в роботу з відкатом", async () => {
    await notifyQuoteInitiatorOnStatusChange({
      quoteId,
      fromStatus: "new",
      toStatus: "estimating",
      actorUserId: "someone-else",
    });
    expect(notifyUsers).toHaveBeenCalledTimes(1);
    expect(notifyUsers.mock.calls[0][0]).toMatchObject({
      title: "Прорахунок взято в роботу",
    });
  });
});
