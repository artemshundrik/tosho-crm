import * as React from "react";

import type { QuoteImportDraftImprint } from "@/features/quotes/quote-import/types";

import { ImprintChips, type PlaceOption } from "./ImprintChips";
import { getImprintSheet } from "./imprintSheets";
import { resolveImprintPlaces, type PlaceCache } from "./imprintPlaces";
import { KindChip, KindImprintDoor, type KindOption } from "./KindChip";
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
 *
 * ПОЗИЦІЯ БЕЗ ВИДУ (REQ-324#p1). Методи належать виду, тож без виду смузі
 * нема чого запропонувати — і раніше її тут просто не було. Так лягали
 * товари за посиланням, чий вид не вгадався: у вересні 30 позицій зі 103, у
 * жовтні 17 з 22, і в жодної нанесення, бо поставити його було ніде. Тепер
 * поруч стоїть чип виду, як у вікні створення: здогад із назви — пунктиром,
 * і перше ж нанесення його підтверджує; немає здогаду — «+ нанесення» веде
 * через вибір виду. Вид, обраний тут, прив'язує позицію до каталогу тим
 * самим шляхом, що й «Створити» (`kindPicker.bind`).
 */

export type QuoteItemMethodInput = {
  methodId: string;
  printPositionId?: string;
  printPositionLabel?: string | null;
  printWidthMm?: number | null;
  printHeightMm?: number | null;
  count?: number;
};

/** Вибір виду для позиції, у якої його ще немає. */
export type QuoteItemKindPicker = {
  options: KindOption[];
  /** Здогад із назви позиції. Не записаний: його підтверджує перший клік. */
  guess: KindOption | null;
  /** Поля позиції, що прив'язують її до виду (і моделі каталогу, якщо вдалося). */
  bind: (kind: KindOption) => Promise<Record<string, unknown>>;
};

/** Відбиток набору пар — щоб бачити, чи взагалі щось змінилось. */
const signatureOf = (imprints: QuoteImportDraftImprint[]) =>
  imprints.map((imprint) => `${imprint.methodId}:${imprint.positionId ?? ""}:${imprint.positionLabel ?? ""}`).join("|");

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
  kindName,
  product,
  methods,
  disabled,
  onSaved,
  kindPicker,
}: {
  teamId: string;
  itemId: string;
  /** Вид товару: методи й місця належать саме йому. Без виду — лише з `kindPicker`. */
  kindId: string | null;
  methods: QuoteItemMethodInput[];
  /** Назва виду — за нею береться ескіз товару для вікна вибору місця. */
  kindName?: string | null;
  /** Паспорт позиції для шапки вікна: назва, колір, артикул, фото. */
  product?: { name: string; sku: string | null; color: string | null; imageUrl: string | null };
  disabled?: boolean;
  /** Позиція збережена — сторінці час перечитати товари. */
  onSaved?: () => void;
  /** Позиція без виду: вид обирається тут же (REQ-324#p1). Не задано — без виду смуги немає. */
  kindPicker?: QuoteItemKindPicker;
}) {
  const initial = React.useMemo(() => toImprints(methods), [methods]);
  const signature = signatureOf(initial);
  const [imprints, setImprints] = React.useState<QuoteImportDraftImprint[]>(initial);
  const [seen, setSeen] = React.useState(signature);
  const [saving, setSaving] = React.useState(false);
  const placeCache = React.useRef<PlaceCache>(new Map());

  /*
    ВИД, ЯКИЙ ЩЕ НЕ ДОЇХАВ ІЗ БАЗИ. Людина обрала вид — запис пішов, але
    сторінка ще перечитує товари, і `kindId` поки порожній. Без цього чип на
    пів секунди повертався б до «Вид товару?» або до здогаду.
  */
  const [picked, setPicked] = React.useState<KindOption | null>(null);
  /** Вид обрали через «+ нанесення» — смуга цього виду відкриє методи сама. */
  const [imprintsAfterKind, setImprintsAfterKind] = React.useState<string | null>(null);
  const pending = kindId ? null : (picked ?? kindPicker?.guess ?? null);
  const effectiveKindId = kindId ?? pending?.kindId ?? null;
  const effectiveKindName = kindId ? kindName : pending?.kindName;

  const { byKind, directoryFor } = useKindImprintOptions(teamId, effectiveKindId ? [effectiveKindId] : []);

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

  const options = byKind[effectiveKindId ?? ""];
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

  const kindless = !kindId && Boolean(kindPicker);
  if (!kindId && !kindPicker) return null;

  /**
   * Прив'язати позицію до виду. Вид без нанесень — теж відповідь: його
   * записуємо одразу, а не тримаємо в пам'яті до першого методу, інакше він
   * зник би з перезавантаженням сторінки.
   */
  const pickKind = async (kind: KindOption, viaImprints: boolean) => {
    if (!kindPicker) return;
    setPicked(kind);
    setImprintsAfterKind(viaImprints ? kind.kindId : null);
    setSaving(true);
    const binding = await kindPicker.bind(kind);
    await updateQuoteItemRow(itemId, binding);
    setSaving(false);
    onSaved?.();
  };

  const apply = async (next: QuoteImportDraftImprint[]) => {
    /* НІЧОГО НЕ ЗМІНИЛОСЬ — НІЧОГО Й НЕ ПИШЕМО. «Без нанесення» — єдиний чип,
       який малюється саме тоді, коли нанесень немає, тож клік по ньому лише
       підтверджує наявний стан. А коштував він запису в базу плюс
       перечитування всіх позицій прорахунку з каталогом (заміряно: PATCH +
       чотири GET, близько півтори секунди) — і все заради того, щоб лишити
       все як було. */
    if (signatureOf(next) === signatureOf(imprints)) return;
    if (!effectiveKindId) return;
    setImprints(next);
    setSaving(true);
    const resolved = await resolveImprintPlaces(next, effectiveKindId, placeCache.current);
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
    /*
      МЕТОД ЗДОГАДАНОГО ВИДУ ПІДТВЕРДЖУЄ І ВИД. Методи, які людина бачила,
      належали виду на чипі поруч, тож клік по методу — це відповідь і на
      питання «що це за товар». Одним записом: позиція з методом чужого виду
      (або без виду взагалі) була б саме тією брехнею, яку не прочитає ні
      картка, ні замовлення, ні дизайн-задача.
    */
    const binding = !kindId && pending && kindPicker ? await kindPicker.bind(pending) : {};
    await updateQuoteItemRow(itemId, {
      ...binding,
      methods: payload,
      print_position_id: resolved.find((imprint) => imprint.positionId)?.positionId ?? null,
    });
    setSaving(false);
    onSaved?.();
  };

  const chips =
    effectiveKindId && options ? (
      <ImprintChips
        // Новий вид — нова смуга: `autoOpen` читається лише на появі.
        key={effectiveKindId}
        autoOpen={imprintsAfterKind === effectiveKindId}
        imprints={imprints}
        methods={options.methods}
        places={places}
        // «Інші методи…» (REQ-292): той самий довідник, що у вікні створення.
        directory={directoryFor(effectiveKindId)}
        disabled={disabled || saving}
        onChange={(next) => void apply(next)}
        // Ескіз є не в кожного виду: немає — смуга лишається поповерами.
        sheet={getImprintSheet(effectiveKindName)}
        product={product ? { ...product, kindName: effectiveKindName ?? null } : undefined}
      />
    ) : null;

  if (!kindless || !kindPicker) {
    return chips ? <div className="flex flex-wrap items-center gap-2">{chips}</div> : null;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <KindChip
        value={pending ? { kindId: pending.kindId, kindName: pending.kindName, guessed: !picked } : null}
        options={kindPicker.options}
        disabled={disabled || saving}
        allowClear={false}
        onChange={(kind) => {
          if (kind) void pickKind(kind, false);
        }}
      />
      {pending ? (
        chips
      ) : (
        <KindImprintDoor
          options={kindPicker.options}
          disabled={disabled || saving}
          onPick={(kind) => void pickKind(kind, true)}
        />
      )}
    </div>
  );
}
