import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Check, Loader2, Lock, Wallet } from "lucide-react";

import { useAuth } from "@/auth/AuthProvider";
import { resolveWorkspaceId } from "@/lib/workspace";
import {
  listWorkspaceMembersForDisplay,
  type WorkspaceMemberDisplayRow,
} from "@/lib/workspaceMemberDirectory";
import {
  loadPayrollEntries,
  periodKey,
  upsertPayrollEntry,
  type PayrollValues,
} from "@/lib/payroll";
import { AvatarBase } from "@/components/app/avatar-kit";
import {
  getTeamAvailabilityBadgeClass,
  getTeamAvailabilityLabel,
  type TeamAvailabilityStatus,
} from "@/lib/teamAvailability";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

const MONTHS = [
  "Січень",
  "Лютий",
  "Березень",
  "Квітень",
  "Травень",
  "Червень",
  "Липень",
  "Серпень",
  "Вересень",
  "Жовтень",
  "Листопад",
  "Грудень",
];

type Draft = { base: string; bonus: string; deduction: string; note: string };
type SaveStatus = "saving" | "saved" | "error";

const EMPTY_DRAFT: Draft = { base: "", bonus: "", deduction: "", note: "" };

// Accounts intentionally kept off the payroll sheet (owner / management / a duplicate
// account) — they aren't paid through this register. Excluded by user id, since display
// names can change. Per user request 2026-06-05.
const EXCLUDED_USER_IDS = new Set<string>([
  "438b2643-e6fb-4366-bb92-83a88475c1f4", // Артем Шундрик (owner)
  "a411928a-27d8-495c-90e6-c7125d2ee1f5", // Артем Шундрик (другий акаунт)
  "9753ba06-3911-40fe-a9d4-bea1a92f1667", // В'ячеслав Хом'яков
  "ceade688-2792-4814-b0f4-c4e4b6d058e1", // Олена Борщ
  "e73aee8c-ebc8-449f-af12-6420a363498a", // Євгенія Безручко
]);

// People paid through this sheet who don't have a CRM account yet. Their entries are
// stored in payroll_entries under a fixed placeholder user id; once they get a real
// account we re-key the rows (update ... set user_id = <real> where user_id = <placeholder>).
type ManualPerson = { userId: string; name: string; jobRole: string };
const MANUAL_PEOPLE: ManualPerson[] = [
  { userId: "30e3147f-3c00-45f9-ac04-91a160799efd", name: "Тетяна Карандюк", jobRole: "Бухгалтер" },
  { userId: "d604c8de-9976-42db-b9ec-f2f756818295", name: "Юлія Кубенко", jobRole: "Бухгалтер" },
];

type PayrollPerson = {
  userId: string;
  name: string;
  jobRole: string | null;
  avatarUrl: string | null;
  initials: string | null;
  availability: TeamAvailabilityStatus | null;
  manual: boolean;
};

const currencyFmt = new Intl.NumberFormat("uk-UA", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const formatUAH = (value: number) => `${currencyFmt.format(value)} грн`;

const parseAmount = (raw: string): number => {
  const cleaned = raw.replace(/\s/g, "").replace(",", ".");
  if (!cleaned) return 0;
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.round(parsed * 100) / 100);
};

const amountToInput = (value: number): string => (value ? String(value) : "");

const memberName = (member: WorkspaceMemberDisplayRow): string =>
  member.displayName ||
  member.fullName ||
  member.label ||
  member.email ||
  "Без імені";

