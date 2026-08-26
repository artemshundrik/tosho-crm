import { AvatarBase } from "@/components/app/avatar-kit";
import { HoverTip } from "@/components/ui/hover-tip";
import { cn } from "@/lib/utils";
import { toneBadgeClass } from "@/lib/statusTones";
import {
  TEAM_ABSENCE_KIND_LABELS,
  TEAM_ABSENCE_KIND_TONE,
  type TeamAbsence,
} from "@/lib/teamAbsences";
import {
  ABSENCE_QUOTA_UNIT,
  ABSENCE_QUOTA_UNIT_LABEL,
  QUOTA_ABSENCE_KINDS,
  type QuotaAbsenceKind,
} from "@/lib/teamAbsenceCalendar";
import type { AbsenceBalance } from "@/lib/teamAbsenceQuotas";
import type { BalanceEntry } from "@/components/team/AbsenceBalanceMeters";

/**
 * Щільний вид «скільки в кого лишилось» — 16 людей на одному екрані.
 *
 * ЧОМУ ОКРЕМО ВІД РІЧНОГО ЗВІТУ: звіт відповідає бухгалтерії на питання
 * «скільки ВИКОРИСТАНО за рік» і вміє копіюватись у таблицю. Тут питання
 * протилежне — «скільки ще Є», і воно про планування: кому можна давати
 * відпустку, у кого залишок горить. Одна таблиця на дві задачі читалась би
 * гірше за дві.
 *
 * ПРИВАТНІСТЬ: чужі залишки бачить лише owner/CEO, тож викликач показує цей
 * вид тільки їм. Компонент нічого не вирішує — він малює те, що дали.
 */

const FILL_CLASS: Record<QuotaAbsenceKind, string> = {
  vacation: "bg-[hsl(var(--chart-1))]",
  day_off: "bg-[hsl(var(--accent-tone-foreground))]",
  sick_leave: "bg-[hsl(var(--warning-solid))]",
};

const TRACK_CLASS: Record<QuotaAbsenceKind, string> = {
  vacation: "bg-[hsl(var(--chart-1)/0.28)]",
  day_off: "bg-[hsl(var(--accent-tone-foreground)/0.28)]",
  sick_leave: "bg-[hsl(var(--warning-solid)/0.28)]",
};

export type BalancesRowPerson = {
  userId: string;
  name: string;
  roleLabel: string;
  avatarUrl?: string | null;
  initials: string;
  absenceToday?: TeamAbsence | null;
};

const shortDate = (key: string) => `${key.slice(8, 10)}.${key.slice(5, 7)}`;

