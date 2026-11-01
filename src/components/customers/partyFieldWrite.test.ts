import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Поле картки пишеться в базу лише собою (Review Focus 1). Менеджер А міняє
 * пошту бухгалтера в панелі, менеджер Б тим часом — нотатки на сторінці: якщо
 * панель шле в `update` усю картку, правка Б зникає мовчки.
 */
const calls: { table: string; patch: unknown; id: unknown }[] = [];
const response = { value: { data: [{ id: "c1" }], error: null } as { data: unknown; error: unknown } };

vi.mock("@/lib/supabaseClient", () => ({
  supabase: {
    schema: () => ({
      from: (table: string) => ({
        update: (patch: unknown) => ({
          eq: (_column: string, id: unknown) => ({
            select: async () => {
              calls.push({ table, patch, id });
              return response.value;
            },
          }),
        }),
      }),
    }),
  },
}));

import { writeCustomerFields, writeLeadFields } from "./partyFieldWrite";

beforeEach(() => {
  calls.length = 0;
  response.value = { data: [{ id: "c1" }], error: null };
});

describe("writeCustomerFields", () => {
  it("шле в update рівно змінену колонку", async () => {
    await expect(writeCustomerFields("c1", { accountant_email: "a@b.ua" })).resolves.toEqual({ ok: true });
    expect(calls).toEqual([{ table: "customers", patch: { accountant_email: "a@b.ua" }, id: "c1" }]);
  });

  it("нуль рядків — замовника вже немає або він недоступний", async () => {
    response.value = { data: [], error: null };
    await expect(writeCustomerFields("c1", { notes: "x" })).resolves.toEqual({
      ok: false,
      reason: "gone",
      message: "Замовника вже немає або він вам недоступний",
    });
  });

  it("помилка мережі — текст обіцяє, що введене не пропало", async () => {
    response.value = { data: null, error: { message: "TypeError: Failed to fetch" } };
    await expect(writeCustomerFields("c1", { notes: "x" })).resolves.toEqual({
      ok: false,
      reason: "network",
      message: "Не зберіглось: немає звʼязку. Те, що ви ввели, не пропало.",
    });
  });
});

describe("writeLeadFields", () => {
  it("пише в leads лише змінене", async () => {
    response.value = { data: [{ id: "l1" }], error: null };
    await expect(writeLeadFields("l1", { payment_type: "cash" })).resolves.toEqual({ ok: true });
    expect(calls).toEqual([{ table: "leads", patch: { payment_type: "cash" }, id: "l1" }]);
  });

  it("нуль рядків — ліда вже немає", async () => {
    response.value = { data: [], error: null };
    const result = await writeLeadFields("l1", { notes: "x" });
    expect(result).toMatchObject({ ok: false, reason: "gone" });
  });
});
