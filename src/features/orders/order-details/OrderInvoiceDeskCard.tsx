import { useState } from "react";

import { AlertTriangle, ExternalLink, Receipt } from "@/components/icons/appIcons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DateInput } from "@/components/ui/picker-input";
import { Textarea } from "@/components/ui/textarea";
import { CustomerContractEntry } from "@/features/orders/order-details/CustomerContractDialog";
import { OrderItemDocumentNamesField } from "@/features/orders/order-details/OrderItemDocumentNamesField";
import { getInvoiceContractBlocker } from "@/features/orders/orderDocumentRequirements";
import type { InvoiceItemDraft } from "@/features/orders/order-details/useOrderInvoiceFlow";
import { findIndivisiblePrices, getInvoicePriceBlocker, parseMoneyInput } from "@/features/orders/orderInvoice";
import { formatOrderMoneyExact as formatOrderMoney, type DerivedOrderRecord } from "@/features/orders/orderRecords";

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

const toInput = (value: number) => String(value).replace(".", ",");

/**
 * Плашка бухгалтера на замовленні (REQ-322#p10, макет «Бухгалтер»): хто
 * просить рахунок, поля «Номер з BAS» і «Дата», кнопки «Рахунок виписано» /
 * «Повернути менеджеру». Бухгалтер приходить сюди з Telegram просто на замовлення.
 *
 * Назву позиції (номенклатуру BAS) бухгалтер виправляє тут сам (REQ-322#p38),
 * а з картки 345 — і ціну з кількістю: «Рахунок виписано» тоді зберігає позиції,
 * номер і дату однією дією, і менеджер не бачить рахунку зі старою ціною. Межі
 * ті самі, що у виправленні виписаного рахунку: підписана СП чи оплата.
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
  const [number, setNumber] = useState("");
  const [date, setDate] = useState(todayIso);
  const [returning, setReturning] = useState(false);
  const [note, setNote] = useState("");
  const [drafts, setDrafts] = useState<Record<string, { qty: string; price: string }>>({});
  // Замовлення з прорахунку без власних позицій у базі — ціну нікуди записати.
  const priceBlocker = record.source === "stored" ? getInvoicePriceBlocker(record) : "Позиції ще не збережені в замовленні";
  const canEditPrices = !priceBlocker && record.items.length > 0;
  const lines = record.items.map((item) => {
    const draft = drafts[item.id] ?? { qty: toInput(item.qty), price: toInput(item.unitPrice) };
    const qty = parseMoneyInput(draft.qty);
    const unitPrice = parseMoneyInput(draft.price);
    return { item, draft, qty, unitPrice, changed: qty !== item.qty || unitPrice !== item.unitPrice };
  });
  const pricesChanged = canEditPrices && lines.some((line) => line.changed);
  const pricesInvalid = lines.some((line) => !line.qty || line.qty <= 0 || !line.unitPrice || line.unitPrice <= 0);
  const draftTotal = lines.reduce(
    (sum, line) => sum + Math.round((line.qty ?? 0) * (line.unitPrice ?? 0) * 100) / 100,
    0
  );
  const patchDraft = (itemId: string, patch: Partial<{ qty: string; price: string }>) =>
    setDrafts((current) => {
      const item = record.items.find((entry) => entry.id === itemId);
      const base = current[itemId] ?? { qty: toInput(item?.qty ?? 0), price: toInput(item?.unitPrice ?? 0) };
      return { ...current, [itemId]: { ...base, ...patch } };
    });
  // Кратність 6 коп. потрібна, щоб виділити 20% ПДВ; у ФОП без ПДВ її немає.
  const indivisible = record.executor.vatPayer
    ? findIndivisiblePrices(lines.map((line) => ({ name: line.item.id, unitPrice: line.unitPrice }))).map((entry) => ({
        ...entry,
        itemId: entry.name,
        name: lines.find((line) => line.item.id === entry.name)?.item.name ?? entry.name,
      }))
    : [];
  const issueItems = pricesChanged
    ? lines.map((line) => ({ id: line.item.id, qty: line.qty ?? 0, unitPrice: line.unitPrice ?? 0 }))
    : undefined;
  const requester =
    record.invoiceRequestedBy && record.invoiceRequestedBy === record.managerUserId ? record.managerLabel : "Менеджер";
  const requestedAt = formatRequestedAt(record.invoiceRequestedAt);
  const contractBlocker = getInvoiceContractBlocker(record);

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

      <div className="mt-3 rounded-lg border border-border/60 bg-background/70 p-3">
        <OrderItemDocumentNamesField record={record} teamId={teamId} onSaved={onDocumentNamesSaved} />
      </div>

      {canEditPrices ? (
        <div className="mt-3 space-y-2 rounded-lg border border-border/60 bg-background/70 p-3">
          <div>
            <div className="text-sm font-medium text-foreground">Ціна й кількість</div>
            <p className="text-xs text-muted-foreground">
              Змінені ціни збережуться разом із номером, коли натиснете «Рахунок виписано».
            </p>
          </div>
          <div className="grid grid-cols-[1fr_1fr_auto] gap-2 text-2xs text-muted-foreground">
            <span>Кількість</span>
            <span>{record.executor.vatPayer ? "Ціна з ПДВ" : "Ціна"}</span>
            <span className="min-w-24 text-right">Сума</span>
          </div>
          {lines.map((line, index) => (
            <div key={line.item.id} className="grid gap-1">
              <div className="truncate text-xs text-muted-foreground" title={line.item.name}>
                {index + 1}. {line.item.documentName ?? line.item.name}
              </div>
              <div className="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
                <Input
                  aria-label={`Кількість, ${line.item.unit}: ${line.item.name}`}
                  inputMode="decimal"
                  value={line.draft.qty}
                  disabled={busy !== null}
                  onChange={(event) => patchDraft(line.item.id, { qty: event.target.value })}
                />
                <Input
                  aria-label={`${record.executor.vatPayer ? "Ціна з ПДВ" : "Ціна"}: ${line.item.name}`}
                  inputMode="decimal"
                  value={line.draft.price}
                  disabled={busy !== null}
                  onChange={(event) => patchDraft(line.item.id, { price: event.target.value })}
                />
                <div className="min-w-24 text-right text-sm tabular-nums text-muted-foreground">
                  {price((line.qty ?? 0) * (line.unitPrice ?? 0), record.currency)}
                </div>
              </div>
            </div>
          ))}
          <div className="flex items-baseline justify-between border-t border-border/60 pt-2 text-sm">
            <span className="text-muted-foreground">Разом</span>
            <span className="tabular-nums">
              {pricesChanged && draftTotal !== record.total ? (
                <span className="mr-2 text-muted-foreground line-through">{price(record.total, record.currency)}</span>
              ) : null}
              <span className="font-semibold text-foreground">{price(draftTotal, record.currency)}</span>
            </span>
          </div>
          {pricesChanged ? (
            <div className="flex justify-end">
              <Button size="sm" variant="ghost" onClick={() => setDrafts({})} disabled={busy !== null}>
                Повернути ціни менеджера
              </Button>
            </div>
          ) : null}
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

      {indivisible.length > 0 ? (
        <div className="mt-3 rounded-lg border border-warning-soft-border bg-warning-soft/50 px-3 py-2 text-xs text-foreground">
          <div className="flex items-center gap-1.5 font-medium">
            <AlertTriangle className="h-3.5 w-3.5 tone-text-warning" />
            Ціна не ділиться на 1,2 до копійки — округлювати не можна
          </div>
          <ul className="mt-1 space-y-1 text-muted-foreground">
            {indivisible.map((item) =>
              canEditPrices ? (
                <li key={item.itemId} className="flex flex-wrap items-center gap-1.5">
                  <span>
                    {item.name}: {price(item.price, record.currency)} →
                  </span>
                  {[item.down, item.up].map((value) => (
                    <Button
                      key={value}
                      type="button"
                      size="xs"
                      variant="outline"
                      disabled={busy !== null}
                      onClick={() => patchDraft(item.itemId, { price: toInput(value) })}
                    >
                      {price(value, record.currency)}
                    </Button>
                  ))}
                </li>
              ) : (
                <li key={item.itemId}>
                  {item.name}: {price(item.price, record.currency)} → {price(item.down, record.currency)} або{" "}
                  {price(item.up, record.currency)}
                </li>
              )
            )}
          </ul>
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
            <Button size="sm" variant="ghost" onClick={() => setReturning(false)} disabled={busy === "return"}>
              Скасувати
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!note.trim() || busy !== null}
              onClick={async () => {
                if (await onReturn(note)) setReturning(false);
              }}
            >
              Повернути менеджеру
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <div className="grid w-full gap-1 sm:w-36">
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
            <DateInput id="invoice-date" value={date} onChange={(event) => setDate(event.target.value)} />
          </div>
          <div className="flex w-full flex-wrap gap-2 sm:ml-auto sm:w-auto">
            <Button size="sm" variant="outline" onClick={() => setReturning(true)} disabled={busy !== null}>
              Повернути менеджеру
            </Button>
            <Button
              size="sm"
              disabled={
                !number.trim() ||
                !date ||
                busy !== null ||
                Boolean(contractBlocker) ||
                (pricesChanged && (pricesInvalid || indivisible.length > 0))
              }
              onClick={() => void onIssue(number, date, issueItems)}
            >
              Рахунок виписано
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
