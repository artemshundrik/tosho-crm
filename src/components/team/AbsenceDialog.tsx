import { useEffect, useMemo, useState } from "react";
import { CalendarRange, Info, Loader2, Trash2, Users } from "lucide-react";

import { AvatarBase } from "@/components/app/avatar-kit";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DateInput } from "@/components/ui/picker-input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { toneBadgeClass, toneTextClass } from "@/lib/statusTones";
import {
  ABSENCE_QUOTA_UNIT,
  ABSENCE_QUOTA_UNIT_LABEL,
  countQuotaDaysInYear,
} from "@/lib/teamAbsenceCalendar";
import { holidaysInRange } from "@/lib/teamAbsenceQuotas";
import { ABSENCE_KIND_ICONS } from "@/components/team/AbsenceKindChip";
import {
  isQuotaAbsenceKind,
  TEAM_ABSENCE_KIND_LABELS,
  TEAM_ABSENCE_KIND_OPTIONS,
  TEAM_ABSENCE_KIND_TONE,
  type TeamAbsenceKind,
} from "@/lib/teamAbsences";
import type { AbsenceBalance } from "@/lib/teamAbsenceQuotas";

/**
 * Створення/редагування відсутності.
 *
 * Ключова деталь: людина бачить ціну рішення ДО відправлення — скільки саме
 * днів квоти з'їсть діапазон і скільки лишиться. Без цього рядка «24 дні
 * відпустки» лишається абстракцією, а вихідні всередині діапазону здаються
 * втраченими.
 */

export type AbsenceDialogValue = {
  userId: string;
  startDate: string;
  endDate: string;
  kind: TeamAbsenceKind;
  comment: string;
};

export type AbsenceDialogPerson = {
  userId: string;
  name: string;
  roleLabel?: string;
  avatarUrl?: string | null;
  initials?: string;
};

/** Хто ще відсутній у ті самі дні — рахує викликач, діалог лише показує. */
export type AbsenceOwnConflict = {
  kindLabel: string;
  rangeLabel: string;
  pending: boolean;
  /** Точний збіг дат — тоді це вже не «перетин», а дубль, і його блокуємо. */
  exact: boolean;
};

export type AbsenceOverlap = { userId: string; name: string; rangeLabel: string; pending: boolean };

function addDaysKey(dateKey: string, delta: number) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

function calendarSpan(startKey: string, endKey: string) {
  const start = new Date(`${startKey}T00:00:00Z`).getTime();
  const end = new Date(`${endKey}T00:00:00Z`).getTime();
  return Math.round((end - start) / 86400000) + 1;
}

/** «24.08» — короткий підпис святкового дня всередині діапазону. */
function formatHolidayShort(dateKey: string) {
  return `${dateKey.slice(8, 10)}.${dateKey.slice(5, 7)}`;
}

function pluralDays(count: number) {
  const mod100 = count % 100;
  const mod10 = count % 10;
  if (mod100 >= 11 && mod100 <= 14) return "днів";
  if (mod10 === 1) return "день";
  if (mod10 >= 2 && mod10 <= 4) return "дні";
  return "днів";
}

/**
 * Межі самостійного лікарняного — ДЗЕРКАЛО правил у БД
 * (scripts/team-absences-selfservice.sql). Тут вони лише для того, щоб
 * людина побачила проблему до відправлення; стіною лишається база.
 *
 * Обмежені обидва кінці: «хворію до кінця наступного місяця» обнуляє норму
 * дизайнера так само ефективно, як лікарняний заднім числом.
 */
export const SELF_SICK_BACKDATE_DAYS = 7;
export const SELF_SICK_FORWARD_DAYS = 14;
export const SELF_SICK_MAX_LENGTH_DAYS = 14;

