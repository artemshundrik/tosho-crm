import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Запис кольорів у `catalog_variants` (REQ-178#p9).
 *
 * ЧОМУ ЦЕ ПОКРИТО ТЕСТОМ, А НЕ ПЕРЕВІРЕНО РУКАМИ. Єдиний спосіб проклацати цей
 * шлях живцем — зберегти модель у справжньому каталозі, тобто змінити робочі
 * дані. А найдорожча помилка тут не видима на екрані взагалі: зайве видалення
 * рядка тихо занулює `quote_items.catalog_variant_id` у ЧУЖОМУ прорахунку, і
 * пам'ять про проданий колір зникає без жодного повідомлення.
 *
 * Тому перевіряємо саме порядок операцій: спершу дописати, потім прибрати — і
 * прибрати рівно тих, кого в новому списку немає.
 */

const upsert = vi.fn();
const select = vi.fn();
const del = vi.fn();
const deleteIn = vi.fn();
const calls: string[] = [];

vi.mock("@/lib/supabaseClient", () => {
  const builder: Record<string, unknown> = {
    upsert: (...args: unknown[]) => {
      calls.push("upsert");
      return upsert(...args);
    },
    select: (...args: unknown[]) => {
      calls.push("select");
      return { eq: () => select(...args) };
    },
    delete: () => {
      calls.push("delete");
      del();
      return { in: (_col: string, ids: string[]) => deleteIn(ids) };
    },
  };
  return { supabase: { schema: () => ({ from: () => builder }) } };
});

vi.mock("@/lib/catalogAssetUrl", () => ({
  buildCatalogImageAsset: (bucket: string | null, path: string | null) =>
    bucket && path ? { bucket, path, originalUrl: "o", previewUrl: "p", thumbUrl: "t" } : null,
}));

const { persistCatalogVariants, groupCatalogVariantsByModel } = await import("./catalogVariantRows");

const variant = (id: string, name: string, sku: string | null = null) => ({
  id,
  name,
  sku,
  imageUrl: null,
  imageAsset: null,
  active: true,
});

const BLACK = "11111111-2222-4333-8444-555555555555";
const WHITE = "22222222-3333-4444-8555-666666666666";
const GONE = "33333333-4444-4555-8666-777777777777";

describe("persistCatalogVariants", () => {
  beforeEach(() => {
    calls.length = 0;
    upsert.mockReset().mockResolvedValue({ error: null });
    select.mockReset().mockResolvedValue({ data: [], error: null });
    del.mockReset();
    deleteIn.mockReset().mockResolvedValue({ error: null });
  });

  it("спершу дописує, і лише потім прибирає — інакше обрив лишив би модель без кольорів", async () => {
    select.mockResolvedValue({ data: [{ id: BLACK }, { id: GONE }], error: null });
    await persistCatalogVariants({
      teamId: "team",
      modelId: "model",
      variants: [variant(BLACK, "Чорний", "JG3555")],
    });
    expect(calls).toEqual(["upsert", "select", "delete"]);
  });

  it("прибирає рівно тих, кого в новому списку немає", async () => {
    select.mockResolvedValue({ data: [{ id: BLACK }, { id: WHITE }, { id: GONE }], error: null });
    await persistCatalogVariants({
      teamId: "team",
      modelId: "model",
      variants: [variant(BLACK, "Чорний"), variant(WHITE, "Білий")],
    });
    expect(deleteIn).toHaveBeenCalledWith([GONE]);
  });

  it("нічого не змінилось — жодного видалення: чужий прорахунок не має втрачати колір", async () => {
    select.mockResolvedValue({ data: [{ id: BLACK }], error: null });
    await persistCatalogVariants({
      teamId: "team",
      modelId: "model",
      variants: [variant(BLACK, "Чорний")],
    });
    expect(deleteIn).not.toHaveBeenCalled();
  });

  it("порядок у списку стає sort_order, а порожня назва не лягає в not null", async () => {
    await persistCatalogVariants({
      teamId: "team",
      modelId: "model",
      variants: [variant(BLACK, "  "), variant(WHITE, "Білий", "  ")],
    });
    const rows = upsert.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(rows.map((row) => [row.name, row.sort_order])).toEqual([
      ["Без назви", 0],
      ["Білий", 1],
    ]);
    expect(rows[1].sku).toBeNull();
  });

  it("варіант без uuid у таблицю не пускається", async () => {
    select.mockResolvedValue({ data: [], error: null });
    await persistCatalogVariants({
      teamId: "team",
      modelId: "model",
      variants: [variant("import:item-42", "Чорний")],
    });
    expect(upsert).not.toHaveBeenCalled();
  });

  it("список спорожнів — прибираємо все, що лишилось", async () => {
    select.mockResolvedValue({ data: [{ id: BLACK }, { id: WHITE }], error: null });
    await persistCatalogVariants({ teamId: "team", modelId: "model", variants: [] });
    expect(deleteIn).toHaveBeenCalledWith([BLACK, WHITE]);
  });
});

describe("groupCatalogVariantsByModel", () => {
  it("порядок бере з sort_order, а не з того, як приїхали рядки", () => {
    const grouped = groupCatalogVariantsByModel([
      { id: WHITE, model_id: "m", name: "Білий", sku: null, image_bucket: null, image_path: null, is_active: true, sort_order: 1 },
      { id: BLACK, model_id: "m", name: "Чорний", sku: null, image_bucket: null, image_path: null, is_active: true, sort_order: 0 },
    ]);
    expect(grouped.get("m")?.map((v) => v.name)).toEqual(["Чорний", "Білий"]);
  });

  it("URL картинки виводиться зі шляху — у базі його немає", () => {
    const grouped = groupCatalogVariantsByModel([
      {
        id: BLACK,
        model_id: "m",
        name: "Чорний",
        sku: "JG3555",
        image_bucket: "public-assets",
        image_path: "teams/t/catalog-models/m/pic.webp",
        is_active: true,
        sort_order: 0,
      },
    ]);
    expect(grouped.get("m")?.[0].imageUrl).toBe("p");
    expect(grouped.get("m")?.[0].imageAsset?.path).toBe("teams/t/catalog-models/m/pic.webp");
  });
});
