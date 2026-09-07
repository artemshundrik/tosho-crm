import { describe, expect, it } from "vitest";

import { looksLikeSku } from "./productSkuLike";

/**
 * Поріг «схоже на артикул» стереже два походи в базу — підказки товару у вікні
 * прорахунку й пошук прорахунку за артикулом позиції, — тож ці випадки тримають
 * саме межу: що ганяє мережу, а що ні.
 */
describe("looksLikeSku", () => {
  it("впізнає коди постачальників", () => {
    for (const sku of ["TSRA170-BK", "51K054MHH", "70030505-44", "eco-sumka/grey", "2523-08"]) {
      expect(looksLikeSku(sku), sku).toBe(true);
    }
  });

  it("не жене запит на назви й короткі уривки", () => {
    for (const query of ["худі", "hudi", "термосумка", "ab", "  ", "TS 0926"]) {
      expect(looksLikeSku(query), query).toBe(false);
    }
  });

  it("не пропускає символів, які PostgREST або LIKE прочитають як шаблон", () => {
    for (const query of ["51K%", "51K_54", "51K,054", "51K*"]) {
      expect(looksLikeSku(query), query).toBe(false);
    }
  });
});
