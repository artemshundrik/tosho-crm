import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SupplierPoolRow } from "@/lib/supplierPoolRows";

/**
 * `search_supplier_pool` саму функцію бази тут не чіпаємо — вона тюнінгована
 * під RLS-обхідний trgm-індекс окремо (`scripts/supplier-pool-search.sql`) і
 * має свій ризик. Перевіряється лише клієнт: чи справді `mustContain`
 * (REQ-182#p27, `poolQueryPlan.ts`) звужує рядки ДО згортання в картки, і чи
 * без цього поля виклик поводиться так само, як і до фікса.
 */

let rpcRows: SupplierPoolRow[] = [];
const rpcSpy = vi.fn(async (_name: string, _params: unknown) => ({ data: rpcRows, error: null }));

vi.mock("@/lib/supabaseClient", () => ({
  supabase: { schema: () => ({ rpc: rpcSpy }) },
}));

const { searchSupplierPool } = await import("./supplierPool");

const row = (over: Partial<SupplierPoolRow>): SupplierPoolRow => ({
  id: "id-1",
  supplier_slug: "totobi.com.ua",
  article: null,
  name: "Товар",
  vendor: null,
  category: null,
  price: null,
  currency: "UAH",
  price_kind: "wholesale",
  url: null,
  image_url: null,
  color: null,
  size: null,
  ...over,
});

beforeEach(() => {
  rpcRows = [];
  rpcSpy.mockClear();
});

describe("searchSupplierPool: mustContain (REQ-182#p27)", () => {
  it("без mustContain — поведінка як і раніше, рядки в злиття йдуть усі", async () => {
    rpcRows = [
      row({ id: "a", name: "Жилет флісовий Mercury" }),
      row({ id: "b", name: "Жилет шкіряний Mercury" }),
    ];
    const products = await searchSupplierPool("жиле", { limit: 5 });
    expect(products.map((p) => p.name).sort()).toEqual([
      "Жилет флісовий Mercury",
      "Жилет шкіряний Mercury",
    ]);
  });

  it("mustContain лишає лише товари, де назва містить усі стеми", async () => {
    // Живий випадок 24.09.2026: «жиле» саме по собі знаходить і шкіряні
    // жилети — «фліс» у mustContain звужує до того, що шукав клієнт.
    rpcRows = [
      row({ id: "a", name: "Жилет флісовий Mercury" }),
      row({ id: "b", name: "Жилет шкіряний Mercury" }),
      row({ id: "c", name: "Рюкзак шкіряний" }),
    ];
    const products = await searchSupplierPool("жиле", { limit: 5, mustContain: ["фліс"] });
    expect(products.map((p) => p.name)).toEqual(["Жилет флісовий Mercury"]);
  });

  it("кілька стемів у mustContain — товар мусить містити кожен", async () => {
    rpcRows = [
      row({ id: "a", supplier_slug: "bergamo.ua", name: "Жилет флісовий SOL'S Norway" }),
      row({ id: "b", supplier_slug: "bergamo.ua", name: "Куртка флісова SOL'S Norway" }),
    ];
    const products = await searchSupplierPool("жиле", { limit: 5, mustContain: ["фліс", "жиле"] });
    expect(products.map((p) => p.name)).toEqual(["Жилет флісовий SOL'S Norway"]);
  });

  it("закороткий термін не летить у RPC навіть із mustContain", async () => {
    const products = await searchSupplierPool("жи", { limit: 5, mustContain: ["фліс"] });
    expect(products).toEqual([]);
    expect(rpcSpy).not.toHaveBeenCalled();
  });
});
