import { useMemo, useState } from "react";
import { Copy } from "lucide-react";
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
import { cn } from "@/lib/utils";
import {
  eachDateKey,
  ABSENCE_QUOTA_UNIT,
  isBusinessDay,
  isVacationChargeableDay,
  QUOTA_ABSENCE_KINDS,
  type QuotaAbsenceKind,
} from "@/lib/teamAbsenceCalendar";
import { TEAM_ABSENCE_KIND_LABELS, type TeamAbsence } from "@/lib/teamAbsences";
import { fallbackBalance, type AbsenceBalance } from "@/lib/teamAbsenceQuotas";

/**
 * Річний звіт по відсутностях — для бухгалтерії.
 *
 * Рахуємо тими самими одиницями, що й квота (відпустка — календарні дні,
 * решта — робочі), і з тих самих ПОГОДЖЕНИХ записів,
 * щоб цифра у звіті не могла розійтися з цифрою на картці людини.
 *
 * Копіювання віддає TSV: він вставляється в Excel/Google Sheets колонками
 * без жодного імпорту — саме так цим і користуються.
 */

export type AbsenceReportPerson = {
  userId: string;
  name: string;
  roleLabel: string;
  avatarUrl?: string | null;
  initials: string;
};

const METER_FILL: Record<QuotaAbsenceKind, string> = {
  vacation: "bg-[hsl(var(--chart-1))]",
  day_off: "bg-[hsl(var(--accent-tone-foreground))]",
  sick_leave: "bg-[hsl(var(--warning-solid))]",
};

type ReportRow = {
  userId: string;
  name: string;
  roleLabel: string;
  avatarUrl?: string | null;
  initials: string;
  used: Record<string, number>;
  quota: Record<string, number>;
  total: number;
};

