import { describe, expect, it } from "vitest";

import { buildModelSwapPatch } from "./modelSwapPatch";

/**
 * Що злітає при заміні товару (REQ-36#p41).
 *
 * Правило одне: зміна ВИДУ скидає все, що належало виду або моделі. Нанесення
 * скидались від початку, а параметри виробу — ні, і після заміни щоденника на
 * брошуру позиція лишалась із 33 полями щоденника. Панель їх ще й показувала,
 * бо брала пресет зі збереженого значення.
 */

const suggestion = (over: Partial<Parameters<typeof buildModelSwapPatch>[0]> = {}) => ({
  name: "Брошура",
  typeId: "type-print",
  kindId: "kind-brochure",
  modelId: "model-brochure",
  matched: undefined,
  ...over,
});

const diaryMetadata = {
  sku: "ART-1",
  printSpec: { presetKey: "print_diary", values: { format: "a5" } },
};

describe("заміна товару в позиції", () => {
  it("зміна виду знімає і нанесення, і параметри виробу", () => {
    const patch = buildModelSwapPatch(suggestion(), {
      currentKindId: "kind-diary",
      metadata: diaryMetadata,
    });

    expect(patch.methods).toBeNull();
    expect(patch.print_position_id).toBeNull();
    expect(patch.metadata).toEqual({ sku: "ART-1" });
  });

  it("решта метаданих переживає заміну — колонка перезаписується цілком", () => {
    const patch = buildModelSwapPatch(suggestion(), {
      currentKindId: "kind-diary",
      metadata: { ...diaryMetadata, catalogVariant: { id: "variant-blue", name: "Синій", sku: "ART-1-BLUE" } },
    });

    expect(patch.metadata).toEqual({
      sku: "ART-1",
      catalogVariant: { id: "variant-blue", name: "Синій", sku: "ART-1-BLUE" },
    });
  });

  it("модель змінилась усередині того самого виду — не чіпаємо нічого зайвого", () => {
    const patch = buildModelSwapPatch(suggestion({ modelId: "model-other" }), {
      currentKindId: "kind-brochure",
      metadata: diaryMetadata,
    });

    expect(patch).not.toHaveProperty("methods");
    expect(patch).not.toHaveProperty("print_position_id");
    expect(patch).not.toHaveProperty("metadata");
    expect(patch.catalog_model_id).toBe("model-other");
  });

  it("параметрів не було — метадані не переписуємо заради нічого", () => {
    const patch = buildModelSwapPatch(suggestion(), {
      currentKindId: "kind-diary",
      metadata: { sku: "ART-1" },
    });

    expect(patch.methods).toBeNull();
    expect(patch).not.toHaveProperty("metadata");
  });

  it("колір лишається, коли товар знайшли за артикулом кольору", () => {
    const patch = buildModelSwapPatch(
      suggestion({ matched: { variantId: "variant-blue" } as never }),
      { currentKindId: "kind-brochure", metadata: null }
    );

    expect(patch.catalog_variant_id).toBe("variant-blue");
  });
});
