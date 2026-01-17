import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowUpRight,
  BadgeAlert,
  BadgeCheck,
  CalendarDays,
  CircleDollarSign,
  CreditCard,
  FolderPlus,
  Receipt,
  TrendingUp,
  Wallet,
  WalletCards,
} from "lucide-react";

import { supabase } from "@/lib/supabaseClient";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { OperationalSummary } from "@/components/app/OperationalSummary";
import { usePageHeaderActions } from "@/components/app/page-header-actions";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import { useMinimumLoading } from "@/hooks/useMinimumLoading";
import { usePageCache } from "@/hooks/usePageCache";

const TEAM_ID = "389719a7-5022-41da-bc49-11e7a3afbd98";

type FinancePlan = {
  id: string;
  name: string;
  description: string | null;
  amount: number | string;
  currency: string;
  billing_period: string;
  is_active: boolean;
};

type FinanceRecurringRule = {
  id: string;
  title: string;
  scope: string;
  status: string;
  schedule: string;
  next_run_date: string | null;
  amount: number | string | null;
  currency: string;
};

type FinanceTransaction = {
  id: string;
  player_id: string | null;
  type: "income" | "expense";
  category: string | null;
  amount: number | string;
  currency: string;
  status: "pending" | "paid" | "canceled" | "refunded";
  occurred_at: string;
  note: string | null;
};

type FinanceInvoice = {
  id: string;
  player_id: string | null;
  title: string | null;
  status: "draft" | "sent" | "paid" | "overdue" | "canceled";
  amount: number | string;
  currency: string;
  due_date: string | null;
  paid_at: string | null;
};

type FinancePool = {
  id: string;
  title: string;
  total_amount: number | string;
  due_date: string | null;
  status: string;
  created_at: string;
};

type FinancePoolParticipant = {
  id: string;
  pool_id: string;
  expected_amount: number | string;
  paid_amount: number | string | null;
};

type PlayerLite = {
  id: string;
  first_name: string | null;
  last_name: string | null;
};

type FinancePageCache = {
  plans: FinancePlan[];
  rules: FinanceRecurringRule[];
  transactions: FinanceTransaction[];
  invoices: FinanceInvoice[];
  pools: FinancePool[];
  poolParticipants: FinancePoolParticipant[];
  players: Record<string, PlayerLite>;
};

const statusLabel: Record<FinanceTransaction["status"], string> = {
  pending: "Очікує",
  paid: "Оплачено",
  canceled: "Скасовано",
  refunded: "Повернено",
};

const statusTone: Record<FinanceTransaction["status"], "success" | "info" | "danger" | "neutral"> = {
  paid: "success",
  pending: "info",
  canceled: "danger",
  refunded: "neutral",
};

const invoiceStatusLabel: Record<FinanceInvoice["status"], string> = {
  draft: "Чернетка",
  sent: "Надіслано",
  paid: "Оплачено",
  overdue: "Прострочено",
  canceled: "Скасовано",
};

const planPeriodLabel: Record<string, string> = {
  once: "Разово",
  monthly: "Щомісяця",
  season: "Сезон",
  per_training: "За тренування",
  custom: "Індивідуально",
};

