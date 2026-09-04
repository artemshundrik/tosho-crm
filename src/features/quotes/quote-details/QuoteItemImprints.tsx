import * as React from "react";

import type { QuoteImportDraftImprint } from "@/features/quotes/quote-import/types";

import { ImprintChips, type PlaceOption } from "./ImprintChips";
import { resolveImprintPlaces, type PlaceCache } from "./imprintPlaces";
import { updateQuoteItemRow } from "./queries";
import { useKindImprintOptions } from "./useKindImprintOptions";

/**
 * Нанесення позиції прямо в картці товару (REQ-157#p4).
 *
 * ЧОМУ ТУТ. Вікно редагування прорахунку віддало продукцію вкладці «Товари»
 * (REQ-157#p2) — отже, приймати її має картка позиції, і тими самими рухами,
 * що у вікні створення: пари «метод · місце» чипами, «+ нанесення», вписане
 * місце заводить рядок довідника виду. Одна мова в трьох місцях: створення,
 * картка товару, картка дизайн-задачі.
 *
 * ЗАПИС ОДРАЗУ, БЕЗ КНОПКИ «ЗБЕРЕГТИ» — як тиражі поруч: клік по чипу і є
 * відповіддю, а окрема кнопка на кожну позицію означала б, що половина змін
 * лишиться незбереженою.
 *
 * РОЗМІРИ ДАВНІХ НАНЕСЕНЬ НЕ ГУБИМО: у вікні їх не питають, але в базі вони є,
 * тож ширина й висота їдуть разом зі своєю парою, поки її не прибрали.
 */

export type QuoteItemMethodInput = {
  methodId: string;
  printPositionId?: string;
  printPositionLabel?: string | null;
  printWidthMm?: number | null;
  printHeightMm?: number | null;
  count?: number;
};

const toImprints = (methods: QuoteItemMethodInput[]) =>
  methods.map((method, index) => ({
    key: `${method.methodId}-${index}`,
    methodId: method.methodId,
    positionId: method.printPositionId ?? null,
    positionLabel: method.printPositionLabel?.trim() || null,
  }));

export function QuoteItemImprints({
  teamId,
  itemId,
  kindId,
  methods,
  disabled,
  onSaved,
}: {
  teamId: string;
  itemId: string;
  /** Вид товару: методи й місця належать саме йому. Без виду чипів немає. */
  kindId: string | null;
  methods: QuoteItemMethodInput[];
  disabled?: boolean;
  /** Позиція збережена — сторінці час перечитати товари. */
  onSaved?: () => void;
}) {
  const initial = React.useMemo(() => toImprints(methods), [methods]);
  const signature = initial.map((imprint) => `${imprint.methodId}:${imprint.positionId ?? ""}:${imprint.positionLabel ?? ""}`).join("|");
  const [imprints, setImprints] = React.useState<QuoteImportDraftImprint[]>(initial);
  const [seen, setSeen] = React.useState(signature);
  const [saving, setSaving] = React.useState(false);
  const placeCache = React.useRef<PlaceCache>(new Map());
  const { byKind } = useKindImprintOptions(teamId, kindId ? [kindId] : []);

  /* Прийшли інші дані (перечитали товари, перемкнули позицію) — беремо їх.
     Порівнянням під час рендера, а не ефектом: ефект тут ганяв би зайвий
     рендер на кожне збереження. */
  if (seen !== signature) {
    setSeen(signature);
    setImprints(initial);
  }

  /** Розмір і кількість давнього нанесення — щоб не втратити їх на правці пари. */
  const extraFor = (key: string) => {
    const index = initial.findIndex((imprint) => imprint.key === key);
    const source = index >= 0 ? methods[index] : undefined;
    return {
      count: source?.count ?? 1,
      widthMm: source?.printWidthMm ?? null,
      heightMm: source?.printHeightMm ?? null,
    };
  };

  const options = byKind[kindId ?? ""];
  const places = React.useMemo<PlaceOption[]>(() => {
    const known = options?.places ?? [];
    const seen = new Set(known.map((place) => place.label.toLowerCase()));
    const typed = imprints
      .filter((imprint) => !imprint.positionId && imprint.positionLabel?.trim())
      .map((imprint) => (imprint.positionLabel ?? "").trim())
      .filter((label) => label && !seen.has(label.toLowerCase()))
      .map((label) => ({ id: null, label }));
    return [...known, ...typed];
  }, [imprints, options]);

  if (!kindId || !options) return null;

  const apply = async (next: QuoteImportDraftImprint[]) => {
    setImprints(next);
    setSaving(true);
    const resolved = await resolveImprintPlaces(next, kindId, placeCache.current);
    setImprints(resolved);
    const payload =
      resolved.length > 0
        ? resolved.map((imprint) => {
            const extra = extraFor(imprint.key);
            return {
              method_id: imprint.methodId,
              count: extra.count,
              print_position_id: imprint.positionId,
              print_position_label: imprint.positionLabel,
              print_width_mm: extra.widthMm,
              print_height_mm: extra.heightMm,
            };
          })
        : null;
    await updateQuoteItemRow(itemId, {
      methods: payload,
      print_position_id: resolved.find((imprint) => imprint.positionId)?.positionId ?? null,
    });
    setSaving(false);
    onSaved?.();
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <ImprintChips
        imprints={imprints}
        methods={options.methods}
        places={places}
        disabled={disabled || saving}
        onChange={(next) => void apply(next)}
      />
    </div>
  );
}
