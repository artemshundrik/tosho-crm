import { memo, useMemo } from "react";
import { Award, Cake, PartyPopper, type LucideIcon } from "lucide-react";

import { AvatarBase } from "@/components/app/avatar-kit";
import { cn } from "@/lib/utils";
import { isBusinessDay } from "@/lib/teamAbsenceCalendar";
import {
  TEAM_ABSENCE_KIND_LABELS,
  TEAM_ABSENCE_KIND_TONE,
  type TeamAbsence,
} from "@/lib/teamAbsences";
import { ABSENCE_KIND_ICONS, type AvatarAbsence } from "@/lib/absenceIndicator";
import { PersonHoverCardMaybe, type PersonHoverCardData } from "@/components/app/PersonHoverCard";
import { TEAM_EVENT_TONE, toneBadgeClass, toneDotClass, toneTextClass } from "@/lib/statusTones";

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
  absence?: AvatarAbsence | null;
  /** Дані для картки під курсором. Без них рядок просто не має підказки. */
  card?: PersonHoverCardData | null;
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

/**
 * Тон позначки береться зі спільної мапи подій команди.
 *
 * Тут стояв власний список, і день народження в ньому був ЖОВТИЙ — той самий,
 * що в лікарняного. У календарі на «Команді» він рожевий, тож одна подія мала
 * два кольори, а жовтий читався як попередження. Мапа тепер одна на всі
 * поверхні (TEAM_EVENT_TONE), і розійтись їм більше нема як.
 */
const MARK_TONE_CLASS: Record<PlannerMark["kind"], string> = {
  birthday: toneTextClass[TEAM_EVENT_TONE.birthday],
  anniversary: toneTextClass[TEAM_EVENT_TONE.anniversary],
};

/**
 * Заливка святкового стовпчика. Свідомо слабка: вона тягнеться на всю висоту
 * планера, а насиченість мусить падати з площею — інакше колір читається як
 * бруд і перебиває самі бари відсутностей.
 */
/*
 * У світлій темі беремо м'який відтінок, у темній — ЯСКРАВИЙ колір із низькою
 * альфою. Прямий `festive-soft` у темній не працює: він сам темний (17%
 * lightness) і на темній картці зливається з фоном — перевірено рендером.
 */
const HOLIDAY_COLUMN_CLASS =
  "bg-[hsl(var(--festive-soft)/0.55)] dark:bg-[hsl(var(--festive-solid)/0.16)]";

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
  /** день → назва свята. Чи вихідний він — каже `exceptions`, а не наявність тут. */
  holidayNames?: Map<string, string>;
  todayKey: string;
  currentUserId?: string | null;
  /** Може створювати відсутність будь-кому (owner/SEO). Решта — лише собі. */
  canPickForOthers?: boolean;
  onPickDay?: (userId: string, dateKey: string) => void;
  /** Клік по бару — відкрити саму відсутність (редагування для owner/SEO). */
  onOpenAbsence?: (absence: TeamAbsence) => void;
  emptyLabel?: string;
};

