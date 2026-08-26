import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarPlus, Loader2, PartyPopper, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyStateCard } from "@/components/ui/empty-state-card";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/picker-input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { toneTextClass } from "@/lib/statusTones";
import { deleteHoliday, listHolidays, upsertHoliday, type HolidayRow } from "@/lib/teamAbsenceQuotas";

/**
 * Календар свят компанії. Owner/CEO — RLS на ua_workday_exceptions однаково
 * відхилить чужий запис, але кнопку показуємо лише тим, хто має право.
 *
 * НАВІЩО ЦЕ В ІНТЕРФЕЙСІ, а не в SQL-скрипті: перехідні свята (Великдень,
 * Трійця) щороку припадають на нові дати, тож «внести наступний рік» — це
 * регулярна робота, і вона не має вимагати розробника.
 *
 * Свято = рядок `is_workday = false`. Робочу суботу цей екран не показує й не
 * створює: вона теж виняток календаря, але це не свято.
 */

const MONTHS = [
  "січня", "лютого", "березня", "квітня", "травня", "червня",
  "липня", "серпня", "вересня", "жовтня", "листопада", "грудня",
];

function formatHolidayDate(dateKey: string) {
  const month = Number(dateKey.slice(5, 7));
  const day = Number(dateKey.slice(8, 10));
  if (!month || !day) return dateKey;
  return `${day} ${MONTHS[month - 1] ?? ""}`;
}

