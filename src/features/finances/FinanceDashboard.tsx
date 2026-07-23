import * as React from "react";
import { toast } from "sonner";
import { AlertTriangle, Loader2, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatOrderMoney } from "@/features/orders/orderRecords";
import {
  useFinanceAccounts,
  useFinanceDerivedOrderNames,
  useFinanceInvoices,
  useFinanceLegalEntities,
  useFinancePayments,
} from "./queries";
import {
  invoiceIsReceivable,
  formatLegalEntityLabel,
  paymentUahValue,
  type FinanceAccount,
  type FinanceInvoice,
  type FinanceLegalEntity,
  type FinancePayment,
} from "./types";

type FinanceDashboardProps = {
  teamId: string | null;
  userId: string | null;
  canSeeSensitive: boolean;
};

type OrderMini = { customerName: string };

// Стабільні порожні значення для стану «дані ще не приїхали» — щоб useMemo
// нижче по файлу не перераховувались через новий [] на кожен рендер.
const EMPTY_PAYMENTS: FinancePayment[] = [];
const EMPTY_ACCOUNTS: FinanceAccount[] = [];
const EMPTY_ENTITIES: FinanceLegalEntity[] = [];
const EMPTY_INVOICES: FinanceInvoice[] = [];
const EMPTY_ORDERS = new Map<string, OrderMini>();

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

const monthStartISO = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
};

const uah = (value: number) => formatOrderMoney(value, "UAH");

