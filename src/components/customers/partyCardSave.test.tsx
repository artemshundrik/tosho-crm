import { describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => [] as string[]);

/** Ланцюжок PostgREST: лід уже переведено (0 рядків), решта мала б пройти. */
vi.mock("@/lib/supabaseClient", () => {
  const chain = (table: string, op: string) => {
    const result = { data: op === "update" ? [] : { id: "c-dup" }, error: null };
    const node: Record<string, unknown> = {
      eq: () => node,
      in: () => node,
      select: () => node,
      single: () => Promise.resolve(result),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
    };
    calls.push(`${op} ${table}`);
    return node;
  };
  const from = (table: string) => ({
    update: () => chain(table, "update"),
    insert: () => chain(table, "insert"),
    delete: () => chain(table, "delete"),
  });
  return { supabase: { schema: () => ({ from }) } };
});

import { createEmptyLeadForm } from "./leadRecord";
import { saveLeadCard } from "./partyCardSave";

describe("saveLeadCard — переведення", () => {
  it("лід, якого вже немає (перевели в іншій вкладці), не породжує другого замовника", async () => {
    const form = { ...createEmptyLeadForm(), companyName: "MAS Seeds", firstName: "Людмила", source: "Сайт", paymentType: "cash" as const, phones: ["+380966960056"] };
    await expect(
      saveLeadCard({
        teamId: "t1",
        leadId: "l1",
        form,
        manager: { label: "Дарʼя М.", userId: null },
        fallbackManagerLabel: "",
        previous: { logoUrl: null, managerUserId: null, managerLabel: "", companyName: "MAS Seeds" },
        actor: { userId: "u1", name: "Я" },
        convertToCustomer: true,
      }),
    ).rejects.toThrow(/вже переведено/);
    expect(calls).toEqual(["update leads"]);
  });
});