function weekdayLabel(dateKey: string) {
  const date = new Date(`${dateKey}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("uk-UA", { weekday: "short", timeZone: "UTC" }).format(date);
}

/** Субота/неділя: таке свято на квоту не впливає — попереджаємо одразу. */
function isWeekend(dateKey: string) {
  const weekday = new Date(`${dateKey}T12:00:00Z`).getUTCDay();
  return weekday === 0 || weekday === 6;
}

export function HolidayEditorDialog({
  open,
  onOpenChange,
  workspaceId,
  year,
  currentUserId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string | null;
  year: number;
  currentUserId: string | null;
  onSaved?: () => void;
}) {
  const [rows, setRows] = useState<HolidayRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [removingKey, setRemovingKey] = useState<string | null>(null);
  const [draftDate, setDraftDate] = useState("");
  const [draftName, setDraftName] = useState("");

  const reload = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      setRows(await listHolidays({ workspaceId, year }));
    } catch (error) {
      console.error("[team] holidays load failed", error);
      toast.error("Не вдалося завантажити свята");
    } finally {
      setLoading(false);
    }
  }, [workspaceId, year]);

  useEffect(() => {
    if (!open) return;
    setDraftDate("");
    setDraftName("");
    void reload();
  }, [open, reload]);

  const canAdd = Boolean(
    workspaceId && draftDate && draftName.trim() && draftDate.slice(0, 4) === String(year)
  );

  const wrongYear = Boolean(draftDate && draftDate.slice(0, 4) !== String(year));

  const handleAdd = useCallback(async () => {
    if (!workspaceId || !canAdd) return;
    setSaving(true);
    try {
      await upsertHoliday({
        workspaceId,
        dateKey: draftDate,
        name: draftName,
        updatedBy: currentUserId,
      });
      setDraftDate("");
      setDraftName("");
      await reload();
      onSaved?.();
      toast.success("Свято додано");
    } catch (error) {
      console.error("[team] holiday save failed", error);
      toast.error(error instanceof Error ? error.message : "Не вдалося зберегти");
    } finally {
      setSaving(false);
    }
  }, [canAdd, currentUserId, draftDate, draftName, onSaved, reload, workspaceId]);

  const handleDelete = useCallback(
    async (dateKey: string) => {
      if (!workspaceId) return;
      setRemovingKey(dateKey);
      try {
        await deleteHoliday({ workspaceId, dateKey });
        await reload();
        onSaved?.();
        toast.success("День прибрано з календаря");
      } catch (error) {
        console.error("[team] holiday delete failed", error);
        toast.error(error instanceof Error ? error.message : "Не вдалося прибрати");
      } finally {
        setRemovingKey(null);
      }
    },
    [onSaved, reload, workspaceId]
  );

  const workingDayCount = useMemo(() => rows.filter((row) => !isWeekend(row.dateKey)).length, [rows]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PartyPopper className={cn("h-4 w-4", toneTextClass.festive)} aria-hidden />
            Календар свят — {year}
          </DialogTitle>
          <DialogDescription>
            Святкові дні не списують квоту відсутностей і не додають нормо-днів. Перехідні
            свята (Великдень, Трійця) щороку припадають на нові дати — вносьте їх тут.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-[150px_1fr_auto] sm:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="holiday-date">Дата</Label>
              <DateInput
                id="holiday-date"
                value={draftDate}
                min={`${year}-01-01`}
                max={`${year}-12-31`}
                onChange={(event) => setDraftDate(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="holiday-name">Назва</Label>
              <Input
                id="holiday-name"
                value={draftName}
                placeholder="День Незалежності"
                maxLength={200}
                onChange={(event) => setDraftName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && canAdd) void handleAdd();
                }}
              />
            </div>
            <Button onClick={() => void handleAdd()} disabled={!canAdd || saving} className="sm:mb-0">
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <CalendarPlus className="h-4 w-4" aria-hidden />
              )}
              Додати
            </Button>
          </div>

          {wrongYear ? (
            <p className={cn("text-2xs", toneTextClass.warning)}>
              Дата поза {year} роком — перемкніть рік на сторінці, щоб її внести.
            </p>
          ) : draftDate && isWeekend(draftDate) ? (
            <p className="text-2xs text-muted-foreground">
              Це субота або неділя — на квоту запис не вплине.
            </p>
          ) : null}

          <div className="rounded-inner border border-border/60">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                Завантажуємо…
              </div>
            ) : rows.length === 0 ? (
              <EmptyStateCard
                badgeLabel="Календар порожній"
                title={`За ${year} рік свят не внесено`}
                description="Поки жодного дня немає, робочими вважаються всі пн–пт."
                className="border-0"
              />
            ) : (
              <div className="divide-y divide-border/40">
                {rows.map((row) => (
                  <div key={row.dateKey} className="group flex items-center gap-3 px-3 py-2">
                    <span className="w-[92px] shrink-0 text-xs">
                      <b className="font-semibold tabular-nums text-foreground">
                        {formatHolidayDate(row.dateKey)}
                      </b>
                      <span className="ml-1 text-muted-foreground">{weekdayLabel(row.dateKey)}</span>
                    </span>
                    <span className="min-w-0 flex-1 truncate text-xs text-foreground">{row.name}</span>
                    {/*
                      Робоче свято підписуємо окремо: у списку воно виглядає
                      точно як будь-яке інше, і без позначки неможливо зрозуміти,
                      чому норма місяця не зменшилась.
                    */}
                    {row.isWorkday ? (
                      <span className="shrink-0 text-3xs text-muted-foreground">працюємо</span>
                    ) : isWeekend(row.dateKey) ? (
                      <span className="shrink-0 text-3xs text-muted-foreground">вихідний</span>
                    ) : null}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-11 w-11 shrink-0 text-destructive sm:h-8 sm:w-8 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
                      onClick={() => void handleDelete(row.dateKey)}
                      disabled={removingKey === row.dateKey}
                      aria-label={`Прибрати ${formatHolidayDate(row.dateKey)}`}
                    >
                      {removingKey === row.dateKey ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      )}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {rows.length > 0 ? (
            <p className="text-2xs text-muted-foreground">
              Усього {rows.length}, з них на робочі дні припадає{" "}
              <b className="font-medium text-foreground">{workingDayCount}</b> — саме вони
              зменшують нормо-дні й не списують квоту.
            </p>
          ) : null}

          {/* Той самий календар рахує норми дизайнерів, тож правка за минулий
              місяць змінює цифри в їхньому дашборді. Виплачене вона не рухає,
              але розбіжність варто побачити ДО збереження, а не після. */}
          <p className="text-2xs text-muted-foreground/80">
            Зміни за вже минулі місяці перерахують нормо-дні дизайнерів. Виплачені суми
            вони не чіпають, але цифри в дашборді зміняться.
          </p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Готово
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
