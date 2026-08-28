import { useEffect, useState } from "react";
import { Building2, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ABSENCE_KIND_ICONS } from "@/lib/absenceIndicator";
import { cn } from "@/lib/utils";
import {
  WEEKDAY_SHORT_LABELS,
  WORK_MODE_LABELS,
  type IsoWeekday,
  type ScheduleDays,
  type TeamWorkSchedule,
  type WorkMode,
} from "@/lib/teamWorkSchedule";
import {
  clearWorkSchedule,
  loadActiveWorkSchedule,
  saveWorkSchedule,
} from "@/lib/teamWorkScheduleQueries";

/**
 * Постійний графік людини в картці: які дні вона в офісі, а які з дому.
 *
 * ОДНА МОВА З ПЛАНЕРОМ. День «з дому» намальований рівно тим, чим бар на
 * планері «Календаря»: КОНТУР кольору success і будиночок — заливка там
 * означає «людини немає», а тут вона Є, просто не в офісі. Перша редакція
 * заливала день власним зеленим (`success-soft`), і поруч із календарем це
 * читалось як третій, невідомий стан.
 *
 * ЧОМУ ЛИШЕ ПН–ПТ. Субота й неділя — вихідні для всіх, і графік їх не
 * стосується: розгортання все одно пропускає неробочі дні, тож перемикач на
 * них обіцяв би роботу, якої не буде.
 *
 * ЧОМУ БЕЗ ПОГОДЖЕННЯ. Це не заявка, а рішення керівника: він ставить графік,
 * і той діє одразу. Кнопку бачать лише owner і СЕО — RLS відхилить чужий запис
 * і без цього, але показувати недоступну дію немає сенсу.
 */

const WORKWEEK: IsoWeekday[] = [1, 2, 3, 4, 5];

const HomeIcon = ABSENCE_KIND_ICONS.wfh;

/**
 * Класи бара «з дому» з планера — узяті звідти дослівно, щоб при зміні там
 * розбіжність була видима одразу, а не через місяць на чужому знімку екрана.
 */
const REMOTE_PILL =
  "border-[1.5px] border-[hsl(var(--success-foreground)/0.45)] bg-transparent text-[hsl(var(--success-foreground))]";
const OFFICE_PILL = "border border-border/60 bg-transparent text-muted-foreground";

