/**
 * Факт про товар у картці прорахунку — РЯДОК, А НЕ ПЛИТКА (REQ-175#p26).
 *
 * Було: `min-h-14` і `min-w-[112px]` — коробка 56 px заввишки під один рядок
 * тексту, у власній рамці з власним тлом. Три такі плитки важили більше, ніж
 * назва товару над ними, хоч кажуть дрібницю: місце й розмір нанесення,
 * кількість, одиницю. Тепер підпис і значення стоять в один рядок — 32 px, та
 * сама волосінь і та сама сімʼя, що в мітки артикула поруч.
 *
 * Тло `bg-muted` — суцільне, а не `bg-muted/20`: картка тепер сама поверхня
 * (`bg-card`), і на ній двадцятивідсотковий шар давав 0,6 % різниці, тобто
 * рамку без заливки.
 */
export function QuoteItemFact({
  label,
  value,
}: {
  label: string;
  /** Порожнє значення показує сам підпис — так поводились і старі плитки. */
  value?: string | null;
}) {
  return (
    <span
      className="inline-flex max-w-full items-baseline gap-2 rounded-lg border border-border/50 bg-muted px-2.5 py-1.5"
      title={value ? `${label}: ${value}` : label}
    >
      <span className="shrink-0 text-3xs font-semibold uppercase tracking-caps text-muted-foreground">
        {label}
      </span>
      {value ? (
        <span className="min-w-0 truncate text-sm font-semibold text-foreground">{value}</span>
      ) : null}
    </span>
  );
}
