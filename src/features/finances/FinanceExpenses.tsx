import * as React from "react";
import { toast } from "sonner";
import { Loader2, PiggyBank, Pin, Plus, X } from "lucide-react";
import { EditIconButton, DeleteIconButton } from "./financeRowActions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
import { OrderPickerInline } from "./OrderPickerInline";
import {
  createExpense,
  deleteExpense,
  listAccounts,
  listExpenseCategories,
  listExpenses,
  listLegalEntities,
  listOrdersForFinance,
  updateExpense,
  type ExpenseAllocationInput,
  type ExpenseInput,
} from "./api";
import {
  EXPENSE_CATEGORY_KIND_LABELS,
  formatLegalEntityLabel,
  type FinanceAccount,
  type FinanceExpense,
  type FinanceExpenseCategory,
  type FinanceLegalEntity,
  type FinanceOrderRef,
} from "./types";

type FinanceExpensesProps = {
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

export function FinanceExpenses({ teamId, userId, canSeeSensitive }: FinanceExpensesProps) {
  const [expenses, setExpenses] = React.useState<FinanceExpense[]>([]);
  const [categories, setCategories] = React.useState<FinanceExpenseCategory[]>([]);
  const [accounts, setAccounts] = React.useState<FinanceAccount[]>([]);
  const [entities, setEntities] = React.useState<FinanceLegalEntity[]>([]);
  const [orders, setOrders] = React.useState<FinanceOrderRef[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [ordersLoading, setOrdersLoading] = React.useState(true);

  const reload = React.useCallback(async () => {
    if (!teamId) return;
    setLoading(true);
    try {
      // Critical path: if expenses fail, show error and bail.
      const nextExpenses = await listExpenses(teamId);
      setExpenses(nextExpenses);
      // Supporting data: failures here are logged but don't wipe the expense list.
      const [nextCategories, nextAccounts, nextEntities] = await Promise.all([
        listExpenseCategories(teamId).catch((e) => {
          console.error("[finance] listExpenseCategories failed", e);
          return [] as FinanceExpenseCategory[];
        }),
        listAccounts(teamId).catch((e) => {
          console.error("[finance] listAccounts failed", e);
          return [] as FinanceAccount[];
        }),
        listLegalEntities(teamId).catch((e) => {
          console.error("[finance] listLegalEntities failed", e);
          return [] as FinanceLegalEntity[];
        }),
      ]);
      setCategories(nextCategories);
      setAccounts(nextAccounts);
      setEntities(nextEntities);
    } catch (error) {
      console.error("[finance] listExpenses failed", error);
      toast.error("Не вдалося завантажити витрати", { description: getErrorMessage(error, "Спробуйте ще раз.") });
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
      .then((rows) => active && setOrders(rows))
      .catch(() => active && setOrders([]))
      .finally(() => active && setOrdersLoading(false));
    return () => {
      active = false;
    };
  }, [teamId, userId]);

  const categoryById = React.useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const accountById = React.useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);

  const visibleAccounts = React.useMemo(
    () => (canSeeSensitive ? accounts : accounts.filter((a) => !a.isSensitive)),
    [accounts, canSeeSensitive]
  );

  // Hide expenses paid from sensitive accounts from non-top roles.
  const visibleExpenses = React.useMemo(() => {
    if (canSeeSensitive) return expenses;
    return expenses.filter((e) => {
      const account = e.accountId ? accountById.get(e.accountId) : null;
      return !account?.isSensitive;
    });
  }, [expenses, accountById, canSeeSensitive]);

  const { fixed, variable } = React.useMemo(() => {
    const fixedList: FinanceExpense[] = [];
    const variableList: FinanceExpense[] = [];
    for (const expense of visibleExpenses) {
      if (expense.isRecurring) fixedList.push(expense);
      else variableList.push(expense);
    }
    return { fixed: fixedList, variable: variableList };
  }, [visibleExpenses]);

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<FinanceExpense | null>(null);

  const remove = async (expense: FinanceExpense) => {
    if (!teamId) return;
    if (!window.confirm("Видалити цю витрату?")) return;
    try {
      await deleteExpense(teamId, expense.id);
      await reload();
      toast.success("Витрату видалено");
    } catch (error) {
      toast.error("Не вдалося видалити витрату", { description: getErrorMessage(error, "Спробуйте ще раз.") });
    }
  };

  const renderRow = (expense: FinanceExpense) => {
    const category = expense.categoryId ? categoryById.get(expense.categoryId) : null;
    const account = expense.accountId ? accountById.get(expense.accountId) : null;
    const allocatedTotal = expense.allocations.reduce((sum, a) => sum + a.amount, 0);
    return (
      <div
        key={expense.id}
        className="flex items-start justify-between gap-3 rounded-xl border border-border/60 bg-card px-4 py-3"
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-foreground">{formatOrderMoney(expense.amount, "UAH")}</span>
            {category ? (
              <Badge variant="outline" className="text-[10px]">
                {category.name}
              </Badge>
            ) : null}
            {expense.isRecurring ? (
              <Badge variant="outline" className="gap-1 text-[10px] text-muted-foreground">
                <Pin className="h-3 w-3" /> Щомісяця
              </Badge>
            ) : null}
            {expense.allocations.length > 0 ? (
              <Badge variant="outline" className="text-[10px] border-info/40 bg-info/10 text-info-foreground">
                На {expense.allocations.length} замовл. · {formatOrderMoney(allocatedTotal, "UAH")}
              </Badge>
            ) : null}
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            <span>{formatDate(expense.expenseDate)}</span>
            {expense.supplierName ? <span>{expense.supplierName}</span> : null}
            {account ? <span>{account.name}</span> : null}
            {expense.notes ? <span className="truncate">{expense.notes}</span> : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <EditIconButton
            onClick={() => {
              setEditing(expense);
              setDialogOpen(true);
            }}
          />
          <DeleteIconButton onClick={() => void remove(expense)} />
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Сталі (щомісячні) та змінні витрати. Змінні можна розподілити між замовленнями для коректної маржі.
        </p>
        <Button
          type="button"
          size="sm"
          className="h-8 gap-1.5"
          onClick={() => {
            setEditing(null);
            setDialogOpen(true);
          }}
        >
          <Plus className="h-4 w-4" /> Додати витрату
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 rounded-xl border border-border/50 bg-muted/10 px-4 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Завантаження…
        </div>
      ) : visibleExpenses.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/60 bg-muted/10 p-8 text-center">
          <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-xl border border-border/60 bg-background">
            <PiggyBank className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">Ще немає витрат. Додайте першу.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {fixed.length > 0 ? (
            <div>
              <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <Pin className="h-3 w-3" /> Сталі (щомісячні)
              </h3>
              <div className="grid gap-2">{fixed.map(renderRow)}</div>
            </div>
          ) : null}
          {variable.length > 0 ? (
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Змінні (під замовлення)
              </h3>
              <div className="grid gap-2">{variable.map(renderRow)}</div>
            </div>
          ) : null}
        </div>
      )}

      {dialogOpen ? (
        <ExpenseDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          teamId={teamId}
          userId={userId}
          editing={editing}
          categories={categories}
          accounts={visibleAccounts}
          entities={entities}
          orders={orders}
          ordersLoading={ordersLoading}
          onSaved={reload}
        />
      ) : null}
    </div>
  );
}

