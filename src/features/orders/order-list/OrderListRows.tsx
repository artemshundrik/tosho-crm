import { AvatarBase, EntityAvatar } from "@/components/app/avatar-kit";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { HoverCopyText } from "@/components/ui/hover-copy-text";
import { TableCell, TableRow } from "@/components/ui/table";
import {
  ORDER_TURN_LABELS,
  type OrderDocMark,
  type OrderNextStep,
} from "@/features/orders/orderListStages";
import { formatOrderMoney, type DerivedOrderRecord } from "@/features/orders/orderRecords";
import { cn } from "@/lib/utils";

/**
 * Рядок списку замовлень і його мобільна картка (макет ListFinal, REQ-322#p12).
 * Дія в рядку лише відкриває картку: запуск, оплата й документи робляться там.
 */
export type OrderListRowView = {
  record: DerivedOrderRecord;
  step: OrderNextStep;
  paid: { pct: number; label: string };
  docs: OrderDocMark[] | null;
  mine: boolean;
};

const initials = (value: string) =>
  value
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "?";

export const summarizeOrderItems = (record: DerivedOrderRecord) => {
  const first = record.items[0];
  if (!first) return { name: "Немає позицій", qty: null as string | null };
  const qty = record.items.reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
  return {
    name: record.items.length > 1 ? `${first.name} +${record.items.length - 1}` : first.name,
    qty: qty > 0 ? `${qty.toLocaleString("uk-UA")} ${first.unit || "шт."}` : null,
  };
};

/** Замовник і «що замовили» другим рядком: окремій колонці бракує місця поруч із бічною панеллю. */
export function CustomerWithItems({ record }: { record: DerivedOrderRecord }) {
  const items = summarizeOrderItems(record);
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <EntityAvatar
        src={record.customerLogoUrl}
        name={record.customerName}
        fallback={initials(record.customerName)}
        size={28}
      />
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-foreground">{record.customerName}</div>
        <div className="truncate text-xs text-muted-foreground" title={items.name}>
          {items.name}
          {items.qty ? ` · ${items.qty}` : ""}
        </div>
      </div>
    </div>
  );
}

function PaidMiniBar({ paid }: { paid: OrderListRowView["paid"] }) {
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <div className="h-1.5 w-8 shrink-0 overflow-hidden rounded-full bg-muted" aria-hidden>
        <div className="h-full rounded-full bg-success-solid" style={{ width: `${paid.pct}%` }} />
      </div>
      <span className="truncate text-xs text-muted-foreground">{paid.label}</span>
    </div>
  );
}

function DocMarks({ docs }: { docs: OrderDocMark[] | null }) {
  if (!docs) {
    return (
      <span className="whitespace-nowrap text-xs text-muted-foreground" title="Договору, СП, рахунку й видаткової на готівці немає">
        готівка
      </span>
    );
  }
  return (
    <div className="flex gap-[3px]">
      {docs.map((mark) => (
        <span
          key={mark.key}
          title={`${mark.title}: ${mark.ready ? "готово" : "ще ні"}`}
          className={cn(
            "inline-grid h-5 w-5 place-items-center rounded-md text-3xs font-bold",
            mark.ready
              ? "bg-success-solid text-white"
              : "border-[1.5px] border-dashed border-muted-foreground/40 text-muted-foreground/70"
          )}
        >
          {mark.letter}
        </span>
      ))}
    </div>
  );
}

function TurnChip({ step, mine }: { step: OrderNextStep; mine: boolean }) {
  if (!step.turn) return null;
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center rounded-md px-1.5 text-2xs font-semibold",
        mine
          ? "bg-primary text-primary-foreground"
          : step.turn === "customer"
            ? "tone-warning"
            : step.turn === "production"
              ? "tone-neutral"
              : "tone-info"
      )}
    >
      {mine ? "Ти" : ORDER_TURN_LABELS[step.turn]}
    </span>
  );
}

function NextStep({ view }: { view: OrderListRowView }) {
  const { step, record } = view;
  const extra = [
    step.amountDue ? formatOrderMoney(step.amountDue, record.currency) : null,
    step.detail,
  ].filter(Boolean);
  return (
    <div className="flex min-w-0 items-center gap-2">
      <TurnChip step={step} mine={view.mine} />
      <span className="min-w-0 truncate text-sm text-foreground">
        {step.title}
        {extra.length > 0 ? <span className="text-muted-foreground"> · {extra.join(" · ")}</span> : null}
      </span>
    </div>
  );
}

