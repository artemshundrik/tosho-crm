import { Check, ChevronDown, Loader2 } from "@/components/icons/appIcons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ORDER_STATUS_SECTIONS } from "@/features/orders/config";
import { toneBadgeClass, toneDotClass, type Tone } from "@/lib/statusTones";
import { cn } from "@/lib/utils";

/**
 * Один статус у шапці замість трьох списків (СЕО, 14.10.2026). Кнопка показує
 * стан замовлення, а в меню три групи: замовлення, оплата, доставка — як у
 * прорахунку, де стан і зміна стану є одним елементом.
 */
export type OrderStatusField = "orderStatus" | "paymentStatus" | "deliveryStatus";

const GROUPS: { field: OrderStatusField; sectionId: string; label: string }[] = [
  { field: "orderStatus", sectionId: "primary", label: "Замовлення" },
  { field: "paymentStatus", sectionId: "payment", label: "Оплата" },
  { field: "deliveryStatus", sectionId: "delivery", label: "Доставка" },
];

const sectionItems = (sectionId: string) =>
  ORDER_STATUS_SECTIONS.find((section) => section.id === sectionId)?.items ?? [];

export function OrderStatusControl({
  values,
  busy,
  readOnly,
  onChange,
}: {
  values: Record<OrderStatusField, string>;
  busy: boolean;
  /** Незбережений запис (затверджений прорахунок без рядка в orders) — статус лише текстом. */
  readOnly: boolean;
  onChange: (field: OrderStatusField, value: string) => void;
}) {
  const current = sectionItems("primary").find((item) => item.id === values.orderStatus);
  const tone = (current?.tone ?? "neutral") as Tone;
  const label = current?.label ?? "Нове";
  const chipClass = cn(
    "inline-flex h-8 min-w-0 max-w-[10rem] items-center gap-1.5 rounded-lg border px-2.5 text-sm font-semibold sm:max-w-none",
    toneBadgeClass[tone]
  );

  if (readOnly) return <span className={chipClass}>{label}</span>;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            chipClass,
            "transition-[filter] hover:brightness-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20"
          )}
          aria-label={`Статус: ${label}. Змінити`}
        >
          <span className="truncate">{label}</span>
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <ChevronDown className="h-3 w-3 opacity-70" />}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-[70vh] w-[268px] overflow-y-auto">
        {GROUPS.map((group, index) => (
          <div key={group.field}>
            {index > 0 ? <DropdownMenuSeparator /> : null}
            <DropdownMenuLabel className="text-3xs uppercase tracking-caps text-muted-foreground">
              {group.label}
            </DropdownMenuLabel>
            {sectionItems(group.sectionId).map((item) => {
              const isCurrent = values[group.field] === item.id;
              return (
                <DropdownMenuItem
                  key={`${group.field}:${item.id}`}
                  disabled={busy || isCurrent}
                  onSelect={() => onChange(group.field, item.id)}
                >
                  <span className={cn("mr-2 h-2 w-2 shrink-0 rounded-full", toneDotClass[(item.tone ?? "neutral") as Tone])} />
                  <span className="truncate">{item.label}</span>
                  {isCurrent ? <Check className="ml-auto h-3.5 w-3.5 text-muted-foreground" /> : null}
                </DropdownMenuItem>
              );
            })}
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
