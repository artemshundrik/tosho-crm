import { cn } from "@/lib/utils";
import { ABSENCE_KIND_ICONS } from "@/lib/absenceIndicator";
import { toneBadgeClass } from "@/lib/statusTones";
import {
  TEAM_ABSENCE_KIND_LABELS,
  TEAM_ABSENCE_KIND_TONE,
  type TeamAbsenceKind,
} from "@/lib/teamAbsences";

export { ABSENCE_KIND_ICONS };

/**
 * Чип типу відсутності — ОДИН на весь застосунок.
 *
 * Іконка тут не декор: тип має впізнаватись формою, а не лише кольором —
 * інакше людина з дальтонізмом не відрізнить відпустку від day-off. Той самий
 * словник іконок стоїть на барах планера, тож сторінка говорить однією мовою.
 */

export function AbsenceKindChip({
  kind,
  label,
  className,
  size = "md",
}: {
  kind: TeamAbsenceKind;
  /** Перебиває підпис — напр. «Відпустка · до 14.08». */
  label?: string;
  className?: string;
  size?: "sm" | "md";
}) {
  const Icon = ABSENCE_KIND_ICONS[kind];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border font-semibold",
        size === "sm" ? "px-2 py-0.5 text-3xs" : "px-2.5 py-1 text-2xs",
        toneBadgeClass[TEAM_ABSENCE_KIND_TONE[kind]],
        className
      )}
    >
      <Icon className={cn("shrink-0", size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5")} aria-hidden />
      {label ?? TEAM_ABSENCE_KIND_LABELS[kind]}
    </span>
  );
}
