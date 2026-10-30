import { useState } from "react";
import { toast } from "sonner";

import { useAuth } from "@/auth/AuthProvider";
import { AlertTriangle, ExternalLink, Receipt } from "@/components/icons/appIcons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DateInput } from "@/components/ui/picker-input";
import { Textarea } from "@/components/ui/textarea";
import { CustomerContractEntry } from "@/features/orders/order-details/CustomerContractDialog";
import type { InvoiceItemDraft } from "@/features/orders/order-details/useOrderInvoiceFlow";
import { getInvoiceContractBlocker } from "@/features/orders/orderDocumentRequirements";
import { findIndivisiblePrices, getInvoicePriceBlocker, parseMoneyInput } from "@/features/orders/orderInvoice";
import { itemDocumentName } from "@/features/orders/orderItemDocumentNames";
import { saveOrderItemDocumentNames } from "@/features/orders/orderItemDocumentNamesQueries";
import { formatOrderMoneyExact as formatOrderMoney, type DerivedOrderRecord } from "@/features/orders/orderRecords";
import { canManageOrderDocuments } from "@/lib/permissions";
import { cn } from "@/lib/utils";

const todayIso = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

const formatRequestedAt = (value: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString("uk-UA", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
};

const price = (value: number, currency: string) => formatOrderMoney(value, currency);

// 403.7 → «403,70», як пише бухгалтер; ціле лишається цілим.
const toInput = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(2).replace(".", ","));

// № · назва · к-сть · ціна · сума. На телефоні к-сть, ціна й сума — другим рядком під назвою.
const ROW_GRID = "grid grid-cols-[1.25rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 sm:grid-cols-[1.25rem_minmax(0,1fr)_5.5rem_8.5rem_7.5rem]";

type LineDraft = { name: string; qty: string; price: string };

/**
 * Плашка бухгалтера на замовленні (REQ-322#p10, макет «Бухгалтер»): хто
 * просить рахунок, позиції, «Номер з BAS» і «Дата», кнопки «Рахунок виписано» /
 * «Повернути менеджеру». Бухгалтер приходить сюди з Telegram просто на замовлення.
 *
 * Позиції — одна таблиця (картка 345): назва в документах (номенклатура BAS,
 * REQ-322#p38), кількість і ціна в одному рядку. Окремої кнопки збереження
 * немає: назви пишуться разом із випискою чи поверненням, а змінені ціна й
 * кількість — разом із номером і датою однією транзакцією, тож менеджер не
 * бачить рахунку зі старою ціною. Межі ціни ті самі, що у виправленні
 * виписаного рахунку: підписана СП чи оплата — тоді ціна лише для читання.
 *
 * Неподільна на 1,2 ціна: якщо бухгалтер ціну не чіпав — попередження, а не
 * замок (виписати чи повернути, вирішує сам); змінену ціну — лише подільну, як
 * у «Виправити рахунок».
 *
 * Без підписаного договору рахунок не виписується (REQ-322#p40): договір,
 * підписаний поза CRM, бухгалтер вносить звідси ж (p39).
 */