type AllocRow = { quoteId: string; amount: string };

function ExpenseDialog({
  open,
  onOpenChange,
  teamId,
  userId,
  editing,
  categories,
  accounts,
  entities,
  orders,
  ordersLoading,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  teamId: string | null;
  userId: string | null;
  editing: FinanceExpense | null;
  categories: FinanceExpenseCategory[];
  accounts: FinanceAccount[];
  entities: FinanceLegalEntity[];
  orders: FinanceOrderRef[];
  ordersLoading: boolean;
  onSaved: () => Promise<void> | void;
}) {
  const [categoryId, setCategoryId] = React.useState(editing?.categoryId ?? "");
  const [amount, setAmount] = React.useState(editing ? String(editing.amount) : "");
  const [supplierName, setSupplierName] = React.useState(editing?.supplierName ?? "");
  const [expenseDate, setExpenseDate] = React.useState(editing?.expenseDate ?? todayISO());
  const [accountId, setAccountId] = React.useState(editing?.accountId ?? "");
  const [legalEntityId, setLegalEntityId] = React.useState(editing?.legalEntityId ?? "");
  const [isRecurring, setIsRecurring] = React.useState(editing?.isRecurring ?? false);
  const [notes, setNotes] = React.useState(editing?.notes ?? "");
  const [allocations, setAllocations] = React.useState<AllocRow[]>(
    editing?.allocations.map((a) => ({ quoteId: a.quoteId, amount: String(a.amount) })) ?? []
  );
  const [saving, setSaving] = React.useState(false);

  const amountNum = Number(amount.replace(",", ".")) || 0;
  const allocatedNum = allocations.reduce((sum, a) => sum + (Number(a.amount.replace(",", ".")) || 0), 0);
  const remaining = Math.round((amountNum - allocatedNum) * 100) / 100;

  const usedQuoteIds = React.useMemo(
    () => new Set(allocations.map((a) => a.quoteId).filter(Boolean)),
    [allocations]
  );

  const addAllocation = () => setAllocations((prev) => [...prev, { quoteId: "", amount: "" }]);
  const updateAllocation = (index: number, patch: Partial<AllocRow>) =>
    setAllocations((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  const removeAllocation = (index: number) =>
    setAllocations((prev) => prev.filter((_, i) => i !== index));

  const submit = async () => {
    if (!teamId) return;
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      toast.error("Вкажіть коректну суму витрати.");
      return;
    }
    if (allocatedNum - amountNum > 0.005) {
      toast.error("Розподілено більше, ніж сума витрати.");
      return;
    }
    const allocInput: ExpenseAllocationInput[] = allocations
      .filter((a) => a.quoteId)
      .map((a) => ({ quoteId: a.quoteId, amount: Number(a.amount.replace(",", ".")) || 0 }))
      .filter((a) => a.amount > 0);

    const input: ExpenseInput = {
      categoryId: categoryId || null,
      amount: amountNum,
      supplierName,
      expenseDate,
      accountId: accountId || null,
      legalEntityId: legalEntityId || null,
      isRecurring,
      notes,
      enteredBy: userId,
      allocations: allocInput,
    };

    setSaving(true);
    try {
      if (editing) await updateExpense(teamId, editing.id, input);
      else await createExpense(teamId, input);
      onOpenChange(false);
      await onSaved();
      toast.success(editing ? "Витрату оновлено" : "Витрату додано");
    } catch (error) {
      toast.error("Не вдалося зберегти витрату", { description: getErrorMessage(error, "Спробуйте ще раз.") });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{editing ? "Редагувати витрату" : "Нова витрата"}</DialogTitle>
          <DialogDescription>Витрата компанії. Змінну можна розподілити між замовленнями.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>Сума (грн) <span className="text-destructive">*</span></Label>
              <Input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
                placeholder="0.00"
                className="h-9"
              />
            </div>
            <div className="grid gap-2">
              <Label>Дата</Label>
              <Input type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} className="h-9" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>Стаття витрат</Label>
              <Select value={categoryId || "none"} onValueChange={(v) => setCategoryId(v === "none" ? "" : v)}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Без статті" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Без статті</SelectItem>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name} · {EXPENSE_CATEGORY_KIND_LABELS[category.kind]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Постачальник</Label>
              <Input
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
                placeholder="Назва постачальника"
                className="h-9"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>Каса / рахунок</Label>
              <Select value={accountId || "none"} onValueChange={(v) => setAccountId(v === "none" ? "" : v)}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Не вказано" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Не вказано</SelectItem>
                  {accounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Юрособа</Label>
              <Select value={legalEntityId || "none"} onValueChange={(v) => setLegalEntityId(v === "none" ? "" : v)}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Не вказано" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Не вказано</SelectItem>
                  {entities.map((entity) => (
                    <SelectItem key={entity.id} value={entity.id}>
                      {formatLegalEntityLabel(entity)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={isRecurring} onCheckedChange={(v) => setIsRecurring(v === true)} />
            Стала (щомісячна) витрата
          </label>

          <div className="rounded-xl border border-border/60 bg-muted/10 p-3">
            <div className="mb-2 flex items-center justify-between">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Розподіл на замовлення
              </Label>
              <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={addAllocation}>
                <Plus className="h-3.5 w-3.5" /> Замовлення
              </Button>
            </div>
            {allocations.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Не обов'язково. Додайте, якщо ця витрата стосується конкретних замовлень (для маржі).
              </p>
            ) : (
              <div className="space-y-2">
                {allocations.map((row, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <OrderPickerInline
                        orders={orders}
                        loading={ordersLoading}
                        value={row.quoteId}
                        onChange={(quoteId) => updateAllocation(index, { quoteId })}
                        excludeQuoteIds={usedQuoteIds}
                        placeholder="Замовлення"
                      />
                    </div>
                    <Input
                      value={row.amount}
                      onChange={(e) => updateAllocation(index, { amount: e.target.value })}
                      inputMode="decimal"
                      placeholder="сума"
                      className="h-9 w-28"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-muted-foreground"
                      onClick={() => removeAllocation(index)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <div
                  className={cn(
                    "flex items-center justify-between rounded-lg px-2 py-1 text-xs",
                    remaining < -0.005 ? "text-destructive" : "text-muted-foreground"
                  )}
                >
                  <span>Розподілено: {formatOrderMoney(allocatedNum, "UAH")}</span>
                  <span>Залишок (загальні): {formatOrderMoney(remaining, "UAH")}</span>
                </div>
              </div>
            )}
          </div>

          <div className="grid gap-2">
            <Label>Коментар</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-[50px]" />
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
