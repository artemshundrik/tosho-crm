import * as React from "react";
import { toast } from "sonner";
import { Loader2, StickyNote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FinanceBentoSummary, monthGenitive } from "./FinanceBentoSummary";
import { FinanceMonthBar } from "./FinanceMonthBar";
import { HoverTip } from "@/components/ui/hover-tip";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AvatarBase } from "@/components/app/avatar-kit";
import { formatJobRole } from "@/lib/jobRoles";
import { cn } from "@/lib/utils";
import { type WorkspaceMemberDisplayRow } from "@/lib/workspaceMemberDirectory";
import {
  upsertPayrollEntry,
  periodKey,
  parsePayrollAmount,
  PAYROLL_MONTHS,
  PAYROLL_EXCLUDED_USER_IDS,
  MANUAL_PAYROLL_PEOPLE,
  type PayrollEntry,
} from "@/lib/payroll";
import { upsertPayoutMeta } from "./api";
import { usePayrollPeriodData, usePayrollPrevTotal, usePayrollWorkspace } from "./queries";
import { type FinancePayoutMeta } from "./types";

const EMPTY_MEMBERS: WorkspaceMemberDisplayRow[] = [];

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

// Розряди в полях сум: «22500» читається гірше, ніж «22 500». Intl для uk-UA
// ставить нерозривний пробіл, а parsePayrollAmount його зчищає (\s покриває
// U+00A0), тож відформатоване значення парситься назад без втрат.
const fmtAmountGrouped = new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 2 });
const groupAmount = (raw: string) => {
  const parsed = parsePayrollAmount(raw);
  return parsed ? fmtAmountGrouped.format(parsed) : "";
};

