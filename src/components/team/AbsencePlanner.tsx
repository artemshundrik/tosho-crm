import { memo, useMemo } from "react";
import { Cake, Award, type LucideIcon } from "lucide-react";

import { AvatarBase } from "@/components/app/avatar-kit";
import { cn } from "@/lib/utils";
import { isBusinessDay } from "@/lib/teamAbsenceCalendar";
import {
  TEAM_ABSENCE_KIND_LABELS,
  TEAM_ABSENCE_KIND_TONE,
  type TeamAbsence,
} from "@/lib/teamAbsences";
import { toneBadgeClass, toneTextClass } from "@/lib/statusTones";

/**
 * Планер відсутностей: люди × дні.
 *
 * Один рядок = одна людина, один стовпчик = один день. Погоджені відсутності
 * малюються суцільними барами, запити на погодженні — штрихованими: різниця
 * між «його вже немає» і «він щойно попросив» мусить читатись без легенди.
 *
 * Вихідні та свята — фон стовпчика (не тип відсутності), бо квоту вони не
 * їдять; сьогодні — вертикальна підсвітка.
 *
 * Сітка будується inline-стилями (`gridTemplateColumns`), бо кількість днів
 * динамічна — Tailwind таких класів згенерувати не може.
 */

export type PlannerPerson = {
  userId: string;
  name: string;
  roleLabel: string;
  avatarUrl?: string | null;
  initials: string;
  online?: boolean;
  inactive?: boolean;
};

export type PlannerMark = {
  id: string;
  userId: string;
  dateKey: string;
  kind: "birthday" | "anniversary";
  title: string;
};

const MARK_ICONS: Record<PlannerMark["kind"], LucideIcon> = {
  birthday: Cake,
  anniversary: Award,
};

const MARK_TONE_CLASS: Record<PlannerMark["kind"], string> = {
  birthday: toneTextClass.warning,
  anniversary: toneTextClass.accent,
};

const NAME_COLUMN_PX = 208;
const MIN_DAY_PX = 26;

function formatWeekdayShort(dateKey: string) {
  const label = new Date(`${dateKey}T12:00:00`).toLocaleDateString("uk-UA", { weekday: "short" });
  return `${label.charAt(0).toUpperCase()}${label.slice(1)}`;
}

function dayNumber(dateKey: string) {
  return Number(dateKey.slice(8, 10));
}

function formatRangeTitle(absence: TeamAbsence) {
  const label = TEAM_ABSENCE_KIND_LABELS[absence.kind];
  const status = absence.status === "pending" ? " · на погодженні" : "";
  const range =
    absence.startDate === absence.endDate
      ? absence.startDate.slice(8, 10) + "." + absence.startDate.slice(5, 7)
      : `${absence.startDate.slice(8, 10)}.${absence.startDate.slice(5, 7)} – ${absence.endDate.slice(8, 10)}.${absence.endDate.slice(5, 7)}`;
  return `${label} · ${range}${status}${absence.comment ? ` · ${absence.comment}` : ""}`;
}

type AbsenceSegment = {
  absence: TeamAbsence;
  /** 1-based індекс дня в межах вікна */
  startIndex: number;
  endIndex: number;
  clippedRight: boolean;
};

function buildSegments(absences: TeamAbsence[], days: string[]): AbsenceSegment[] {
  if (days.length === 0) return [];
  const first = days[0];
  const last = days[days.length - 1];

  return absences
    .filter((absence) => absence.startDate <= last && absence.endDate >= first)
    .map((absence) => {
      const startKey = absence.startDate < first ? first : absence.startDate;
      const endKey = absence.endDate > last ? last : absence.endDate;
      const startIndex = days.indexOf(startKey);
      const endIndex = days.indexOf(endKey);
      return {
        absence,
        startIndex,
        endIndex,
        clippedRight: absence.endDate > last,
      };
    })
    .filter((segment) => segment.startIndex >= 0 && segment.endIndex >= segment.startIndex);
}

type AbsencePlannerProps = {
  days: string[];
  people: PlannerPerson[];
  absences: TeamAbsence[];
  marks?: PlannerMark[];
  exceptions?: Map<string, boolean>;
  todayKey: string;
  currentUserId?: string | null;
  /** Може створювати відсутність будь-кому (owner/SEO). Решта — лише собі. */
  canPickForOthers?: boolean;
  onPickDay?: (userId: string, dateKey: string) => void;
  emptyLabel?: string;
};

