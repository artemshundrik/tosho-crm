import * as React from "react";
import { toast } from "sonner";
import { Check, FileText, Loader2, Plus, Search } from "lucide-react";
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
  createInvoice,
  deleteInvoice,
  listInvoices,
  listLegalEntities,
  listOrderMeta,
  listOrdersForFinance,
  updateInvoice,
  upsertOrderMeta,
  type InvoiceInput,
} from "./api";
import { FinanceBentoSummary } from "./FinanceBentoSummary";
import {
  INVOICE_STATUS_LABELS,
  INVOICE_STATUS_BADGE_TONE,
  formatLegalEntityLabel,
  ORDER_TYPE_LABELS,
  type FinanceInvoice,
  type FinanceInvoiceStatus,
  type FinanceLegalEntity,
  type FinanceOrderMeta,
  type FinanceOrderRef,
  type OrderType,
} from "./types";
import { buildInvoiceHtml, openPrintableDocument } from "./documentHtml";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/auth/AuthProvider";
import { getCachedCurrentWorkspaceMemberDirectoryEntry } from "@/lib/workspaceMemberDirectory";
import { listVchasnoStatusesByCrmIds, vchasnoStatusBadge, type VchasnoDocStatus } from "./vchasnoStatus";
import { ActionButton, EditIconButton, DeleteIconButton } from "./financeRowActions";
import vchasnoLogo from "@/assets/vchasno-logo.png";

