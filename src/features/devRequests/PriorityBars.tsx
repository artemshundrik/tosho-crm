import { cn } from "@/lib/utils";
import { PRIORITY_LABELS, type RequestPriority } from "./types";

/**
 * Пріоритет трьома стовпчиками — три залиті це «терміново», два «звичайний»,
 * один «не горить».
 *
 * ЧОМУ НЕ ЧІП ЗІ СЛОВОМ, як було. Чіп займав повноцінне місце в ряду
 * метаданих і читався лише прочитаним — а пріоритет сканують по всій колонці
 * згори вниз, не читаючи. Через це «звичайний» довелось узагалі прибрати з
 * картки, і вийшла двозначність: картка без мітки означала водночас і
 * «звичайний», і «пріоритет ще не проставили». Стовпчики показують усі три
 * стани в тому самому місці й тим самим розміром.
 *
 * ФОРМА, А НЕ ЛИШЕ КОЛІР: кількість залитих стовпчиків читається без кольору,
 * тож шкала переживає дальтонізм і чорно-білий друк дошки — та сама вимога,
 * що записана в коментарі до KIND_ICONS.
 */
export function PriorityBars({
  priority,
  className,
}: {
  priority: RequestPriority | null;
  className?: string;
}) {
  // Незаповнений пріоритет показуємо як «звичайний»: у базі це значення за
  // замовчуванням, і малювати замість нього порожнє місце означало б повернути
  // ту саму двозначність, заради якої стовпчики й з'явились.
  const value: RequestPriority = priority ?? "normal";
  const filled = value === "high" ? 3 : value === "normal" ? 2 : 1;

  return (
    <span
      className={cn(
        "inline-flex h-3 shrink-0 items-end gap-[1.5px]",
        value === "high" ? "text-danger-foreground" : "text-muted-foreground",
        className
      )}
      title={PRIORITY_LABELS[value]}
      aria-label={`Пріоритет: ${PRIORITY_LABELS[value]}`}
      role="img"
    >
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          aria-hidden="true"
          className={cn(
            "w-[3px] rounded-[1px]",
            index === 0 ? "h-[5px]" : index === 1 ? "h-[9px]" : "h-3",
            index < filled ? "bg-current" : "bg-border"
          )}
        />
      ))}
    </span>
  );
}