/** Пігулка одного дня: у перегляді — підпис, у редакторі — кнопка. */
function DayPill({
  day,
  mode,
  onClick,
}: {
  day: IsoWeekday;
  mode: WorkMode;
  onClick?: () => void;
}) {
  const remote = mode === "remote";
  const Icon = remote ? HomeIcon : Building2;
  const className = cn(
    "inline-flex h-[26px] min-w-[4.25rem] items-center justify-center gap-1.5 rounded-full px-2.5 text-3xs font-semibold",
    remote ? REMOTE_PILL : OFFICE_PILL,
    onClick && "cursor-pointer transition-[filter,box-shadow] hover:brightness-[0.97]"
  );
  const content = (
    <>
      <Icon className="h-3 w-3 shrink-0" aria-hidden />
      {WEEKDAY_SHORT_LABELS[day]}
    </>
  );
  if (!onClick) {
    return (
      <span className={className} title={`${WEEKDAY_SHORT_LABELS[day]} — ${WORK_MODE_LABELS[mode]}`}>
        {content}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={remote}
      title={`${WEEKDAY_SHORT_LABELS[day]} — ${WORK_MODE_LABELS[mode]}`}
      className={cn(className, "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-foreground/40")}
    >
      {content}
    </button>
  );
}

function summarize(days: ScheduleDays): string {
  const remote = WORKWEEK.filter((day) => days[day] === "remote");
  if (remote.length === 0) return "Щодня в офісі";
  if (remote.length === WORKWEEK.length) return "Щодня з дому";
  return `${remote.map((day) => WEEKDAY_SHORT_LABELS[day]).join(", ")} — з дому`;
}

function sameDays(a: ScheduleDays, b: ScheduleDays): boolean {
  return WORKWEEK.every((day) => (a[day] ?? "office") === (b[day] ?? "office"));
}

const DEFAULT_DAYS: ScheduleDays = { 1: "office", 2: "office", 3: "office", 4: "office", 5: "office" };

export function WorkScheduleCard({
  workspaceId,
  userId,
  actorUserId,
  canManage,
}: {
  workspaceId: string | null;
  userId: string;
  actorUserId: string | null;
  canManage: boolean;
}) {
  const [schedule, setSchedule] = useState<TeamWorkSchedule | null>(null);
  const [draft, setDraft] = useState<ScheduleDays>(DEFAULT_DAYS);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!workspaceId) {
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    void loadActiveWorkSchedule({ workspaceId, userId })
      .then((row) => {
        if (!active) return;
        setSchedule(row);
        setDraft(row ? { ...DEFAULT_DAYS, ...row.days } : DEFAULT_DAYS);
      })
      .catch((error) => {
        console.error("Failed to load work schedule", error);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [workspaceId, userId]);

  const toggleDay = (day: IsoWeekday) => {
    setDraft((prev) => ({
      ...prev,
      [day]: (prev[day] ?? "office") === "remote" ? "office" : "remote",
    }));
  };

  const handleSave = async () => {
    if (!workspaceId) return;
    setSaving(true);
    try {
      const everyDayInOffice = WORKWEEK.every((day) => (draft[day] ?? "office") === "office");
      // «Щодня в офісі» — це відсутність графіка, а не графік із п'яти офісів:
      // інакше картка казала б «графік задано» там, де нічого не задано.
      if (everyDayInOffice && schedule) {
        await clearWorkSchedule({ workspaceId, scheduleId: schedule.id });
        setSchedule(null);
        setEditing(false);
        toast.success("Графік прибрано");
        return;
      }
      if (everyDayInOffice) {
        setEditing(false);
        return;
      }
      await saveWorkSchedule({
        workspaceId,
        userId,
        days: draft,
        actorUserId,
        existingId: schedule?.id ?? null,
      });
      const saved = await loadActiveWorkSchedule({ workspaceId, userId });
      setSchedule(saved);
      setDraft(saved ? { ...DEFAULT_DAYS, ...saved.days } : DEFAULT_DAYS);
      setEditing(false);
      toast.success("Графік збережено", { description: summarize(draft) });
    } catch (error) {
      console.error("Failed to save work schedule", error);
      toast.error("Не вдалося зберегти графік");
    } finally {
      setSaving(false);
    }
  };

  const current: ScheduleDays = schedule ? { ...DEFAULT_DAYS, ...schedule.days } : DEFAULT_DAYS;
  const dirty = !sameDays(draft, current);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-2 text-2xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Графік…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 border-t border-border/40 py-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <span className="w-[8.5rem] shrink-0 text-2xs leading-5 text-muted-foreground">Графік роботи</span>
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          {schedule ? (
            <>
              {/* Тиждень видно, а не переказано словами: у планері він теж
                  тиждень, і око переносить одну картинку на іншу без зусиль. */}
              {WORKWEEK.map((day) => (
                <DayPill key={day} day={day} mode={(current[day] ?? "office") as WorkMode} />
              ))}
              <span className="ml-1 text-2xs text-muted-foreground">{summarize(current)}</span>
            </>
          ) : (
            <span className="text-[15px] font-normal leading-snug text-muted-foreground">
              Звичайний тиждень в офісі
            </span>
          )}
        </span>
        {canManage ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-2xs"
            onClick={() => setEditing((prev) => !prev)}
          >
            {editing ? "Згорнути" : schedule ? "Змінити" : "Задати"}
          </Button>
        ) : null}
      </div>

      {editing ? (
        <div className="flex flex-col gap-2.5 rounded-[var(--radius-md)] border border-border/50 p-3">
          <p className="text-2xs leading-relaxed text-muted-foreground">
            Тисніть день, щоб перемкнути його між офісом і домом. Графік діє одразу й до скасування;
            свята й відпустки його перекривають.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {WORKWEEK.map((day) => (
              <DayPill
                key={day}
                day={day}
                mode={(draft[day] ?? "office") as WorkMode}
                onClick={() => toggleDay(day)}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" disabled={saving || !dirty} onClick={() => void handleSave()}>
              {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
              Зберегти
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={saving}
              onClick={() => {
                setDraft(current);
                setEditing(false);
              }}
            >
              Скасувати
            </Button>
            <span className="ml-auto text-2xs text-muted-foreground">{summarize(draft)}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
