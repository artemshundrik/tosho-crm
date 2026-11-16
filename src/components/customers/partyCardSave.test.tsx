import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  calls: [] as string[],
  /** Скільки рядків повертає update ліда: 0 = лід уже переведено. */
  leadRows: 0,
  rpcArgs: null as Record<string, unknown> | null,
}));

/** Ланцюжок PostgREST: записує порядок кроків, щоб перевірити послідовність переведення. */
vi.mock("@/lib/supabaseClient", () => {
  const chain = (table: string, op: string) => {
    const data = op === "update" ? Array.from({ length: table === "leads" ? state.leadRows : 1 }, () => ({ id: "x" })) : { id: "c-new" };
    const result = { data, error: null };
    const node: Record<string, unknown> = {
      eq: () => node,
      in: () => node,
      is: () => node,
      select: () => node,
      single: () => Promise.resolve(result),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
    };
    state.calls.push(`${op} ${table}`);
    return node;
  };
  const from = (table: string) => ({
    update: () => chain(table, "update"),
    insert: () => chain(table, "insert"),
    delete: () => chain(table, "delete"),
  });
  const rpc = (name: string, args: Record<string, unknown>) => {
    state.calls.push(`rpc ${name}`);
    state.rpcArgs = args;
    return Promise.resolve({ data: { moved: 1, locked: 0 }, error: null });
  };
  return { supabase: { schema: () => ({ from, rpc }) } };
});

import { createEmptyLeadForm } from "./leadRecord";
import { saveLeadCard } from "./partyCardSave";

const convert = () =>
  saveLeadCard({
    teamId: "t1",
    leadId: "l1",
    form: { ...createEmptyLeadForm(), companyName: "MAS Seeds", firstName: "Людмила", source: "Сайт", paymentType: "cash" as const, phones: ["+380966960056"] },
    manager: { label: "Дарʼя М.", userId: null },
    fallbackManagerLabel: "",
    previous: { logoUrl: null, managerUserId: null, managerLabel: "", companyName: "MAS Seeds" },
    actor: { userId: "u1", name: "Я" },
    convertToCustomer: true,
  });

describe("saveLeadCard — переведення", () => {
  beforeEach(() => {
    state.calls.length = 0;
    state.rpcArgs = null;
  });

  it("лід, якого вже немає (перевели в іншій вкладці), не породжує другого замовника", async () => {
    state.leadRows = 0;
    await expect(convert()).rejects.toThrow(/вже переведено/);
    expect(state.calls).toEqual(["update leads"]);
  });

  it("переносить на замовника і прорахунки, і дизайн-задачі — до видалення ліда", async () => {
    state.leadRows = 1;
    await expect(convert()).resolves.toMatchObject({ convertedCustomerId: "c-new" });
    expect(state.calls).toEqual([
      "update leads",
      "insert customers",
      "update quotes",
      "rpc relink_lead_design_tasks",
      "delete leads",
    ]);
    expect(state.rpcArgs).toEqual({ p_lead_id: "l1", p_customer_id: "c-new" });
  });
});
