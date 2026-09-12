import { QuoteItemImprints, type QuoteItemMethodInput } from "./QuoteItemImprints";

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
  disabled?: boolean;
  onSaved: () => void;
}) {
  if (!teamId || !kindId || specPreset) return null;

  return (
    <div className="mt-4 border-t border-border/50 pt-3">
      <QuoteItemImprints
        teamId={teamId}
        itemId={itemId}
        kindId={kindId}
        kindName={kindName}
        product={{
          name: itemTitle || modelLabel || "Позиція",
          sku,
          color,
          imageUrl,
        }}
        methods={methods}
        disabled={disabled}
        onSaved={onSaved}
      />
    </div>
  );
}
