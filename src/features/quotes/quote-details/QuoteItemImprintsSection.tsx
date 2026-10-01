import * as React from "react";

import { guessKindFromTitle } from "@/features/quotes/quote-wizard/catalogSuggestions";
import type { QuoteItemMetadata } from "@/lib/printPackage";
import type { CatalogType } from "@/types/catalog";

import { ensureCatalogModel } from "./catalogModelBinding";
import type { KindOption } from "./KindChip";
import { QuoteItemImprints, type QuoteItemKindPicker, type QuoteItemMethodInput } from "./QuoteItemImprints";

/**
 * Смуга нанесення в картці позиції — разом із умовою, за якої вона взагалі є.
 *
 * ЧОМУ ОКРЕМИМ МОДУЛЕМ. Умова, три абзаци пояснення й збирання паспорта
 * товару для шапки вікна — це двадцять рядків усередині `QuoteDetailsPage`,
 * файла на сім тисяч рядків. Він саме так і виріс, тому ратчет розміру нове
 * туди більше не пускає, і це правильно: тут усе видно цілком.
 *
 * НАНЕСЕННЯ РЕДАГУЄТЬСЯ ТУТ, а не показується рядком специфікації
 * (REQ-157#p2/p4/p5): вікно редагування прорахунку віддало продукцію вкладці
 * «Товари», а вікно позиції лишилось для рідкісного — одиниці, артикула,
 * коментаря, вкладення.
 *
 * У ПОЛІГРАФІЇ СМУГИ НЕМАЄ. Там нанесення не питають: оздоблення живе в
 * параметрах виробу (тиснення, лак, УФ), тож вид із власним пресетом виробу
 * цю секцію не показує зовсім.
 *
 * ПОЗИЦІЯ БЕЗ ВИДУ ТЕПЕР ТЕЖ МАЄ СМУГУ (REQ-324#p1) — із чипом виду попереду.
 * Тут збирається все, що для цього треба: список видів каталогу, здогад із
 * назви й прив'язка до каталогу з тим самим паспортом товару (фото, сайти,
 * артикул), з яким модель заводить «Створити» у вікні нового прорахунку.
 */
export function QuoteItemImprintsSection({
  teamId,
  itemId,
  itemTitle,
  methods,
  kindId,
  kindName,
  modelLabel,
  sku,
  color,
  imageUrl,
  specPreset,
  catalogTypes,
  metadata,
  disabled,
  onSaved,
}: {
  teamId: string | null | undefined;
  itemId: string;
  itemTitle: string | null | undefined;
  methods: QuoteItemMethodInput[];
  kindId: string | null | undefined;
  kindName: string | null | undefined;
  modelLabel: string | null | undefined;
  sku: string | null;
  color: string | null;
  imageUrl: string | null;
  /** `metadata.specPreset` моделі — вид, який ми виробляємо самі. */
  specPreset: string | null | undefined;
  /** Каталог сторінки — з нього список видів для позиції без виду. */
  catalogTypes: CatalogType[];
  /** Метадані позиції — сайти постачальника для рядка каталогу. */
  metadata: QuoteItemMetadata | null;
  disabled?: boolean;
  onSaved: () => void;
}) {
  const kinds = React.useMemo<KindOption[]>(
    () =>
      catalogTypes.flatMap((type) =>
        type.kinds.map((kind) => ({ kindId: kind.id, kindName: kind.name, typeId: type.id, typeName: type.name }))
      ),
    [catalogTypes]
  );

  if (!teamId || specPreset) return null;
  // Без виду смуга — це питання «що за товар». Хто не може правити позицію,
  // відповісти на нього не може, тож питання йому й не ставимо.
  if (!kindId && (disabled || kinds.length === 0)) return null;

  const name = itemTitle || modelLabel || "Позиція";
  const kindPicker: QuoteItemKindPicker | undefined = kindId
    ? undefined
    : {
        options: kinds,
        guess: guessKindFromTitle(kinds, itemTitle),
        bind: async (kind) => ({
          catalog_type_id: kind.typeId,
          catalog_kind_id: kind.kindId,
          catalog_model_id: await ensureCatalogModel({
            teamId,
            kindId: kind.kindId,
            // Лише справжня назва: модель «Позиція» в каталозі нікому не потрібна.
            name: itemTitle ?? "",
            imageUrl,
            supplierUrl: metadata?.supplierUrl ?? null,
            avantprintUrl: metadata?.avantprintUrl ?? null,
            sku,
          }),
        }),
      };

  return (
    <div className="mt-4 border-t border-border/50 pt-3">
      <QuoteItemImprints
        teamId={teamId}
        itemId={itemId}
        kindId={kindId ?? null}
        kindName={kindName}
        product={{ name, sku, color, imageUrl }}
        methods={methods}
        disabled={disabled}
        onSaved={onSaved}
        kindPicker={kindPicker}
      />
    </div>
  );
}
