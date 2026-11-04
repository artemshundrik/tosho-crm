import { cn } from "@/lib/utils";
import { DESIGN_STATUS_TONE, designStatusDotClass, toneTextClass } from "@/lib/statusTones";

/** Скільки активних задач на дизайнері за кожним етапом. */
export type DesignerStatusCounts = {
  newCount: number;
  inProgressCount: number;
  changesCount: number;
};

const SEGMENTS = [
  { key: "newCount", status: "new", label: "нові" },
  { key: "inProgressCount", status: "in_progress", label: "в роботі" },
  { key: "changesCount", status: "changes", label: "правки" },
] as const;

export const getDesignerStatusTotal = (counts: DesignerStatusCounts | null | undefined) =>
  counts ? counts.newCount + counts.inProgressCount + counts.changesCount : 0;

/**
 * Навантаження дизайнера за етапами — для кожного місця, де йому призначають задачу.
 *
 * Одне число «N задач» ховало головне: «4 нові» і «4 на правках» — різна
 * завантаженість. Нові ще чекають у черзі, правки приходять поза чергою і
 * з'їдають день непередбачувано (прохання менеджера, 04.11.2026).
 *
 * Смуга масштабується до `scaleMax` — найбільшої кількості задач серед усіх
 * дизайнерів у списку, тож довжина порівнюється між рядками, а кольори
 * показують, з чого навантаження складається. Тони — з DESIGN_STATUS_TONE,
 * ті самі, що в бейджах статусів на дошці.
 */
export function DesignerStatusLoad({
  counts,
  scaleMax,
  className,
}: {
  counts: DesignerStatusCounts;
  scaleMax: number;
  className?: string;
}) {
  const total = getDesignerStatusTotal(counts);
  const scale = Math.max(scaleMax, total, 1);

  return (
    <div className={cn("mt-1 space-y-1", className)}>
      <div className="flex h-1.5 w-full gap-px overflow-hidden rounded-full bg-muted" aria-hidden="true">
        {SEGMENTS.map((segment) =>
          counts[segment.key] > 0 ? (
            <span
              key={segment.key}
              className={cn("h-full", designStatusDotClass[segment.status])}
              style={{ width: `${(counts[segment.key] / scale) * 100}%` }}
            />
          ) : null
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-1 text-2xs tabular-nums text-muted-foreground">
        {SEGMENTS.map((segment, index) => (
          <span key={segment.key} className="inline-flex items-center gap-1">
            {index > 0 ? <span aria-hidden="true">·</span> : null}
            <span
              className={cn(
                counts[segment.key] > 0 && segment.status === "changes" && toneTextClass[DESIGN_STATUS_TONE[segment.status]],
                counts[segment.key] === 0 && "text-muted-foreground/70"
              )}
            >
              {counts[segment.key]} {segment.label}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
