import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Відповідь «чи справді змінився статус» — це те, за чим сторінки вирішують,
 * слати сповіщення чи змовчати. Помилка тут коштує рівно того, що вже було:
 * чотири однакові «Прорахунок затверджено» при одному рядку історії (REQ-231).
 */

const rpc = vi.fn();
const select = vi.fn();

vi.mock("@/lib/supabaseClient", () => {
  const builder: Record<string, unknown> = {};
  for (const method of ["update", "eq", "neq"]) builder[method] = vi.fn(() => builder);
  builder.select = select;
  const from = vi.fn(() => builder);
  return { supabase: { schema: () => ({ rpc, from }) } };
});

const { setQuoteStatus } = await import("./setQuoteStatus");

const params = { quoteId: "11111111-2222-4333-8444-555555555555", status: "approved" };

describe("setQuoteStatus", () => {
  beforeEach(() => {
    rpc.mockReset();
    select.mockReset();
  });

  it("база каже «не змінилось» — повертаємо false, і сповіщати нема про що", async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    await expect(setQuoteStatus(params)).resolves.toBe(false);
  });

  it("справжній перехід — true", async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    await expect(setQuoteStatus(params)).resolves.toBe(true);
  });

  it("стара функція на проді (void → null) вважається зміною, а не тишею", async () => {
    // Поки міграція не застосована, RPC віддає null. Замовкнути тут означало б
    // перестати слати сповіщення взагалі — гірше за зайве повідомлення.
    rpc.mockResolvedValue({ data: null, error: null });
    await expect(setQuoteStatus(params)).resolves.toBe(true);
  });

  it("немає RPC — запасний шлях теж відрізняє холостий перехід", async () => {
    rpc.mockResolvedValue({ data: null, error: new Error("function set_quote_status does not exist") });
    select.mockResolvedValue({ data: [], error: null });
    await expect(setQuoteStatus(params)).resolves.toBe(false);

    select.mockResolvedValue({ data: [{ id: params.quoteId }], error: null });
    await expect(setQuoteStatus(params)).resolves.toBe(true);
  });

  it("чужа помилка не маскується під «нічого не змінилось»", async () => {
    rpc.mockResolvedValue({ data: null, error: new Error("permission denied for table quotes") });
    await expect(setQuoteStatus(params)).rejects.toThrow("permission denied");
  });
});
