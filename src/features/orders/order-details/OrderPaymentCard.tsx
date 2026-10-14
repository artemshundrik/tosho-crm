import { HeroShell, SplitBar } from "@/components/app/bento";
import { ORDER_STATUS_SECTIONS } from "@/features/orders/config";
import { buildOrderPaymentParts } from "@/features/orders/orderLaunchPath";
import { formatOrderMoney, type DerivedOrderRecord } from "@/features/orders/orderRecords";
import { toneBadgeClass, type Tone } from "@/lib/statusTones";
import { cn } from "@/lib/utils";

/**
 * Оплата в правій колонці: велике число, смуга «наперед / доплата» і статус.
 * Кнопки «Внести оплату» тут свідомо немає: облік оплат живе у Фінансах і
 * менеджерам закритий (REQ-322#p11, рішення в плані).
 */
const paymentStatusOption = (id: string) =>
  ORDER_STATUS_SECTIONS.find((section) => section.id === "payment")?.items.find((item) => item.id === id);

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
    </HeroShell>
  );
}
