import { beforeEach, describe, expect, it, vi } from "vitest";

import { attachDirectoryMethod, loadMethodDirectory } from "./useKindImprintOptions";

/**
 * «Інші методи…» (REQ-292): метод із довідника спершу стає методом виду —
 * рядком `catalog_methods` тієї самої форми, що пише Каталог, — і лише тоді
 * йде в позицію. Тут перевіряється саме запис, бо в прев'ю він глушиться
 * сторожем і до бази не доходить.
 *
 * Ланцюжок PostgREST підроблено мінімально: кожен виклик записується, а
 * відповідь задає тест.
 */

type Result = { data: unknown; error: unknown };
type Call = { table: string; op: string; args: unknown[] };

const calls: Call[] = [];
let insertResult: Result = { data: null, error: null };
let lookupResults: Result[] = [];
let listResult: Result = { data: [], error: null };

function fakeQuery(table: string) {
  const chain: Record<string, unknown> = {};
  for (const op of ["select", "eq", "limit", "insert", "order"]) {
    chain[op] = (...args: unknown[]) => {
      calls.push({ table, op, args });
      return chain;
    };
  }
  chain.single = () => Promise.resolve(insertResult);
  chain.maybeSingle = () => Promise.resolve(lookupResults.shift() ?? { data: null, error: null });
  chain.then = (resolve: (value: Result) => unknown, reject: (reason: unknown) => unknown) =>
    Promise.resolve(listResult).then(resolve, reject);
  return chain;
}

vi.mock("@/lib/supabaseClient", () => ({
  supabase: { schema: () => ({ from: (table: string) => fakeQuery(table) }) },
}));

const DTF = { id: "dir-dtf", name: "ДТФ" };
const eqCalls = () => calls.filter((call) => call.op === "eq").map((call) => call.args);

describe("attachDirectoryMethod", () => {
  beforeEach(() => {
    calls.length = 0;
    insertResult = { data: null, error: null };
    lookupResults = [];
  });

  it("пише рядок виду тієї самої форми, що Каталог, і повертає його", async () => {
    insertResult = { data: { id: "method-new", name: "ДТФ" }, error: null };

    await expect(attachDirectoryMethod("team-1", "kind-multitool", DTF)).resolves.toEqual({
      id: "method-new",
      name: "ДТФ",
    });

    const insert = calls.find((call) => call.op === "insert");
    expect(insert?.table).toBe("catalog_methods");
    expect(insert?.args[0]).toEqual({
      team_id: "team-1",
      kind_id: "kind-multitool",
      name: "ДТФ",
      price: null,
      directory_id: "dir-dtf",
    });
  });

  it("23505 — хтось прив'язав метод раніше: беремо наявний рядок за довідником", async () => {
    insertResult = { data: null, error: { code: "23505", message: "duplicate key value" } };
    lookupResults = [{ data: { id: "method-existing", name: "ДТФ" }, error: null }];

    await expect(attachDirectoryMethod("team-1", "kind-multitool", DTF)).resolves.toEqual({
      id: "method-existing",
      name: "ДТФ",
    });
    expect(eqCalls()).toEqual([
      ["team_id", "team-1"],
      ["kind_id", "kind-multitool"],
      ["directory_id", "dir-dtf"],
    ]);
  });

  it("23505, а за довідником не знайшлось — шукаємо за назвою", async () => {
    insertResult = { data: null, error: { code: "23505", message: "duplicate key value" } };
    lookupResults = [
      { data: null, error: null },
      { data: { id: "method-legacy", name: "ДТФ" }, error: null },
    ];

    await expect(attachDirectoryMethod("team-1", "kind-multitool", DTF)).resolves.toEqual({
      id: "method-legacy",
      name: "ДТФ",
    });
    expect(eqCalls().at(-1)).toEqual(["name", "ДТФ"]);
  });

  it("будь-яка інша помилка йде нагору як є і нічого не шукає", async () => {
    const denied = { code: "42501", message: "new row violates row-level security policy" };
    insertResult = { data: null, error: denied };

    await expect(attachDirectoryMethod("team-1", "kind-multitool", DTF)).rejects.toBe(denied);
    expect(calls.some((call) => call.op === "eq")).toBe(false);
  });
});

describe("loadMethodDirectory", () => {
  beforeEach(() => {
    calls.length = 0;
  });

  it("бере активні методи своєї команди, за абеткою, без порожніх назв", async () => {
    listResult = {
      data: [
        { id: "d-3", name: "УФ-друк" },
        { id: "d-1", name: "Вишивка" },
        { id: "d-blank", name: "  " },
        { id: "d-2", name: "ДТФ" },
      ],
      error: null,
    };

    await expect(loadMethodDirectory("team-1")).resolves.toEqual([
      { id: "d-1", name: "Вишивка" },
      { id: "d-2", name: "ДТФ" },
      { id: "d-3", name: "УФ-друк" },
    ]);
    expect(calls[0]?.table).toBe("method_directory");
    expect(eqCalls()).toEqual([
      ["team_id", "team-1"],
      ["active", true],
    ]);
  });
});
