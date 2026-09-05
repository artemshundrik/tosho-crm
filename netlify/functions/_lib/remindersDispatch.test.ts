import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Диспетчер нагадувань замінив три окремі POST-и від pg_cron одним викликом.
 * Виграш у грошах очевидний (864 → 288 інвокацій на добу), а от що легко
 * втратити разом із трьома запитами — ІЗОЛЯЦІЮ. Доти падіння однієї функції
 * фізично не могло зачепити дві інші: це були різні HTTP-запити. Тепер вони в
 * одному процесі, і `Promise.all` замість `allSettled` тихо перетворив би
 * помилку в одному нагадуванні на мовчання всіх трьох.
 *
 * Саме цей клас поломки в проєкті вже коштував доби тиші (20.08.2026), причому
 * при зелених джобах: pg_cron рахує запуск успішним, щойно поставив запит у
 * чергу, і не дивиться ні на код відповіді, ні на те, що всередині. Тож тести
 * нижче стережуть три речі, яких більше нікому стерегти: гейт крон-ключа,
 * ізоляцію падінь і те, що невдача не губиться у відповіді.
 */

const customerLead = vi.fn();
const quoteDeadline = vi.fn();
const contractor = vi.fn();

vi.mock("../customer-lead-reminders", () => ({ handler: (event: unknown) => customerLead(event) }));
vi.mock("../quote-deadline-reminders", () => ({ handler: (event: unknown) => quoteDeadline(event) }));
vi.mock("../contractor-reminders", () => ({ handler: (event: unknown) => contractor(event) }));

const { handler } = await import("../reminders-dispatch");

const ok = (body: Record<string, unknown> = { success: true }) => ({
  statusCode: 200,
  headers: {},
  body: JSON.stringify(body),
});

const SECRET = "s".repeat(32);
const authorized = { httpMethod: "POST", headers: { "x-cron-key": SECRET } };

type Parsed = { success: boolean; ran: number; failed: number; results: Array<{ job: string; ok: boolean; statusCode?: number; error?: string }> };
const parse = (response: { body: string }) => JSON.parse(response.body) as Parsed;

beforeEach(() => {
  process.env.CRON_SHARED_SECRET = SECRET;
  customerLead.mockReset().mockResolvedValue(ok());
  quoteDeadline.mockReset().mockResolvedValue(ok());
  contractor.mockReset().mockResolvedValue(ok());
});

afterEach(() => {
  delete process.env.CRON_SHARED_SECRET;
});

describe("reminders-dispatch", () => {
  it("проганяє всі три нагадування за один виклик", async () => {
    const response = await handler(authorized);
    const body = parse(response);

    expect(response.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.ran).toBe(3);
    expect(body.failed).toBe(0);
    expect(customerLead).toHaveBeenCalledTimes(1);
    expect(quoteDeadline).toHaveBeenCalledTimes(1);
    expect(contractor).toHaveBeenCalledTimes(1);
  });

  it("падіння одного нагадування не глушить два інші", async () => {
    quoteDeadline.mockRejectedValue(new Error("Supabase впала"));

    const response = await handler(authorized);
    const body = parse(response);

    // Головне: решта ВІДПРАЦЮВАЛА. Саме це забрав би Promise.all.
    expect(customerLead).toHaveBeenCalledTimes(1);
    expect(contractor).toHaveBeenCalledTimes(1);

    expect(body.success).toBe(false);
    expect(body.failed).toBe(1);
    const failed = body.results.find((result) => !result.ok);
    expect(failed?.job).toBe("quote-deadline-reminders");
    expect(failed?.error).toBe("Supabase впала");
  });

  it("обробник, який повернув 500, рахується невдалим, а не тихо успішним", async () => {
    contractor.mockResolvedValue({ statusCode: 500, headers: {}, body: JSON.stringify({ error: "boom" }) });

    const body = parse(await handler(authorized));

    expect(body.success).toBe(false);
    expect(body.results.find((result) => result.job === "contractor-reminders")).toMatchObject({
      ok: false,
      statusCode: 500,
    });
  });

  it("без крон-ключа не пускає далі гейта", async () => {
    const response = await handler({ httpMethod: "POST", headers: {} });

    expect(response.statusCode).toBe(401);
    expect(customerLead).not.toHaveBeenCalled();
    expect(quoteDeadline).not.toHaveBeenCalled();
    expect(contractor).not.toHaveBeenCalled();
  });

  it("передає подію обробникам як є — їхні власні гейти мають бачити той самий ключ", async () => {
    await handler(authorized);

    expect(customerLead).toHaveBeenCalledWith(authorized);
    expect(quoteDeadline).toHaveBeenCalledWith(authorized);
    expect(contractor).toHaveBeenCalledWith(authorized);
  });

  it("не приймає чужі методи", async () => {
    const response = await handler({ httpMethod: "DELETE", headers: { "x-cron-key": SECRET } });

    expect(response.statusCode).toBe(405);
    expect(customerLead).not.toHaveBeenCalled();
  });
});
