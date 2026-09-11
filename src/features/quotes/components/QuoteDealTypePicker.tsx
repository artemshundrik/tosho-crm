import { Check, ChevronDown, Handshake } from "lucide-react";

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
 * Вибір типу угоди — чотири рівні шкали Олени (REQ-182).
 *
 * ЧОМУ ПОЛЕ З МЕНЮ, А НЕ РЯД ПІГУЛОК (Артем, 11.09.2026). Спершу це були чотири
 * кнопки в один ряд, і в лівій панелі вікна створення — 240 px — вони поламались:
 * «Стандартний виробничий» переносився у два рядки, відсоток відривався від
 * назви й ставав під нею окремо, а блок виріс на чотири поверхи. Тепер це ОДИН
 * контрол: піктограма, назва обраного, відсоток, шеврон — а варіанти в меню.
 *
 * ЧОМУ НЕ `Chip`. Перша спроба взяла його — і він загортає ВСІХ дітей в один
 * `<span class="font-medium">` без `display:flex`, тож шеврон перенісся під
 * текст, а підпис відірвався від лівого краю. Плюс сам чип круглий, а решта
 * контролів на h-9 у цій базі має `rounded-lg`. Тому тут звичайна кнопка в тій
 * самій мові, що поля вводу поруч.
 *
 * ЧОМУ ВІДСОТОК ВИДНО НА САМОМУ ЧИПІ. Без числа вибір читається як довідкове
 * поле «для звітності», яке ні на що не впливає, — і тоді всі лишають перше
 * значення. Насправді від нього залежать ДВА числа: що підставиться в новий
 * тираж і де стоїть дно, нижче якого ціну погоджує СЕО або головний бухгалтер.
 *
 * ЧОМУ ОКРЕМИЙ ФАЙЛ, А НЕ РОЗМІТКА У ВІКНІ. Тип угоди правлять у двох місцях —
 * при створенні прорахунку й при його редагуванні. Дві копії однакових кнопок
 * розійшлися б на першій же зміні шкали, і одна показувала б старі відсотки.
 */
export function QuoteDealTypePicker({
  value,
  onChange,
  disabled,
}: {
  /** `null` — ще не обрано: у вікні створення це відрізняється від «стандартного». */
  value: QuoteDealType | null;
  onChange: (next: QuoteDealType) => void;
  disabled?: boolean;
}) {
  const rule = value ? QUOTE_DEAL_TYPES[value] : null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            "inline-flex h-9 w-full items-center gap-2 rounded-lg border px-3 text-sm font-medium",
            "transition-colors duration-base ease-out motion-reduce:transition-none",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:ring-offset-1",
            "disabled:cursor-not-allowed disabled:opacity-60",
            rule
              ? "border-foreground/30 bg-muted text-foreground hover:bg-muted/80"
              : "border-border/50 bg-background/55 text-muted-foreground hover:border-border hover:bg-background/70"
          )}
        >
          <Handshake className="h-4 w-4 shrink-0 opacity-70" />
          <span className="min-w-0 flex-1 truncate text-left">{rule?.label ?? "Оберіть тип угоди"}</span>
          {rule ? (
            <span className="shrink-0 tabular-nums text-2xs opacity-60">
              {formatRatePercent(defaultMarkupRateFor(rule.key))} %
            </span>
          ) : null}
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
        </button>
      </DropdownMenuTrigger>

      {/* Меню ширше за сам чип: підказка «коли обирати саме цей тип» — це те,
          заради чого людина його й відкриває, і в 240 px вона б не вмістилась. */}
      <DropdownMenuContent align="start" className="w-[320px]">
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
                <span className="mt-0.5 block text-2xs leading-snug text-muted-foreground">{item.hint}</span>
              </span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