function AbsencePlannerImpl({
  days,
  people,
  absences,
  marks,
  exceptions,
  holidayNames,
  todayKey,
  currentUserId,
  canPickForOthers = false,
  onPickDay,
  onOpenAbsence,
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
        // Ім'я свята незалежне від режиму дня: `rest` вище вже врахував
        // календар, тож робоче свято не отримає сірого фону вихідного.
        holiday: holidayNames?.get(dateKey) ?? null,
        today: dateKey === todayKey,
      })),
    [days, exceptions, holidayNames, todayKey]
  );

  /** Свята видимого вікна — для підпису під сіткою. */
  const visibleHolidays = useMemo(
    () => dayMeta.filter((day) => day.holiday).map((day) => ({ dateKey: day.dateKey, name: day.holiday as string })),
    [dayMeta]
  );

  const gridStyle = {
    gridTemplateColumns: `${NAME_COLUMN_PX}px repeat(${days.length}, minmax(${MIN_DAY_PX}px, 1fr))`,
  } as const;

  if (people.length === 0) {
    return <div className="px-5 py-8 text-center text-xs text-muted-foreground">{emptyLabel}</div>;
  }

  return (
    <div>
      {/* Свята видимого вікна — НАД сіткою: знизу цей рядок не помічали
          (правка CEO 2026-08-03). Дублює заливку стовпчика навмисно: колір
          каже «щось особливе», а назву дає лише текст. */}
      {visibleHolidays.length > 0 ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border/40 px-3 py-2">
          <span className="flex items-center gap-1.5 text-3xs font-semibold uppercase tracking-wide text-muted-foreground">
            <PartyPopper className={cn("h-3.5 w-3.5", toneTextClass.festive)} aria-hidden />
            Свята
          </span>
          {visibleHolidays.map((holiday) => (
            <span key={holiday.dateKey} className="flex items-center gap-1.5 text-2xs">
              <span
                aria-hidden
                className={cn("h-3 w-3 shrink-0 rounded-sm border border-border/50", HOLIDAY_COLUMN_CLASS)}
              />
              <b className={cn("font-semibold tabular-nums", toneTextClass.festive)}>
                {dayNumber(holiday.dateKey)}
              </b>
              <span className="text-foreground">{holiday.name}</span>
            </span>
          ))}
        </div>
      ) : null}

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
                // Фон свята інший, ніж у вихідного: сірий = просто вихідний.
                day.rest && !day.holiday && "bg-muted/40 text-muted-foreground/70",
                day.holiday && HOLIDAY_COLUMN_CLASS
              )}
              title={day.holiday ?? undefined}
            >
              <div>{formatWeekdayShort(day.dateKey)}</div>
              <div
                className={cn(
                  "mt-0.5 text-2xs font-semibold tabular-nums text-foreground",
                  // Свято має власний фон, тож тон тексту звіряємо з ним —
                  // відрізняє його колір числа. «Сьогодні» лишається сильнішим
                  // сигналом і перебиває: воно одне на весь місяць.
                  day.holiday && !day.today && toneTextClass.festive,
                  day.today &&
                    "mx-auto grid h-5 w-5 place-items-center rounded-full bg-primary text-primary-foreground"
                )}
              >
                {dayNumber(day.dateKey)}
              </div>
              {/* Крапка дублює колір для тих, хто його не розрізняє, і тримає
                  висоту шапки однаковою. Легенда під сіткою дає назву: на
                  тачі title недоступний. */}
              <div className="mt-0.5 flex h-1.5 items-center justify-center">
                {day.holiday ? (
                  <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", toneDotClass.festive)} />
                ) : null}
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
                <PersonHoverCardMaybe person={person.card ?? null} side="right">
                  <AvatarBase
                    src={person.avatarUrl}
                    name={person.name}
                    fallback={person.initials}
                    assetVariant="xs"
                    size={26}
                    inactive={person.inactive}
                    absence={person.absence ?? null}
                    suppressNativeTitle={Boolean(person.card)}
                  />
                </PersonHoverCardMaybe>
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
                  day.rest && !day.holiday && "bg-muted/40",
                  // Стовпчик свята фарбується НАСКРІЗЬ, а не лише в шапці:
                  // мітка вгорі губилась серед сірих вихідних.
                  day.holiday && HOLIDAY_COLUMN_CLASS,
                  day.today && "shadow-[inset_1.5px_0_0_hsl(var(--primary)/0.35),inset_-1.5px_0_0_hsl(var(--primary)/0.35)]",
                  canPick && "cursor-pointer hover:bg-primary/5"
                );
                const style = { gridColumn: `${index + 2} / ${index + 3}`, gridRow: 1 } as const;

                return canPick ? (
                  <button
                    key={day.dateKey}
                    type="button"
                    className={cn(cellClass, "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-foreground/20")}
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
                const tone = TEAM_ABSENCE_KIND_TONE[segment.absence.kind];
                const pending = segment.absence.status === "pending";
                const Icon = ABSENCE_KIND_ICONS[segment.absence.kind];
                const label = pending
                  ? `Запит · ${TEAM_ABSENCE_KIND_LABELS[segment.absence.kind]}`
                  : TEAM_ABSENCE_KIND_LABELS[segment.absence.kind];

                // Підпис показуємо за ФАКТИЧНОЮ шириною бару, а не за кількістю
                // днів: та сама триденна відпустка на 14-денному вікні має купу
                // місця, а на 31-денному дає обрізане «Відпу…». Тому бар — це
                // container, і підпис вмикається container-query, коли реально
                // влазить. Іконка є завжди: без неї одноденна відсутність
                // малювалась порожньою пігулкою.

                // Бар лежить ПОВЕРХ клітинок, тож без власного обробника він
                // просто з'їдав кліки: людина тицяла в пігулку, а нічого не
                // відбувалось. Owner/SEO відкриває запис, решта — потрапляє
                // туди ж, куди й клік по вільному дню під баром.
                const handleClick = onOpenAbsence
                  ? () => onOpenAbsence(segment.absence)
                  : canPick
                    ? () => onPickDay?.(person.userId, days[segment.startIndex])
                    : undefined;

                // «З дому» — контур замість заливки: заливка означає «людини
                // немає», а тут вона Є, просто не в офісі. Різниця зчитується
                // боковим зором, дальтоніку допомагає іконка будиночка.
                const wfhBar = segment.absence.kind === "wfh";
                const barClass = cn(
                  "z-10 mx-0.5 flex h-[26px] items-center gap-1.5 self-center overflow-hidden rounded-full border text-3xs font-semibold",
                  "[container-type:inline-size] justify-center px-0",
                  "@min-[96px]:justify-start @min-[96px]:px-2",
                  wfhBar
                    ? "border-[1.5px] border-[hsl(var(--success-foreground)/0.45)] bg-transparent text-[hsl(var(--success-foreground))]"
                    : toneBadgeClass[tone],
                  pending &&
                    "border-dashed [background-image:repeating-linear-gradient(45deg,transparent_0_5px,hsl(var(--card)/0.5)_5px_10px)]",
                  handleClick &&
                    "cursor-pointer transition-[filter,box-shadow] hover:brightness-[0.97] hover:shadow-[var(--shadow-elevated-sm)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-foreground/40"
                );

                const barStyle = {
                  gridColumn: `${segment.startIndex + 2} / ${segment.endIndex + 3}`,
                  gridRow: 1,
                } as const;

                const barContent = (
                  <>
                    <Icon className="h-3 w-3 shrink-0" aria-hidden />
                    <span className="hidden truncate @min-[96px]:inline">
                      {label}
                      {segment.clippedRight ? " →" : ""}
                    </span>
                  </>
                );

                return handleClick ? (
                  <button
                    key={segment.absence.id}
                    type="button"
                    className={barClass}
                    style={barStyle}
                    title={formatRangeTitle(segment.absence)}
                    aria-label={formatRangeTitle(segment.absence)}
                    onClick={handleClick}
                  >
                    {barContent}
                  </button>
                ) : (
                  <div
                    key={segment.absence.id}
                    className={barClass}
                    style={barStyle}
                    title={formatRangeTitle(segment.absence)}
                  >
                    {barContent}
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

    </div>
  );
}

export const AbsencePlanner = memo(AbsencePlannerImpl);
