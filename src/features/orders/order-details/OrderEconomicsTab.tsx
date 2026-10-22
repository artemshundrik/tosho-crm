import { BentoFact, HeroShell, SplitBar } from "@/components/app/bento";
import { MoreHorizontal } from "@/components/icons/appIcons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuItemDestructive,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { dayMonth } from "@/features/orders/kyivDate";
import { formatAmountInput, formatUah } from "@/features/orders/orderPayments";
import {
  groupPurchasesByItem,
  isPurchaseShortReceived,
  purchasePaidDiffers,
  summarizeOrderEconomics,
  type OrderPurchase,
} from "@/features/orders/orderPurchases";
import { formatOrderMoney } from "@/features/orders/orderRecords";
import {
  canConfirmPurchaseReceipt,
  canEditOrderPurchases,
  canMarkNoPurchases,
  canSeeOrderMargin,
  canSeeOrderPurchaseAmounts,
} from "@/lib/permissions";
import { cn } from "@/lib/utils";

/** Що посада бачить і робить у вкладці. Права все одно перевіряє база; тут — що показати. */
export type EconomicsAccess = { amounts: boolean; margin: boolean; edit: boolean; receive: boolean; markNone: boolean };

export function economicsAccess(accessRole: string | null | undefined, jobRole: string | null | undefined): EconomicsAccess {
  return {
    amounts: canSeeOrderPurchaseAmounts(accessRole, jobRole),
    margin: canSeeOrderMargin(accessRole, jobRole),
    edit: canEditOrderPurchases(accessRole, jobRole),
    receive: canConfirmPurchaseReceipt(accessRole, jobRole),
    markNone: canMarkNoPurchases(accessRole, jobRole),
  };
}

export type EconomicsItem = { id: string; name: string; qty: number | null; unit: string | null };

export const isForeignCurrency = (currency: string | null | undefined) => {
  const cur = (currency ?? "").trim().toUpperCase();
  return cur === "USD" || cur === "EUR";
};

const pctFormat = new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 1 });
const formatPct = (value: number) => `${pctFormat.format(value)}%`;

/** «1 000,00» для звичайного рядка, «1 000,00 → 1 200,00 з ПДВ» для ФОП. */
const purchaseAmountText = (p: OrderPurchase) => {
  if (p.amount == null) return null;
  if (p.vatMode === "no_vat" && p.costWithVat != null) {
    return `${formatAmountInput(p.amount)} → ${formatAmountInput(p.costWithVat)} з ПДВ`;
  }
  return formatAmountInput(p.amount);
};

const qtyText = (qty: number | null, unit: string | null) => (qty == null ? null : [qty, unit].filter(Boolean).join(" "));

const isPaid = (p: OrderPurchase) => Boolean(p.expenseId || p.paidOn);

/**
 * «оплачено 12.10» — або, якщо сплатили не суму рахунку, «оплачено 5 000,00 з
 * 5 250,30 · 12.10» жовтим: інакше різниця між замовленням і Фінансами
 * лишилась би без пояснення. Для ФОП обидва числа без × 1,2.
 */
function PaidBadge({ purchase: p }: { purchase: OrderPurchase }) {
  const date = p.paidOn ? dayMonth(p.paidOn) : null;
  if (purchasePaidDiffers(p) && p.paidAmount != null && p.amount != null) {
    return (
      <Badge tone="warning" size="sm" title="Сплачено не стільки, скільки в рахунку постачальника">
        {`оплачено ${formatAmountInput(p.paidAmount)} з ${formatAmountInput(p.amount)}${date ? ` · ${date}` : ""}`}
      </Badge>
    );
  }
  return (
    <Badge tone="success" size="sm">
      {date ? `оплачено ${date}` : "оплачено"}
    </Badge>
  );
}

