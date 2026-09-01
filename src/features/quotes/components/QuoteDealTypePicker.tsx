import {
  DEAL_TYPE_ORDER,
  defaultMarkupRateFor,
  formatRatePercent,
  QUOTE_DEAL_TYPES,
  type QuoteDealType,
} from "@/lib/quoteDealType";
import { cn } from "@/lib/utils";

/**
 * Вибір типу угоди — чотири рівні шкали Олени (REQ-182).
 *
 * ЧОМУ ВІДСОТОК СТОЇТЬ ПРЯМО НА КНОПЦІ. Без числа вибір читається як довідкове
 * поле «для звітності», яке ні на що не впливає, — і тоді всі лишають перше
 * значення. Насправді від нього залежать ДВА числа: що підставиться в новий
 * тираж і де стоїть дно, нижче якого ціну погоджує СЕО або головний бухгалтер.
 *
 * ЧОМУ ОКРЕМИЙ ФАЙЛ, А НЕ РОЗМІТКА У ВІКНІ СТВОРЕННЯ. Це не смак і не ратчет
 * розміру: тип угоди правлять у двох місцях — при створенні прорахунку й при
 * його редагуванні з картки. Дві копії однакових кнопок розійшлися б на першій
 * же зміні шкали, і одна з них показувала б старі відсотки.
 */
export function QuoteDealTypePicker({
  value,
  onChange,
  disabled,
}: {
  value: QuoteDealType;
  onChange: (next: QuoteDealType) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {DEAL_TYPE_ORDER.map((key) => {
        const rule = QUOTE_DEAL_TYPES[key];
        const active = value === key;
        return (
          <button
            key={key}
            type="button"
            disabled={disabled}
            onClick={() => onChange(key)}
            title={rule.hint}
            aria-pressed={active}
            className={cn(
              "inline-flex h-9 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-all",
              "disabled:cursor-not-allowed disabled:opacity-60",
              active
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border/50 text-muted-foreground hover:bg-background/70 hover:text-foreground"
            )}
          >
            <span>{rule.label}</span>
            <span className="tabular-nums text-2xs opacity-70">
              {formatRatePercent(defaultMarkupRateFor(key))} %
            </span>
          </button>
        );
      })}
    </div>
  );
}