export function AbsenceDialog({
  open,
  onOpenChange,
  initial,
  people,
  canPickPerson,
  balanceOf,
  exceptions,
  holidayNames,
  saving,
  editing,
  mode = "manage",
  approverLabel,
  todayKey,
  findOverlaps,
  findOwnConflict,
  editingId,
  onSubmit,
  onDelete,
  deleting,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: AbsenceDialogValue;
  /** Список для вибору людини — лише коли можна вносити за інших. */
  people: AbsenceDialogPerson[];
  canPickPerson: boolean;
  /** Баланс людини, якщо він видимий викликачу. */
  balanceOf: (userId: string) => AbsenceBalance | null;
  exceptions?: Map<string, boolean>;
  /** день → назва свята: пояснює, чому діапазон з'їв менше, ніж здається. */
  holidayNames?: Map<string, string>;
  saving?: boolean;
  editing?: boolean;
  /** `request` — співробітник просить за себе; `manage` — owner/SEO вносить факт. */
  mode?: "manage" | "request";
  approverLabel?: string;
  todayKey?: string;
  /** Повертає колег, чиї відсутності перетинаються з обраним діапазоном. */
  findOverlaps?: (params: { userId: string; startDate: string; endDate: string }) => AbsenceOverlap[];
  /** Власний запис людини, що перетинає діапазон, — захист від дубля. */
  findOwnConflict?: (params: { userId: string; startDate: string; endDate: string }) => AbsenceOwnConflict | null;
  /** Id запису, який редагуємо: сам себе конфліктом вважати не можна. */
  editingId?: string | null;
  onSubmit: (value: AbsenceDialogValue) => void;
  /** Видалити запис, який редагуємо. Немає — кнопки видалення теж немає. */
  onDelete?: () => void;
  deleting?: boolean;
}) {
  const [value, setValue] = useState<AbsenceDialogValue>(initial);
  // Другий клік по «Видалити» — це і є підтвердження. Скидаємо на кожному
  // відкритті, щоб діалог ніколи не відкривався вже зведеним на видалення.
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (open) {
      setValue(initial);
      setConfirmDelete(false);
    }
  }, [initial, open]);

  const rangeInvalid = Boolean(value.startDate && value.endDate && value.endDate < value.startDate);

  // Одиниця залежить від типу: відпустка — календарні дні, day-off і
  // лікарняний — робочі. «Інше» квоти не має, показуємо робочими.
  const quotaKind = isQuotaAbsenceKind(value.kind) ? value.kind : "day_off";
  const chargedDays = useMemo(() => {
    if (!value.startDate || !value.endDate || rangeInvalid) return 0;
    return countQuotaDaysInYear(
      quotaKind,
      { startDate: value.startDate, endDate: value.endDate },
      Number(value.startDate.slice(0, 4)),
      exceptions
    );
  }, [exceptions, quotaKind, rangeInvalid, value.endDate, value.startDate]);
  const unitLabel = ABSENCE_QUOTA_UNIT_LABEL[ABSENCE_QUOTA_UNIT[quotaKind]];

  // Свята у вибраному діапазоні. Без цього рядка «6 днів, а списалось 5»
  // виглядає як помилка розрахунку.
  const rangeHolidays = useMemo(() => {
    if (!holidayNames || !value.startDate || !value.endDate || rangeInvalid) return [];
    return holidaysInRange(holidayNames, value.startDate, value.endDate);
  }, [holidayNames, rangeInvalid, value.endDate, value.startDate]);

  const balance = balanceOf(value.userId);
  const bucket = balance && isQuotaAbsenceKind(value.kind) ? balance[value.kind] : null;
  const remainingAfter = bucket ? bucket.remaining - chargedDays : null;

  const isRequest = mode === "request";
  // «Інше» — керований тип (відрядження, форс-мажор), його вносить лише
  // owner/SEO, тож у режимі заявки він зі списку зникає.
  const kindOptions = isRequest
    ? TEAM_ABSENCE_KIND_OPTIONS.filter((option) => option.value !== "other")
    : TEAM_ABSENCE_KIND_OPTIONS;

  const sickAsFact = isRequest && value.kind === "sick_leave";

  const earliestSelfSick = todayKey ? addDaysKey(todayKey, -SELF_SICK_BACKDATE_DAYS) : null;
  const latestSelfSick = todayKey ? addDaysKey(todayKey, SELF_SICK_FORWARD_DAYS) : null;
  const sickTooOld = Boolean(
    sickAsFact && earliestSelfSick && value.startDate && value.startDate < earliestSelfSick
  );
  const sickTooFar = Boolean(
    sickAsFact && latestSelfSick && value.endDate && value.endDate > latestSelfSick
  );
  const sickTooLong = Boolean(
    sickAsFact &&
      value.startDate &&
      value.endDate &&
      !rangeInvalid &&
      calendarSpan(value.startDate, value.endDate) > SELF_SICK_MAX_LENGTH_DAYS + 1
  );
  // Понад річну квоту лікарняний вносить керівництво — база відхилить, тож
  // не даємо натиснути «Зафіксувати» наосліп.
  const sickOverQuota = Boolean(sickAsFact && remainingAfter !== null && remainingAfter < 0);

  const sickBlocked = sickTooOld || sickTooFar || sickTooLong || sickOverQuota;

  // Перетини рахуємо на клієнті з уже завантаженого року — це підказка, а не
  // заборона: два дизайнери у відпустці одночасно бувають виправдані, але
  // рішення має ухвалюватись із цим фактом перед очима, а не постфактум.
  const overlaps = useMemo(() => {
    if (!findOverlaps || !value.startDate || !value.endDate || rangeInvalid) return [];
    return findOverlaps({ userId: value.userId, startDate: value.startDate, endDate: value.endDate });
  }, [findOverlaps, rangeInvalid, value.endDate, value.startDate, value.userId]);

  // Власний запис на ті самі дати. Точний збіг блокуємо тут же: у БД на нього
  // стоїть тригер, але зловити помилку після кліку — гірше, ніж не дати
  // натиснути. Під час редагування запис не конфліктує сам із собою.
  const ownConflict = useMemo(() => {
    if (editingId || !findOwnConflict || !value.startDate || !value.endDate || rangeInvalid) return null;
    return findOwnConflict({ userId: value.userId, startDate: value.startDate, endDate: value.endDate });
  }, [editingId, findOwnConflict, rangeInvalid, value.endDate, value.startDate, value.userId]);

  const canSubmit =
    Boolean(value.userId && value.startDate && value.endDate) &&
    !rangeInvalid &&
    !sickBlocked &&
    !saving &&
    !ownConflict?.exact;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[480px]">
        <DialogHeader>
          <DialogTitle>
            {editing
              ? "Редагувати відсутність"
              : isRequest
                ? "Запросити відсутність"
                : "Додати відсутність"}
          </DialogTitle>
          <DialogDescription>
            {isRequest
              ? sickAsFact
                ? "Лікарняний погодження не потребує — фіксуємо одразу і повідомляємо керівництво."
                : value.kind === "wfh"
                  ? `Квоту не списує і норму не ріже. Заявка піде на погодження${approverLabel ? ` — ${approverLabel}` : ""}.`
                  : `Заявка піде на погодження${approverLabel ? ` — ${approverLabel}` : ""}. Скасувати можна, поки її не вирішили.`
              : "Вихідні та свята всередині діапазону квоту не списують."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {canPickPerson ? (
            <div className="space-y-1.5">
              <Label htmlFor="absence-person">Хто</Label>
              <Select
                value={value.userId}
                onValueChange={(next) => setValue((prev) => ({ ...prev, userId: next }))}
              >
                <SelectTrigger id="absence-person">
                  <SelectValue placeholder="Оберіть людину" />
                </SelectTrigger>
                <SelectContent>
                  {people.map((person) => (
                    <SelectItem key={person.userId} value={person.userId}>
                      <span className="flex items-center gap-2.5">
                        <AvatarBase
                          src={person.avatarUrl}
                          name={person.name}
                          fallback={person.initials ?? "•"}
                          assetVariant="xs"
                          size={24}
                        />
                        <span>{person.name}</span>
                        {person.roleLabel ? (
                          <span className="text-2xs text-muted-foreground">· {person.roleLabel}</span>
                        ) : null}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label>Тип</Label>
            {/* Сегменти замість дропдауна: варіантів мало, і всі мають бути
                видні одразу — зайвий клік тут нічого не дає. */}
            <div
              role="radiogroup"
              aria-label="Тип відсутності"
              className={cn(
                "grid gap-1 rounded-xl border border-border/50 bg-muted/40 p-1",
                // 5 типів в один рядок уже не влазять — підписи ламались на
                // два рядки і пігулки пливли по висоті. Сітка дає рівні ряди:
                // 5 → 3+2; 4 (режим заявки) → 2×2 на вузькому, один ряд на sm.
                kindOptions.length > 4 ? "grid-cols-3" : "grid-cols-2 sm:grid-cols-4"
              )}
            >
              {kindOptions.map((option) => {
                const KindIcon = ABSENCE_KIND_ICONS[option.value];
                const active = value.kind === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setValue((prev) => ({ ...prev, kind: option.value }))}
                    className={cn(
                      "flex h-9 w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-2 text-xs font-medium transition-all duration-200",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20",
                      active
                        ? cn("", toneBadgeClass[TEAM_ABSENCE_KIND_TONE[option.value]])
                        : "text-muted-foreground hover:bg-background/60 hover:text-foreground"
                    )}
                  >
                    <KindIcon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="absence-start">З</Label>
              <DateInput
                id="absence-start"
                value={value.startDate}
                onChange={(event) => {
                  const startDate = event.target.value;
                  setValue((prev) => ({
                    ...prev,
                    startDate,
                    // Один день — найчастіший випадок: тягнемо кінець за початком,
                    // поки користувач не задав його свідомо.
                    endDate: !prev.endDate || prev.endDate < startDate ? startDate : prev.endDate,
                  }));
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="absence-end">По</Label>
              <DateInput
                id="absence-end"
                value={value.endDate}
                min={value.startDate || undefined}
                onChange={(event) => setValue((prev) => ({ ...prev, endDate: event.target.value }))}
              />
            </div>
          </div>

          {rangeInvalid ? (
            <p className="text-xs text-destructive">Кінець періоду раніше за початок.</p>
          ) : (
            <div
              className={cn(
                "flex items-start gap-2 rounded-[var(--radius-inner)] border px-3 py-2.5 text-xs",
                remainingAfter !== null && remainingAfter < 0
                  ? "tone-warning"
                  : "tone-info"
              )}
            >
              {remainingAfter !== null && remainingAfter < 0 ? (
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              ) : (
                <CalendarRange className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              )}
              <span>
                <b className="font-semibold tabular-nums">
                  {chargedDays} {pluralDays(chargedDays)}
                </b>{" "}
                {unitLabel}
                {rangeHolidays.length > 0 ? (
                  <>
                    {" "}
                    {rangeHolidays.length === 1
                      ? `${formatHolidayShort(rangeHolidays[0].dateKey)} — ${rangeHolidays[0].name}, цей день не списується.`
                      : `${rangeHolidays.length} святкові дні всередині не списуються (${rangeHolidays
                          .map((holiday) => formatHolidayShort(holiday.dateKey))
                          .join(", ")}).`}
                  </>
                ) : null}
                {bucket ? (
                  remainingAfter !== null && remainingAfter < 0 ? (
                    <>
                      {" "}
                      Це більше за залишок: доступно {bucket.remaining} із {bucket.quota}{" "}
                      {TEAM_ABSENCE_KIND_LABELS[value.kind].toLowerCase()}.
                    </>
                  ) : (
                    <>
                      {" "}
                      Після цього залишиться{" "}
                      <b className="font-semibold tabular-nums">{remainingAfter}</b> із {bucket.quota}.
                    </>
                  )
                ) : null}
              </span>
            </div>
          )}

          {overlaps.length > 0 ? (
            <div className="rounded-[var(--radius-inner)] border border-warning-soft-border bg-warning-soft/60 px-3 py-2.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-warning-foreground">
                <Users className="h-3.5 w-3.5 shrink-0" aria-hidden />
                У ці ж дні відсутні ще {overlaps.length}
              </div>
              <ul className="mt-1.5 space-y-0.5">
                {overlaps.slice(0, 4).map((overlap) => (
                  <li key={overlap.userId + overlap.rangeLabel} className="text-2xs text-foreground/80">
                    {overlap.name} · {overlap.rangeLabel}
                    {overlap.pending ? " (на погодженні)" : ""}
                  </li>
                ))}
                {overlaps.length > 4 ? (
                  <li className="text-2xs text-muted-foreground">… і ще {overlaps.length - 4}</li>
                ) : null}
              </ul>
            </div>
          ) : null}

          {ownConflict ? (
            <p className={cn("text-xs", ownConflict.exact ? "text-destructive" : toneTextClass.warning)}>
              {ownConflict.exact
                ? `Така заявка вже подана: ${ownConflict.kindLabel.toLowerCase()} ${ownConflict.rangeLabel}${
                    ownConflict.pending ? " — чекає рішення" : ""
                  }.`
                : `Ці дати вже перетинаються з вашим записом: ${ownConflict.kindLabel.toLowerCase()} ${
                    ownConflict.rangeLabel
                  }${ownConflict.pending ? " (на погодженні)" : ""}.`}
            </p>
          ) : null}

          {sickBlocked ? (
            <p className="text-xs text-destructive">
              {sickTooOld
                ? `Лікарняний заднім числом можна вносити не глибше ніж на ${SELF_SICK_BACKDATE_DAYS} днів.`
                : sickTooFar
                  ? `Лікарняний наперед можна вносити не далі ніж на ${SELF_SICK_FORWARD_DAYS} днів.`
                  : sickTooLong
                    ? `Самостійно можна зафіксувати не більше ніж ${SELF_SICK_MAX_LENGTH_DAYS} днів поспіль.`
                    : "Це більше за річний залишок лікарняних."}{" "}
              Довший лікарняний вносить керівництво.
            </p>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="absence-comment">Коментар</Label>
            <Textarea
              id="absence-comment"
              value={value.comment}
              placeholder="Необовʼязково"
              onChange={(event) => setValue((prev) => ({ ...prev, comment: event.target.value }))}
              className="min-h-[72px]"
            />
          </div>
        </div>

        <DialogFooter className="sm:justify-between">
          {/* Видалення живе тут, бо саме сюди приводить клік по відсутності в
              календарі: відкрив — і або правиш, або прибираєш. Підтвердження
              двокрокове прямо в кнопці, а не окремим діалогом: вкладені модалки
              в цьому проєкті ловлять фокус, а рішення тут одне й оборотне
              (відсутність можна внести заново). */}
          {editing && onDelete ? (
            <Button
              variant="ghost"
              onClick={() => (confirmDelete ? onDelete() : setConfirmDelete(true))}
              disabled={saving || deleting}
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : (
                <Trash2 className="h-4 w-4" aria-hidden />
              )}
              {confirmDelete ? "Точно видалити?" : "Видалити"}
            </Button>
          ) : (
            <span className="hidden sm:block" />
          )}
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving || deleting}>
              Скасувати
            </Button>
            <Button onClick={() => onSubmit(value)} disabled={!canSubmit || deleting}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              {editing ? "Зберегти" : isRequest ? (sickAsFact ? "Зафіксувати" : "Надіслати заявку") : "Додати"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
