import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

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
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { DEFAULT_ABSENCE_QUOTAS } from "@/lib/teamAbsenceCalendar";
import { listAbsenceQuotas, saveAbsenceQuota } from "@/lib/teamAbsenceQuotas";

/**
 * Редактор річних квот. Owner/SEO only — RLS на team_absence_quotas все одно
 * відхилить чужий запис, але кнопку показуємо лише тим, хто має право.
 *
 * Рядка в БД може не бути: тоді людина на дефолтах 18/6/10, і ми пишемо рядок
 * лише коли число справді змінили — щоб таблиця не заростала копіями дефолтів.
 */

export type QuotaEditorPerson = {
  userId: string;
  name: string;
  roleLabel: string;
  avatarUrl?: string | null;
  initials: string;
};

type Draft = { vacation: string; dayOff: string; sick: string };

function toDraft(vacation: number, dayOff: number, sick: number): Draft {
  return { vacation: String(vacation), dayOff: String(dayOff), sick: String(sick) };
}

function parseDay(value: string, fallback: number) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < 0) return fallback;
  return Math.min(parsed, 365);
}

export function QuotaEditorDialog({
  open,
  onOpenChange,
  workspaceId,
  year,
  people,
  currentUserId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string | null;
  year: number;
  people: QuotaEditorPerson[];
  currentUserId: string | null;
  onSaved: () => void;
}) {
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [initialDrafts, setInitialDrafts] = useState<Record<string, Draft>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !workspaceId) return;
    let active = true;
    setLoading(true);
    void listAbsenceQuotas({ workspaceId, year })
      .then((rows) => {
        if (!active) return;
        const byUser = new Map(rows.map((row) => [row.userId, row]));
        const next: Record<string, Draft> = {};
        people.forEach((person) => {
          const row = byUser.get(person.userId);
          next[person.userId] = toDraft(
            row?.vacationDays ?? DEFAULT_ABSENCE_QUOTAS.vacation,
            row?.dayOffDays ?? DEFAULT_ABSENCE_QUOTAS.day_off,
            row?.sickDays ?? DEFAULT_ABSENCE_QUOTAS.sick_leave
          );
        });
        setDrafts(next);
        setInitialDrafts(next);
      })
      .catch((error) => {
        console.error("[quotas] load failed", error);
        toast.error("Не вдалося завантажити квоти");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open, people, workspaceId, year]);

  const changedUserIds = useMemo(
    () =>
      Object.keys(drafts).filter((userId) => {
        const before = initialDrafts[userId];
        const after = drafts[userId];
        if (!before || !after) return false;
        return (
          before.vacation !== after.vacation ||
          before.dayOff !== after.dayOff ||
          before.sick !== after.sick
        );
      }),
    [drafts, initialDrafts]
  );

  const handleSave = async () => {
    if (!workspaceId || changedUserIds.length === 0) {
      onOpenChange(false);
      return;
    }
    setSaving(true);
    try {
      for (const userId of changedUserIds) {
        const draft = drafts[userId];
        await saveAbsenceQuota({
          workspaceId,
          userId,
          year,
          vacationDays: parseDay(draft.vacation, DEFAULT_ABSENCE_QUOTAS.vacation),
          dayOffDays: parseDay(draft.dayOff, DEFAULT_ABSENCE_QUOTAS.day_off),
          sickDays: parseDay(draft.sick, DEFAULT_ABSENCE_QUOTAS.sick_leave),
          updatedBy: currentUserId,
        });
      }
      toast.success(
        changedUserIds.length === 1 ? "Квоту оновлено" : `Оновлено квоти: ${changedUserIds.length}`
      );
      onSaved();
      onOpenChange(false);
    } catch (error) {
      console.error("[quotas] save failed", error);
      toast.error("Не вдалося зберегти квоти");
    } finally {
      setSaving(false);
    }
  };

  const setField = (userId: string, field: keyof Draft, next: string) => {
    setDrafts((prev) => ({ ...prev, [userId]: { ...prev[userId], [field]: next } }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Квоти на {year}</DialogTitle>
          <DialogDescription>
            Відпустка рахується КАЛЕНДАРНИМИ днями (свята всередині не
            списуються), day-off і лікарняний — робочими. За замовчуванням{" "}
            {DEFAULT_ABSENCE_QUOTAS.vacation} / {DEFAULT_ABSENCE_QUOTAS.day_off} /{" "}
            {DEFAULT_ABSENCE_QUOTAS.sick_leave}.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[52vh] overflow-y-auto pr-1">
          <div className="sticky top-0 z-10 grid grid-cols-[minmax(0,1fr)_64px_64px_64px] items-center gap-2 border-b border-border/50 bg-card px-1 pb-2 text-3xs font-semibold uppercase tracking-wide text-muted-foreground">
            <span>Людина</span>
            <span className="text-center">Відп.</span>
            <span className="text-center">Day-off</span>
            <span className="text-center">Лік.</span>
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Завантаження…
            </div>
          ) : (
            <div className="divide-y divide-border/40">
              {people.map((person) => {
                const draft = drafts[person.userId];
                if (!draft) return null;
                const changed = changedUserIds.includes(person.userId);
                return (
                  <div
                    key={person.userId}
                    className="grid grid-cols-[minmax(0,1fr)_64px_64px_64px] items-center gap-2 px-1 py-2"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <AvatarBase
                        src={person.avatarUrl}
                        name={person.name}
                        fallback={person.initials}
                        assetVariant="xs"
                        size={26}
                      />
                      <div className="min-w-0">
                        <div className={cn("truncate text-xs font-medium", changed && "text-primary")}>
                          {person.name}
                        </div>
                        <div className="truncate text-3xs text-muted-foreground">{person.roleLabel}</div>
                      </div>
                    </div>
                    <Input
                      inputMode="numeric"
                      controlSize="sm"
                      className="text-center tabular-nums"
                      value={draft.vacation}
                      aria-label={`Відпустка — ${person.name}`}
                      onChange={(event) => setField(person.userId, "vacation", event.target.value)}
                    />
                    <Input
                      inputMode="numeric"
                      controlSize="sm"
                      className="text-center tabular-nums"
                      value={draft.dayOff}
                      aria-label={`Day-off — ${person.name}`}
                      onChange={(event) => setField(person.userId, "dayOff", event.target.value)}
                    />
                    <Input
                      inputMode="numeric"
                      controlSize="sm"
                      className="text-center tabular-nums"
                      value={draft.sick}
                      aria-label={`Лікарняні — ${person.name}`}
                      onChange={(event) => setField(person.userId, "sick", event.target.value)}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter>
          <span className="mr-auto text-2xs text-muted-foreground">
            {changedUserIds.length > 0 ? `Змінено: ${changedUserIds.length}` : "Змін немає"}
          </span>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Скасувати
          </Button>
          <Button onClick={handleSave} disabled={saving || changedUserIds.length === 0}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            Зберегти
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
