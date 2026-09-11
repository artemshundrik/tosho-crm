import { CatalogPlaceChip } from "@/features/quotes/quote-wizard/CatalogPlaceChip";

/**
 * Шапка позиції прорахунку: назва, місце в каталозі, паспортний рядок.
 *
 * ЧОМУ ВИД ОКРЕМИМ БЕЙДЖЕМ, А НЕ ПЕРШОЮ ЧАСТИНОЮ СІРОГО РЯДКА (Артем,
 * 11.09.2026). У наших друкованих виробів назва моделі й рівень каталогу майже
 * збігаються: під заголовком «Щоденник» сірим дрібним стояло «Щоденники» — око
 * читало це як ту саму назву вдруге, в іншому відмінку, а не як місце в
 * каталозі. Бейдж каже те саме інакше: не другий підзаголовок, а мітка — і рівно
 * такий самий, як у вікні додавання позицій, де вид показують так само.
 *
 * У товарів бейджа немає навмисно: там рівень каталогу («Кепки / Одяг») не
 * повторює назву моделі й читається саме як паспортний рядок разом із кольором
 * і артикулом — а три частини одного паспорта не мають розбігатись на бейдж і
 * рядок.
 */
export function QuoteItemTitle({
  title,
  /** Місце в каталозі бейджем. `null` у товарів — там воно йде в `meta`. */
  place,
  /** Паспорт товару одним сірим рядком: рід, колір, артикул. */
  meta,
}: {
  title: string;
  place: string | null;
  meta: string[];
}) {
  return (
    <div className="min-w-0">
      <div className="truncate text-xl font-semibold leading-tight tracking-tight text-foreground">{title}</div>
      {place ? (
        <div className="mt-1.5">
          <CatalogPlaceChip label={place} />
        </div>
      ) : null}
      {meta.length > 0 ? (
        <div className="mt-1 truncate text-sm text-muted-foreground" title={meta.join(" · ")}>
          {meta.join(" · ")}
        </div>
      ) : null}
    </div>
  );
}
