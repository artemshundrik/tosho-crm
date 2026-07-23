import * as React from "react";
import { toast } from "sonner";
import { Check, Landmark, Loader2, Plus } from "lucide-react";
import { EditIconButton, DeleteIconButton } from "./financeRowActions";
import { BENTO_COLORS, FinanceBentoSummary } from "./FinanceBentoSummary";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { createTax, deleteTax, listLegalEntities, listTaxes, updateTax, type TaxInput } from "./api";
import {
  formatLegalEntityLabel,
  TAX_STATUS_LABELS,
  TAX_TYPE_DEFAULT_RATE,
  TAX_TYPE_LABELS,
  type FinanceLegalEntity,
  type FinanceTax,
  type TaxStatus,
  type TaxType,
} from "./types";

type FinanceTaxesProps = { teamId: string | null };

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

const monthInputValue = (period: string) => period.slice(0, 7); // YYYY-MM
const monthToPeriod = (month: string) => (month ? `${month}-01` : "");
const currentMonth = () => new Date().toISOString().slice(0, 7);
const formatPeriod = (period: string) => {
  try {
    return new Date(`${period}T00:00:00`).toLocaleDateString("uk-UA", { month: "long", year: "numeric" });
  } catch {
    return period;
  }
};
const formatDate = (value?: string | null) => {
  if (!value) return "—";
  try {
    return new Date(`${value}T00:00:00`).toLocaleDateString("uk-UA");
  } catch {
    return value;
  }
};

