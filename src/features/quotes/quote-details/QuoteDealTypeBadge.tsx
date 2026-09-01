import { Check, ChevronDown } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  DEAL_TYPE_ORDER,
  defaultMarkupRateFor,
  formatRatePercent,
  QUOTE_DEAL_TYPES,
  type QuoteDealType,
} from "@/lib/quoteDealType";
import { cn } from "@/lib/utils";

/**
 * Тип угоди в шапці картки — поруч із типом товару (REQ-182).
 *
 * ЧОМУ САМЕ ТУТ. Це два типи однієї картки: що виробляємо і яка це угода. Око
 * зв'язує їх, коли вони стоять поруч, і не зв'язує, коли один у шапці, а
 * другий у вікні редагування.
 *
 * ЧОМУ КЛІКАБЕЛЬНИЙ. Тип угоди з'ясовується не при створенні, а тоді, коли
 * менеджер уже поговорив із клієнтом і зрозумів, що це тендер. Змушувати його
 * заради одного слова відкривати «Редагувати» й гортати всю форму означає, що
 * тип лишиться тим, який поставили наосліп.
 *
 * ЧОГО ТУТ НЕМАЄ. Показу на мерчі: там шкала не діє, і бейдж лише додавав би
 * питання «а що це». Вирішує викликач — компонент малюється лише коли тип є.
 */
export function QuoteDealTypeBadge({
  value,
  onChange,
  disabled,
}: {
  value: QuoteDealType;
  onChange?: (next: QuoteDealType) => void;
  /** Немає права правити — бейдж лишається, але вже просто підписом. */
  disabled?: boolean;
}) {
  const rule = QUOTE_DEAL_TYPES[value];
  const label = (
    <>
      <span className="truncate">{rule.label}</span>
      <span className="shrink-0 tabular-nums opacity-60">
        {formatRatePercent(defaultMarkupRateFor(value))} %
      </span>
    </>
  );
  const base =
    "inline-flex h-8 max-w-[280px] shrink-0 items-center gap-1.5 rounded-lg border border-border/60 bg-muted px-2.5 text-2xs font-medium text-foreground";

  if (disabled || !onChange) {
    return <span className={base}>{label}</span>;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            base,
            "transition-colors hover:border-border hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20"
          )}
          title="Тип угоди — від нього дно ціни"
        >
          {label}
          <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[300px]">
        {DEAL_TYPE_ORDER.map((key) => {
          const item = QUOTE_DEAL_TYPES[key];
          const active = key === value;
          return (
            <DropdownMenuItem
              key={key}
              onSelect={() => {
                if (!active) onChange(key);
              }}
              className="flex items-start gap-2"
            >
              <Check className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", active ? "opacity-100" : "opacity-0")} />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-3">
                  <span className="font-medium text-foreground">{item.label}</span>
                  <span className="shrink-0 tabular-nums text-2xs text-muted-foreground">
                    {formatRatePercent(defaultMarkupRateFor(key))} %
                  </span>
                </span>
                <span className="mt-0.5 block text-2xs leading-snug text-muted-foreground">
                  {item.hint}
                </span>
              </span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