export default function PayrollPage() {
  const { userId, permissions } = useAuth();
  const canAccess = permissions.isSuperAdmin || permissions.isSeo;

  const now = useMemo(() => new Date(), []);
  const [year, setYear] = useState(() => now.getFullYear());
  const [month, setMonth] = useState(() => now.getMonth() + 1);

  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [members, setMembers] = useState<WorkspaceMemberDisplayRow[]>([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [entriesLoading, setEntriesLoading] = useState(false);
  const [statuses, setStatuses] = useState<Record<string, SaveStatus>>({});

  const draftsRef = useRef(drafts);
  useEffect(() => {
    draftsRef.current = drafts;
  }, [drafts]);

  const saveTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const savedTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const period = useMemo(() => periodKey(year, month), [year, month]);
  const periodLabel = `${MONTHS[month - 1]} ${year}`;

  const yearOptions = useMemo(() => {
    const current = now.getFullYear();
    const list: number[] = [];
    for (let y = current - 3; y <= current + 1; y += 1) list.push(y);
    return list;
  }, [now]);

  // Load workspace members once we know the viewer.
  useEffect(() => {
    if (!canAccess || !userId) {
      setMembersLoading(false);
      return;
    }
    let cancelled = false;
    setMembersLoading(true);
    setLoadError(null);
    (async () => {
      try {
        const wsId = await resolveWorkspaceId(userId);
        if (!wsId) {
          if (!cancelled) setLoadError("Не вдалося визначити робочий простір.");
          return;
        }
        const rows = await listWorkspaceMembersForDisplay(wsId);
        if (cancelled) return;
        setWorkspaceId(wsId);
        setMembers(rows);
      } catch {
        if (!cancelled) setLoadError("Не вдалося завантажити список співробітників.");
      } finally {
        if (!cancelled) setMembersLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canAccess, userId]);

  const people = useMemo<PayrollPerson[]>(() => {
    const real: PayrollPerson[] = members
      .filter(
        (m) =>
          m.employmentStatus !== "rejected" &&
          m.employmentStatus !== "inactive" &&
          !EXCLUDED_USER_IDS.has(m.userId)
      )
      .map((m) => ({
        userId: m.userId,
        name: memberName(m),
        jobRole: m.jobRole,
        avatarUrl: m.avatarDisplayUrl,
        initials: m.initials,
        availability: m.availabilityStatus,
        manual: false,
      }));
    const manual: PayrollPerson[] = MANUAL_PEOPLE.map((p) => ({
      userId: p.userId,
      name: p.name,
      jobRole: p.jobRole,
      avatarUrl: null,
      initials: null,
      availability: null,
      manual: true,
    }));
    return [...real, ...manual].sort((a, b) => a.name.localeCompare(b.name, "uk"));
  }, [members]);

  // Load saved entries for the selected month and seed the editable drafts.
  useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;
    setEntriesLoading(true);
    // Drop any pending autosaves queued for the previous month.
    Object.values(saveTimersRef.current).forEach(clearTimeout);
    saveTimersRef.current = {};
    (async () => {
      try {
        const map = await loadPayrollEntries(workspaceId, period);
        if (cancelled) return;
        const next: Record<string, Draft> = {};
        const ids = [
          ...members.map((m) => m.userId),
          ...MANUAL_PEOPLE.map((p) => p.userId),
        ];
        for (const id of ids) {
          const entry = map.get(id);
          next[id] = entry
            ? {
                base: amountToInput(entry.baseAmount),
                bonus: amountToInput(entry.bonusAmount),
                deduction: amountToInput(entry.deductionAmount),
                note: entry.note ?? "",
              }
            : { ...EMPTY_DRAFT };
        }
        setDrafts(next);
        setStatuses({});
      } catch {
        if (!cancelled)
          setLoadError("Не вдалося завантажити відомість за обраний місяць.");
      } finally {
        if (!cancelled) setEntriesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceId, period, members]);

  // Clear timers on unmount.
  useEffect(
    () => () => {
      Object.values(saveTimersRef.current).forEach(clearTimeout);
      Object.values(savedTimersRef.current).forEach(clearTimeout);
    },
    []
  );

  const saveRow = useCallback(
    (memberId: string) => {
      if (!workspaceId) return;
      const draft = draftsRef.current[memberId];
      if (!draft) return;
      const values: PayrollValues = {
        baseAmount: parseAmount(draft.base),
        bonusAmount: parseAmount(draft.bonus),
        deductionAmount: parseAmount(draft.deduction),
        note: draft.note.trim() ? draft.note.trim() : null,
      };
      setStatuses((prev) => ({ ...prev, [memberId]: "saving" }));
      upsertPayrollEntry({
        workspaceId,
        userId: memberId,
        period,
        updatedBy: userId ?? null,
        values,
      })
        .then(() => {
          setStatuses((prev) => ({ ...prev, [memberId]: "saved" }));
          clearTimeout(savedTimersRef.current[memberId]);
          savedTimersRef.current[memberId] = setTimeout(() => {
            setStatuses((prev) => {
              if (prev[memberId] !== "saved") return prev;
              const next = { ...prev };
              delete next[memberId];
              return next;
            });
          }, 1800);
        })
        .catch(() => {
          setStatuses((prev) => ({ ...prev, [memberId]: "error" }));
        });
    },
    [workspaceId, period, userId]
  );

  const scheduleSave = useCallback(
    (memberId: string) => {
      clearTimeout(saveTimersRef.current[memberId]);
      saveTimersRef.current[memberId] = setTimeout(() => saveRow(memberId), 600);
    },
    [saveRow]
  );

  const handleField = useCallback(
    (memberId: string, field: keyof Draft, value: string) => {
      setDrafts((prev) => ({
        ...prev,
        [memberId]: { ...(prev[memberId] ?? EMPTY_DRAFT), [field]: value },
      }));
      scheduleSave(memberId);
    },
    [scheduleSave]
  );

  const totals = useMemo(() => {
    let base = 0;
    let bonus = 0;
    let deduction = 0;
    for (const person of people) {
      const draft = drafts[person.userId];
      if (!draft) continue;
      base += parseAmount(draft.base);
      bonus += parseAmount(draft.bonus);
      deduction += parseAmount(draft.deduction);
    }
    return { base, bonus, deduction, total: base + bonus - deduction };
  }, [people, drafts]);

  if (!canAccess) {
    return (
      <div className="w-full pb-20 md:pb-0">
        <div className="mx-auto mt-10 max-w-md rounded-2xl border border-border/60 bg-muted/10 p-10 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-border/60 bg-background">
            <Lock className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="text-base font-semibold text-foreground">
            Доступ обмежено
          </div>
          <div className="mx-auto mt-1.5 max-w-sm text-sm text-muted-foreground">
            Зарплатна відомість доступна лише власнику та SEO.
          </div>
        </div>
      </div>
    );
  }

  const renderStatus = (memberId: string) => {
    const status = statuses[memberId];
    if (status === "saving")
      return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
    if (status === "saved")
      return <Check className="h-4 w-4 text-emerald-500" />;
    if (status === "error")
      return <AlertCircle className="h-4 w-4 text-destructive" />;
    return null;
  };

  const numberInputClass =
    "h-9 w-28 text-right font-medium tabular-nums focus-visible:ring-2 focus-visible:ring-primary/30";

  return (
    <div className="w-full pb-20 md:pb-0">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-border/60 bg-muted/30">
            <Wallet className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <div className="text-lg font-semibold text-foreground">
              Зарплатна відомість
            </div>
            <div className="text-sm text-muted-foreground">
              Ставка, премія та утримання по кожному співробітнику за місяць.
              Зміни зберігаються автоматично.
            </div>
          </div>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
          Відомість за {periodLabel}
        </span>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
          <SelectTrigger className="w-[150px]" aria-label="Місяць">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MONTHS.map((name, index) => (
              <SelectItem key={name} value={String(index + 1)}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
          <SelectTrigger className="w-[110px]" aria-label="Рік">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {yearOptions.map((value) => (
              <SelectItem key={value} value={String(value)}>
                {value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {entriesLoading ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Завантаження…
          </span>
        ) : null}
      </div>

      {/* KPI strip */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Ставки", value: totals.base, accent: false },
          { label: "Бонуси", value: totals.bonus, accent: false },
          { label: "Утримання", value: totals.deduction, accent: false },
          { label: "До виплати", value: totals.total, accent: true },
        ].map((stat) => (
          <div
            key={stat.label}
            className={cn(
              "rounded-xl border px-4 py-3",
              stat.accent
                ? "border-primary/25 bg-primary/5"
                : "border-border/60 bg-muted/15"
            )}
          >
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              {stat.label}
            </div>
            <div
              className={cn(
                "mt-1 text-lg font-semibold tabular-nums",
                stat.accent ? "text-primary" : "text-foreground"
              )}
            >
              {formatUAH(stat.value)}
            </div>
          </div>
        ))}
      </div>

      {loadError ? (
        <div className="mb-4 rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {loadError}
        </div>
      ) : null}

      <div className="-mx-4 md:-mx-5 lg:-mx-6">
        <Table variant="list" size="md">
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[220px] pl-6">Співробітник</TableHead>
              <TableHead className="text-right">Ставка</TableHead>
              <TableHead className="text-right">Бонус</TableHead>
              <TableHead className="text-right">Утримання</TableHead>
              <TableHead className="text-right">Разом</TableHead>
              <TableHead className="min-w-[180px]">Нотатка</TableHead>
              <TableHead className="w-10" aria-label="Статус збереження" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {membersLoading ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={7} className="py-12 text-center text-sm text-muted-foreground">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </TableCell>
              </TableRow>
            ) : people.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={7} className="py-12 text-center text-sm text-muted-foreground">
                  Немає співробітників для відображення.
                </TableCell>
              </TableRow>
            ) : (
              people.map((person) => {
                const name = person.name;
                const draft = drafts[person.userId] ?? EMPTY_DRAFT;
                const rowTotal =
                  parseAmount(draft.base) +
                  parseAmount(draft.bonus) -
                  parseAmount(draft.deduction);
                const showAvailability =
                  !person.manual &&
                  person.availability !== null &&
                  person.availability !== "available";
                return (
                  <TableRow key={person.userId}>
                    <TableCell>
                      <div className="flex min-w-0 items-center gap-3">
                        <AvatarBase
                          src={person.avatarUrl}
                          name={name}
                          fallback={person.initials ?? undefined}
                          size={34}
                          availability={person.availability}
                          className="shrink-0 border-border/70"
                        />
                        <div className="min-w-0">
                          <div className="truncate font-medium text-foreground">
                            {name}
                          </div>
                          <div className="mt-0.5 flex items-center gap-1.5">
                            {person.jobRole ? (
                              <span className="truncate text-xs text-muted-foreground">
                                {person.jobRole}
                              </span>
                            ) : null}
                            {person.manual ? (
                              <span className="inline-flex items-center rounded-full border border-amber-300/60 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-300">
                                без акаунту
                              </span>
                            ) : showAvailability ? (
                              <span
                                className={cn(
                                  "inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                                  getTeamAvailabilityBadgeClass(person.availability)
                                )}
                              >
                                {getTeamAvailabilityLabel(person.availability)}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Input
                        inputMode="decimal"
                        value={draft.base}
                        placeholder="0"
                        aria-label={`Ставка, ${name}`}
                        className={numberInputClass}
                        onFocus={(e) => e.currentTarget.select()}
                        onChange={(e) =>
                          handleField(person.userId, "base", e.target.value)
                        }
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Input
                        inputMode="decimal"
                        value={draft.bonus}
                        placeholder="0"
                        aria-label={`Бонус, ${name}`}
                        className={numberInputClass}
                        onFocus={(e) => e.currentTarget.select()}
                        onChange={(e) =>
                          handleField(person.userId, "bonus", e.target.value)
                        }
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Input
                        inputMode="decimal"
                        value={draft.deduction}
                        placeholder="0"
                        aria-label={`Утримання, ${name}`}
                        className={numberInputClass}
                        onFocus={(e) => e.currentTarget.select()}
                        onChange={(e) =>
                          handleField(person.userId, "deduction", e.target.value)
                        }
                      />
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right font-semibold tabular-nums",
                        rowTotal < 0 ? "text-destructive" : "text-foreground"
                      )}
                    >
                      {formatUAH(rowTotal)}
                    </TableCell>
                    <TableCell>
                      <Input
                        value={draft.note}
                        placeholder="—"
                        aria-label={`Нотатка, ${name}`}
                        className="h-9 focus-visible:ring-2 focus-visible:ring-primary/30"
                        onChange={(e) =>
                          handleField(person.userId, "note", e.target.value)
                        }
                      />
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="inline-flex h-4 w-4 items-center justify-center">
                        {renderStatus(person.userId)}
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
          {people.length > 0 ? (
            <TableFooter>
              <TableRow className="hover:bg-transparent">
                <TableCell className="font-semibold text-foreground">
                  Разом · {people.length}{" "}
                  {people.length === 1 ? "співробітник" : "співробітників"}
                </TableCell>
                <TableCell className="text-right font-semibold tabular-nums">
                  {formatUAH(totals.base)}
                </TableCell>
                <TableCell className="text-right font-semibold tabular-nums">
                  {formatUAH(totals.bonus)}
                </TableCell>
                <TableCell className="text-right font-semibold tabular-nums">
                  {formatUAH(totals.deduction)}
                </TableCell>
                <TableCell className="text-right font-semibold tabular-nums text-primary">
                  {formatUAH(totals.total)}
                </TableCell>
                <TableCell colSpan={2} />
              </TableRow>
            </TableFooter>
          ) : null}
        </Table>
      </div>
    </div>
  );
}
