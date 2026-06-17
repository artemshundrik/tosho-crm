import * as React from "react";
import { toast } from "sonner";
import { Check, Loader2, Pencil, Plus, Search, Trash2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { formatOrderMoney } from "@/features/orders/orderRecords";
import {
  createPayment,
  deletePayment,
  listAccounts,
  listOrdersForFinance,
  listPayments,
  updatePayment,
  type PaymentInput,
} from "./api";
import {
  ACCOUNT_KIND_LABELS,
  PAYMENT_SOURCE_LABELS,
  type FinanceAccount,
  type FinanceOrderRef,
  type FinancePayment,
  type FinancePaymentSource,
} from "./types";

type FinancePaymentsProps = {
  teamId: string | null;
  userId: string | null;
  canSeeSensitive: boolean;
};

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

const todayISO = () => new Date().toISOString().slice(0, 10);

const formatDate = (value?: string | null) => {
  if (!value) return "—";
  try {
    return new Date(`${value}T00:00:00`).toLocaleDateString("uk-UA");
  } catch {
    return value;
  }
};

export function FinancePayments({ teamId, userId, canSeeSensitive }: FinancePaymentsProps) {
  const [payments, setPayments] = React.useState<FinancePayment[]>([]);
  const [accounts, setAccounts] = React.useState<FinanceAccount[]>([]);
  const [orders, setOrders] = React.useState<FinanceOrderRef[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [ordersLoading, setOrdersLoading] = React.useState(true);

  const reload = React.useCallback(async () => {
    if (!teamId) return;
    setLoading(true);
    try {
      const [nextPayments, nextAccounts] = await Promise.all([listPayments(teamId), listAccounts(teamId)]);
      setPayments(nextPayments);
      setAccounts(nextAccounts);
    } catch (error) {
      toast.error("Не вдалося завантажити оплати", { description: getErrorMessage(error, "Спробуйте ще раз.") });
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  React.useEffect(() => {
    void reload();
  }, [reload]);

  React.useEffect(() => {
    if (!teamId) return;
    let active = true;
    setOrdersLoading(true);
    void listOrdersForFinance(teamId, userId)
      .then((rows) => {
        if (active) setOrders(rows);
      })
      .catch(() => {
        if (active) setOrders([]);
      })
      .finally(() => {
        if (active) setOrdersLoading(false);
      });
    return () => {
      active = false;
    };
  }, [teamId, userId]);

  const accountById = React.useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const orderByQuote = React.useMemo(() => new Map(orders.map((o) => [o.quoteId, o])), [orders]);

  const visibleAccounts = React.useMemo(
    () => (canSeeSensitive ? accounts : accounts.filter((a) => !a.isSensitive)),
    [accounts, canSeeSensitive]
  );

  // Hide payments that land on sensitive accounts from non-top roles.
  const visiblePayments = React.useMemo(() => {
    if (canSeeSensitive) return payments;
    return payments.filter((p) => {
      const account = p.accountId ? accountById.get(p.accountId) : null;
      return !account?.isSensitive;
    });
  }, [payments, accountById, canSeeSensitive]);

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<FinancePayment | null>(null);

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };
  const openEdit = (payment: FinancePayment) => {
    setEditing(payment);
    setDialogOpen(true);
  };

  const remove = async (payment: FinancePayment) => {
    if (!teamId) return;
    if (!window.confirm("Видалити цю оплату?")) return;
    try {
      await deletePayment(teamId, payment.id);
      await reload();
      toast.success("Оплату видалено");
    } catch (error) {
      toast.error("Не вдалося видалити оплату", { description: getErrorMessage(error, "Спробуйте ще раз.") });
    }
  };

  const noAccounts = !loading && accounts.length === 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Факт надходження грошей. Кожна оплата прив'язується до замовлення й каси.
        </p>
        <Button type="button" size="sm" className="h-8 gap-1.5" onClick={openCreate} disabled={noAccounts}>
          <Plus className="h-4 w-4" /> Додати оплату
        </Button>
      </div>

      {noAccounts ? (
        <div className="rounded-xl border tone-warning-subtle px-4 py-3 text-sm">
          Спершу додайте хоча б одну касу/рахунок у розділі «Налаштування → Каси та рахунки».
        </div>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 rounded-xl border border-border/50 bg-muted/10 px-4 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Завантаження…
        </div>
      ) : visiblePayments.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/60 bg-muted/10 p-8 text-center">
          <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-xl border border-border/60 bg-background">
            <Wallet className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">Ще немає оплат. Додайте першу.</p>
        </div>
      ) : (
        <div className="grid gap-2">
          {visiblePayments.map((payment) => {
            const account = payment.accountId ? accountById.get(payment.accountId) : null;
            const order = orderByQuote.get(payment.quoteId);
            return (
              <div
                key={payment.id}
                className="flex items-start justify-between gap-3 rounded-xl border border-border/60 bg-card px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">
                      {formatOrderMoney(payment.amount, payment.currency)}
                    </span>
                    {order ? (
                      <Badge variant="outline" className="text-[10px]">
                        {order.number}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] text-muted-foreground">
                        замовлення не знайдено
                      </Badge>
                    )}
                    {account?.isSensitive ? (
                      <Badge variant="outline" className="text-[10px] border-warning/40 bg-warning/10 text-warning-foreground">
                        {ACCOUNT_KIND_LABELS[account.kind]}
                      </Badge>
                    ) : null}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                    <span>{formatDate(payment.paidAt)}</span>
                    {order?.customerName ? <span>{order.customerName}</span> : null}
                    <span>{account ? account.name : "Каса не вказана"}</span>
                    <span>{PAYMENT_SOURCE_LABELS[payment.source]}</span>
                    {payment.notes ? <span className="truncate">{payment.notes}</span> : null}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(payment)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => void remove(payment)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {dialogOpen ? (
        <PaymentDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          teamId={teamId}
          userId={userId}
          editing={editing}
          accounts={visibleAccounts}
          orders={orders}
          ordersLoading={ordersLoading}
          onSaved={reload}
        />
      ) : null}
    </div>
  );
}

function PaymentDialog({
  open,
  onOpenChange,
  teamId,
  userId,
  editing,
  accounts,
  orders,
  ordersLoading,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  teamId: string | null;
  userId: string | null;
  editing: FinancePayment | null;
  accounts: FinanceAccount[];
  orders: FinanceOrderRef[];
  ordersLoading: boolean;
  onSaved: () => Promise<void> | void;
}) {
  const [quoteId, setQuoteId] = React.useState(editing?.quoteId ?? "");
  const [accountId, setAccountId] = React.useState(editing?.accountId ?? accounts[0]?.id ?? "");
  const [amount, setAmount] = React.useState(editing ? String(editing.amount) : "");
  const [paidAt, setPaidAt] = React.useState(editing?.paidAt ?? todayISO());
  const [source, setSource] = React.useState<FinancePaymentSource>(editing?.source ?? "manual");
  const [fxRate, setFxRate] = React.useState(editing?.fxRate != null ? String(editing.fxRate) : "");
  const [notes, setNotes] = React.useState(editing?.notes ?? "");
  const [saving, setSaving] = React.useState(false);

  const selectedAccount = accounts.find((a) => a.id === accountId) ?? null;
  const currency = selectedAccount?.currency ?? "UAH";
  const needsFxRate = currency.toUpperCase() !== "UAH";

  const submit = async () => {
    if (!teamId) return;
    if (!quoteId) {
      toast.error("Оберіть замовлення.");
      return;
    }
    if (!accountId) {
      toast.error("Оберіть касу/рахунок.");
      return;
    }
    const amountNum = Number(amount.replace(",", "."));
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      toast.error("Вкажіть коректну суму.");
      return;
    }
    const fxNum = needsFxRate ? Number(fxRate.replace(",", ".")) : null;
    if (needsFxRate && (!Number.isFinite(fxNum as number) || (fxNum as number) <= 0)) {
      toast.error("Вкажіть курс до гривні для не-гривневого рахунку.");
      return;
    }

    const input: PaymentInput = {
      accountId,
      quoteId,
      amount: amountNum,
      currency,
      fxRate: fxNum,
      paidAt,
      source,
      notes,
      enteredBy: userId,
    };

    setSaving(true);
    try {
      if (editing) await updatePayment(teamId, editing.id, input);
      else await createPayment(teamId, input);
      onOpenChange(false);
      await onSaved();
      toast.success(editing ? "Оплату оновлено" : "Оплату додано");
    } catch (error) {
      toast.error("Не вдалося зберегти оплату", { description: getErrorMessage(error, "Спробуйте ще раз.") });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{editing ? "Редагувати оплату" : "Нова оплата"}</DialogTitle>
          <DialogDescription>Факт надходження грошей по замовленню.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-2">
            <Label>Замовлення <span className="text-destructive">*</span></Label>
            <OrderPicker
              orders={orders}
              loading={ordersLoading}
              value={quoteId}
              onChange={setQuoteId}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>Каса / рахунок <span className="text-destructive">*</span></Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Оберіть" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.name} · {account.currency}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Сума ({currency}) <span className="text-destructive">*</span></Label>
              <Input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
                placeholder="0.00"
                className="h-9"
              />
            </div>
          </div>
          {needsFxRate ? (
            <div className="grid gap-2">
              <Label>Курс до гривні (1 {currency} = … грн) <span className="text-destructive">*</span></Label>
              <Input
                value={fxRate}
                onChange={(e) => setFxRate(e.target.value)}
                inputMode="decimal"
                placeholder="напр. 41.5"
                className="h-9"
              />
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>Дата</Label>
              <Input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} className="h-9" />
            </div>
            <div className="grid gap-2">
              <Label>Джерело</Label>
              <Select value={source} onValueChange={(v) => setSource(v as FinancePaymentSource)}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(PAYMENT_SOURCE_LABELS) as FinancePaymentSource[]).map((s) => (
                    <SelectItem key={s} value={s}>
                      {PAYMENT_SOURCE_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Коментар</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Напр. передоплата 50%"
              className="min-h-[60px]"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Скасувати
          </Button>
          <Button onClick={() => void submit()} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Зберегти
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OrderPicker({
  orders,
  loading,
  value,
  onChange,
}: {
  orders: FinanceOrderRef[];
  loading: boolean;
  value: string;
  onChange: (quoteId: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const selected = orders.find((o) => o.quoteId === value) ?? null;

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? orders.filter(
          (o) => o.number.toLowerCase().includes(q) || o.customerName.toLowerCase().includes(q)
        )
      : orders;
    return base.slice(0, 50);
  }, [orders, query]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" className="h-9 w-full justify-start font-normal">
          {selected ? (
            <span className="truncate">
              {selected.number} · {selected.customerName}
            </span>
          ) : (
            <span className="text-muted-foreground">Оберіть замовлення</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[380px] p-2" align="start">
        <div className="relative mb-2">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Номер або замовник…"
            className="h-9 pl-8"
          />
        </div>
        <div className="max-h-[280px] space-y-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center gap-2 px-2 py-3 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Завантажуємо замовлення…
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-2 py-3 text-xs text-muted-foreground">Замовлень не знайдено</div>
          ) : (
            filtered.map((order) => (
              <button
                key={order.quoteId}
                type="button"
                onClick={() => {
                  onChange(order.quoteId);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted/60",
                  order.quoteId === value && "bg-muted"
                )}
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{order.number}</span>
                  <span className="block truncate text-xs text-muted-foreground">{order.customerName}</span>
                </span>
                <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                  {formatOrderMoney(order.total, order.currency)}
                  {order.quoteId === value ? <Check className="h-3.5 w-3.5 text-primary" /> : null}
                </span>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
