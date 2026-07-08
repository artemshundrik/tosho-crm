import * as React from "react";
import { toast } from "sonner";
import { Check, ChevronLeft, ChevronRight, Loader2, StickyNote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AvatarBase } from "@/components/app/avatar-kit";
import { formatJobRole } from "@/lib/jobRoles";
import { cn } from "@/lib/utils";
import { resolveWorkspaceId } from "@/lib/workspace";
import { listWorkspaceMembersForDisplay, type WorkspaceMemberDisplayRow } from "@/lib/workspaceMemberDirectory";
import {
  loadPayrollEntries,
  upsertPayrollEntry,
  periodKey,
  parsePayrollAmount,
  PAYROLL_MONTHS,
  PAYROLL_EXCLUDED_USER_IDS,
  MANUAL_PAYROLL_PEOPLE,
  type PayrollEntry,
} from "@/lib/payroll";
import { listLegalEntities, listPayoutMeta, upsertPayoutMeta } from "./api";
import { formatLegalEntityLabel, type FinanceLegalEntity, type FinancePayoutMeta } from "./types";

type FinancePayrollProps = {
  teamId: string | null;
  userId: string | null;
};

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

const fmtUAH0 = new Intl.NumberFormat("uk-UA", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmtUAH2 = new Intl.NumberFormat("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// Hide kopecks for whole amounts («38 000 грн»), keep them when present («38 000,50 грн»).
const formatUAH = (value: number) => {
  const rounded = Math.round(value * 100) / 100;
  const hasKopecks = Math.round(rounded * 100) % 100 !== 0;
  return `${(hasKopecks ? fmtUAH2 : fmtUAH0).format(rounded)} грн`;
};
const amountToInput = (value: number) => (value ? String(value) : "");

// Compact display name for the payout table: «Тетяна Карандюк» → «Тетяна К.».
// Keeps the given name and abbreviates the surname to a single initial so the
// column stays narrow. Single-word names are returned as-is.
const shortenName = (name: string): string => {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return name;
  const [first, second] = parts;
  const initial = second.charAt(0).toUpperCase();
  return initial ? `${first} ${initial}.` : first;
};

type Person = {
  userId: string;
  name: string;
  jobRole: string | null;
  avatarUrl: string | null;
  initials: string | null;
};

type Draft = { base: string; bonus: string; deduction: string };

export function FinancePayroll({ teamId, userId }: FinancePayrollProps) {
  const now = React.useMemo(() => new Date(), []);
  const [year, setYear] = React.useState(() => now.getFullYear());
  const [month, setMonth] = React.useState(() => now.getMonth() + 1);
  const period = React.useMemo(() => periodKey(year, month), [year, month]);

  const [workspaceId, setWorkspaceId] = React.useState<string | null>(null);
  const [members, setMembers] = React.useState<WorkspaceMemberDisplayRow[]>([]);
  const [entries, setEntries] = React.useState<Map<string, PayrollEntry>>(new Map());
  const [meta, setMeta] = React.useState<Map<string, FinancePayoutMeta>>(new Map());
  const [entities, setEntities] = React.useState<FinanceLegalEntity[]>([]);
  const [drafts, setDrafts] = React.useState<Record<string, Draft>>({});
  const [loading, setLoading] = React.useState(true);

  const saveTimers = React.useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Load members + reference data once.
  React.useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void (async () => {
      try {
        const wsId = await resolveWorkspaceId(userId);
        if (!wsId || cancelled) return;
        const [rows, ents] = await Promise.all([
          listWorkspaceMembersForDisplay(wsId),
          teamId ? listLegalEntities(teamId) : Promise.resolve([]),
        ]);
        if (cancelled) return;
        setWorkspaceId(wsId);
        setMembers(rows);
        setEntities(ents);
      } catch (error) {
        if (!cancelled) toast.error("Не вдалося завантажити команду", { description: getErrorMessage(error, "") });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, teamId]);

  // Load period entries + payout meta whenever period or workspace changes.
  React.useEffect(() => {
    if (!workspaceId || !teamId) return;
    let cancelled = false;
    setLoading(true);
    void Promise.all([loadPayrollEntries(workspaceId, period), listPayoutMeta(teamId, period)])
      .then(([nextEntries, nextMeta]) => {
        if (cancelled) return;
        setEntries(nextEntries);
        setMeta(nextMeta);
        const nextDrafts: Record<string, Draft> = {};
        nextEntries.forEach((entry, uid) => {
          nextDrafts[uid] = {
            base: amountToInput(entry.baseAmount),
            bonus: amountToInput(entry.bonusAmount),
            deduction: amountToInput(entry.deductionAmount),
          };
        });
        setDrafts(nextDrafts);
      })
      .catch((error) => {
        if (!cancelled) toast.error("Не вдалося завантажити виплати", { description: getErrorMessage(error, "") });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId, teamId, period]);

  const people = React.useMemo<Person[]>(() => {
    const real = members
      .filter(
        (m) =>
          m.employmentStatus !== "rejected" &&
          m.employmentStatus !== "inactive" &&
          !PAYROLL_EXCLUDED_USER_IDS.has(m.userId)
      )
      .map<Person>((m) => ({
        userId: m.userId,
        name: m.displayName || m.fullName || m.label || m.email || "Без імені",
        jobRole: m.jobRole,
        avatarUrl: m.avatarDisplayUrl ?? null,
        initials: m.initials ?? null,
      }));
    const manual = MANUAL_PAYROLL_PEOPLE.map<Person>((p) => ({
      userId: p.userId,
      name: p.name,
      jobRole: p.jobRole,
      avatarUrl: null,
      initials: null,
    }));
    return [...real, ...manual];
  }, [members]);

  const draftFor = (uid: string): Draft =>
    drafts[uid] ?? { base: "", bonus: "", deduction: "" };

  const totalFor = (uid: string): number => {
    const d = draftFor(uid);
    return parsePayrollAmount(d.base) + parsePayrollAmount(d.bonus) - parsePayrollAmount(d.deduction);
  };

  const totals = React.useMemo(() => {
    let base = 0;
    let bonus = 0;
    let total = 0;
    let paid = 0;
    for (const person of people) {
      const d = draftFor(person.userId);
      const b = parsePayrollAmount(d.base);
      const bo = parsePayrollAmount(d.bonus);
      const t = b + bo - parsePayrollAmount(d.deduction);
      base += b;
      bonus += bo;
      total += t;
      if (meta.get(person.userId)?.status === "paid") paid += t;
    }
    return { base, bonus, total, paid };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [people, drafts, entries, meta]);

  const queueSaveAmount = (uid: string, patch: Partial<Draft>) => {
    setDrafts((prev) => ({ ...prev, [uid]: { ...draftFor(uid), ...patch } }));
    if (!workspaceId) return;
    if (saveTimers.current[uid]) clearTimeout(saveTimers.current[uid]);
    saveTimers.current[uid] = setTimeout(() => {
      const d = { ...draftFor(uid), ...patch };
      const entry = entries.get(uid);
      void upsertPayrollEntry({
        workspaceId,
        userId: uid,
        period,
        updatedBy: userId,
        values: {
          baseAmount: parsePayrollAmount(d.base),
          bonusAmount: parsePayrollAmount(d.bonus),
          deductionAmount: parsePayrollAmount(d.deduction),
          note: entry?.note ?? null,
        },
      }).catch((error) => toast.error("Не збереглося", { description: getErrorMessage(error, "") }));
    }, 600);
  };

  const saveNote = async (uid: string, note: string) => {
    if (!workspaceId) return;
    const d = draftFor(uid);
    const trimmed = note.trim();
    const nextNote = trimmed ? trimmed : null;
    const baseAmount = parsePayrollAmount(d.base);
    const bonusAmount = parsePayrollAmount(d.bonus);
    const deductionAmount = parsePayrollAmount(d.deduction);
    // Optimistic — keep the shared payroll_entries snapshot in sync so the cell
    // reflects the saved note immediately.
    setEntries((prev) => {
      const next = new Map(prev);
      next.set(uid, {
        userId: uid,
        period,
        baseAmount,
        bonusAmount,
        deductionAmount,
        totalAmount: baseAmount + bonusAmount - deductionAmount,
        note: nextNote,
      });
      return next;
    });
    try {
      await upsertPayrollEntry({
        workspaceId,
        userId: uid,
        period,
        updatedBy: userId,
        values: { baseAmount, bonusAmount, deductionAmount, note: nextNote },
      });
    } catch (error) {
      toast.error("Не вдалося зберегти нотатку", { description: getErrorMessage(error, "") });
    }
  };

  const saveMeta = async (uid: string, patch: Partial<FinancePayoutMeta>) => {
    if (!teamId) return;
    const current = meta.get(uid);
    const next: FinancePayoutMeta = {
      userId: uid,
      period,
      legalEntityId: current?.legalEntityId ?? null,
      accountId: current?.accountId ?? null,
      status: current?.status ?? "pending",
      paidAt: current?.paidAt ?? null,
      note: current?.note ?? null,
      ...patch,
    };
    setMeta((prev) => new Map(prev).set(uid, next));
    try {
      await upsertPayoutMeta(teamId, uid, period, {
        legalEntityId: next.legalEntityId,
        accountId: next.accountId,
        status: next.status,
        paidAt: next.paidAt,
        note: next.note,
      });
    } catch (error) {
      toast.error("Не вдалося зберегти", { description: getErrorMessage(error, "") });
    }
  };

  const shiftMonth = (delta: number) => {
    const d = new Date(year, month - 1 + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth() + 1);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Ставка, бонус, офіційна ЗП та статус виплати по кожному за місяць. Дані спільні зі сторінкою зарплат.
        </p>
        <div className="flex items-center gap-1">
          <Button type="button" variant="outline" size="icon" className="h-8 w-8" onClick={() => shiftMonth(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-[140px] text-center text-sm font-medium">
            {PAYROLL_MONTHS[month - 1]} {year}
          </div>
          <Button type="button" variant="outline" size="icon" className="h-8 w-8" onClick={() => shiftMonth(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Ставки" value={formatUAH(totals.base)} />
        <Kpi label="Бонуси" value={formatUAH(totals.bonus)} />
        <Kpi label="До виплати" value={formatUAH(totals.total)} accent />
        <Kpi label="Виплачено" value={formatUAH(totals.paid)} tone="success" />
      </div>

      {loading ? (
        <div className="flex items-center gap-2 rounded-xl border border-border/50 bg-muted/10 px-4 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Завантаження…
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border/60">
          {/* Content-width so every inter-column gap is the same cell padding;
              leftover space falls to the right of the last column. */}
          <Table size="sm" className="!w-auto">
            <TableHeader>
              <TableRow>
                <TableHead className="whitespace-nowrap">Співробітник</TableHead>
                <TableHead className="whitespace-nowrap text-right">Ставка</TableHead>
                <TableHead className="whitespace-nowrap text-right">Бонус</TableHead>
                <TableHead className="whitespace-nowrap text-right">Офіційна ЗП</TableHead>
                <TableHead className="whitespace-nowrap text-right">До виплати</TableHead>
                <TableHead className="w-[200px]">Нотатка</TableHead>
                <TableHead className="whitespace-nowrap">Юрособа</TableHead>
                <TableHead className="whitespace-nowrap text-center">Статус</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {people.map((person) => {
                const d = draftFor(person.userId);
                const m = meta.get(person.userId);
                const isPaid = m?.status === "paid";
                return (
                  <TableRow key={person.userId}>
                    <TableCell className="whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <AvatarBase
                          src={person.avatarUrl}
                          name={person.name}
                          fallback={person.initials ?? person.name.slice(0, 2)}
                          size={28}
                          className="border-border/60"
                        />
                        <div className="min-w-0">
                          <div className="text-sm font-medium" title={person.name}>
                            {shortenName(person.name)}
                          </div>
                          {person.jobRole ? (
                            <div className="truncate text-[11px] text-muted-foreground">
                              {formatJobRole(person.jobRole)}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Input
                        value={d.base}
                        onChange={(e) => queueSaveAmount(person.userId, { base: e.target.value })}
                        inputMode="decimal"
                        placeholder="0"
                        className="h-8 w-28 text-right"
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Input
                        value={d.bonus}
                        onChange={(e) => queueSaveAmount(person.userId, { bonus: e.target.value })}
                        inputMode="decimal"
                        placeholder="0"
                        className="h-8 w-28 text-right"
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Input
                        value={d.deduction}
                        onChange={(e) => queueSaveAmount(person.userId, { deduction: e.target.value })}
                        inputMode="decimal"
                        placeholder="0"
                        className="h-8 w-28 text-right"
                      />
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right text-sm font-medium tabular-nums">
                      {formatUAH(totalFor(person.userId))}
                    </TableCell>
                    <TableCell className="w-[200px]">
                      <PayrollNoteCell
                        note={entries.get(person.userId)?.note ?? null}
                        onSave={(text) => saveNote(person.userId, text)}
                      />
                    </TableCell>
                    <TableCell>
                      <Select
                        value={m?.legalEntityId ?? "none"}
                        onValueChange={(v) => void saveMeta(person.userId, { legalEntityId: v === "none" ? null : v })}
                      >
                        <SelectTrigger className="h-8 w-[150px]">
                          <SelectValue placeholder="—" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">—</SelectItem>
                          {entities.map((entity) => (
                            <SelectItem key={entity.id} value={entity.id}>
                              {formatLegalEntityLabel(entity)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-center">
                      <Button
                        type="button"
                        variant={isPaid ? "secondary" : "outline"}
                        size="sm"
                        className={cn("h-8 gap-1.5", isPaid && "text-success-foreground")}
                        onClick={() => void saveMeta(person.userId, { status: isPaid ? "pending" : "paid" })}
                      >
                        {isPaid ? <Check className="h-3.5 w-3.5" /> : null}
                        {isPaid ? "Виплачено" : "Позначити"}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function Kpi({
  label,
  value,
  accent,
  tone,
}: {
  label: string;
  value: string;
  accent?: boolean;
  tone?: "success";
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border/60 bg-card p-4",
        accent && "border-primary/40 bg-primary/5",
        tone === "success" && "border-success/40 bg-success/5"
      )}
    >
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1.5 text-lg font-semibold text-foreground">{value}</div>
    </div>
  );
}

// Note cell for the payout register. Hover the trigger to read the full note in a
// popover; click to edit it inline. Backed by the shared payroll_entries.note.
function PayrollNoteCell({
  note,
  onSave,
}: {
  note: string | null;
  onSave: (text: string) => Promise<void>;
}) {
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(note ?? "");
  const [saving, setSaving] = React.useState(false);
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const hasNote = Boolean(note && note.trim());

  // Keep the local draft in sync with the persisted note while not editing.
  React.useEffect(() => {
    if (!editing) setDraft(note ?? "");
  }, [note, editing]);

  React.useEffect(
    () => () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    },
    []
  );

  const openHover = () => {
    if (editing) return;
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const closeHover = () => {
    if (editing) return;
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), 90);
  };

  const startEdit = () => {
    setDraft(note ?? "");
    setEditing(true);
    setOpen(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      await onSave(draft);
      setEditing(false);
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setEditing(false);
      }}
    >
      <PopoverAnchor asChild>
        <button
          type="button"
          onMouseEnter={openHover}
          onMouseLeave={closeHover}
          onClick={startEdit}
          className={cn(
            // Definite px width so the note truncates with «…» instead of
            // stretching the auto-layout table when the note is long.
            "flex w-[200px] max-w-[200px] items-center gap-1.5 rounded-md px-2 py-1 text-left text-sm transition-colors hover:bg-muted/60",
            hasNote ? "text-foreground" : "text-muted-foreground/70"
          )}
        >
          <StickyNote className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          {hasNote ? (
            <span className="min-w-0 flex-1 truncate">{note}</span>
          ) : (
            <span className="text-xs">Нотатка</span>
          )}
        </button>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        sideOffset={6}
        onMouseEnter={openHover}
        onMouseLeave={closeHover}
        onOpenAutoFocus={(e) => {
          if (!editing) e.preventDefault();
        }}
        className="w-80 space-y-2 p-3"
      >
        {editing ? (
          <>
            <Textarea
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={4}
              placeholder="Нотатка про виплату…"
              className="resize-none text-sm"
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  e.preventDefault();
                  void save();
                }
              }}
            />
            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7"
                disabled={saving}
                onClick={() => {
                  setEditing(false);
                  setOpen(false);
                }}
              >
                Скасувати
              </Button>
              <Button type="button" size="sm" className="h-7" disabled={saving} onClick={() => void save()}>
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Зберегти"}
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="whitespace-pre-wrap break-words text-sm text-foreground">
              {hasNote ? note : <span className="text-muted-foreground">Нотатки ще немає</span>}
            </div>
            <div className="flex justify-end">
              <Button type="button" size="sm" variant="ghost" className="h-7" onClick={startEdit}>
                Редагувати
              </Button>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
