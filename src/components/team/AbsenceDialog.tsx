import { useEffect, useMemo, useState } from "react";
import { CalendarRange, Info, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { countBusinessDays } from "@/lib/teamAbsenceCalendar";
import {
  isQuotaAbsenceKind,
  TEAM_ABSENCE_KIND_LABELS,
  TEAM_ABSENCE_KIND_OPTIONS,
  type TeamAbsenceKind,
} from "@/lib/teamAbsences";
import type { AbsenceBalance } from "@/lib/teamAbsenceQuotas";

/**
 * Створення/редагування відсутності.
 *
 * Ключова деталь: людина бачить ціну рішення ДО відправлення — скільки саме
 * робочих днів з'їсть діапазон і скільки лишиться. Без цього рядка «18 днів
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

export type AbsenceDialogPerson = { userId: string; name: string };

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
  saving,
  editing,
  mode = "manage",
  approverLabel,
  todayKey,
  onSubmit,
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
  saving?: boolean;
  editing?: boolean;
  /** `request` — співробітник просить за себе; `manage` — owner/SEO вносить факт. */
  mode?: "manage" | "request";
  approverLabel?: string;
  todayKey?: string;
  onSubmit: (value: AbsenceDialogValue) => void;
}) {
  const [value, setValue] = useState<AbsenceDialogValue>(initial);

  useEffect(() => {
    if (open) setValue(initial);
  }, [initial, open]);

  const rangeInvalid = Boolean(value.startDate && value.endDate && value.endDate < value.startDate);

  const businessDays = useMemo(() => {
    if (!value.startDate || !value.endDate || rangeInvalid) return 0;
    return countBusinessDays(value.startDate, value.endDate, exceptions);
  }, [exceptions, rangeInvalid, value.endDate, value.startDate]);

  const balance = balanceOf(value.userId);
  const bucket = balance && isQuotaAbsenceKind(value.kind) ? balance[value.kind] : null;
  const remainingAfter = bucket ? bucket.remaining - businessDays : null;

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

  const canSubmit =
    Boolean(value.userId && value.startDate && value.endDate) && !rangeInvalid && !sickBlocked && !saving;

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
                      {person.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="absence-kind">Тип</Label>
            <Select
              value={value.kind}
              onValueChange={(next) => setValue((prev) => ({ ...prev, kind: next as TeamAbsenceKind }))}
            >
              <SelectTrigger id="absence-kind">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {kindOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="absence-start">З</Label>
              <Input
                id="absence-start"
                type="date"
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
              <Input
                id="absence-end"
                type="date"
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
                  {businessDays} {pluralDays(businessDays)}
                </b>{" "}
                робочих.
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

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Скасувати
          </Button>
          <Button onClick={() => onSubmit(value)} disabled={!canSubmit}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            {editing ? "Зберегти" : isRequest ? (sickAsFact ? "Зафіксувати" : "Надіслати заявку") : "Додати"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