export function OrderInvoiceDeskCard({
  record,
  busy,
  onIssue,
  onReturn,
  onPreview,
  teamId,
  onDocumentNamesSaved,
  onContractSaved,
}: {
  record: DerivedOrderRecord;
  teamId: string | null | undefined;
  onDocumentNamesSaved: (names: Map<string, string | null>) => void;
  onContractSaved: () => void;
  busy: "request" | "issue" | "return" | null;
  onIssue: (number: string, date: string, items?: InvoiceItemDraft[]) => Promise<boolean>;
  onReturn: (note: string) => Promise<boolean>;
  onPreview: () => void;
}) {
  const { accessRole, jobRole } = useAuth();
  const [number, setNumber] = useState("");
  const [date, setDate] = useState(todayIso);
  const [returning, setReturning] = useState(false);
  const [note, setNote] = useState("");
  const [drafts, setDrafts] = useState<Record<string, LineDraft>>({});
  const [savingNames, setSavingNames] = useState(false);
  const locked = busy !== null || savingNames;
  const vatLabel = record.executor.vatPayer ? "Ціна з ПДВ" : "Ціна";

  // Замовлення з прорахунку без власних позицій у базі — ні назву, ні ціну нікуди записати.
  const stored = record.source === "stored" && Boolean(teamId);
  const canEditNames = stored && canManageOrderDocuments(accessRole, jobRole);
  const canEditPrices = stored && !getInvoicePriceBlocker(record);

  const baseDraft = (item: DerivedOrderRecord["items"][number]): LineDraft => ({
    name: itemDocumentName(item),
    qty: toInput(item.qty),
    price: toInput(item.unitPrice),
  });
  const lines = record.items.map((item) => {
    const draft = drafts[item.id] ?? baseDraft(item);
    const qty = parseMoneyInput(draft.qty);
    const unitPrice = parseMoneyInput(draft.price);
    return {
      item,
      draft,
      qty,
      unitPrice,
      nameChanged: draft.name.trim() !== itemDocumentName(item),
      qtyChanged: qty !== item.qty,
      priceChanged: unitPrice !== item.unitPrice,
    };
  });
  const namesChanged = canEditNames && lines.some((line) => line.nameChanged);
  const pricesChanged = canEditPrices && lines.some((line) => line.qtyChanged || line.priceChanged);
  const pricesInvalid = lines.some((line) => !line.qty || line.qty <= 0 || !line.unitPrice || line.unitPrice <= 0);
  const draftTotal = lines.reduce(
    (sum, line) => sum + Math.round((line.qty ?? 0) * (line.unitPrice ?? 0) * 100) / 100,
    0
  );
  const patchDraft = (item: DerivedOrderRecord["items"][number], patch: Partial<LineDraft>) =>
    setDrafts((current) => ({ ...current, [item.id]: { ...(current[item.id] ?? baseDraft(item)), ...patch } }));

  // Кратність 6 коп. потрібна, щоб виділити 20% ПДВ; у ФОП без ПДВ її немає.
  const indivisible = new Map(
    record.executor.vatPayer
      ? findIndivisiblePrices(lines.map((line) => ({ name: line.item.id, unitPrice: line.unitPrice }))).map(
          (entry) => [entry.name, entry] as const
        )
      : []
  );
  const priceLock = pricesChanged && (pricesInvalid || indivisible.size > 0);
  const issueItems = pricesChanged
    ? lines.map((line) => ({ id: line.item.id, qty: line.qty ?? 0, unitPrice: line.unitPrice ?? 0 }))
    : undefined;

  const requester =
    record.invoiceRequestedBy && record.invoiceRequestedBy === record.managerUserId ? record.managerLabel : "Менеджер";
  const requestedAt = formatRequestedAt(record.invoiceRequestedAt);
  const contractBlocker = getInvoiceContractBlocker(record);

  /** Назви — перед випискою чи поверненням: інакше виправлена номенклатура загубиться. */
  const saveNames = async () => {
    if (!namesChanged || !teamId) return true;
    setSavingNames(true);
    try {
      const saved = await saveOrderItemDocumentNames(
        teamId,
        lines
          .filter((line) => line.nameChanged)
          .map((line) => ({ itemId: line.item.id, name: line.item.name, value: line.draft.name }))
      );
      onDocumentNamesSaved(saved);
      return true;
    } catch (error: unknown) {
      const code = (error as { code?: string } | null)?.code;
      toast.error(code === "42501" ? "Назву в документах правлять СЕО і бухгалтерія." : "Не вдалося зберегти назви в документах");
      return false;
    } finally {
      setSavingNames(false);
    }
  };

  return (
    <section className="rounded-xl border border-info-soft-border bg-info-soft/40 p-4" aria-label="Запит рахунку">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2.5">
          <Receipt className="mt-0.5 h-4 w-4 shrink-0 text-info-foreground" />
          <div className="min-w-0">
            <div className="text-sm font-semibold text-foreground">{requester} просить рахунок</div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              {record.customerName} · {price(record.total, record.currency)}
              {requestedAt ? ` · ${requestedAt}` : ""}
            </div>
          </div>
        </div>
        <Button size="sm" variant="ghost" className="gap-1 px-2 text-xs" onClick={onPreview}>
          <ExternalLink className="h-3.5 w-3.5" />
          Переглянути чернетку
        </Button>
      </div>

      {record.items.length > 0 ? (
        <div className="mt-3 overflow-hidden rounded-lg border border-border/60 bg-background">
          <div className={cn(ROW_GRID, "hidden border-b border-border/60 px-3 py-2 text-xs text-muted-foreground sm:grid")}>
            <span>№</span>
            <span>Назва в документах — як у BAS</span>
            <span>К-сть</span>
            <span>{vatLabel}</span>
            <span className="text-right">Сума</span>
          </div>
          <div className="border-b border-border/60 px-3 py-2 text-xs text-muted-foreground sm:hidden">
            Назва в документах — як у BAS · к-сть · {vatLabel.toLowerCase()}
          </div>
          {lines.map((line, index) => {
            const hint = indivisible.get(line.item.id);
            const was = [
              line.nameChanged ? `назва «${itemDocumentName(line.item)}»` : null,
              line.qtyChanged ? `к-сть ${toInput(line.item.qty)}` : null,
              line.priceChanged ? `ціна ${price(line.item.unitPrice, record.currency)}` : null,
            ].filter(Boolean);
            return (
              <div key={line.item.id} className={cn(ROW_GRID, "items-center border-b border-border/60 px-3 py-2.5")}>
                <span className="text-xs tabular-nums text-muted-foreground">{index + 1}</span>
                <Input
                  aria-label={`Назва в документах: ${line.item.name}`}
                  title={line.item.name}
                  value={line.draft.name}
                  disabled={!canEditNames || locked}
                  onChange={(event) => patchDraft(line.item, { name: event.target.value })}
                />
                {/* На телефоні к-сть і ціна — поруч під назвою, сума — під ними; на ширшому — клітинки тієї ж таблиці. */}
                <div className="col-start-2 grid grid-cols-[5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-1 sm:contents">
                  <Input
                    aria-label={`Кількість, ${line.item.unit}: ${line.item.name}`}
                    inputMode="decimal"
                    className="text-right tabular-nums"
                    value={line.draft.qty}
                    disabled={!canEditPrices || locked}
                    onChange={(event) => patchDraft(line.item, { qty: event.target.value })}
                  />
                  <Input
                    aria-label={`${vatLabel}: ${line.item.name}`}
                    inputMode="decimal"
                    className={cn(
                      "text-right tabular-nums",
                      hint && "border-warning-soft-border bg-warning-soft/40"
                    )}
                    value={line.draft.price}
                    disabled={!canEditPrices || locked}
                    onChange={(event) => patchDraft(line.item, { price: event.target.value })}
                  />
                  <span className="col-span-2 text-right text-sm tabular-nums text-foreground sm:col-span-1">
                    {price((line.qty ?? 0) * (line.unitPrice ?? 0), record.currency)}
                  </span>
                </div>
                {was.length > 0 || hint ? (
                  <div className="col-start-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs sm:col-span-4">
                    <span className="text-muted-foreground">{was.length > 0 ? `Було: ${was.join(", ")}` : null}</span>
                    {hint ? (
                      <span className="flex flex-wrap items-center gap-1.5 text-foreground">
                        <AlertTriangle className="h-3.5 w-3.5 tone-text-warning" />
                        Не ділиться на 1,2 до копійки
                        {canEditPrices ? (
                          [hint.down, hint.up].map((value) => (
                            <Button
                              key={value}
                              type="button"
                              size="xs"
                              variant="outline"
                              disabled={locked}
                              onClick={() => patchDraft(line.item, { price: toInput(value) })}
                            >
                              {price(value, record.currency)}
                            </Button>
                          ))
                        ) : (
                          <span className="text-muted-foreground">
                            → {price(hint.down, record.currency)} або {price(hint.up, record.currency)}
                          </span>
                        )}
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 bg-muted/30 px-3 py-2.5 text-sm">
            {namesChanged || pricesChanged ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="-ml-2 h-auto px-2 py-1 text-xs"
                disabled={locked}
                onClick={() => setDrafts({})}
              >
                Скинути до даних менеджера
              </Button>
            ) : (
              <span className="text-xs text-muted-foreground">
                {canEditPrices
                  ? "Назва, кількість і ціна збережуться разом із випискою."
                  : `${getInvoicePriceBlocker(record) ?? "Ціну тут змінити не можна"}. Назва збережеться разом із випискою.`}
              </span>
            )}
            <span className="ml-auto flex items-baseline gap-2 tabular-nums">
              <span className="text-muted-foreground">Разом</span>
              {pricesChanged && draftTotal !== record.total ? (
                <span className="text-muted-foreground line-through">{price(record.total, record.currency)}</span>
              ) : null}
              <span className="font-semibold text-foreground">{price(draftTotal, record.currency)}</span>
            </span>
          </div>
        </div>
      ) : null}

      {contractBlocker ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-warning-soft-border bg-warning-soft/50 px-3 py-2 text-xs text-foreground">
          <div className="flex items-center gap-1.5 font-medium">
            <AlertTriangle className="h-3.5 w-3.5 tone-text-warning" />
            {contractBlocker}
          </div>
          <CustomerContractEntry record={record} teamId={teamId} onSaved={onContractSaved} />
        </div>
      ) : null}

      {returning ? (
        <div className="mt-3 space-y-2">
          <Label htmlFor="invoice-return-note" className="text-xs">
            Що виправити менеджеру
          </Label>
          <Textarea
            id="invoice-return-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={2}
            autoFocus
            placeholder="Напр.: ціна футболки 403,70 не ділиться на 1,2 — поставте 403,68"
          />
          <div className="flex flex-wrap justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setReturning(false)} disabled={locked}>
              Скасувати
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!note.trim() || locked}
              onClick={async () => {
                if (!(await saveNames())) return;
                if (await onReturn(note)) setReturning(false);
              }}
            >
              Повернути менеджеру
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <div className="grid w-full gap-1 sm:w-40">
            <Label htmlFor="invoice-number" className="text-xs">
              Номер з BAS
            </Label>
            <Input
              id="invoice-number"
              value={number}
              onChange={(event) => setNumber(event.target.value)}
              placeholder={record.executor.kind === "sole_prop" ? "напр. СФ-0000118" : "напр. 407"}
              inputMode={record.executor.kind === "sole_prop" ? "text" : "numeric"}
            />
          </div>
          <div className="grid w-full gap-1 sm:w-40">
            <Label htmlFor="invoice-date" className="text-xs">
              Дата
            </Label>
            <DateInput id="invoice-date" controlSize="md" value={date} onChange={(event) => setDate(event.target.value)} />
          </div>
          <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:ml-auto sm:w-auto">
            {priceLock ? (
              <span className="text-xs text-muted-foreground">
                {pricesInvalid ? "Кількість і ціна мають бути більші за нуль" : "Оберіть ціну, що ділиться на 1,2"}
              </span>
            ) : null}
            <Button size="sm" variant="outline" onClick={() => setReturning(true)} disabled={locked}>
              Повернути менеджеру
            </Button>
            <Button
              size="sm"
              disabled={!number.trim() || !date || locked || Boolean(contractBlocker) || priceLock}
              onClick={async () => {
                if (!(await saveNames())) return;
                if (await onIssue(number, date, issueItems)) setDrafts({});
              }}
            >
              Рахунок виписано
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