function EconomicsSummary({
  purchases,
  invoiceTotal,
  currency,
  access,
  none,
}: {
  purchases: OrderPurchase[];
  invoiceTotal: number;
  currency: string | null;
  access: EconomicsAccess;
  /** Стоїть «закупок немає»: тоді весь рахунок — залишок, і це правда, а не порожнеча. */
  none: boolean;
}) {
  const s = summarizeOrderEconomics(purchases, invoiceTotal, currency);
  const receivedLine = `отримано ${s.received} з ${s.total}`;

  if (!access.amounts) {
    if (s.total === 0) return null;
    const pct = Math.round((s.received / s.total) * 100);
    return (
      <div className="rounded-xl border border-border/60 px-4 py-3">
        <div className="flex items-baseline justify-between gap-2 text-sm">
          <span className="font-medium">{receivedLine}</span>
          {s.received < s.total ? <span className="text-xs text-muted-foreground">склад ще чекає документів</span> : null}
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
          <div className="h-full rounded-full bg-chart-1 transition-[width]" style={{ width: `${pct}%` }} />
        </div>
      </div>
    );
  }

  const foreign = isForeignCurrency(currency);
  const invoiceText = foreign ? formatOrderMoney(invoiceTotal, currency) : formatUah(invoiceTotal);
  const unpaid = Math.max(s.costAll - s.costPaid, 0);
  const facts = (
    <>
      <BentoFact value={invoiceText} label="сума рахунку" />
      {s.total > 0 ? <BentoFact value={receivedLine} /> : null}
    </>
  );

  if (access.margin && !foreign) {
    const negative = s.confirmedRemainder < 0;
    return (
      <HeroShell
        className="p-4 sm:p-4"
        label="Залишок · від суми рахунку"
        value={<span className={cn(negative && "tone-text-danger")}>{formatUah(s.confirmedRemainder)}</span>}
        suffix={s.costAll !== s.costPaid ? `очікується ${formatUah(s.expectedRemainder)}` : null}
        badge={
          s.marginPct == null ? (
            <span className="text-xs text-muted-foreground">немає суми рахунку</span>
          ) : s.total === 0 && !none ? (
            <span className="text-xs text-muted-foreground">закупок ще не внесено</span>
          ) : (
            <Badge tone={s.marginPct < 0 ? "danger" : "success"} size="sm">
              Маржа {formatPct(s.marginPct)}
              {s.expectedMarginPct != null && s.costAll !== s.costPaid ? (
                <span className="font-normal opacity-70"> · очікувана {formatPct(s.expectedMarginPct)}</span>
              ) : null}
            </Badge>
          )
        }
        footnote={
          <>
            {facts}
            <BentoFact value={formatUah(s.costAll)} label="собівартість" />
          </>
        }
      >
        {invoiceTotal > 0 ? (
          <SplitBar
            className="mt-3"
            parts={[
              { key: "paid", label: "Оплачені закупки", weight: s.costPaid, valueText: formatUah(s.costPaid), color: "bg-chart-1" },
              { key: "unpaid", label: "Неоплачені", weight: unpaid, valueText: formatUah(unpaid), color: "bg-chart-2" },
              {
                key: "rest",
                label: "Залишок",
                weight: Math.max(s.expectedRemainder, 0),
                valueText: formatUah(s.expectedRemainder),
                color: "bg-success-solid",
              },
            ]}
          />
        ) : null}
      </HeroShell>
    );
  }

  return (
    <HeroShell
      className="p-4 sm:p-4"
      label="Собівартість з ПДВ"
      value={formatUah(s.costAll)}
      badge={access.margin && foreign ? <span className="text-xs text-muted-foreground">маржа для валютних замовлень — поки ні</span> : null}
      footnote={facts}
    >
      <SplitBar
        className="mt-3"
        parts={[
          { key: "paid", label: "Оплачено", weight: s.costPaid, valueText: formatUah(s.costPaid), color: "bg-chart-1" },
          { key: "unpaid", label: "Не оплачено", weight: unpaid, valueText: formatUah(unpaid), color: "bg-chart-2" },
        ]}
      />
    </HeroShell>
  );
}