export function FinanceDashboard({ teamId, userId, canSeeSensitive }: FinanceDashboardProps) {
  // React Query замість useEffect+useState: повторний вхід на вкладку рендерить
  // одразу з кешу, свіжість тримає refetchOnMount:"always" (див. queries.ts).
  const paymentsQuery = useFinancePayments(teamId);
  const accountsQuery = useFinanceAccounts(teamId);
  const entitiesQuery = useFinanceLegalEntities(teamId);
  const invoicesQuery = useFinanceInvoices(teamId);
  // Orders (for debtor names) — best-effort, не блокує дашборд (помилка → порожня мапа).
  const ordersQuery = useFinanceDerivedOrderNames(teamId, userId ?? null);

  const payments = paymentsQuery.data ?? EMPTY_PAYMENTS;
  const accounts = accountsQuery.data ?? EMPTY_ACCOUNTS;
  const entities = entitiesQuery.data ?? EMPTY_ENTITIES;
  const invoices = invoicesQuery.data ?? EMPTY_INVOICES;
  const ordersByQuote: Map<string, OrderMini> = ordersQuery.data ?? EMPTY_ORDERS;

  // isPending = нема ані кешу, ані відповіді. Фоновий рефетч свіжого кешу
  // скелетона не показує — саме тому перемикання вкладок стало миттєвим.
  const loading =
    paymentsQuery.isPending || accountsQuery.isPending || entitiesQuery.isPending || invoicesQuery.isPending;

  const loadError =
    paymentsQuery.error ?? accountsQuery.error ?? entitiesQuery.error ?? invoicesQuery.error ?? null;
  React.useEffect(() => {
    if (loadError) {
      toast.error("Не вдалося завантажити дашборд", { description: getErrorMessage(loadError, "") });
    }
  }, [loadError]);

  const accountById = React.useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);

  // Hide sensitive-account payments + accounts from non-top roles.
  const visiblePayments = React.useMemo(() => {
    if (canSeeSensitive) return payments;
    return payments.filter((p) => {
      const account = p.accountId ? accountById.get(p.accountId) : null;
      return !account?.isSensitive;
    });
  }, [payments, accountById, canSeeSensitive]);

  const visibleAccounts = React.useMemo(
    () => (canSeeSensitive ? accounts : accounts.filter((a) => !a.isSensitive)),
    [accounts, canSeeSensitive]
  );

  const monthStart = monthStartISO();

  const totalReceived = React.useMemo(
    () => visiblePayments.reduce((sum, p) => sum + paymentUahValue(p), 0),
    [visiblePayments]
  );
  const monthReceived = React.useMemo(
    () => visiblePayments.filter((p) => p.paidAt >= monthStart).reduce((sum, p) => sum + paymentUahValue(p), 0),
    [visiblePayments, monthStart]
  );

  // Received per account (proxy for "надійшло" — без витрат це ще не баланс).
  const receivedByAccount = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const p of visiblePayments) {
      if (!p.accountId) continue;
      map.set(p.accountId, (map.get(p.accountId) ?? 0) + paymentUahValue(p));
    }
    return map;
  }, [visiblePayments]);

  // Received per legal entity (контур) via the payment's account.
  const receivedByEntity = React.useMemo(() => {
    const map = new Map<string | null, number>();
    for (const p of visiblePayments) {
      const account = p.accountId ? accountById.get(p.accountId) : null;
      const entityId = account?.legalEntityId ?? null;
      map.set(entityId, (map.get(entityId) ?? 0) + paymentUahValue(p));
    }
    return map;
  }, [visiblePayments, accountById]);

  const entityName = React.useCallback(
    (id: string | null) => {
      if (!id) return "Без юрособи";
      const entity = entities.find((e) => e.id === id);
      return entity ? formatLegalEntityLabel(entity) : "Невідома юрособа";
    },
    [entities]
  );

  // Дебіторка: виставлено (активні рахунки) − оплачено, по замовленню.
  // Оплачено рахуємо по quote_id (як прив'язані оплати). Боржники — по замовнику.
  const paidByQuote = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const p of payments) {
      map.set(p.quoteId, (map.get(p.quoteId) ?? 0) + paymentUahValue(p));
    }
    return map;
  }, [payments]);

  const receivables = React.useMemo(() => {
    const byCustomer = new Map<string, { name: string; amount: number }>();
    let total = 0;
    for (const invoice of invoices) {
      if (!invoiceIsReceivable(invoice.status)) continue;
      const paid = invoice.quoteId ? paidByQuote.get(invoice.quoteId) ?? 0 : 0;
      const outstanding = invoice.amount - paid;
      if (outstanding <= 0.005) continue;
      total += outstanding;
      const key = invoice.customerId ?? invoice.quoteId ?? invoice.id;
      const name =
        (invoice.quoteId ? ordersByQuote.get(invoice.quoteId)?.customerName : null) || "Замовник без назви";
      const prev = byCustomer.get(key);
      byCustomer.set(key, { name, amount: (prev?.amount ?? 0) + outstanding });
    }
    return {
      total,
      rows: Array.from(byCustomer.values()).sort((a, b) => b.amount - a.amount),
    };
  }, [invoices, paidByQuote, ordersByQuote]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border/50 bg-muted/10 px-4 py-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Завантаження…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Надійшло за весь час" value={uah(totalReceived)} icon={TrendingUp} />
        <StatCard label="Надійшло цього місяця" value={uah(monthReceived)} icon={TrendingUp} />
        <StatCard
          label="Дебіторка (винні нам)"
          value={uah(receivables.total)}
          icon={AlertTriangle}
          tone={receivables.total > 0 ? "warning" : undefined}
        />
      </div>

      <Section title="Хто винен гроші">
        {receivables.rows.length === 0 ? (
          <EmptyHint text="Немає непогашених рахунків. Дебіторка з'явиться, коли виставите рахунки без повної оплати." />
        ) : (
          <div className="grid gap-2">
            {receivables.rows.map((row, index) => (
              <Row key={`${row.name}-${index}`} label={row.name} value={uah(row.amount)} muted />
            ))}
          </div>
        )}
      </Section>

      <Section title="Надходження по контурах">
        {receivedByEntity.size === 0 ? (
          <EmptyHint text="Ще немає оплат. Внесіть надходження в розділі «Реєстр продажів»." />
        ) : (
          <div className="grid gap-2">
            {Array.from(receivedByEntity.entries())
              .sort((a, b) => b[1] - a[1])
              .map(([entityId, sum]) => (
                <Row key={entityId ?? "none"} label={entityName(entityId)} value={uah(sum)} />
              ))}
          </div>
        )}
      </Section>

      <Section title="Каси та рахунки">
        {visibleAccounts.length === 0 ? (
          <EmptyHint text="Додайте каси в «Налаштування → Каси та рахунки»." />
        ) : (
          <div className="grid gap-2">
            {visibleAccounts.map((account) => (
              <Row
                key={account.id}
                label={account.name}
                sublabel={account.currency}
                value={uah(receivedByAccount.get(account.id) ?? 0)}
                muted={account.isSensitive}
              />
            ))}
          </div>
        )}
      </Section>

      <p className="text-xs text-muted-foreground">
        Поки що показано лише надходження. Дебіторка/кредиторка, витрати, прибуток і маржа з'являться з наступними розділами.
      </p>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  icon: typeof TrendingUp;
  tone?: "warning";
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border/40 bg-card p-4 shadow-card",
        tone === "warning" && "flag-warning"
      )}
    >
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className={cn("h-3.5 w-3.5", tone === "warning" && "text-warning-foreground")} /> {label}
      </div>
      <div className="figure mt-2 text-xl font-semibold text-foreground">{value}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      {children}
    </div>
  );
}

function Row({
  label,
  sublabel,
  value,
  muted,
}: {
  label: string;
  sublabel?: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 rounded-xl border border-border/40 bg-card shadow-card px-4 py-2.5",
        muted && "flag-warning"
      )}
    >
      <div className="min-w-0">
        <span className="block truncate text-sm font-medium text-foreground">{label}</span>
        {sublabel ? <span className="text-xs text-muted-foreground">{sublabel}</span> : null}
      </div>
      <span className="shrink-0 text-sm font-semibold text-foreground">{value}</span>
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border/60 bg-muted/10 px-4 py-5 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}