function Cell({
  kind,
  balance,
  entries,
  year,
}: {
  kind: QuotaAbsenceKind;
  balance: AbsenceBalance | null;
  entries?: BalanceEntry[];
  year: number;
}) {
  if (!balance) {
    return <span className="text-2xs text-muted-foreground">—</span>;
  }
  const bucket = balance[kind];
  const usedPct = bucket.quota <= 0 ? 0 : Math.min(100, (bucket.used / bucket.quota) * 100);
  const pendingPct = bucket.quota <= 0 ? 0 : Math.min(100 - usedPct, (bucket.pending / bucket.quota) * 100);
  const exhausted = bucket.remaining === 0 && bucket.quota > 0;
  const unit = ABSENCE_QUOTA_UNIT_LABEL[ABSENCE_QUOTA_UNIT[kind]];

  const meter = (
    <span className="inline-flex items-center justify-end gap-1.5">
      <span className={cn("relative inline-block h-1.5 w-[54px] shrink-0 rounded-full", TRACK_CLASS[kind])}>
        <span
          className={cn("absolute inset-y-0 left-0 rounded-full", FILL_CLASS[kind])}
          style={{ width: `${usedPct}%` }}
        />
        {pendingPct > 0 ? (
          <span
            className="absolute inset-y-0 rounded-full bg-foreground/25"
            style={{ left: `${usedPct}%`, width: `${pendingPct}%` }}
          />
        ) : null}
      </span>
      <span className="tabular-nums text-2xs">
        <b className={cn("font-semibold", exhausted ? "text-muted-foreground" : "text-foreground")}>
          {bucket.remaining}
        </b>
        <span className="text-muted-foreground">/{bucket.quota}</span>
      </span>
    </span>
  );

  const list = entries ?? [];

  return (
    <HoverTip
      side="top"
      contentClassName="max-w-none rounded-xl p-3"
      label={
        <div className="w-[230px]">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xs font-semibold text-foreground">{TEAM_ABSENCE_KIND_LABELS[kind]}</span>
            <span className="text-2xs text-muted-foreground">
              {bucket.used} із {bucket.quota} {unit}
            </span>
          </div>
          {list.length === 0 ? (
            <div className="mt-2 border-t border-border/40 pt-2 text-2xs text-muted-foreground">
              За {year} рік не було.
            </div>
          ) : (
            <div className="mt-2 space-y-1 border-t border-border/40 pt-2">
              {list.slice(0, 5).map((entry) => (
                <div key={entry.id} className={cn("flex items-center gap-2 text-2xs", entry.pending && "opacity-75")}>
                  <span className="flex-1 tabular-nums text-foreground">
                    {entry.startDate === entry.endDate
                      ? shortDate(entry.startDate)
                      : `${shortDate(entry.startDate)} – ${shortDate(entry.endDate)}`}
                  </span>
                  <span className="shrink-0 text-muted-foreground">
                    {entry.days} дн.{entry.pending ? " · запит" : ""}
                  </span>
                </div>
              ))}
              {list.length > 5 ? (
                <div className="text-3xs text-muted-foreground">…і ще {list.length - 5}</div>
              ) : null}
            </div>
          )}
        </div>
      }
    >
      {meter}
    </HoverTip>
  );
}

export function TeamBalancesTable({
  people,
  balances,
  entriesByUser,
  year,
  onOpenPerson,
}: {
  people: BalancesRowPerson[];
  balances: Map<string, AbsenceBalance>;
  entriesByUser: Map<string, Record<QuotaAbsenceKind, BalanceEntry[]>>;
  year: number;
  /** Клік по рядку — відкрити внесення відсутності цій людині. */
  onOpenPerson?: (userId: string) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[620px]">
        <thead>
          <tr className="border-b border-border/60 text-3xs uppercase tracking-wide text-muted-foreground">
            <th className="px-4 py-2 text-left font-semibold">Людина</th>
            {QUOTA_ABSENCE_KINDS.map((kind) => (
              <th key={kind} className="px-3 py-2 text-right font-semibold">
                {TEAM_ABSENCE_KIND_LABELS[kind]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/40">
          {people.map((person) => {
            const balance = balances.get(person.userId) ?? null;
            const entries = entriesByUser.get(person.userId);
            return (
              <tr
                key={person.userId}
                className={cn("group", onOpenPerson && "cursor-pointer hover:bg-muted/40")}
                onClick={onOpenPerson ? () => onOpenPerson(person.userId) : undefined}
              >
                <td className="px-4 py-2">
                  <div className="flex items-center gap-2.5">
                    <AvatarBase
                      src={person.avatarUrl}
                      name={person.name}
                      fallback={person.initials}
                      assetVariant="xs"
                      size={28}
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-xs font-medium text-foreground">{person.name}</span>
                        {person.absenceToday ? (
                          <span
                            className={cn(
                              "shrink-0 rounded-full border px-1.5 py-px text-3xs font-semibold",
                              toneBadgeClass[TEAM_ABSENCE_KIND_TONE[person.absenceToday.kind]]
                            )}
                          >
                            зараз
                          </span>
                        ) : null}
                      </div>
                      <div className="truncate text-3xs text-muted-foreground">{person.roleLabel}</div>
                    </div>
                  </div>
                </td>
                {QUOTA_ABSENCE_KINDS.map((kind) => (
                  <td key={kind} className="px-3 py-2 text-right">
                    <Cell kind={kind} balance={balance} entries={entries?.[kind]} year={year} />
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