type RowHandlers = {
  onEdit: (p: OrderPurchase) => void;
  onDelete: (p: OrderPurchase) => void;
  onPay: (p: OrderPurchase) => void;
  onCancelPayment: (p: OrderPurchase) => void;
  onReceive: (p: OrderPurchase) => void;
};

function PurchaseRow({ purchase: p, access, handlers }: { purchase: OrderPurchase; access: EconomicsAccess; handlers: RowHandlers }) {
  const paid = isPaid(p);
  const short = isPurchaseShortReceived(p);
  const amountText = access.amounts ? purchaseAmountText(p) : null;
  const invoice = p.supplierInvoiceNumber
    ? `№ ${p.supplierInvoiceNumber} від ${dayMonth(p.supplierInvoiceDate)}`
    : `рахунок від ${dayMonth(p.supplierInvoiceDate)}`;
  const details = [p.supplierName, invoice, qtyText(p.qty, p.unit)].filter(Boolean).join(" · ");
  const receipt = p.receivedOn
    ? [
        `отримано ${dayMonth(p.receivedOn)}`,
        p.receivedDocNumber ? `${p.receivedDocKind === "act" ? "акт" : "ВН"} № ${p.receivedDocNumber}` : null,
        p.receivedQty != null && p.qty != null && p.receivedQty !== p.qty ? `${p.receivedQty} з ${qtyText(p.qty, p.unit)}` : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : "не отримано";
  const menu = [
    access.edit ? { key: "edit", label: "Правити", run: () => handlers.onEdit(p) } : null,
    access.edit && paid ? { key: "cancel", label: "Скасувати оплату", run: () => handlers.onCancelPayment(p) } : null,
    access.receive && p.receivedOn ? { key: "receipt", label: "Виправити отримання", run: () => handlers.onReceive(p) } : null,
  ].filter((item): item is { key: string; label: string; run: () => void } => item !== null);
  const canDelete = access.edit && !paid;

  return (
    <li className="flex flex-wrap items-start gap-x-3 gap-y-1.5 py-2.5">
      <div className="min-w-[200px] flex-1">
        <div className="text-sm font-medium">{p.description}</div>
        <div className="text-xs text-muted-foreground">{details}</div>
      </div>
      {amountText ? <div className="text-sm font-medium tabular-nums">{amountText}</div> : null}
      <div className="flex flex-wrap items-center gap-1.5">
        {access.amounts ? (
          paid ? (
            <PaidBadge purchase={p} />
          ) : access.edit ? (
            <Button type="button" size="xs" variant="outline" onClick={() => handlers.onPay(p)}>
              Оплачено
            </Button>
          ) : (
            <span className="text-xs text-muted-foreground">рахунок є</span>
          )
        ) : null}
        {short ? (
          <Badge tone="warning" size="sm">
            недовіз {p.receivedQty} з {p.qty}
          </Badge>
        ) : null}
        {!p.receivedOn && access.receive ? (
          <Button type="button" size="xs" variant="outline" onClick={() => handlers.onReceive(p)}>
            Отримано
          </Button>
        ) : (
          <span className={cn("text-xs", p.receivedOn ? "text-foreground" : "text-muted-foreground")}>{receipt}</span>
        )}
        {menu.length > 0 || canDelete ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" size="iconXs" variant="ghost" aria-label="Ще дії із закупкою">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {menu.map((item) => (
                <DropdownMenuItem key={item.key} onSelect={item.run}>
                  {item.label}
                </DropdownMenuItem>
              ))}
              {canDelete ? (
                <DropdownMenuItemDestructive onSelect={() => handlers.onDelete(p)}>Видалити</DropdownMenuItemDestructive>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
    </li>
  );
}

/**
 * «Економіка» замовлення: підсумок за посадою і закупки, згруповані за
 * позиціями. Склад бачить лише що, у кого й отримання; молодший бухгалтер —
 * суми без залишку й маржі; бухгалтерія — усе й кнопки запису.
 */
export function OrderEconomicsTab({
  items,
  purchases,
  purchasesNone,
  invoiceTotal,
  currency,
  access,
  loading,
  saving = false,
  onAdd,
  onToggleNone,
  ...handlers
}: {
  items: EconomicsItem[];
  purchases: OrderPurchase[];
  /** Позначка «закупок немає»; null — не стоїть. */
  purchasesNone: { byName: string | null } | null;
  invoiceTotal: number;
  currency: string | null;
  access: EconomicsAccess;
  loading: boolean;
  /** Іде запис: кнопки позначки неактивні, щоб подвійний клік не слав два запити. */
  saving?: boolean;
  /** undefined — позицію обере людина; null — «на все замовлення». */
  onAdd: (itemId?: string | null) => void;
  /** true - поставити «закупок немає», false - зняти. */
  onToggleNone: (none: boolean) => void;
} & RowHandlers) {
  // Позиція могла зникнути із замовлення: такий рядок показуємо в «На все замовлення», а не губимо.
  const known = new Set(items.map((item) => item.id));
  const shown = purchases.map((p) => (p.orderItemId && !known.has(p.orderItemId) ? { ...p, orderItemId: null } : p));
  const groups = groupPurchasesByItem(shown, items);
  const canAdd = access.edit && !purchasesNone;

  if (loading && purchases.length === 0) {
    return (
      <div className="space-y-3" aria-busy="true">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <EconomicsSummary purchases={purchases} invoiceTotal={invoiceTotal} currency={currency} access={access} none={Boolean(purchasesNone)} />

      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Закупки</h2>
        <div className="flex items-center gap-2">
          {access.markNone && !purchasesNone && purchases.length === 0 ? (
            <Button type="button" size="sm" variant="ghost" disabled={saving} onClick={() => onToggleNone(true)}>
              Закупок немає
            </Button>
          ) : null}
          {canAdd ? (
            <Button type="button" size="sm" variant="outline" onClick={() => onAdd(undefined)}>
              + Закупка
            </Button>
          ) : null}
        </div>
      </div>

      {purchasesNone ? (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
          <span>{["Закупок немає", purchasesNone.byName].filter(Boolean).join(" · ")}</span>
          {access.markNone ? (
            <Button type="button" size="xs" variant="textPrimary" disabled={saving} onClick={() => onToggleNone(false)}>
              Зняти позначку
            </Button>
          ) : null}
        </div>
      ) : groups.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
          Закупок ще не внесено.{access.edit ? " Рахунки постачальників вносить бухгалтерія — по ходу, до відвантаження." : ""}
        </div>
      ) : (
        groups.map((group) => {
          const groupCost = summarizeOrderEconomics(group.purchases, 0, currency).costAll; // до копійок
          return (
            <section key={group.itemId ?? "whole"} className="rounded-xl border border-border/60 px-4 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-2 pt-1">
                <h3 className="text-sm font-semibold">
                  {group.title}
                  {group.qtyLabel ? ` - ${group.qtyLabel}` : ""}
                </h3>
                <div className="flex items-center gap-2">
                  {access.amounts ? <span className="text-xs text-muted-foreground tabular-nums">{formatUah(groupCost)} з ПДВ</span> : null}
                  {canAdd ? (
                    <Button type="button" size="xs" variant="textPrimary" onClick={() => onAdd(group.itemId)}>
                      + Закупка
                    </Button>
                  ) : null}
                </div>
              </div>
              <ul className="divide-y divide-border/60">
                {group.purchases.map((p) => (
                  <PurchaseRow key={p.id} purchase={p} access={access} handlers={handlers} />
                ))}
              </ul>
            </section>
          );
        })
      )}
    </div>
  );
}