function ManagerAvatar({ record, size }: { record: DerivedOrderRecord; size: number }) {
  return (
    <AvatarBase
      src={record.managerAvatarUrl ?? null}
      name={record.managerLabel}
      fallback={initials(record.managerLabel)}
      size={size}
      className="shrink-0 border-border/60"
      fallbackClassName="text-3xs font-semibold"
    />
  );
}

type RowHandlers = {
  onOpen: (record: DerivedOrderRecord) => void;
  selected: boolean;
  /** null — можна обрати в групову СП; рядок — чому не можна. */
  selectBlocker: string | null;
  onToggleSelect: (record: DerivedOrderRecord, checked: boolean) => void;
};

export function OrderListTableRow({ view, onOpen, selected, selectBlocker, onToggleSelect }: { view: OrderListRowView } & RowHandlers) {
  const { record, step } = view;
  return (
    <TableRow
      className={cn("relative cursor-pointer hover:bg-muted/10", view.mine && "bg-primary/[0.04]")}
      onClick={() => onOpen(record)}
    >
      <TableCell className="relative pl-6" onClick={(event) => event.stopPropagation()}>
        {view.mine ? <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-r bg-primary" aria-hidden /> : null}
        <Checkbox
          checked={selected}
          disabled={Boolean(selectBlocker)}
          aria-label={`Додати ${record.quoteNumber} до групової СП`}
          title={selectBlocker ?? undefined}
          onCheckedChange={(checked) => onToggleSelect(record, Boolean(checked))}
        />
      </TableCell>
      <TableCell>
        <HoverCopyText
          value={record.quoteNumber}
          textClassName="font-mono text-sm font-semibold text-foreground"
          successMessage="Номер замовлення скопійовано"
          copyLabel="Скопіювати номер замовлення"
        >
          {record.quoteNumber}
        </HoverCopyText>
      </TableCell>
      <TableCell>
        <CustomerWithItems record={record} />
      </TableCell>
      <TableCell className="figure text-right font-semibold text-foreground">
        {formatOrderMoney(record.total, record.currency)}
      </TableCell>
      <TableCell>
        <PaidMiniBar paid={view.paid} />
      </TableCell>
      <TableCell>
        <DocMarks docs={view.docs} />
      </TableCell>
      <TableCell>
        <div className="flex min-w-0 items-center justify-between gap-2">
          <NextStep view={view} />
          {view.mine && step.actionLabel ? (
            <Button
              size="xs"
              className="shrink-0"
              onClick={(event) => {
                event.stopPropagation();
                onOpen(record);
              }}
            >
              {step.actionLabel}
            </Button>
          ) : null}
        </div>
      </TableCell>
      <TableCell className="pr-6">
        <ManagerAvatar record={record} size={22} />
      </TableCell>
    </TableRow>
  );
}

export function OrderListMobileCard({ view, onOpen }: { view: OrderListRowView; onOpen: (record: DerivedOrderRecord) => void }) {
  const { record } = view;
  const items = summarizeOrderItems(record);
  return (
    <button
      type="button"
      onClick={() => onOpen(record)}
      className={cn(
        "relative flex w-full flex-col gap-2 overflow-hidden rounded-xl border border-border/60 bg-card p-3 text-left",
        view.mine && "border-primary/40"
      )}
    >
      {view.mine ? <span className="absolute inset-y-2 left-0 w-[3px] rounded-r bg-primary" aria-hidden /> : null}
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <EntityAvatar
            src={record.customerLogoUrl}
            name={record.customerName}
            fallback={initials(record.customerName)}
            size={28}
          />
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-foreground">{record.customerName}</div>
            <div className="font-mono text-2xs text-muted-foreground">{record.quoteNumber}</div>
          </div>
        </div>
        <div className="figure shrink-0 text-sm font-semibold text-foreground">
          {formatOrderMoney(record.total, record.currency)}
        </div>
      </div>
      <div className="truncate text-xs text-muted-foreground">
        {items.name}
        {items.qty ? ` · ${items.qty}` : ""}
      </div>
      <div className="flex items-center justify-between gap-3">
        <PaidMiniBar paid={view.paid} />
        <DocMarks docs={view.docs} />
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-border/40 pt-2">
        <NextStep view={view} />
        <ManagerAvatar record={record} size={20} />
      </div>
    </button>
  );
}
