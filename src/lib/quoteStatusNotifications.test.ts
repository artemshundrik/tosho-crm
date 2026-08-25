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
