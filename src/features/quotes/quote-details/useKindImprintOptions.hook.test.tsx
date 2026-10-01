import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useKindImprintOptions } from "./useKindImprintOptions";

/**
 * Методи виду не губляться, коли список видів міняється посеред завантаження
 * (REQ-324#p2).
 *
 * Так жило вікно створення: вставили кілька посилань — вид першого вгадався,
 * методи пішли вантажитись, друге посилання дочиталось і додало свій вид. Ефект
 * перезапускався, відповідь для першого виду викидалась, а запитаним він уже
 * значився — і позиція назавжди лишалась із чипом виду й без жодного методу.
 */

let release: () => void = () => {};
let gate: Promise<void> = Promise.resolve();

function fakeQuery(table: string) {
  const chain: Record<string, unknown> = {};
  for (const op of ["select", "eq", "not", "order", "limit"]) chain[op] = () => chain;
  chain.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
    gate
      .then(() => ({
        data: table === "catalog_methods" ? [{ id: "m-decal", name: "Деколь" }] : [],
        error: null,
      }))
      .then(resolve, reject);
  return chain;
}

vi.mock("@/lib/supabaseClient", () => ({
  supabase: { schema: () => ({ from: (table: string) => fakeQuery(table) }) },
}));

describe("useKindImprintOptions", () => {
  it("вид, чий список змінився посеред завантаження, свої методи все одно отримує", async () => {
    gate = new Promise((resolve) => {
      release = resolve;
    });
    const { result, rerender } = renderHook(({ kinds }) => useKindImprintOptions("team-1", kinds), {
      initialProps: { kinds: ["k-thermo"] },
    });

    // Друга позиція додала свій вид, поки методи першої ще в дорозі.
    rerender({ kinds: ["k-thermo", "k-cap"] });
    release();

    await waitFor(() => expect(Object.keys(result.current.byKind).sort()).toEqual(["k-cap", "k-thermo"]));
    expect(result.current.byKind["k-thermo"].methods).toEqual([{ id: "m-decal", name: "Деколь" }]);
  });
});
