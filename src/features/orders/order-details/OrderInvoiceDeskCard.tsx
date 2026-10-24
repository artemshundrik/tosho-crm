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
import { findIndivisiblePrices } from "@/features/orders/orderInvoice";
import { formatOrderMoney, type DerivedOrderRecord } from "@/features/orders/orderRecords";

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

/**
 * Плашка бухгалтера на замовленні (REQ-322#p10, макет «Бухгалтер»): хто
 * просить рахунок, поля «Номер з BAS» і «Дата», кнопки «Рахунок виписано» /
 * «Повернути менеджеру». Бухгалтер приходить сюди з Telegram просто на замовлення.
 *
 * Неподільні на 1,2 ціни — попередження, а не замок: виправити ціну може лише
 * менеджер, тож бухгалтер вирішує сам — повернути чи виписати. Назву позиції
 * (номенклатуру BAS) бухгалтер виправляє тут сам (REQ-322#p38).
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
  onIssue: (number: string, date: string) => Promise<boolean>;
  onReturn: (note: string) => Promise<boolean>;
  onPreview: () => void;
}) {
  const [number, setNumber] = useState("");
  const [date, setDate] = useState(todayIso);
  const [returning, setReturning] = useState(false);
  const [note, setNote] = useState("");
  // Кратність 6 коп. потрібна, щоб виділити 20% ПДВ; у ФОП без ПДВ її немає.
  const indivisible = record.executor.vatPayer ? findIndivisiblePrices(record.items) : [];
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
          <ul className="mt-1 space-y-0.5 text-muted-foreground">
            {indivisible.map((item) => (
              <li key={item.name}>
                {item.name}: {price(item.price, record.currency)} → {price(item.down, record.currency)} або{" "}
                {price(item.up, record.currency)}
              </li>
            ))}
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
              disabled={!number.trim() || !date || busy !== null || Boolean(contractBlocker)}
              onClick={() => void onIssue(number, date)}
            >
              Рахунок виписано
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
