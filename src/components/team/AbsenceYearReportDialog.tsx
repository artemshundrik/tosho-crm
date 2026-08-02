import { useMemo, useState } from "react";
import { Copy, Printer } from "lucide-react";
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
import { cn } from "@/lib/utils";
import { countBusinessDaysInYear, QUOTA_ABSENCE_KINDS } from "@/lib/teamAbsenceCalendar";
import { TEAM_ABSENCE_KIND_LABELS, type TeamAbsence } from "@/lib/teamAbsences";
import type { AbsenceBalance } from "@/lib/teamAbsenceQuotas";

/**
 * Річний звіт по відсутностях — для бухгалтерії.
 *
 * Рахуємо ті самі робочі дні, що й квота, і з тих самих ПОГОДЖЕНИХ записів,
 * щоб цифра у звіті не могла розійтися з цифрою на картці людини.
 *
 * Копіювання віддає TSV: він вставляється в Excel/Google Sheets колонками
 * без жодного імпорту — саме так цим і користуються.
 */

export type AbsenceReportPerson = {
  userId: string;
  name: string;
  roleLabel: string;
};

type ReportRow = {
  userId: string;
  name: string;
  roleLabel: string;
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

    return people
      .map((person) => {
        const own = approved.filter((absence) => absence.userId === person.userId);
        const balance = balances.get(person.userId);
        const used: Record<string, number> = {};
        const quota: Record<string, number> = {};
        let total = 0;

        QUOTA_ABSENCE_KINDS.forEach((kind) => {
          const days = own
            .filter((absence) => absence.kind === kind)
            .reduce((sum, absence) => sum + countBusinessDaysInYear(absence, year, exceptions), 0);
          used[kind] = days;
          quota[kind] = balance?.[kind].quota ?? 0;
          total += days;
        });

        // «Інше» до квот не входить, але в звіті має бути — бухгалтерія
        // рахує всі дні відсутності, а не лише лімітовані.
        const otherDays = own
          .filter((absence) => absence.kind === "other")
          .reduce((sum, absence) => sum + countBusinessDaysInYear(absence, year, exceptions), 0);
        used.other = otherDays;
        total += otherDays;

        return { userId: person.userId, name: person.name, roleLabel: person.roleLabel, used, quota, total };
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[820px]">
        <DialogHeader>
          <DialogTitle>Відсутності за {year} рік</DialogTitle>
          <DialogDescription>
            Робочі дні за погодженими записами. Вихідні та свята не рахуються.
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
                    За цей рік відсутностей не записано.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.userId} className="hover:bg-muted/40">
                    <td className="px-2 py-1.5">
                      <div className="font-medium text-foreground">{row.name}</div>
                      <div className="text-3xs text-muted-foreground">{row.roleLabel}</div>
                    </td>
                    {QUOTA_ABSENCE_KINDS.map((kind) => {
                      const over = row.used[kind] > row.quota[kind];
                      return (
                        <td key={kind} className={cn(cell, over && "text-warning-foreground")}>
                          {row.used[kind]}
                          <span className="text-muted-foreground"> / {row.quota[kind]}</span>
                        </td>
                      );
                    })}
                    <td className={cell}>{row.used.other || "—"}</td>
                    <td className={cn(cell, "font-semibold")}>{row.total}</td>
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
          <Button variant="outline" onClick={() => window.print()} className="gap-2">
            <Printer className="h-4 w-4" aria-hidden />
            Друк
          </Button>
          <Button onClick={handleCopy} disabled={copying || rows.length === 0} className="gap-2">
            <Copy className="h-4 w-4" aria-hidden />
            Скопіювати для таблиці
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