export function AbsenceYearReportDialog({
  open,
  onOpenChange,
  year,
  people,
  absences,
  balances,
  exceptions,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  year: number;
  people: AbsenceReportPerson[];
  absences: TeamAbsence[];
  balances: Map<string, AbsenceBalance>;
  exceptions: Map<string, boolean>;
}) {
  const [copying, setCopying] = useState(false);

  const rows = useMemo<ReportRow[]>(() => {
    const approved = absences.filter((absence) => absence.status === "approved");
    const yearFrom = `${year}-01-01`;
    const yearTo = `${year}-12-31`;

    /**
     * УНІКАЛЬНІ дні, а не сума по записах. Сума подвоювала б дні на
     * перетинах, і звіт для бухгалтерії розходився б із залишком на картці
     * людини — там (і в гарді квоти) рахунок теж по унікальних днях.
     *
     * Одиниця залежить від типу: відпустка міряється календарними днями
     * (вихідні всередині входять, свята — ні), day-off і лікарняний —
     * робочими. Те саме правило, що в teamAbsenceCalendar і в RPC балансів.
     */
    const countDistinct = (list: TeamAbsence[], unit: "calendar" | "business") => {
      const days = new Set<string>();
      list.forEach((absence) => {
        const from = absence.startDate < yearFrom ? yearFrom : absence.startDate;
        const to = absence.endDate > yearTo ? yearTo : absence.endDate;
        eachDateKey(from, to).forEach((day) => {
          const counts =
            unit === "calendar" ? isVacationChargeableDay(day, exceptions) : isBusinessDay(day, exceptions);
          if (counts) days.add(day);
        });
      });
      return days.size;
    };

    return people
      .map((person) => {
        const own = approved.filter((absence) => absence.userId === person.userId);
        // Немає рядка балансу — беремо дефолти, а не нулі: інакше звіт
        // друкував би «12 / 0» і фарбував усіх як порушників ліміту.
        const balance = balances.get(person.userId) ?? fallbackBalance(person.userId);
        const used: Record<string, number> = {};
        const quota: Record<string, number> = {};
        let total = 0;

        QUOTA_ABSENCE_KINDS.forEach((kind) => {
          const days = countDistinct(
            own.filter((absence) => absence.kind === kind),
            ABSENCE_QUOTA_UNIT[kind]
          );
          used[kind] = days;
          quota[kind] = balance[kind].quota;
          total += days;
        });

        // «Інше» до квот не входить, але в звіті має бути — бухгалтерія
        // рахує всі дні відсутності, а не лише лімітовані.
        const otherDays = countDistinct(own.filter((absence) => absence.kind === "other"), "business");
        used.other = otherDays;
        total += otherDays;

        return {
          userId: person.userId,
          name: person.name,
          roleLabel: person.roleLabel,
          avatarUrl: person.avatarUrl,
          initials: person.initials,
          used,
          quota,
          total,
        };
      })
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "uk"));
  }, [absences, balances, exceptions, people, year]);

  const totals = useMemo(() => {
    const sum: Record<string, number> = { vacation: 0, day_off: 0, sick_leave: 0, other: 0 };
    rows.forEach((row) => {
      Object.keys(sum).forEach((kind) => {
        sum[kind] += row.used[kind] ?? 0;
      });
    });
    return sum;
  }, [rows]);

  const handleCopy = async () => {
    setCopying(true);
    try {
      const header = ["Людина", "Роль", "Відпустка", "Ліміт", "Day-off", "Ліміт", "Лікарняні", "Ліміт", "Інше", "Разом"];
      const body = rows.map((row) =>
        [
          row.name,
          row.roleLabel,
          row.used.vacation,
          row.quota.vacation,
          row.used.day_off,
          row.quota.day_off,
          row.used.sick_leave,
          row.quota.sick_leave,
          row.used.other,
          row.total,
        ].join("\t")
      );
      await navigator.clipboard.writeText([header.join("\t"), ...body].join("\n"));
      toast.success("Звіт скопійовано — вставляйте в таблицю");
    } catch (error) {
      console.error("[absence report] copy failed", error);
      toast.error("Не вдалося скопіювати");
    } finally {
      setCopying(false);
    }
  };

  const cell = "px-2 py-1.5 text-right tabular-nums";

  /**
   * Крихітна шкала поруч із числом: таблиця з самими нулями читалась як
   * мертва, а так одразу видно, хто вибирає квоту, ще до читання цифр.
   */
  const meter = (used: number, quota: number, kind: QuotaAbsenceKind) => {
    const pct = quota > 0 ? Math.min(100, (used / quota) * 100) : 0;
    return (
      <span className="inline-flex items-center justify-end gap-2">
        <span className="h-1.5 w-9 overflow-hidden rounded-full bg-muted" aria-hidden>
          {pct > 0 ? (
            <span className={cn("block h-full rounded-full", METER_FILL[kind])} style={{ width: `${pct}%` }} />
          ) : null}
        </span>
        <span className={cn(used === 0 && "text-muted-foreground")}>{used}</span>
        <span className="text-muted-foreground">/ {quota}</span>
      </span>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Річний звіт — лише читання й копіювання. */}
      <DialogContent dismissible className="max-w-[820px]">
        <DialogHeader>
          <DialogTitle>Відсутності за {year} рік</DialogTitle>
          <DialogDescription>
            Використано за погодженими записами. Відпустка — календарними днями
            (вихідні всередині рахуються), day-off і лікарняний — робочими. Свята
            не списують нічого.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[56vh] overflow-auto rounded-[var(--radius-inner)] border border-border/50">
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10 bg-card">
              <tr className="border-b border-border/60 text-3xs uppercase tracking-wide text-muted-foreground">
                <th className="px-2 py-2 text-left font-semibold">Людина</th>
                {QUOTA_ABSENCE_KINDS.map((kind) => (
                  <th key={kind} className="px-2 py-2 text-right font-semibold">
                    {TEAM_ABSENCE_KIND_LABELS[kind]}
                  </th>
                ))}
                <th className="px-2 py-2 text-right font-semibold">Інше</th>
                <th className="px-2 py-2 text-right font-semibold">Разом</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-2 py-6 text-center text-muted-foreground">
                    Немає кого показати.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.userId} className="hover:bg-muted/40">
                    <td className="px-2 py-1.5">
                      <div className="flex items-center gap-2.5">
                        <AvatarBase
                          src={row.avatarUrl}
                          name={row.name}
                          fallback={row.initials}
                          assetVariant="xs"
                          size={28}
                        />
                        <div className="min-w-0">
                          <div className="truncate font-medium text-foreground">{row.name}</div>
                          <div className="truncate text-3xs text-muted-foreground">{row.roleLabel}</div>
                        </div>
                      </div>
                    </td>
                    {QUOTA_ABSENCE_KINDS.map((kind) => {
                      const over = row.used[kind] > row.quota[kind];
                      return (
                        <td key={kind} className={cn(cell, over && "text-warning-foreground")}>
                          {meter(row.used[kind], row.quota[kind], kind)}
                        </td>
                      );
                    })}
                    <td className={cn(cell, !row.used.other && "text-muted-foreground")}>
                      {row.used.other || "—"}
                    </td>
                    <td className={cn(cell, "font-semibold", row.total === 0 && "text-muted-foreground")}>
                      {row.total}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {rows.length > 0 ? (
              <tfoot className="border-t border-border/60 bg-muted/30">
                <tr className="font-semibold">
                  <td className="px-2 py-2 text-left">Разом по команді</td>
                  {QUOTA_ABSENCE_KINDS.map((kind) => (
                    <td key={kind} className={cell}>
                      {totals[kind]}
                    </td>
                  ))}
                  <td className={cell}>{totals.other}</td>
                  <td className={cell}>
                    {Object.values(totals).reduce((sum, value) => sum + value, 0)}
                  </td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>

        <DialogFooter>
          <span className="mr-auto text-2xs text-muted-foreground">
            {rows.length} {rows.length === 1 ? "людина" : "людей"}
          </span>
          <Button onClick={handleCopy} disabled={copying || rows.length === 0} className="gap-2">
            <Copy className="h-4 w-4" aria-hidden />
            Скопіювати для таблиці
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