function AbsencePlannerImpl({
  days,
  people,
  absences,
  marks,
  exceptions,
  todayKey,
  currentUserId,
  canPickForOthers = false,
  onPickDay,
  emptyLabel = "Нікого немає в цьому вікні.",
}: AbsencePlannerProps) {
  const absencesByUser = useMemo(() => {
    const map = new Map<string, TeamAbsence[]>();
    absences.forEach((absence) => {
      const list = map.get(absence.userId);
      if (list) list.push(absence);
      else map.set(absence.userId, [absence]);
    });
    return map;
  }, [absences]);

  const marksByUser = useMemo(() => {
    const map = new Map<string, PlannerMark[]>();
    (marks ?? []).forEach((mark) => {
      const list = map.get(mark.userId);
      if (list) list.push(mark);
      else map.set(mark.userId, [mark]);
    });
    return map;
  }, [marks]);

  const dayMeta = useMemo(
    () =>
      days.map((dateKey) => ({
        dateKey,
        rest: !isBusinessDay(dateKey, exceptions),
        today: dateKey === todayKey,
      })),
    [days, exceptions, todayKey]
  );

  const gridStyle = {
    gridTemplateColumns: `${NAME_COLUMN_PX}px repeat(${days.length}, minmax(${MIN_DAY_PX}px, 1fr))`,
  } as const;

  if (people.length === 0) {
    return <div className="px-5 py-8 text-center text-xs text-muted-foreground">{emptyLabel}</div>;
  }

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[760px]">
        {/* Шапка з датами */}
        <div className="grid border-b border-border/60" style={gridStyle}>
          <div />
          {dayMeta.map((day) => (
            <div
              key={day.dateKey}
              className={cn(
                "px-0.5 py-1.5 text-center text-3xs uppercase tracking-wide text-muted-foreground",
                day.rest && "bg-muted/40 text-muted-foreground/70"
              )}
            >
              <div>{formatWeekdayShort(day.dateKey)}</div>
              <div
                className={cn(
                  "mt-0.5 text-2xs font-semibold tabular-nums text-foreground",
                  day.today &&
                    "mx-auto grid h-5 w-5 place-items-center rounded-full bg-primary text-primary-foreground"
                )}
              >
                {dayNumber(day.dateKey)}
              </div>
            </div>
          ))}
        </div>

        {/* Рядки людей */}
        {people.map((person) => {
          const segments = buildSegments(absencesByUser.get(person.userId) ?? [], days);
          const personMarks = (marksByUser.get(person.userId) ?? []).filter((mark) =>
            days.includes(mark.dateKey)
          );
          const canPick = Boolean(onPickDay) && (canPickForOthers || person.userId === currentUserId);

          return (
            <div
              key={person.userId}
              className="relative grid h-[46px] items-center border-b border-border/40 last:border-b-0"
              style={gridStyle}
            >
              <div className="flex h-full min-w-0 items-center gap-2.5 border-r border-border/60 px-3">
                <AvatarBase
                  src={person.avatarUrl}
                  name={person.name}
                  fallback={person.initials}
                  assetVariant="xs"
                  size={26}
                  inactive={person.inactive}
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        "truncate text-xs font-medium text-foreground",
                        person.inactive && "text-muted-foreground line-through"
                      )}
                    >
                      {person.name}
                    </span>
                    {person.online ? (
                      <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full tone-dot-success" />
                    ) : null}
                  </div>
                  <div className="truncate text-3xs text-muted-foreground">{person.roleLabel}</div>
                </div>
              </div>

              {/* Фонові клітинки днів */}
              {dayMeta.map((day, index) => {
                const cellClass = cn(
                  "h-full",
                  day.rest && "bg-muted/40",
                  day.today && "shadow-[inset_1.5px_0_0_hsl(var(--primary)/0.35),inset_-1.5px_0_0_hsl(var(--primary)/0.35)]",
                  canPick && "cursor-pointer hover:bg-primary/5"
                );
                const style = { gridColumn: `${index + 2} / ${index + 3}`, gridRow: 1 } as const;

                return canPick ? (
                  <button
                    key={day.dateKey}
                    type="button"
                    className={cn(cellClass, "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary/50")}
                    style={style}
                    title={`Додати відсутність — ${person.name}, ${day.dateKey}`}
                    aria-label={`Додати відсутність: ${person.name}, ${day.dateKey}`}
                    onClick={() => onPickDay?.(person.userId, day.dateKey)}
                  />
                ) : (
                  <div key={day.dateKey} className={cellClass} style={style} aria-hidden />
                );
              })}

              {/* Бари відсутностей */}
              {segments.map((segment) => {
                const span = segment.endIndex - segment.startIndex + 1;
                const tone = TEAM_ABSENCE_KIND_TONE[segment.absence.kind];
                const pending = segment.absence.status === "pending";
                const label = pending
                  ? `Запит · ${TEAM_ABSENCE_KIND_LABELS[segment.absence.kind]}`
                  : TEAM_ABSENCE_KIND_LABELS[segment.absence.kind];

                return (
                  <div
                    key={segment.absence.id}
                    className={cn(
                      "z-10 mx-0.5 flex h-[26px] items-center gap-1.5 self-center overflow-hidden rounded-full border px-2 text-3xs font-semibold",
                      toneBadgeClass[tone],
                      pending && "border-dashed [background-image:repeating-linear-gradient(45deg,transparent_0_5px,hsl(var(--card)/0.5)_5px_10px)]"
                    )}
                    style={{
                      gridColumn: `${segment.startIndex + 2} / ${segment.endIndex + 3}`,
                      gridRow: 1,
                    }}
                    title={formatRangeTitle(segment.absence)}
                  >
                    {span >= 3 ? (
                      <span className="truncate">
                        {label}
                        {segment.clippedRight ? " →" : ""}
                      </span>
                    ) : null}
                  </div>
                );
              })}

              {/* Дні народження / річниці */}
              {personMarks.map((mark) => {
                const Icon = MARK_ICONS[mark.kind];
                const index = days.indexOf(mark.dateKey);
                return (
                  <div
                    key={mark.id}
                    className="z-20 grid place-items-center place-self-center"
                    style={{ gridColumn: `${index + 2} / ${index + 3}`, gridRow: 1 }}
                    title={mark.title}
                  >
                    <Icon className={cn("h-3.5 w-3.5", MARK_TONE_CLASS[mark.kind])} aria-hidden />
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export const AbsencePlanner = memo(AbsencePlannerImpl);