type FinanceInvoicesProps = {
  teamId: string | null;
  userId: string | null;
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

export function FinanceInvoices({ teamId, userId }: FinanceInvoicesProps) {
  const [invoices, setInvoices] = React.useState<FinanceInvoice[]>([]);
  const [entities, setEntities] = React.useState<FinanceLegalEntity[]>([]);
  const [orders, setOrders] = React.useState<FinanceOrderRef[]>([]);
  const [orderMeta, setOrderMeta] = React.useState<Map<string, FinanceOrderMeta>>(new Map());
  const [loading, setLoading] = React.useState(true);
  const [ordersLoading, setOrdersLoading] = React.useState(true);
  const [vchasnoBusyId, setVchasnoBusyId] = React.useState<string | null>(null);
  const [vchasnoStatuses, setVchasnoStatuses] = React.useState<Map<string, VchasnoDocStatus>>(new Map());

  const auth = useAuth();
  // Показ кнопки (сервер усе одно перевіряє право). Дефолт по ролі + override з module_access.
  const canUploadVchasno = React.useMemo(() => {
    const ma = getCachedCurrentWorkspaceMemberDirectoryEntry()?.moduleAccess;
    if (ma && typeof ma.vchasno === "boolean") return ma.vchasno;
    const role = (auth.jobRole ?? "").toLowerCase();
    return auth.permissions.isSuperAdmin || ["seo", "accountant", "chief_accountant"].includes(role);
  }, [auth.jobRole, auth.permissions.isSuperAdmin]);

  const reload = React.useCallback(async () => {
    if (!teamId) return;
    setLoading(true);
    try {
      const [nextInvoices, nextEntities, nextMeta] = await Promise.all([
        listInvoices(teamId),
        listLegalEntities(teamId),
        listOrderMeta(teamId),
      ]);
      setInvoices(nextInvoices);
      setEntities(nextEntities);
      setOrderMeta(nextMeta);
    } catch (error) {
      toast.error("Не вдалося завантажити рахунки", { description: getErrorMessage(error, "Спробуйте ще раз.") });
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

  const entityById = React.useMemo(() => new Map(entities.map((e) => [e.id, e])), [entities]);
  const orderByQuote = React.useMemo(() => new Map(orders.map((o) => [o.quoteId, o])), [orders]);

  // Дебіторка: скільки нам винні по відкритих рахунках, у розрізі статусів.
  // Відкрита сума = balance_amount (як є), інакше amount − передоплата.
  const receivables = React.useMemo(() => {
    const openAmount = (inv: FinanceInvoice) =>
      typeof inv.balanceAmount === "number" && Number.isFinite(inv.balanceAmount)
        ? Math.max(0, inv.balanceAmount)
        : Math.max(0, inv.amount - (inv.prepaymentAmount ?? 0));
    let sent = 0;
    let partial = 0;
    let overdue = 0;
    let draftCount = 0;
    let paidTotal = 0;
    for (const inv of invoices) {
      if (inv.status === "sent") sent += openAmount(inv);
      else if (inv.status === "partial") partial += openAmount(inv);
      else if (inv.status === "overdue") overdue += openAmount(inv);
      else if (inv.status === "draft") draftCount += 1;
      else if (inv.status === "paid") paidTotal += inv.amount;
    }
    return { sent, partial, overdue, total: sent + partial + overdue, draftCount, paidTotal };
  }, [invoices]);

  const reloadVchasnoStatuses = React.useCallback(async () => {
    if (!teamId || invoices.length === 0) {
      setVchasnoStatuses(new Map());
      return;
    }
    const map = await listVchasnoStatusesByCrmIds(teamId, invoices.map((invoice) => invoice.id));
    setVchasnoStatuses(map);
  }, [teamId, invoices]);

  React.useEffect(() => {
    void reloadVchasnoStatuses();
  }, [reloadVchasnoStatuses]);

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<FinanceInvoice | null>(null);

  const remove = async (invoice: FinanceInvoice) => {
    if (!teamId) return;
    if (!window.confirm("Видалити цей рахунок?")) return;
    try {
      await deleteInvoice(teamId, invoice.id);
      await reload();
      toast.success("Рахунок видалено");
    } catch (error) {
      toast.error("Не вдалося видалити рахунок", { description: getErrorMessage(error, "Спробуйте ще раз.") });
    }
  };

  const generateDocument = (invoice: FinanceInvoice) => {
    const entity = invoice.legalEntityId ? entityById.get(invoice.legalEntityId) : null;
    const order = invoice.quoteId ? orderByQuote.get(invoice.quoteId) : null;
    const orderType = invoice.quoteId ? orderMeta.get(invoice.quoteId)?.orderType : null;
    const description =
      orderType === "services" ? "Послуги" : orderType === "goods" ? "Товари" : "Товари / послуги";
    const html = buildInvoiceHtml({
      number: invoice.number ?? "",
      issueDate: invoice.issueDate,
      sellerName: entity ? formatLegalEntityLabel(entity) : "Постачальник",
      sellerEdrpou: entity?.edrpou,
      sellerIpn: entity?.ipn,
      sellerIban: entity?.iban,
      buyerName: order?.customerName ?? "Замовник",
      orderNumber: order?.number ?? null,
      description,
      amount: invoice.amount,
      vatRate: invoice.vatRate,
      vatAmount: invoice.vatAmount,
    });
    if (!openPrintableDocument(html)) {
      toast.error("Браузер заблокував нове вікно. Дозвольте спливаючі вікна.");
    }
  };

  const uploadToVchasno = async (invoice: FinanceInvoice) => {
    if (!invoice.legalEntityId) {
      toast.error("Вкажіть юрособу-виставника, щоб завантажити у Вчасно.");
      return;
    }
    const entity = entityById.get(invoice.legalEntityId);
    const order = invoice.quoteId ? orderByQuote.get(invoice.quoteId) : null;
    const orderType = invoice.quoteId ? orderMeta.get(invoice.quoteId)?.orderType : null;
    const description =
      orderType === "services" ? "Послуги" : orderType === "goods" ? "Товари" : "Товари / послуги";
    setVchasnoBusyId(invoice.id);
    try {
      // Lazy-load @react-pdf лише при кліку, щоб не роздувати сторінку Фінансів.
      const { renderInvoicePdfBase64 } = await import("./pdf/renderInvoicePdf");
      const fileBase64 = await renderInvoicePdfBase64({
        number: invoice.number ?? "",
        issueDate: invoice.issueDate,
        sellerName: entity ? formatLegalEntityLabel(entity) : "Постачальник",
        sellerEdrpou: entity?.edrpou,
        sellerIpn: entity?.ipn,
        sellerIban: entity?.iban,
        buyerName: order?.customerName ?? "Замовник",
        orderNumber: order?.number ?? null,
        description,
        amount: invoice.amount,
        vatRate: invoice.vatRate,
        vatAmount: invoice.vatAmount,
      });
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Немає активної сесії.");
      const response = await fetch("/.netlify/functions/vchasno-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          legalEntityId: invoice.legalEntityId,
          customerId: invoice.customerId,
          docType: "invoice",
          crmDocId: invoice.id,
          quoteId: invoice.quoteId,
          number: invoice.number,
          title: `Рахунок ${invoice.number ?? ""}`.trim(),
          issueDate: invoice.issueDate,
          amountKopecks: Math.round((invoice.amount || 0) * 100),
          fileBase64,
          send: false,
        }),
      });
      const result = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!response.ok || !result.ok) throw new Error(result.error || `HTTP ${response.status}`);
      toast.success("Завантажено у Вчасно як чернетку", {
        description: "Перевірте документ у кабінеті Вчасно перед підписанням і надсиланням.",
      });
      void reloadVchasnoStatuses();
    } catch (error) {
      toast.error("Вчасно: не вдалося завантажити", { description: getErrorMessage(error, "Спробуйте ще раз.") });
    } finally {
      setVchasnoBusyId(null);
    }
  };

  const noEntities = !loading && entities.length === 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Рахунки, виставлені замовникам, та їхні статуси.</p>
        <Button
          type="button"
          size="sm"
          className="h-8 gap-1.5"
          disabled={noEntities}
          onClick={() => {
            setEditing(null);
            setDialogOpen(true);
          }}
        >
          <Plus className="h-4 w-4" /> Виставити рахунок
        </Button>
      </div>

      {noEntities ? (
        <div className="rounded-xl border tone-warning-subtle px-4 py-3 text-sm">
          Спершу додайте юрособу-виставника в «Налаштування → Юрособи».
        </div>
      ) : null}

      {/* Bento дебіторки (спільний із Витратами): скільки винні й у якому стані.
          Статусні кольори — прострочене найтривожніше, тому першим. */}
      {!loading && invoices.length > 0 ? (
        <FinanceBentoSummary
          title="Дебіторка · відкриті рахунки"
          totalText={formatOrderMoney(receivables.total, "UAH")}
          buckets={[
            { key: "overdue", label: "Прострочено", amount: receivables.overdue, color: "bg-rose-500" },
            { key: "partial", label: "Частково оплачено", amount: receivables.partial, color: "bg-amber-500" },
            { key: "sent", label: "Чекає оплати", amount: receivables.sent, color: "bg-sky-500" },
          ].filter((b) => b.amount > 0)}
          footnote={
            <>
              <span>
                Оплачено (за весь час):{" "}
                <span className="font-medium tabular-nums text-foreground/80">
                  {formatOrderMoney(receivables.paidTotal, "UAH")}
                </span>
              </span>
              {receivables.draftCount > 0 ? <span>Чернеток: {receivables.draftCount}</span> : null}
            </>
          }
        />
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 rounded-xl border border-border/50 bg-muted/10 px-4 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Завантаження…
        </div>
      ) : invoices.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/60 bg-muted/10 p-8 text-center">
          <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-xl border border-border/60 bg-background">
            <FileText className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">Ще немає рахунків.</p>
        </div>
      ) : (
        <div className="grid gap-2">
          {invoices.map((invoice) => {
            const order = invoice.quoteId ? orderByQuote.get(invoice.quoteId) : null;
            const entity = invoice.legalEntityId ? entityById.get(invoice.legalEntityId) : null;
            const vBadge = vchasnoStatusBadge(vchasnoStatuses.get(invoice.id));
            return (
              <div
                key={invoice.id}
                className="flex items-start justify-between gap-3 rounded-xl border border-border/40 bg-card shadow-card px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">
                      {formatOrderMoney(invoice.amount, "UAH")}
                    </span>
                    {invoice.number ? (
                      <Badge variant="outline" className="text-[10px]">
                        № {invoice.number}
                      </Badge>
                    ) : null}
                    <Badge
                      tone={INVOICE_STATUS_BADGE_TONE[invoice.status]}
                      size="sm"
                      className={cn("text-[10px]", invoice.status === "cancelled" && "line-through")}
                    >
                      {INVOICE_STATUS_LABELS[invoice.status]}
                    </Badge>
                    {invoice.vatRate ? (
                      <Badge variant="outline" className="text-[10px] text-muted-foreground">
                        ПДВ {invoice.vatRate}%
                      </Badge>
                    ) : null}
                    {vBadge ? (
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium",
                          vBadge.className
                        )}
                      >
                        <span className={cn("h-1.5 w-1.5 rounded-full", vBadge.dot)} />
                        {vBadge.text}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                    {order ? <span>{order.number} · {order.customerName}</span> : <span>Замовлення не вказано</span>}
                    {entity ? <span>{formatLegalEntityLabel(entity)}</span> : null}
                    <span>Виставлено: {formatDate(invoice.issueDate)}</span>
                    {invoice.dueDate ? <span>Оплата до: {formatDate(invoice.dueDate)}</span> : null}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {canUploadVchasno ? (
                    <ActionButton
                      onClick={() => void uploadToVchasno(invoice)}
                      title="Завантажити у Вчасно як чернетку"
                      disabled={!invoice.legalEntityId}
                      loading={vchasnoBusyId === invoice.id}
                      icon={<img src={vchasnoLogo} alt="" className="h-[18px] w-[18px] rounded-full" />}
                      label="Вчасно"
                    />
                  ) : null}
                  <ActionButton
                    onClick={() => generateDocument(invoice)}
                    title="Згенерувати рахунок (PDF)"
                    icon={<FileText />}
                    label="ПДФ"
                  />
                  <EditIconButton
                    onClick={() => {
                      setEditing(invoice);
                      setDialogOpen(true);
                    }}
                  />
                  <DeleteIconButton onClick={() => void remove(invoice)} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {dialogOpen ? (
        <InvoiceDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          teamId={teamId}
          userId={userId}
          editing={editing}
          entities={entities}
          orders={orders}
          ordersLoading={ordersLoading}
          orderMeta={orderMeta}
          onSaved={reload}
        />
      ) : null}
    </div>
  );
}

function InvoiceDialog({
  open,
  onOpenChange,
  teamId,
  userId,
  editing,
  entities,
  orders,
  ordersLoading,
  orderMeta,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  teamId: string | null;
  userId: string | null;
  editing: FinanceInvoice | null;
  entities: FinanceLegalEntity[];
  orders: FinanceOrderRef[];
  ordersLoading: boolean;
  orderMeta: Map<string, FinanceOrderMeta>;
  onSaved: () => Promise<void> | void;
}) {
  const [quoteId, setQuoteId] = React.useState(editing?.quoteId ?? "");
  const [legalEntityId, setLegalEntityId] = React.useState(editing?.legalEntityId ?? entities[0]?.id ?? "");
  const [number, setNumber] = React.useState(editing?.number ?? "");
  const [amount, setAmount] = React.useState(editing ? String(editing.amount) : "");
  const [issueDate, setIssueDate] = React.useState(editing?.issueDate ?? todayISO());
  const [dueDate, setDueDate] = React.useState(editing?.dueDate ?? "");
  const [vatRate, setVatRate] = React.useState(editing?.vatRate != null ? String(editing.vatRate) : "");
  const [status, setStatus] = React.useState<FinanceInvoiceStatus>(editing?.status ?? "draft");
  const [orderType, setOrderType] = React.useState<OrderType | "">(
    editing?.quoteId ? orderMeta.get(editing.quoteId)?.orderType ?? "" : ""
  );
  const [notes, setNotes] = React.useState(editing?.notes ?? "");
  const [saving, setSaving] = React.useState(false);

  const selectedEntity = entities.find((e) => e.id === legalEntityId) ?? null;

  // When the picked order already has a classification, reflect it.
  const handleOrderTypePrefill = React.useCallback(
    (nextQuoteId: string) => {
      const existing = orderMeta.get(nextQuoteId)?.orderType;
      if (existing) setOrderType(existing);
    },
    [orderMeta]
  );

  // When the entity is a VAT payer and no rate set yet, suggest 20%.
  React.useEffect(() => {
    if (!editing && selectedEntity?.vatPayer && !vatRate) setVatRate("20");
    if (!editing && selectedEntity && !selectedEntity.vatPayer) setVatRate("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [legalEntityId]);

  const handleOrderChange = (nextQuoteId: string) => {
    setQuoteId(nextQuoteId);
    const order = orders.find((o) => o.quoteId === nextQuoteId);
    if (order && !amount) setAmount(String(order.total));
    handleOrderTypePrefill(nextQuoteId);
  };

  const submit = async () => {
    if (!teamId) return;
    if (!legalEntityId) {
      toast.error("Оберіть юрособу-виставника.");
      return;
    }
    const amountNum = Number(amount.replace(",", "."));
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      toast.error("Вкажіть коректну суму рахунку.");
      return;
    }
    const order = orders.find((o) => o.quoteId === quoteId) ?? null;
    const input: InvoiceInput = {
      number,
      legalEntityId,
      customerId: order?.customerId ?? editing?.customerId ?? null,
      quoteId: quoteId || null,
      issueDate,
      dueDate: dueDate || null,
      amount: amountNum,
      vatRate: vatRate ? Number(vatRate.replace(",", ".")) : null,
      status,
      notes,
      createdBy: userId,
    };

    setSaving(true);
    try {
      if (editing) await updateInvoice(teamId, editing.id, input);
      else await createInvoice(teamId, input);
      // Дрібниця: класифікуємо замовлення (тип + юрособа) у finance_order_meta.
      if (quoteId && (orderType || legalEntityId)) {
        await upsertOrderMeta(teamId, quoteId, {
          orderType: orderType || null,
          legalEntityId: legalEntityId || null,
        });
      }
      onOpenChange(false);
      await onSaved();
      toast.success(editing ? "Рахунок оновлено" : "Рахунок виставлено");
    } catch (error) {
      toast.error("Не вдалося зберегти рахунок", { description: getErrorMessage(error, "Спробуйте ще раз.") });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{editing ? "Редагувати рахунок" : "Новий рахунок"}</DialogTitle>
          <DialogDescription>Рахунок замовнику від нашої юрособи.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-2">
            <Label>Замовлення</Label>
            <InvoiceOrderPicker orders={orders} loading={ordersLoading} value={quoteId} onChange={handleOrderChange} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>Виставник (юрособа) <span className="text-destructive">*</span></Label>
              <Select value={legalEntityId} onValueChange={setLegalEntityId}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Оберіть" />
                </SelectTrigger>
                <SelectContent>
                  {entities.map((entity) => (
                    <SelectItem key={entity.id} value={entity.id}>
                      {formatLegalEntityLabel(entity)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Номер рахунку</Label>
              <Input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="Напр. 0001" className="h-9" />
            </div>
          </div>
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
              <Label>Ставка ПДВ, %</Label>
              <Input
                value={vatRate}
                onChange={(e) => setVatRate(e.target.value)}
                inputMode="decimal"
                placeholder={selectedEntity?.vatPayer ? "20" : "без ПДВ"}
                className="h-9"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>Дата виставлення</Label>
              <Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} className="h-9" />
            </div>
            <div className="grid gap-2">
              <Label>Оплатити до</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="h-9" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>Статус</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as FinanceInvoiceStatus)}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(INVOICE_STATUS_LABELS) as FinanceInvoiceStatus[]).map((s) => (
                    <SelectItem key={s} value={s}>
                      {INVOICE_STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Тип замовлення</Label>
              <Select value={orderType || "none"} onValueChange={(v) => setOrderType(v === "none" ? "" : (v as OrderType))}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Не вказано" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Не вказано</SelectItem>
                  {(Object.keys(ORDER_TYPE_LABELS) as OrderType[]).map((t) => (
                    <SelectItem key={t} value={t}>
                      {ORDER_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Коментар</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-[60px]" />
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

function InvoiceOrderPicker({
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
      ? orders.filter((o) => o.number.toLowerCase().includes(q) || o.customerName.toLowerCase().includes(q))
      : orders;
    return base.slice(0, 50);
  }, [orders, query]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" className="h-9 w-full justify-start font-normal">
          {selected ? (
            <span className="truncate">{selected.number} · {selected.customerName}</span>
          ) : (
            <span className="text-muted-foreground">Без замовлення / оберіть</span>
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
