import type { KpiCell } from "@/lib/taskThread";
import { cn } from "@/lib/utils";

/**
 * Волосяна сітка показників — прийом із DesignersDashboard: не рамки навколо
 * кожної комірки, а сітка з проміжком в один піксель на тлі лінії.
 */
export function ThreadKpiStrip({ cells }: { cells: KpiCell[] }) {
  if (cells.length === 0) return null;

  return (
    <div
      className="grid gap-px border-y border-border/40 bg-border/40"
      style={{ gridTemplateColumns: `repeat(${cells.length}, minmax(0, 1fr))` }}
    >
      {cells.map((cell) => (
        <div key={cell.label} className="flex flex-col gap-1 bg-card p-2.5">
          <span className="truncate text-2xs font-medium text-muted-foreground">{cell.label}</span>

          <span className="text-lg font-bold leading-none tracking-tight tabular-nums">
            {cell.value}
            {cell.unit ? (
              <span className="ml-1 text-2xs font-medium tracking-normal text-muted-foreground">
                {cell.unit}
              </span>
            ) : null}
          </span>

          {cell.track ? <NormTrack track={cell.track} /> : null}

          {cell.hint ? (
            <span
              className={cn(
                "inline-flex w-fit rounded-full border px-1.5 text-3xs font-semibold",
                cell.tone === "bad" && "border-danger-soft-border bg-danger-soft text-danger-foreground",
                cell.tone === "good" &&
                  "border-success-soft-border bg-success-soft text-success-foreground",
                (!cell.tone || cell.tone === "flat") &&
                  "border-border/60 bg-muted text-muted-foreground"
              )}
            >
              {cell.hint}
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

/**
 * Доріжка «зроблено проти норми»: суцільна смуга — зроблено, бліда під нею —
 * минулий раз, пунктир — норма, перевищення — окремим зеленим сегментом.
 */
function NormTrack({ track }: { track: NonNullable<KpiCell["track"]> }) {
  // Норму ставимо на 68% ширини, щоб перевищення завжди мало куди рости.
  const NORM_AT = 68;
  const scale = track.norm > 0 ? NORM_AT / track.norm : 0;
  const clamp = (value: number) => Math.max(0, Math.min(100, value));

  const doneWidth = clamp(track.done * scale);
  const overWidth = track.done > track.norm ? clamp(doneWidth) - NORM_AT : 0;
  const previousWidth = track.previous === null ? null : clamp(track.previous * scale);

  return (
    <span className="relative block h-3.5" aria-hidden="true">
      <span className="absolute inset-0 flex justify-between">
        {[0, 1, 2, 3, 4].map((line) => (
          <span key={line} className="w-px bg-foreground/5" />
        ))}
      </span>

      <span
        className="absolute top-0.5 h-1.5 rounded-r bg-[hsl(var(--chart-1))]"
        style={{ width: `${Math.min(doneWidth, NORM_AT)}%` }}
      />

      {overWidth > 0 ? (
        <span
          className="absolute top-0.5 h-1.5 rounded-r bg-[hsl(var(--success-solid))]"
          style={{ left: `${NORM_AT}%`, width: `${overWidth}%` }}
        />
      ) : null}

      {previousWidth !== null ? (
        <span
          className="absolute top-2.5 h-0.5 rounded-r bg-[hsl(var(--chart-1))] opacity-30"
          style={{ width: `${previousWidth}%` }}
        />
      ) : null}

      <span
        className="absolute top-0 h-2.5 border-l-2 border-dashed border-foreground/45"
        style={{ left: `${NORM_AT}%` }}
      />
    </span>
  );
}