function toNumber(value: number | string) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatCurrency(amount: number, currency = "UAH") {
  try {
    return new Intl.NumberFormat("uk-UA", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat("uk-UA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(date));
}

function daysOverdue(dueDate: string | null) {
  if (!dueDate) return null;
  const diff = new Date().getTime() - new Date(dueDate).getTime();
  if (diff <= 0) return 0;
  return Math.floor(diff / (24 * 60 * 60 * 1000));
}

export function FinancePage() {
  const navigate = useNavigate();
  const { cached, setCache } = usePageCache<FinancePageCache>("finance");
  const hasCacheRef = useRef(Boolean(cached));

  const [plans, setPlans] = useState<FinancePlan[]>(cached?.plans ?? []);
  const [rules, setRules] = useState<FinanceRecurringRule[]>(cached?.rules ?? []);
  const [transactions, setTransactions] = useState<FinanceTransaction[]>(cached?.transactions ?? []);
  const [invoices, setInvoices] = useState<FinanceInvoice[]>(cached?.invoices ?? []);
  const [pools, setPools] = useState<FinancePool[]>(cached?.pools ?? []);
  const [poolParticipants, setPoolParticipants] = useState<FinancePoolParticipant[]>(
    cached?.poolParticipants ?? []
  );
  const [players, setPlayers] = useState<Record<string, PlayerLite>>(cached?.players ?? {});
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState<string | null>(null);
  const showSkeleton = useMinimumLoading(loading);

  useEffect(() => {
    async function load() {
      if (!hasCacheRef.current) {
        setLoading(true);
      }
      setError(null);
      try {
        let nextPoolParticipants: FinancePoolParticipant[] = [];
        let nextPlayers: Record<string, PlayerLite> = {};
        const [plansRes, rulesRes, txRes, invRes, poolsRes] = await Promise.all([
          supabase
            .from("finance_plans")
            .select("id, name, description, amount, currency, billing_period, is_active")
            .eq("team_id", TEAM_ID)
            .order("created_at", { ascending: false }),
          supabase
            .from("finance_recurring_rules")
            .select("id, title, scope, status, schedule, next_run_date, amount, currency")
            .eq("team_id", TEAM_ID)
            .order("created_at", { ascending: false }),
          supabase
            .from("finance_transactions")
            .select("id, player_id, type, category, amount, currency, status, occurred_at, note")
            .eq("team_id", TEAM_ID)
            .order("occurred_at", { ascending: false })
            .limit(50),
          supabase
            .from("finance_invoices")
            .select("id, player_id, title, status, amount, currency, due_date, paid_at")
            .eq("team_id", TEAM_ID)
            .order("created_at", { ascending: false }),
          supabase
            .from("finance_pools")
            .select("id, title, total_amount, due_date, status, created_at")
            .eq("team_id", TEAM_ID)
            .order("created_at", { ascending: false }),
        ]);

        if (plansRes.error) throw plansRes.error;
        if (rulesRes.error) throw rulesRes.error;
        if (txRes.error) throw txRes.error;
        if (invRes.error) throw invRes.error;
        if (poolsRes.error) throw poolsRes.error;

        const txData = (txRes.data || []) as FinanceTransaction[];
        const invData = (invRes.data || []) as FinanceInvoice[];

        setPlans((plansRes.data || []) as FinancePlan[]);
        setRules((rulesRes.data || []) as FinanceRecurringRule[]);
        setTransactions(txData);
        setInvoices(invData);
        const poolRows = (poolsRes.data || []) as FinancePool[];
        setPools(poolRows);

        if (poolRows.length > 0) {
          const { data: participantsData, error: participantsError } = await supabase
            .from("finance_pool_participants")
            .select("id, pool_id, expected_amount, paid_amount")
            .in("pool_id", poolRows.map((p) => p.id));
          if (!participantsError && participantsData) {
            nextPoolParticipants = participantsData as FinancePoolParticipant[];
            setPoolParticipants(nextPoolParticipants);
          } else if (participantsError) {
            throw participantsError;
          }
        } else {
          nextPoolParticipants = [];
          setPoolParticipants([]);
        }

        const playerIds = Array.from(
          new Set(
            [...txData.map((t) => t.player_id), ...invData.map((i) => i.player_id)].filter(
              Boolean
            ) as string[]
          )
        );

        if (playerIds.length) {
          const playersRes = await supabase
            .from("players")
            .select("id, first_name, last_name")
            .in("id", playerIds);
          if (!playersRes.error && playersRes.data) {
            const map: Record<string, PlayerLite> = {};
            (playersRes.data as PlayerLite[]).forEach((p) => {
              map[p.id] = p;
            });
            nextPlayers = map;
            setPlayers(map);
          } else {
            nextPlayers = {};
            setPlayers({});
          }
        } else {
          nextPlayers = {};
          setPlayers({});
        }

        setCache({
          plans: (plansRes.data || []) as FinancePlan[],
          rules: (rulesRes.data || []) as FinanceRecurringRule[],
          transactions: txData,
          invoices: invData,
          pools: poolRows,
          poolParticipants: nextPoolParticipants,
          players: nextPlayers,
        });
        hasCacheRef.current = true;
      } catch (e: any) {
        console.error(e);
        setError(e.message || "Не вдалося завантажити фінанси");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  const paidTransactions = useMemo(
    () => transactions.filter((t) => t.status === "paid"),
    [transactions]
  );

  const poolSummary = useMemo(() => {
    const byPool = new Map<string, { expected: number; paid: number }>();
    poolParticipants.forEach((p) => {
      const current = byPool.get(p.pool_id) || { expected: 0, paid: 0 };
      current.expected += toNumber(p.expected_amount);
      current.paid += toNumber(p.paid_amount ?? 0);
      byPool.set(p.pool_id, current);
    });
    return byPool;
  }, [poolParticipants]);

  const incomeTotal = useMemo(
    () =>
      paidTransactions
        .filter((t) => t.type === "income")
        .reduce((sum, t) => sum + toNumber(t.amount), 0),
    [paidTransactions]
  );

  const expenseTotal = useMemo(
    () =>
      paidTransactions
        .filter((t) => t.type === "expense")
        .reduce((sum, t) => sum + toNumber(t.amount), 0),
    [paidTransactions]
  );

  const balance = incomeTotal - expenseTotal;

  const unpaidInvoices = useMemo(
    () => invoices.filter((inv) => inv.status === "sent" || inv.status === "overdue"),
    [invoices]
  );

  const debtTotal = useMemo(
    () => unpaidInvoices.reduce((sum, inv) => sum + toNumber(inv.amount), 0),
    [unpaidInvoices]
  );

  const debtors = useMemo(() => {
    return unpaidInvoices
      .filter((inv) => inv.player_id)
      .sort((a, b) => toNumber(b.amount) - toNumber(a.amount))
      .slice(0, 3)
      .map((inv) => {
        const player = inv.player_id ? players[inv.player_id] : null;
        const name = player
          ? `${player.first_name ?? ""} ${player.last_name ?? ""}`.trim()
          : "Гравець";
        const overdue = daysOverdue(inv.due_date);
        const dueLabel = overdue !== null && overdue > 0 ? `${overdue} днів прострочки` : "Очікує";
        return {
          name,
          amount: formatCurrency(toNumber(inv.amount), inv.currency),
          due: dueLabel,
        };
      });
  }, [players, unpaidInvoices]);

  const debtorsCount = new Set(unpaidInvoices.map((inv) => inv.player_id).filter(Boolean)).size;

  const revenueBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    paidTransactions
      .filter((t) => t.type === "income")
      .forEach((t) => {
        const key = t.category || "Без категорії";
        map.set(key, (map.get(key) || 0) + toNumber(t.amount));
      });
    const total = Array.from(map.values()).reduce((sum, v) => sum + v, 0);
    const rows = Array.from(map.entries())
      .map(([label, value]) => ({
        label,
        value: total ? Math.round((value / total) * 100) : 0,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 4);

    if (rows.length === 0) {
      return [
        { label: "Тренування", value: 0 },
        { label: "Турніри", value: 0 },
        { label: "Мерч", value: 0 },
        { label: "Інше", value: 0 },
      ];
    }
    return rows;
  }, [paidTransactions]);

  const expenseBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    paidTransactions
      .filter((t) => t.type === "expense")
      .forEach((t) => {
        const key = t.category || "Без категорії";
        map.set(key, (map.get(key) || 0) + toNumber(t.amount));
      });
    const total = Array.from(map.values()).reduce((sum, v) => sum + v, 0);
    const rows = Array.from(map.entries())
      .map(([label, value]) => ({
        label,
        value: total ? Math.round((value / total) * 100) : 0,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 4);

    if (rows.length === 0) {
      return [
        { label: "Оренда", value: 0 },
        { label: "Судді", value: 0 },
        { label: "Екіпірування", value: 0 },
        { label: "Інше", value: 0 },
      ];
    }
    return rows;
  }, [paidTransactions]);

  const recentTransactions = useMemo(() => transactions.slice(0, 8), [transactions]);

  const headerActions = useMemo(
    () => (
      <>
        <Button variant="secondary" onClick={() => navigate("/finance/invoices/new")}>
          Створити рахунок
        </Button>
        <Button variant="primary" onClick={() => navigate("/finance/transactions/new")}>
          Додати платіж
        </Button>
      </>
    ),
    [navigate]
  );

  usePageHeaderActions(headerActions, [navigate]);

  return showSkeleton ? (
    <PageSkeleton />
  ) : error ? (
    <Alert variant="destructive">
      <AlertTitle>Помилка</AlertTitle>
      <AlertDescription>{error}</AlertDescription>
    </Alert>
  ) : (
    <div className="space-y-6">
      <OperationalSummary
        title="Фінанси"
        subtitle="Платежі, абонементи, доходи та витрати команди в одному місці."
        titleVariant="hidden"
        sectionLabel="Фінанси"
        sectionIcon={WalletCards}
        nextUpLoading={false}
        nextUp={{
          tournamentName: "Фінансовий огляд",
          primary: formatCurrency(balance),
          secondary: `Доходи ${formatCurrency(incomeTotal)} • Витрати ${formatCurrency(expenseTotal)}`,
          tourLabel: `За період: ${transactions.length} транзакцій`,
        }}
        kpis={[
          {
            key: "balance",
            label: "Баланс",
            value: formatCurrency(balance),
            icon: Wallet,
            iconTone: "text-emerald-500 bg-emerald-500/10",
          },
          {
            key: "income",
            label: "Доходи",
            value: formatCurrency(incomeTotal),
            icon: TrendingUp,
            iconTone: "text-blue-500 bg-blue-500/10",
          },
          {
            key: "expense",
            label: "Витрати",
            value: formatCurrency(expenseTotal),
            icon: CircleDollarSign,
            iconTone: "text-rose-500 bg-rose-500/10",
          },
          {
            key: "debt",
            label: "Борг",
            value: formatCurrency(debtTotal),
            icon: CreditCard,
            iconTone: "text-amber-500 bg-amber-500/10",
          },
        ]}
      />

      <Tabs defaultValue="billing" className="space-y-4">
        <TabsList className="w-fit">
          <TabsTrigger value="billing">Плани та нарахування</TabsTrigger>
          <TabsTrigger value="analytics">Аналітика</TabsTrigger>
          <TabsTrigger value="pools">Збори</TabsTrigger>
        </TabsList>

        <TabsContent value="billing" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-3">
            {plans.length === 0 ? (
              <Card className="col-span-full rounded-[var(--radius-section)] border border-dashed border-border bg-card/50 shadow-none">
                <CardContent className="p-6 text-sm text-muted-foreground">
                  Планів поки немає. Додайте перший план для абонементів або турнірних внесків.
                </CardContent>
              </Card>
            ) : (
              plans.map((plan) => (
                <Card key={plan.id} className="rounded-[var(--radius-section)] border border-border bg-card shadow-none">
                  <CardHeader className="space-y-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">{plan.name}</CardTitle>
                      <Badge tone={plan.is_active ? "info" : "neutral"} className="rounded-full">
                        {plan.is_active ? "Активний" : "Неактивний"}
                      </Badge>
                    </div>
                    <div className="text-2xl font-semibold text-foreground">
                      {formatCurrency(toNumber(plan.amount), plan.currency)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {planPeriodLabel[plan.billing_period] || "Індивідуально"}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4 text-sm text-muted-foreground">
                    <p>{plan.description || "Без опису"}</p>
                    <Button variant="outline" size="sm">
                      Керувати планом
                      <ArrowUpRight className="h-4 w-4" />
                    </Button>
                  </CardContent>
                </Card>
              ))
            )}
          </div>

          <Card className="rounded-[var(--radius-section)] border border-border bg-card shadow-none">
            <CardHeader>
              <CardTitle className="text-lg">Автоматичні нарахування</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {rules.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  Налаштуйте авто-нарахування для регулярних платежів.
                </div>
              ) : (
                rules.map((rule) => (
                  <div key={rule.id} className="flex flex-col gap-2 rounded-[var(--radius-inner)] border border-border bg-card/60 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="text-sm font-semibold text-foreground">{rule.title}</div>
                      <div className="text-xs text-muted-foreground">{rule.scope}</div>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <CalendarDays className="h-4 w-4" />
                        {rule.next_run_date ? formatDate(rule.next_run_date) : "—"}
                      </div>
                      <Badge variant="outline" className="rounded-full">
                        {rule.status}
                      </Badge>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="rounded-[var(--radius-section)] border border-border bg-card shadow-none">
            <CardHeader>
              <CardTitle className="text-lg">Останні транзакції</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {recentTransactions.length === 0 ? (
                <div className="text-sm text-muted-foreground">Транзакцій поки немає.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="text-left py-2">ID</th>
                      <th className="text-left py-2">Гравець / Стаття</th>
                      <th className="text-left py-2">Тип</th>
                      <th className="text-right py-2">Сума</th>
                      <th className="text-left py-2">Статус</th>
                      <th className="text-right py-2">Дата</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentTransactions.map((row) => {
                      const player = row.player_id ? players[row.player_id] : null;
                      const name = player
                        ? `${player.first_name ?? ""} ${player.last_name ?? ""}`.trim()
                        : row.category || "Команда";
                      const typeLabel = row.category || (row.type === "income" ? "Надходження" : "Витрата");
                      const sign = row.type === "income" ? "+" : "-";
                      return (
                        <tr key={row.id} className="border-t border-border">
                          <td className="py-3 text-muted-foreground">{row.id.slice(0, 6).toUpperCase()}</td>
                          <td className="py-3 text-foreground font-medium">{name || "—"}</td>
                          <td className="py-3 text-muted-foreground">{typeLabel}</td>
                          <td className="py-3 text-right font-semibold tabular-nums">
                            {sign}
                            {formatCurrency(toNumber(row.amount), row.currency)}
                          </td>
                          <td className="py-3">
                            <Badge tone={statusTone[row.status]} className="rounded-full">
                              {statusLabel[row.status]}
                            </Badge>
                          </td>
                          <td className="py-3 text-right text-muted-foreground">
                            {formatDate(row.occurred_at)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="rounded-[var(--radius-section)] border border-border bg-card shadow-none">
              <CardHeader>
                <CardTitle className="text-lg">Структура доходів</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {revenueBreakdown.map((item, idx) => (
                  <div key={`${item.label}-${idx}`} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-foreground font-medium">{item.label}</span>
                      <span className="text-muted-foreground">{item.value}%</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-muted">
                      <div
                        className={cn("h-2 rounded-full", idx === 0 ? "bg-emerald-500" : "bg-blue-500/50")}
                        style={{ width: `${item.value}%` }}
                      />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="rounded-[var(--radius-section)] border border-border bg-card shadow-none">
              <CardHeader>
                <CardTitle className="text-lg">Структура витрат</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {expenseBreakdown.map((item, idx) => (
                  <div key={`${item.label}-${idx}`} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-foreground font-medium">{item.label}</span>
                      <span className="text-muted-foreground">{item.value}%</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-muted">
                      <div
                        className={cn("h-2 rounded-full", idx === 0 ? "bg-rose-500" : "bg-orange-500/50")}
                        style={{ width: `${item.value}%` }}
                      />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
            <Card className="rounded-[var(--radius-section)] border border-border bg-card shadow-none">
              <CardHeader>
                <CardTitle className="text-lg">Фокус місяця</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-[var(--radius-inner)] border border-border bg-card/60 p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <BadgeCheck className="h-4 w-4 text-emerald-500" />
                    Оплачено {paidTransactions.length} транзакцій
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    Доходи переважають витрати на {formatCurrency(balance)}.
                  </div>
                  <div className="mt-3 h-2 w-full rounded-full bg-muted">
                    <div
                      className="h-2 rounded-full bg-emerald-500"
                      style={{ width: balance >= 0 ? "70%" : "35%" }}
                    />
                  </div>
                </div>

                <div className="rounded-[var(--radius-inner)] border border-border bg-card/60 p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <BadgeAlert className="h-4 w-4 text-rose-500" />
                    Прострочені рахунки
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    У списку {unpaidInvoices.length} рахунків із статусом "надіслано" або "прострочено".
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-[var(--radius-section)] border border-border bg-card shadow-none">
              <CardHeader>
                <CardTitle className="text-lg">Топ боржники</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {debtors.length === 0 ? (
                  <div className="text-sm text-muted-foreground">Немає боржників за обраний період.</div>
                ) : (
                  debtors.map((debtor) => (
                    <div key={debtor.name} className="flex items-center justify-between rounded-[var(--radius-inner)] border border-border bg-card/60 p-3">
                      <div>
                        <div className="text-sm font-semibold text-foreground">{debtor.name}</div>
                        <div className="text-xs text-muted-foreground">{debtor.due}</div>
                      </div>
                      <Badge variant="outline" className="rounded-full">
                        {debtor.amount}
                      </Badge>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="rounded-[var(--radius-section)] border border-border bg-card shadow-none">
            <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <CardTitle className="text-lg">Експорт і звіти</CardTitle>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm">
                  Експорт CSV
                </Button>
                <Button variant="outline" size="sm">
                  Експорт PDF
                </Button>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Receipt className="h-4 w-4 text-muted-foreground" />
                Звіти включають транзакції, плани та нарахування.
              </div>
              <div className="relative">
                <Input className={cn("pl-10")} placeholder="Пошук по транзакціях..." />
                <CreditCard className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pools" className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-base font-semibold text-foreground">Збори</div>
              <div className="text-sm text-muted-foreground">
                Контроль внесків, залишку та хто вже оплатив.
              </div>
            </div>
            <Button onClick={() => navigate("/finance/pools/new")}>
              <FolderPlus className="h-4 w-4" />
              Новий збір
            </Button>
          </div>

          {pools.length === 0 ? (
            <Card className="rounded-[var(--radius-section)] border border-dashed border-border bg-card/50 shadow-none">
              <CardContent className="p-6 text-sm text-muted-foreground">
                Зборів поки немає. Створіть перший збір для оренди або внесків.
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {pools.map((pool) => {
                const summary = poolSummary.get(pool.id) || { expected: 0, paid: 0 };
                const total = toNumber(pool.total_amount);
                const expected = summary.expected || total;
                const paid = summary.paid;
                const remaining = Math.max(expected - paid, 0);
                const percent = expected ? Math.round((paid / expected) * 100) : 0;
                return (
                  <Card key={pool.id} className="rounded-[var(--radius-section)] border border-border bg-card shadow-none">
                    <CardHeader className="space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <CardTitle className="text-lg truncate">{pool.title}</CardTitle>
                          <div className="text-xs text-muted-foreground">
                            {pool.due_date ? `До ${formatDate(pool.due_date)}` : "Без дедлайну"}
                          </div>
                        </div>
                        <Badge variant="outline" className="rounded-full">
                          {pool.status || "active"}
                        </Badge>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Сплачено {formatCurrency(paid)} із {formatCurrency(expected)}
                      </div>
                      <div className="h-2 w-full rounded-full bg-muted">
                        <div className="h-2 rounded-full bg-primary" style={{ width: `${percent}%` }} />
                      </div>
                    </CardHeader>
                    <CardContent className="flex items-center justify-between text-sm">
                      <div className="text-muted-foreground">
                        Залишилось: <span className="font-semibold text-foreground">{formatCurrency(remaining)}</span>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => navigate(`/finance/pools/${pool.id}`)}>
                        Деталі
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
