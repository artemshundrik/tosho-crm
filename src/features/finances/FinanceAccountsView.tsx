import * as React from "react";
import { toast } from "sonner";
import { Loader2, ShieldAlert, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatOrderMoney } from "@/features/orders/orderRecords";
import { useFxRates } from "@/lib/fxRates";
import { listAccounts, listExpenses, listPayments } from "./api";
import { BENTO_COLORS, FinanceBentoSummary } from "./FinanceBentoSummary";
import {
  ACCOUNT_KIND_LABELS,
  expenseUahAmount,
  paymentUahValue,
  type FinanceAccount,
  type FinanceExpense,
  type FinancePayment,
} from "./types";

type FinanceAccountsViewProps = { teamId: string | null; canSeeSensitive: boolean };

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

export function FinanceAccountsView({ teamId, canSeeSensitive }: FinanceAccountsViewProps) {
  const rates = useFxRates();
  const [accounts, setAccounts] = React.useState<FinanceAccount[]>([]);
  const [payments, setPayments] = React.useState<FinancePayment[]>([]);
  const [expenses, setExpenses] = React.useState<FinanceExpense[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (!teamId) return;
    let active = true;
    setLoading(true);
    void Promise.all([listAccounts(teamId), listPayments(teamId), listExpenses(teamId)])
      .then(([a, p, e]) => {
        if (!active) return;
        setAccounts(a);
        setPayments(p);
        setExpenses(e);
      })
      .catch((error) => active && toast.error("Не вдалося завантажити каси", { description: getErrorMessage(error, "") }))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [teamId]);

  const visibleAccounts = React.useMemo(
    () => (canSeeSensitive ? accounts : accounts.filter((a) => !a.isSensitive)),
    [accounts, canSeeSensitive]
  );

  const inByAccount = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const p of payments) {
      if (!p.accountId) continue;
      map.set(p.accountId, (map.get(p.accountId) ?? 0) + paymentUahValue(p));
    }
    return map;
  }, [payments]);

  const outByAccount = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const e of expenses) {
      if (!e.accountId) continue;
      // Валютні витрати переводимо в гривню, інакше $200 віднімались би як 200 ₴.
      map.set(e.accountId, (map.get(e.accountId) ?? 0) + (expenseUahAmount(e, rates) ?? 0));
    }
    return map;
  }, [expenses, rates]);

  const grandBalance = React.useMemo(
    () => visibleAccounts.reduce((s, a) => s + ((inByAccount.get(a.id) ?? 0) - (outByAccount.get(a.id) ?? 0)), 0),
    [visibleAccounts, inByAccount, outByAccount]
  );

  // Кошики bento: додатні баланси кас (смуга не вміє відʼємних — ті йдуть у виноску).
  const accountBuckets = React.useMemo(
    () =>
      visibleAccounts
        .map((a) => ({ account: a, balance: (inByAccount.get(a.id) ?? 0) - (outByAccount.get(a.id) ?? 0) }))
        .filter((x) => x.balance > 0)
        .map((x, i) => ({
          key: x.account.id,
          label: x.account.name,
          amount: x.balance,
          color: BENTO_COLORS[i % BENTO_COLORS.length],
        })),
    [visibleAccounts, inByAccount, outByAccount]
  );
  const negativeAccounts = React.useMemo(
    () =>
      visibleAccounts
        .map((a) => ({ id: a.id, name: a.name, balance: (inByAccount.get(a.id) ?? 0) - (outByAccount.get(a.id) ?? 0) }))
        .filter((x) => x.balance < 0),
    [visibleAccounts, inByAccount, outByAccount]
  );

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border/50 bg-muted/10 px-4 py-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Завантаження…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Bento-підсумок (спільний із Витратами): всього грошей і як вони лежать по касах. */}
      <FinanceBentoSummary
        title="Всього по касах"
        totalText={formatOrderMoney(grandBalance, "UAH")}
        buckets={accountBuckets}
        footnote={
          <>
            <span>Баланс = надходження − витрати через касу. Каси додаються в «Налаштування → Каси та рахунки».</span>
            {negativeAccounts.map((x) => (
              <span key={x.id} className="text-destructive">
                {x.name}: {formatOrderMoney(x.balance, "UAH")}
              </span>
            ))}
          </>
        }
      />

      {visibleAccounts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/60 bg-muted/10 p-8 text-center">
          <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-xl border border-border/60 bg-background">
            <Wallet className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">Ще немає кас. Додайте в налаштуваннях.</p>
        </div>
      ) : (
        <div className="grid gap-2">
          {visibleAccounts.map((account) => {
            const inSum = inByAccount.get(account.id) ?? 0;
            const outSum = outByAccount.get(account.id) ?? 0;
            const balance = inSum - outSum;
            return (
              <div
                key={account.id}
                /* Чутливість НЕ фарбує весь ряд (жовта заливка на широкій площі —
                   бруд): сигнал несе бейдж «Топ-ролі». */
                className="flex items-center justify-between gap-3 rounded-xl border border-border/40 bg-card shadow-card px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-foreground">{account.name}</span>
                    <span className="rounded-full border border-border/60 px-2 py-0.5 text-3xs text-muted-foreground">
                      {ACCOUNT_KIND_LABELS[account.kind]}
                    </span>
                    <span className="text-3xs text-muted-foreground">{account.currency}</span>
                    {account.isSensitive ? (
                      <Badge tone="warning" className="gap-1 text-3xs">
                        <ShieldAlert className="h-3 w-3" /> Топ-ролі
                      </Badge>
                    ) : null}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                    <span>Надійшло: {formatOrderMoney(inSum, "UAH")}</span>
                    <span>Витрачено: {formatOrderMoney(outSum, "UAH")}</span>
                  </div>
                </div>
                <span className={cn("shrink-0 text-sm font-semibold", balance < 0 ? "text-destructive" : "text-foreground")}>
                  {formatOrderMoney(balance, "UAH")}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
