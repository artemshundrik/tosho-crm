import * as React from "react";
import { toast } from "sonner";
import { AlertTriangle, CalendarClock, Landmark, Loader2, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatOrderMoney } from "@/features/orders/orderRecords";
import { resolveWorkspaceId } from "@/lib/workspace";
import { loadPayrollEntries, periodKey } from "@/lib/payroll";
import { listLegalEntities, listPayoutMeta, listTaxes } from "./api";
import {
  formatLegalEntityLabel,
  TAX_TYPE_LABELS,
  type FinanceLegalEntity,
  type FinanceTax,
} from "./types";

type FinanceCalendarProps = { teamId: string | null; userId: string | null };

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

const todayISO = () => new Date().toISOString().slice(0, 10);
const formatDate = (value?: string | null) => {
  if (!value) return "Без терміну";
  try {
    return new Date(`${value}T00:00:00`).toLocaleDateString("uk-UA");
  } catch {
    return value;
  }
};
const daysUntil = (date: string): number => {
  const d = new Date(`${date}T00:00:00`).getTime();
  const t = new Date(`${todayISO()}T00:00:00`).getTime();
  return Math.round((d - t) / 86400000);
};

type DueItem = {
  id: string;
  kind: "tax" | "payroll";
  title: string;
  subtitle: string;
  amount: number;
  dueDate: string | null;
  icon: typeof Landmark;
};

type Bucket = { key: string; label: string; tone?: "danger" | "warning"; items: DueItem[] };

export function FinanceCalendar({ teamId, userId }: FinanceCalendarProps) {
  const [taxes, setTaxes] = React.useState<FinanceTax[]>([]);
  const [entities, setEntities] = React.useState<FinanceLegalEntity[]>([]);
  const [pendingPayout, setPendingPayout] = React.useState<{ total: number; count: number }>({ total: 0, count: 0 });
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (!teamId || !userId) return;
    let active = true;
    setLoading(true);
    const period = periodKey(new Date().getFullYear(), new Date().getMonth() + 1);
    void (async () => {
      try {
        const [nextTaxes, nextEntities] = await Promise.all([listTaxes(teamId), listLegalEntities(teamId)]);
        const wsId = await resolveWorkspaceId(userId);
        let payout = { total: 0, count: 0 };
        if (wsId) {
          const [entries, meta] = await Promise.all([loadPayrollEntries(wsId, period), listPayoutMeta(teamId, period)]);
          entries.forEach((entry, uid) => {
            if (meta.get(uid)?.status !== "paid" && entry.totalAmount > 0) {
              payout = { total: payout.total + entry.totalAmount, count: payout.count + 1 };
            }
          });
        }
        if (!active) return;
        setTaxes(nextTaxes);
        setEntities(nextEntities);
        setPendingPayout(payout);
      } catch (error) {
        if (active) toast.error("Не вдалося завантажити календар", { description: getErrorMessage(error, "") });
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [teamId, userId]);

  const entityById = React.useMemo(() => new Map(entities.map((e) => [e.id, e])), [entities]);

  const buckets = React.useMemo<Bucket[]>(() => {
    const items: DueItem[] = [];
    for (const tax of taxes) {
      if (tax.status === "paid") continue;
      const entity = tax.legalEntityId ? entityById.get(tax.legalEntityId) : null;
      items.push({
        id: `tax-${tax.id}`,
        kind: "tax",
        title: TAX_TYPE_LABELS[tax.taxType],
        subtitle: entity ? formatLegalEntityLabel(entity) : "Юрособа не вказана",
        amount: tax.amount,
        dueDate: tax.dueDate,
        icon: Landmark,
      });
    }
    if (pendingPayout.total > 0) {
      items.push({
        id: "payroll-current",
        kind: "payroll",
        title: "Виплати команді (цей місяць)",
        subtitle: `${pendingPayout.count} осіб ще не виплачено`,
        amount: pendingPayout.total,
        dueDate: null,
        icon: Users,
      });
    }

    const overdue: DueItem[] = [];
    const week: DueItem[] = [];
    const month: DueItem[] = [];
    const later: DueItem[] = [];
    const noDate: DueItem[] = [];
    for (const item of items) {
      if (!item.dueDate) {
        noDate.push(item);
        continue;
      }
      const d = daysUntil(item.dueDate);
      if (d < 0) overdue.push(item);
      else if (d <= 7) week.push(item);
      else if (d <= 31) month.push(item);
      else later.push(item);
    }
    const byDate = (a: DueItem, b: DueItem) => (a.dueDate ?? "").localeCompare(b.dueDate ?? "");
    return [
      { key: "overdue", label: "Прострочено", tone: "danger" as const, items: overdue.sort(byDate) },
      { key: "week", label: "Найближчі 7 днів", tone: "warning" as const, items: week.sort(byDate) },
      { key: "month", label: "Цей місяць", items: month.sort(byDate) },
      { key: "later", label: "Пізніше", items: later.sort(byDate) },
      { key: "nodate", label: "Без терміну", items: noDate },
    ].filter((b) => b.items.length > 0);
  }, [taxes, entityById, pendingPayout]);

  const total = React.useMemo(
    () => buckets.reduce((sum, b) => sum + b.items.reduce((s, i) => s + i.amount, 0), 0),
    [buckets]
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
      <div className="rounded-2xl border border-border/60 bg-card p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <CalendarClock className="h-3.5 w-3.5" /> Загалом до сплати
        </div>
        <div className="mt-1.5 text-xl font-semibold text-foreground">{formatOrderMoney(total, "UAH")}</div>
      </div>

      {buckets.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/60 bg-muted/10 p-8 text-center">
          <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-xl border border-border/60 bg-background">
            <CalendarClock className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">
            Немає запланованих платежів. З'являться несплачені податки та невиплачені зарплати.
          </p>
        </div>
      ) : (
        buckets.map((bucket) => (
          <div key={bucket.key}>
            <h3
              className={cn(
                "mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide",
                bucket.tone === "danger"
                  ? "text-destructive"
                  : bucket.tone === "warning"
                    ? "text-warning-foreground"
                    : "text-muted-foreground"
              )}
            >
              {bucket.tone === "danger" ? <AlertTriangle className="h-3 w-3" /> : null}
              {bucket.label}
            </h3>
            <div className="grid gap-2">
              {bucket.items.map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.id}
                    className={cn(
                      "flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-card px-4 py-3",
                      bucket.tone === "danger" && "border-destructive/40 bg-destructive/5"
                    )}
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-muted/30">
                        <Icon className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-foreground">{item.title}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {item.subtitle} · {formatDate(item.dueDate)}
                        </div>
                      </div>
                    </div>
                    <span className="shrink-0 text-sm font-semibold text-foreground">
                      {formatOrderMoney(item.amount, "UAH")}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