export function FinanceTaxes({ teamId }: FinanceTaxesProps) {
  const [taxes, setTaxes] = React.useState<FinanceTax[]>([]);
  const [entities, setEntities] = React.useState<FinanceLegalEntity[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<FinanceTax | null>(null);

  const reload = React.useCallback(async () => {
    if (!teamId) return;
    setLoading(true);
    try {
      const [nextTaxes, nextEntities] = await Promise.all([listTaxes(teamId), listLegalEntities(teamId)]);
      setTaxes(nextTaxes);
      setEntities(nextEntities);
    } catch (error) {
      toast.error("Не вдалося завантажити податки", { description: getErrorMessage(error, "") });
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  React.useEffect(() => {
    void reload();
  }, [reload]);

  const entityById = React.useMemo(() => new Map(entities.map((e) => [e.id, e])), [entities]);

  const unpaidTotal = React.useMemo(
    () => taxes.filter((t) => t.status === "pending").reduce((sum, t) => sum + t.amount, 0),
    [taxes]
  );

  // Кошики bento: «до сплати» в розрізі типів податку (лише очікувані зобовʼязання).
  const pendingByType = React.useMemo(() => {
    const map = new Map<TaxType, number>();
    for (const t of taxes) {
      if (t.status !== "pending") continue;
      map.set(t.taxType, (map.get(t.taxType) ?? 0) + t.amount);
    }
    return (Object.keys(TAX_TYPE_LABELS) as TaxType[])
      .filter((type) => (map.get(type) ?? 0) > 0)
      .map((type, i) => ({
        key: type,
        label: TAX_TYPE_LABELS[type],
        amount: map.get(type) ?? 0,
        color: BENTO_COLORS[i % BENTO_COLORS.length],
      }));
  }, [taxes]);
  const pendingCount = React.useMemo(() => taxes.filter((t) => t.status === "pending").length, [taxes]);
  const paidTotal = React.useMemo(
    () => taxes.filter((t) => t.status === "paid").reduce((sum, t) => sum + t.amount, 0),
    [taxes]
  );

  const toggleStatus = async (tax: FinanceTax) => {
    if (!teamId) return;
    const nextStatus: TaxStatus = tax.status === "paid" ? "pending" : "paid";
    try {
      await updateTax(teamId, tax.id, {
        legalEntityId: tax.legalEntityId,
        taxType: tax.taxType,
        period: tax.period,
        baseAmount: tax.baseAmount,
        rate: tax.rate,
        amount: tax.amount,
        dueDate: tax.dueDate,
        status: nextStatus,
        note: tax.note,
      });
      await reload();
    } catch (error) {
      toast.error("Не вдалося оновити статус", { description: getErrorMessage(error, "") });
    }
  };

  const remove = async (tax: FinanceTax) => {
    if (!teamId) return;
    if (!window.confirm("Видалити цей податок?")) return;
    try {
      await deleteTax(teamId, tax.id);
      await reload();
      toast.success("Податок видалено");
    } catch (error) {
      toast.error("Не вдалося видалити", { description: getErrorMessage(error, "") });
    }
  };

  return (
    <div className="space-y-3">
      {/* Bento-підсумок (спільний із Витратами): скільки до сплати і з яких податків складається. */}
      <FinanceBentoSummary
        title="Податки до сплати"
        totalText={formatOrderMoney(unpaidTotal, "UAH")}
        buckets={pendingByType}
        footnote={
          <>
            <span>
              Очікують: <span className="font-medium tabular-nums text-foreground/80">{pendingCount}</span>
            </span>
            <span>
              Сплачено (за весь час):{" "}
              <span className="font-medium tabular-nums text-foreground/80">{formatOrderMoney(paidTotal, "UAH")}</span>
            </span>
          </>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">ПДВ (ТОВ) та ФОП (єдиний податок, ЄСВ, військовий збір).</p>
        <Button
          type="button"
          size="sm"
          className="h-8 gap-1.5"
          onClick={() => {
            setEditing(null);
            setDialogOpen(true);
          }}
        >
          <Plus className="h-4 w-4" /> Додати податок
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 rounded-xl border border-border/50 bg-muted/10 px-4 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Завантаження…
        </div>
      ) : taxes.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/60 bg-muted/10 p-8 text-center">
          <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-xl border border-border/60 bg-background">
            <Landmark className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">Ще немає податкових зобов'язань.</p>
        </div>
      ) : (
        <div className="grid gap-2">
          {taxes.map((tax) => {
            const entity = tax.legalEntityId ? entityById.get(tax.legalEntityId) : null;
            const isPaid = tax.status === "paid";
            return (
              <div
                key={tax.id}
                className="flex items-start justify-between gap-3 rounded-xl border border-border/60 bg-card px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">{formatOrderMoney(tax.amount, "UAH")}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {TAX_TYPE_LABELS[tax.taxType]}
                    </Badge>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px]",
                        isPaid
                          ? "border-success/40 bg-success/10 text-success-foreground"
                          : "border-warning/40 bg-warning/10 text-warning-foreground"
                      )}
                    >
                      {TAX_STATUS_LABELS[tax.status]}
                    </Badge>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                    <span>{formatPeriod(tax.period)}</span>
                    {entity ? <span>{formatLegalEntityLabel(entity)}</span> : null}
                    {tax.dueDate ? <span>Сплатити до: {formatDate(tax.dueDate)}</span> : null}
                    {tax.rate ? <span>Ставка {tax.rate}%</span> : null}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Button
                    type="button"
                    variant={isPaid ? "secondary" : "outline"}
                    size="sm"
                    className="h-9 gap-1.5"
                    onClick={() => void toggleStatus(tax)}
                  >
                    {isPaid ? <Check className="h-3.5 w-3.5" /> : null}
                    {isPaid ? "Сплачено" : "Позначити"}
                  </Button>
                  <EditIconButton
                    onClick={() => {
                      setEditing(tax);
                      setDialogOpen(true);
                    }}
                  />
                  <DeleteIconButton onClick={() => void remove(tax)} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {dialogOpen ? (
        <TaxDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          teamId={teamId}
          editing={editing}
          entities={entities}
          onSaved={reload}
        />
      ) : null}
    </div>
  );
}

function TaxDialog({
  open,
  onOpenChange,
  teamId,
  editing,
  entities,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  teamId: string | null;
  editing: FinanceTax | null;
  entities: FinanceLegalEntity[];
  onSaved: () => Promise<void> | void;
}) {
  const [taxType, setTaxType] = React.useState<TaxType>(editing?.taxType ?? "vat");
  const [legalEntityId, setLegalEntityId] = React.useState(editing?.legalEntityId ?? entities[0]?.id ?? "");
  const [month, setMonth] = React.useState(editing ? monthInputValue(editing.period) : currentMonth());
  const [baseAmount, setBaseAmount] = React.useState(editing?.baseAmount != null ? String(editing.baseAmount) : "");
  const [rate, setRate] = React.useState(editing?.rate != null ? String(editing.rate) : "");
  const [amount, setAmount] = React.useState(editing ? String(editing.amount) : "");
  const [dueDate, setDueDate] = React.useState(editing?.dueDate ?? "");
  const [status, setStatus] = React.useState<TaxStatus>(editing?.status ?? "pending");
  const [saving, setSaving] = React.useState(false);

  // When tax type changes (new entry), suggest the default rate.
  const handleTypeChange = (next: TaxType) => {
    setTaxType(next);
    if (!editing) {
      const defaultRate = TAX_TYPE_DEFAULT_RATE[next];
      setRate(defaultRate != null ? String(defaultRate) : "");
    }
  };

  // Auto-suggest amount = base * rate / 100 (if both present and amount empty).
  const suggestAmount = () => {
    const base = Number(baseAmount.replace(",", ".")) || 0;
    const r = Number(rate.replace(",", ".")) || 0;
    if (base > 0 && r > 0) setAmount(String(Math.round(((base * r) / 100) * 100) / 100));
  };

  const submit = async () => {
    if (!teamId) return;
    const amountNum = Number(amount.replace(",", "."));
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      toast.error("Вкажіть суму податку.");
      return;
    }
    if (!month) {
      toast.error("Вкажіть звітний місяць.");
      return;
    }
    const input: TaxInput = {
      legalEntityId: legalEntityId || null,
      taxType,
      period: monthToPeriod(month),
      baseAmount: baseAmount ? Number(baseAmount.replace(",", ".")) : null,
      rate: rate ? Number(rate.replace(",", ".")) : null,
      amount: amountNum,
      dueDate: dueDate || null,
      status,
    };
    setSaving(true);
    try {
      if (editing) await updateTax(teamId, editing.id, input);
      else await createTax(teamId, input);
      onOpenChange(false);
      await onSaved();
      toast.success(editing ? "Податок оновлено" : "Податок додано");
    } catch (error) {
      toast.error("Не вдалося зберегти", { description: getErrorMessage(error, "") });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>{editing ? "Редагувати податок" : "Новий податок"}</DialogTitle>
          <DialogDescription>Податкове зобов'язання по юрособі за місяць.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>Податок</Label>
              <Select value={taxType} onValueChange={(v) => handleTypeChange(v as TaxType)}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(TAX_TYPE_LABELS) as TaxType[]).map((t) => (
                    <SelectItem key={t} value={t}>
                      {TAX_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Звітний місяць</Label>
              <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="h-9" />
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Юрособа</Label>
            <Select value={legalEntityId || "none"} onValueChange={(v) => setLegalEntityId(v === "none" ? "" : v)}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Оберіть" />
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
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-2">
              <Label>База, грн</Label>
              <Input
                value={baseAmount}
                onChange={(e) => setBaseAmount(e.target.value)}
                onBlur={suggestAmount}
                inputMode="decimal"
                placeholder="дохід"
                className="h-9"
              />
            </div>
            <div className="grid gap-2">
              <Label>Ставка %</Label>
              <Input
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                onBlur={suggestAmount}
                inputMode="decimal"
                className="h-9"
              />
            </div>
            <div className="grid gap-2">
              <Label>Сума <span className="text-destructive">*</span></Label>
              <Input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
                placeholder="0.00"
                className="h-9"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>Сплатити до</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="h-9" />
            </div>
            <div className="grid gap-2">
              <Label>Статус</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as TaxStatus)}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(TAX_STATUS_LABELS) as TaxStatus[]).map((s) => (
                    <SelectItem key={s} value={s}>
                      {TAX_STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
