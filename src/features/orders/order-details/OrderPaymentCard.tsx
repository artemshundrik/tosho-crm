import { HeroShell, SplitBar } from "@/components/app/bento";
import { ORDER_STATUS_SECTIONS } from "@/features/orders/config";
import {
  balanceDaysShort,
  buildOrderPaymentParts,
  getBalanceDue,
  getClosingDocumentRef,
} from "@/features/orders/orderLaunchPath";
import { formatOrderMoney, type DerivedOrderRecord } from "@/features/orders/orderRecords";
import { formatDayMonth, isCashlessPaymentMethod } from "@/features/orders/paymentRules";
import { toneBadgeClass, type Tone } from "@/lib/statusTones";
import { cn } from "@/lib/utils";

/**
 * Строк доплати після відвантаження (REQ-322#p5): від дати ВН чи акта, яку
 * вносить бухгалтерія. Поки дати немає — лише умова «N днів від ВН».
 */
function BalanceDueLine({ record }: { record: DerivedOrderRecord }) {
  if (record.balanceTiming !== "after_shipment" || record.paymentStatus === "fully_paid") return null;
  const doc = getClosingDocumentRef(record);
  const short = doc.kind === "act" ? "акта" : "ВН";
  const due = getBalanceDue(record);
  if (!due) {
    if (!isCashlessPaymentMethod(record.paymentMethodId, record.paymentRail)) return null;
    return (
      <p className="mt-2 text-xs text-muted-foreground">
        Доплата — {balanceDaysShort(record)} від дати {short}. Строк з'явиться, коли бухгалтерія внесе номер {short} з BAS.
      </p>
    );
  }
  const from = `${balanceDaysShort(record)} від ${short} ${doc.number ? `№ ${doc.number} ` : ""}${formatDayMonth(due.fromDate)}`;
  return (
    <p className={cn("mt-2 text-xs", due.overdue ? "font-medium text-destructive" : "text-muted-foreground")}>
      {due.overdue
        ? `Доплату прострочено: чекали до ${formatDayMonth(due.dueDate)}`
        : due.daysLeft === 0
          ? "Доплата — сьогодні останній день"
          : `Доплата до ${formatDayMonth(due.dueDate)}`}{" "}
      · {from}
    </p>
  );
}

const paymentStatusOption = (id: string) =>
  ORDER_STATUS_SECTIONS.find((section) => section.id === "payment")?.items.find((item) => item.id === id);

/**
 * Оплата в правій колонці: велике число, смуга «наперед / доплата» і статус.
 * Кнопки «Внести оплату» тут свідомо немає: облік оплат живе у Фінансах і
 * менеджерам закритий (REQ-322#p11, рішення в плані).
 */
export function OrderPaymentCard({ record }: { record: DerivedOrderRecord }) {
  const parts = buildOrderPaymentParts(record);
  const status = paymentStatusOption(record.paymentStatus);
  const tone = (status?.tone ?? "neutral") as Tone;
  const isCash = record.paymentMethodId === "cash";

  return (
    <HeroShell
      className="p-4 sm:p-4"
      label={isCash ? "Оплата · готівка" : "Оплата"}
      value={formatOrderMoney(record.total, record.currency)}
      badge={
        <span className={cn("rounded-md border px-2 py-0.5 text-xs font-semibold", toneBadgeClass[tone])}>
          {status?.label ?? record.paymentStatus}
        </span>
      }
    >
      <SplitBar
        className="mt-3"
        parts={parts.map((part, index) => ({
          key: part.key,
          label: part.label,
          weight: part.pct,
          valueText: formatOrderMoney(part.amount, record.currency),
          color: index === 0 ? "bg-chart-1" : "bg-chart-2",
        }))}
      />
      <BalanceDueLine record={record} />
    </HeroShell>
  );
}
