import { useMemo, useState } from "react";
import { Copy } from "@/components/icons/appIcons";
import { toast } from "sonner";

import { AvatarBase } from "@/components/app/avatar-kit";
import { TableEmptyRow, TableTitleCell } from "@/components/app/table-kit";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
      const header = ["Людина", "Роль", "Відпустка", "Ліміт", "Відгул", "Ліміт", "Лікарняні", "Ліміт", "Інше", "Разом"];
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

  const cell = "text-right";

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
            (вихідні всередині рахуються), відгул і лікарняний — робочими. Свята
            не списують нічого.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[56vh] overflow-auto rounded-inner border border-border/50">
          {/* bare: скрол дає рамка вікна, тож липка шапка рахується від неї (top-0),
              а не від шапки сторінки, як у stickyHeader. */}
          <Table bare className="[&_thead]:sticky [&_thead]:top-0 [&_thead]:z-10 [&_thead]:bg-card">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Людина</TableHead>
                {QUOTA_ABSENCE_KINDS.map((kind) => (
                  <TableHead key={kind} className="text-right">
                    {TEAM_ABSENCE_KIND_LABELS[kind]}
                  </TableHead>
                ))}
                <TableHead className="text-right">Інше</TableHead>
                <TableHead className="text-right">Разом</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableEmptyRow colSpan={6}>Немає кого показати.</TableEmptyRow>
              ) : (
                rows.map((row) => (
                  <TableRow key={row.userId}>
                    <TableCell>
                      <TableTitleCell
                        leading={
                          <AvatarBase
                            src={row.avatarUrl}
                            name={row.name}
                            fallback={row.initials}
                            assetVariant="xs"
                            size={28}
                          />
                        }
                        title={row.name}
                        meta={[row.roleLabel]}
                      />
                    </TableCell>
                    {QUOTA_ABSENCE_KINDS.map((kind) => {
                      const over = row.used[kind] > row.quota[kind];
                      return (
                        <TableCell key={kind} className={cn(cell, over && "text-warning-foreground")}>
                          {meter(row.used[kind], row.quota[kind], kind)}
                        </TableCell>
                      );
                    })}
                    <TableCell className={cn(cell, !row.used.other && "text-muted-foreground")}>
                      {row.used.other || "—"}
                    </TableCell>
                    <TableCell className={cn(cell, "font-medium", row.total === 0 && "text-muted-foreground")}>
                      {row.total}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
            {rows.length > 0 ? (
              <TableFooter>
                <TableRow className="font-medium hover:bg-transparent">
                  <TableCell>Разом по команді</TableCell>
                  {QUOTA_ABSENCE_KINDS.map((kind) => (
                    <TableCell key={kind} className={cell}>
                      {totals[kind]}
                    </TableCell>
                  ))}
                  <TableCell className={cell}>{totals.other}</TableCell>
                  <TableCell className={cell}>
                    {Object.values(totals).reduce((sum, value) => sum + value, 0)}
                  </TableCell>
                </TableRow>
              </TableFooter>
            ) : null}
          </Table>
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