const DATE_SHORT = new Intl.DateTimeFormat("uk-UA", { day: "2-digit", month: "2-digit" });
const formatDayMonth = (iso: string) => {
  const parsed = new Date(`${iso}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? iso : DATE_SHORT.format(parsed);
};
const formatFullDate = (iso: string) => {
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime())
    ? iso
    : parsed.toLocaleDateString("uk-UA", { day: "2-digit", month: "long", year: "numeric" });
};

/**
 * Поле суми у відомості.
 *
 * Розряди показуємо лише поки поле не у фокусі: під час набору форматування
 * перескакувало б каретку («2|2500» → «22 5|00»), тож у фокусі лишається сире
 * значення, а в спокої — згруповане.
 */
function AmountInput({
  value,
  onChange,
  label,
  className,
}: {
  value: string;
  onChange: (next: string) => void;
  label: string;
  className?: string;
}) {
  const [focused, setFocused] = React.useState(false);
  return (
    <Input
      controlSize="sm"
      value={focused ? value : groupAmount(value)}
      onChange={(e) => onChange(e.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      inputMode="decimal"
      placeholder="0"
      aria-label={label}
      className={cn("w-full text-right tabular-nums", className)}
    />
  );
}

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
  departed: boolean;
};

type Draft = { base: string; bonus: string; deduction: string; advance: string; advanceDate: string };

const EMPTY_DRAFT: Draft = { base: "", bonus: "", deduction: "", advance: "", advanceDate: "" };

/**
 * Рядок заголовків тримається верху при скролі, контент їде під ним.
 *
 * Липкість вішаємо на самі <th>, а не на <thead>: у таблиць sticky на секції
 * стабільно працює не в усіх рушіях. Зсув зверху — під липкий бар місяця
 * (FinanceMonthBar: висота ~49px, а на lg він зміщений на -24px).
 * Непрозорий фон обов'язковий, інакше рядки просвічують крізь заголовок.
 */
const STICKY_HEAD =
  "sticky top-12 z-10 border-b border-border/40 bg-background/95 backdrop-blur-sm lg:top-6";

/**
 * Опис колонок — один на таблицю і на її скелетон.
 *
 * Скелетон малюється тією ж <Table> з тими ж відсотками, тож повторити розкладку
 * «на око» неможливо в принципі: колонка може змінитись лише тут, і змінюється
 * одразу в обох. Заголовки в скелетоні справжні, не сірі смужки — вони не
 * залежать від даних, тож коли дані приходять, нічого не стрибає.
 *
 * `cell` каже, чим заповнити клітинку в скелетоні: поле вводу, число, тощо.
 */
const PAYROLL_COLUMNS = [
  { key: "person", label: "Співробітник", width: "w-[21%]", align: "", cell: "person" },
  { key: "base", label: "Ставка", width: "w-[11%]", align: "", cell: "input" },
  { key: "bonus", label: "Бонус", width: "w-[10%]", align: "", cell: "input" },
  { key: "official", label: "Офіційна ЗП", width: "w-[12%]", align: "", cell: "input" },
  { key: "advance", label: "Аванс", width: "w-[12%]", align: "", cell: "input" },
  { key: "total", label: "До виплати", width: "w-[13%]", align: "text-right", cell: "amount" },
  { key: "note", label: "Нотатка", width: "w-[13%]", align: "", cell: "note" },
  { key: "status", label: "Статус", width: "w-[8%]", align: "text-center", cell: "status" },
] as const;

export function FinancePayroll({ teamId, userId }: FinancePayrollProps) {
  const now = React.useMemo(() => new Date(), []);
  const [year, setYear] = React.useState(() => now.getFullYear());
  const [month, setMonth] = React.useState(() => now.getMonth() + 1);
  const period = React.useMemo(() => periodKey(year, month), [year, month]);
  // Попередній місяць — для бейджа дельти «до …» у bento.
  const prev = React.useMemo(() => {
    const d = new Date(year, month - 2, 1);
    return { year: d.getFullYear(), month: d.getMonth() + 1 };
  }, [year, month]);
  const prevPeriod = React.useMemo(() => periodKey(prev.year, prev.month), [prev]);

  // React Query: воркспейс+ростер і дані періоду — з кешу (повернення на
  // вкладку і перемикання місяців туди-назад рендеряться миттєво), свіжість —
  // фоновий рефетч (refetchOnMount:"always" у queries.ts).
  const workspaceQuery = usePayrollWorkspace(teamId, userId);
  const workspaceId = workspaceQuery.data?.workspaceId ?? null;
  const members = workspaceQuery.data?.members ?? EMPTY_MEMBERS;
  const periodQuery = usePayrollPeriodData(teamId, workspaceId, period);
  // «До виплати» минулого місяця — для бейджа дельти; збій не критичний (null).
  const prevTotalQuery = usePayrollPrevTotal(teamId, workspaceId, prevPeriod);
  const prevTotal = prevTotalQuery.data ?? null;
  const loading = workspaceQuery.isPending || periodQuery.isPending;

  React.useEffect(() => {
    if (workspaceQuery.error) {
      toast.error("Не вдалося завантажити команду", { description: getErrorMessage(workspaceQuery.error, "") });
    }
  }, [workspaceQuery.error]);
  React.useEffect(() => {
    if (periodQuery.error) {
      toast.error("Не вдалося завантажити виплати", { description: getErrorMessage(periodQuery.error, "") });
    }
  }, [periodQuery.error]);

  // РЕДАКТОР — ГІБРИД, і це навмисно. Це не список, а табличка місяця з
  // debounce-автозбереженням: суми (queueSaveAmount), нотатки (saveNote,
  // оптимістично) і мета виплат (saveMeta, оптимістично) пишуть у локальний
  // стан. Кеш його лише гідратує, з правилом: НОВИЙ місяць (або перші дані
  // місяця) застосовуються завжди; фоновий рефетч того САМОГО місяця
  // застосовується тільки поки користувач у ньому нічого не редагував —
  // інакше рефетч, що стартував до вводу, перезаписав би цифри під пальцями.
  const [entries, setEntries] = React.useState<Map<string, PayrollEntry>>(new Map());
  const [meta, setMeta] = React.useState<Map<string, FinancePayoutMeta>>(new Map());
  const [drafts, setDrafts] = React.useState<Record<string, Draft>>({});
  const saveTimers = React.useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const periodDataKey = `${workspaceId ?? ""}:${period}`;
  const hydrationRef = React.useRef<{ key: string; at: number; dirty: boolean }>({
    key: "",
    at: 0,
    dirty: false,
  });
  const markPeriodDirty = React.useCallback(() => {
    if (hydrationRef.current.key === `${workspaceId ?? ""}:${period}`) {
      hydrationRef.current.dirty = true;
    }
  }, [workspaceId, period]);

  React.useEffect(() => {
    const data = periodQuery.data;
    if (!data) return;
    const ref = hydrationRef.current;
    const keyChanged = ref.key !== periodDataKey;
    if (!keyChanged && periodQuery.dataUpdatedAt <= ref.at) return;
    if (!keyChanged && ref.dirty) return;
    hydrationRef.current = { key: periodDataKey, at: periodQuery.dataUpdatedAt, dirty: false };
    setEntries(data.entries);
    setMeta(data.meta);
    const nextDrafts: Record<string, Draft> = {};
    data.entries.forEach((entry, uid) => {
      nextDrafts[uid] = {
        base: amountToInput(entry.baseAmount),
        bonus: amountToInput(entry.bonusAmount),
        deduction: amountToInput(entry.deductionAmount),
        advance: amountToInput(entry.advanceAmount),
        advanceDate: entry.advanceDate ?? "",
      };
    });
    // Ставка з картки співробітника підставляється ЛИШЕ у порожню клітинку.
    // «Заповнено» = у відомості вже стоїть ненульова ставка: саме її не можна
    // перетирати. Нуль порожній і візуально (amountToInput(0) === ""), і по суті
    // — рядок місяця часто вже існує з нулями, і вимога «рядка нема» не
    // спрацювала б узагалі.
    data.rates.forEach((rate, uid) => {
      const existing = nextDrafts[uid];
      if (existing?.base) return;
      nextDrafts[uid] = { ...(existing ?? EMPTY_DRAFT), base: amountToInput(rate) };
    });
    setDrafts(nextDrafts);
  }, [periodQuery.data, periodQuery.dataUpdatedAt, periodDataKey]);

  const people = React.useMemo<Person[]>(() => {
    const real = members
      .filter((m) => {
        if (PAYROLL_EXCLUDED_USER_IDS.has(m.userId)) return false;
        const departed = m.employmentStatus === "rejected" || m.employmentStatus === "inactive";
        // Active people always show; those we ended collaboration with only appear
        // in months where they have a payroll entry (past months), never future ones.
        return !departed || entries.has(m.userId);
      })
      .map<Person>((m) => ({
        userId: m.userId,
        name: m.displayName || m.fullName || m.label || m.email || "Без імені",
        jobRole: m.jobRole,
        avatarUrl: m.avatarDisplayUrl ?? null,
        initials: m.initials ?? null,
        departed: m.employmentStatus === "rejected" || m.employmentStatus === "inactive",
      }));
    const manual = MANUAL_PAYROLL_PEOPLE.map<Person>((p) => ({
      userId: p.userId,
      name: p.name,
      jobRole: p.jobRole,
      avatarUrl: null,
      initials: null,
      departed: false,
    }));
    return [...real, ...manual];
  }, [members, entries]);

  const draftFor = (uid: string): Draft => drafts[uid] ?? EMPTY_DRAFT;

  // Підставлену ставку одразу закріплюємо в базі. Інакше у відомості видно одні
  // числа, а збережено інші: людину можна позначити виплаченою (це пише в іншу
  // таблицю), і ставка так і лишилась би нулем, а підсумок минулого місяця
  // рахується вже зі збереженого.
  const prefillSavedRef = React.useRef("");
  React.useEffect(() => {
    const data = periodQuery.data;
    if (!data || !workspaceId || people.length === 0) return;
    if (prefillSavedRef.current === periodDataKey) return;
    prefillSavedRef.current = periodDataKey;

    const pending = people.filter((p) => {
      if (!data.rates.has(p.userId)) return false;
      const stored = data.entries.get(p.userId);
      return !stored || stored.baseAmount <= 0;
    });
    if (pending.length === 0) return;

    void Promise.all(
      pending.map((p) => {
        // Рядок місяця може вже існувати з бонусом чи нотаткою — переписуємо в
        // ньому РІВНО ставку, решту лишаємо як є.
        const stored = data.entries.get(p.userId);
        return upsertPayrollEntry({
          workspaceId,
          userId: p.userId,
          period,
          updatedBy: userId,
          values: {
            baseAmount: data.rates.get(p.userId) as number,
            bonusAmount: stored?.bonusAmount ?? 0,
            deductionAmount: stored?.deductionAmount ?? 0,
            advanceAmount: stored?.advanceAmount ?? 0,
            advanceDate: stored?.advanceDate ?? null,
            note: stored?.note ?? null,
          },
        });
      })
    ).catch((error) =>
      toast.error("Не вдалося підставити ставки", { description: getErrorMessage(error, "") })
    );
  }, [periodQuery.data, periodDataKey, people, workspaceId, period, userId]);

  // Аванс віднімається: це вже видані гроші, тож у колонці лишається залишок.
  // Той самий вираз зашитий у generated-колонку total_amount (див.
  // scripts/payroll-advance-subtracts.sql) — тримаємо їх однаковими.
  const totalFor = (uid: string): number => {
    const d = draftFor(uid);
    return (
      parsePayrollAmount(d.base) +
      parsePayrollAmount(d.bonus) -
      parsePayrollAmount(d.deduction) -
      parsePayrollAmount(d.advance)
    );
  };

  const totals = React.useMemo(() => {
    let base = 0;
    let bonus = 0;
    let advance = 0;
    let total = 0;
    let paid = 0;
    for (const person of people) {
      const d = draftFor(person.userId);
      const b = parsePayrollAmount(d.base);
      const bo = parsePayrollAmount(d.bonus);
      const adv = parsePayrollAmount(d.advance);
      const t = b + bo - parsePayrollAmount(d.deduction) - adv;
      base += b;
      bonus += bo;
      advance += adv;
      total += t;
      if (meta.get(person.userId)?.status === "paid") paid += t;
    }
    return { base, bonus, advance, total, paid };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [people, drafts, entries, meta]);

  const queueSaveAmount = (uid: string, patch: Partial<Draft>) => {
    markPeriodDirty();
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
          advanceAmount: parsePayrollAmount(d.advance),
          advanceDate: d.advanceDate || null,
          note: entry?.note ?? null,
        },
      }).catch((error) => toast.error("Не збереглося", { description: getErrorMessage(error, "") }));
    }, 600);
  };

  const saveNote = async (uid: string, note: string) => {
    if (!workspaceId) return;
    markPeriodDirty();
    const d = draftFor(uid);
    const trimmed = note.trim();
    const nextNote = trimmed ? trimmed : null;
    const baseAmount = parsePayrollAmount(d.base);
    const bonusAmount = parsePayrollAmount(d.bonus);
    const deductionAmount = parsePayrollAmount(d.deduction);
    const advanceAmount = parsePayrollAmount(d.advance);
    const advanceDate = d.advanceDate || null;
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
        advanceAmount,
        advanceDate,
        totalAmount: baseAmount + bonusAmount - deductionAmount - advanceAmount,
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
        values: { baseAmount, bonusAmount, deductionAmount, advanceAmount, advanceDate, note: nextNote },
      });
    } catch (error) {
      toast.error("Не вдалося зберегти нотатку", { description: getErrorMessage(error, "") });
    }
  };

  const saveMeta = async (uid: string, patch: Partial<FinancePayoutMeta>) => {
    if (!teamId) return;
    markPeriodDirty();
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
      {/* Липкий бар місяця — спільний із Витратами: місяць видно і під час скролу таблиці. */}
      <FinanceMonthBar
        label={`${PAYROLL_MONTHS[month - 1]} ${year}`}
        onPrev={() => shiftMonth(-1)}
        onNext={() => shiftMonth(1)}
        onReset={() => {
          setYear(now.getFullYear());
          setMonth(now.getMonth() + 1);
        }}
        showReset={year !== now.getFullYear() || month !== now.getMonth() + 1}
      />

      {/* Bento-підсумок місяця (спільний із Витратами): скільки платимо, прогрес
          виплат смугою (виплачено/лишилось) і склад суми у виносці. */}
      <FinanceBentoSummary
        title={`До виплати за ${PAYROLL_MONTHS[month - 1].toLowerCase()} ${year}`}
        totalText={formatUAH(totals.total)}
        deltaPct={prevTotal !== null && prevTotal > 0 ? ((totals.total - prevTotal) / prevTotal) * 100 : null}
        deltaVs={monthGenitive(
          `${prev.year}-${String(prev.month).padStart(2, "0")}`,
          `${year}-${String(month).padStart(2, "0")}`
        )}
        buckets={
          totals.total > 0
            ? [
                { key: "paid", label: "Виплачено", amount: totals.paid, color: "tone-dot-success" },
                { key: "remaining", label: "Лишилось", amount: Math.max(0, totals.total - totals.paid), color: "tone-dot-warning" },
              ].filter((b) => b.amount > 0)
            : []
        }
        footnote={
          <>
            <span>
              Ставки: <span className="font-medium tabular-nums text-foreground/80">{formatUAH(totals.base)}</span>
            </span>
            <span>
              Бонуси: <span className="font-medium tabular-nums text-foreground/80">{formatUAH(totals.bonus)}</span>
            </span>
            {totals.advance > 0 ? (
              <span>
                Видано авансом:{" "}
                <span className="font-medium tabular-nums text-foreground/80">{formatUAH(totals.advance)}</span>
              </span>
            ) : null}
          </>
        }
      />

      {loading ? (
        <PayrollTableSkeleton />
      ) : (
        <div className="rounded-xl border border-border/60">
          {/* table-fixed + % widths: columns stretch to fill the width and scale
              down on narrower screens without a horizontal scrollbar. */}
          <Table size="sm" stickyHeader className="table-fixed">
            <TableHeader>
              <TableRow>
                {/* Колонки з полями вводу вирівняні ліворуч: поле займає всю
                    ширину клітинки, тож заголовок мусить стояти над його лівим
                    краєм. Праворуч лишається тільки «До виплати» — там у
                    клітинці звичайне число, притиснуте вправо, і заголовок
                    тримається з ним в одній лінії. */}
                {PAYROLL_COLUMNS.map((column) => (
                  <TableHead key={column.key} className={cn(STICKY_HEAD, column.width, column.align)}>
                    {column.label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {people.map((person) => {
                const d = draftFor(person.userId);
                const m = meta.get(person.userId);
                const isPaid = m?.status === "paid";
                return (
                  <TableRow key={person.userId}>
                    <TableCell>
                      <div className="flex min-w-0 items-center gap-2">
                        <AvatarBase
                          src={person.avatarUrl}
                          name={person.name}
                          fallback={person.initials ?? person.name.slice(0, 2)}
                          size={28}
                          className={cn("shrink-0 border-border/60", person.departed && "grayscale opacity-80")}
                        />
                        <div className="min-w-0 flex-1">
                          <div
                            className={cn(
                              "truncate text-sm font-medium",
                              person.departed && "text-muted-foreground line-through"
                            )}
                            title={person.name}
                          >
                            {shortenName(person.name)}
                          </div>
                          {person.jobRole ? (
                            // Довгі посади («Начальник відділу логістики») інакше
                            // розпирали колонку і лізли в сусідні.
                            <div
                              className="truncate text-2xs text-muted-foreground"
                              title={formatJobRole(person.jobRole)}
                            >
                              {formatJobRole(person.jobRole)}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <AmountInput
                        value={d.base}
                        onChange={(next) => queueSaveAmount(person.userId, { base: next })}
                        label="Ставка"
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <AmountInput
                        value={d.bonus}
                        onChange={(next) => queueSaveAmount(person.userId, { bonus: next })}
                        label="Бонус"
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <AmountInput
                        value={d.deduction}
                        onChange={(next) => queueSaveAmount(person.userId, { deduction: next })}
                        label="Офіційна ЗП"
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <AdvanceCell
                        amount={d.advance}
                        date={d.advanceDate}
                        onAmountChange={(next) => queueSaveAmount(person.userId, { advance: next })}
                        onDateChange={(next) => queueSaveAmount(person.userId, { advanceDate: next })}
                      />
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right text-sm font-medium tabular-nums">
                      {formatUAH(totalFor(person.userId))}
                    </TableCell>
                    <TableCell>
                      <PayrollNoteCell
                        note={entries.get(person.userId)?.note ?? null}
                        onSave={(text) => saveNote(person.userId, text)}
                      />
                    </TableCell>
                    <TableCell className="text-center">
                      <PayoutStatusButton
                        paid={isPaid}
                        paidAt={m?.paidAt ?? null}
                        onToggle={() =>
                          void saveMeta(person.userId, {
                            status: isPaid ? "pending" : "paid",
                            // Дата фіксується разом зі статусом — саме вона потім
                            // пояснює в підказці, коли гроші пішли.
                            paidAt: isPaid ? null : new Date().toISOString(),
                          })
                        }
                      />
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

/**
 * Заглушка таблиці виплат.
 *
 * Малюється тією ж <Table> і тими ж PAYROLL_COLUMNS, що й справжня, тож
 * ширини колонок, висота рядків і форма клітинок збігаються точно. Попередня
 * версія була узагальненою сіткою однакових пігулок і з таблицею не мала
 * нічого спільного.
 */
function PayrollTableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="rounded-xl border border-border/60" role="status" aria-busy="true" aria-label="Завантаження виплат">
      <Table size="sm" stickyHeader className="table-fixed">
        <TableHeader>
          <TableRow>
            {PAYROLL_COLUMNS.map((column) => (
              <TableHead key={column.key} className={cn(STICKY_HEAD, column.width, column.align)}>
                {column.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: rows }).map((_, index) => (
            <TableRow key={index}>
              {PAYROLL_COLUMNS.map((column) => (
                <TableCell key={column.key} className={column.align}>
                  {column.cell === "person" ? (
                    <div className="flex min-w-0 items-center gap-2">
                      <Skeleton className="h-7 w-7 shrink-0 rounded-full" />
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <Skeleton className={cn("h-3 rounded-full", index % 3 === 0 ? "w-[64%]" : "w-[52%]")} />
                        <Skeleton
                          className={cn("h-2.5 rounded-full opacity-70", index % 2 === 0 ? "w-[42%]" : "w-[56%]")}
                        />
                      </div>
                    </div>
                  ) : column.cell === "input" ? (
                    // Та сама висота й радіус, що в поля вводу — рядок не стрибне.
                    <Skeleton className="h-8 w-full rounded-md" />
                  ) : column.cell === "amount" ? (
                    <Skeleton className="ml-auto h-3.5 w-16 rounded-full" />
                  ) : column.cell === "note" ? (
                    <div className="flex items-center gap-1.5">
                      <Skeleton className="h-3.5 w-3.5 shrink-0 rounded" />
                      <Skeleton className="h-3 w-14 rounded-full opacity-70" />
                    </div>
                  ) : (
                    <Skeleton className="mx-auto h-5 w-9 rounded-full" />
                  )}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/**
 * Аванс: сума + дата видачі.
 *
 * Дата живе в поповері, а не окремим полем під сумою: інлайнове поле
 * з'являлось лише при заповненій сумі й від того стрибала висота рядка, а вся
 * таблиця «дихала». Кнопка-тригер тієї ж висоти, що й поле (h-8), і присутня
 * завжди, тож рядок не змінює висоту ні за яких значень.
 *
 * Без суми дата недоступна — цього ж вимагає перевірка в БД
 * (payroll_entries_advance_date_needs_amount).
 */
function AdvanceCell({
  amount,
  date,
  onAmountChange,
  onDateChange,
}: {
  amount: string;
  date: string;
  onAmountChange: (next: string) => void;
  onDateChange: (next: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const hasAmount = parsePayrollAmount(amount) > 0;

  return (
    <div className="relative">
      {/* Місце під дату звільняємо лише тоді, коли вона взагалі може бути:
          без суми клітинка нічим не відрізняється від «Ставки» чи «Бонуса». */}
      <AmountInput
        value={amount}
        onChange={onAmountChange}
        label="Аванс"
        className={cn(hasAmount && "pl-[3.25rem]")}
      />
      {hasAmount ? (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={date ? `Дата авансу: ${formatDayMonth(date)}` : "Вказати дату авансу"}
              className={cn(
                "absolute left-1.5 top-1/2 -translate-y-1/2 rounded px-1 py-0.5 text-2xs tabular-nums",
                "transition-colors hover:bg-muted hover:text-foreground",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20",
                date ? "text-muted-foreground" : "text-muted-foreground/70"
              )}
            >
              {date ? formatDayMonth(date) : "дата"}
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" side="bottom" className="w-auto space-y-2 p-2">
            <Input
              type="date"
              controlSize="sm"
              value={date}
              onChange={(e) => onDateChange(e.target.value)}
              aria-label="Дата видачі авансу"
              className="w-[9.5rem]"
            />
            {date ? (
              <Button
                type="button"
                variant="ghost"
                size="xs"
                className="w-full text-muted-foreground"
                onClick={() => {
                  onDateChange("");
                  setOpen(false);
                }}
              >
                Прибрати дату
              </Button>
            ) : null}
          </PopoverContent>
        </Popover>
      ) : null}
    </div>
  );
}

/**
 * Статус виплати — іконка, а не кнопка з текстом: у рядку це вузька колонка,
 * і напис «Позначити» з'їдав місце, нічого не додаючи. Стан читається і формою
 * (порожнє коло проти галочки в колі), і кольором, тож не тримається лише на
 * кольорі. Пояснення — у підказці по наведенню.
 */
function PayoutStatusButton({
  paid,
  paidAt,
  onToggle,
}: {
  paid: boolean;
  paidAt: string | null;
  onToggle: () => void;
}) {
  const label = paid
    ? `Виплачено${paidAt ? ` ${formatFullDate(paidAt)}` : ""}. Перемкніть, щоб зняти позначку.`
    : "Ще не виплачено. Перемкніть, щоб позначити виплату.";

  return (
    <div className="flex items-center justify-center">
      <HoverTip label={label}>
        <Switch
          checked={paid}
          onCheckedChange={onToggle}
          label={paid ? "Виплачено" : "Позначити виплаченим"}
          size="sm"
          tone="success"
        />
      </HoverTip>
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
    if (!hasNote) return; // no hover popover for empty notes — click to add instead
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
            // Fills the fixed-layout note column; content truncates with «…».
            "flex w-full min-w-0 items-center gap-1.5 rounded-md px-2 py-1 text-left text-sm transition-colors hover:bg-muted/60",
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
