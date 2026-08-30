import { NumberInput, type NumberInputProps } from "@/components/ui/number-input";
import { cn } from "@/lib/utils";

/**
 * Поле відсотка: число зліва, знак «%» сірим суфіксом справа.
 *
 * Близнюк CurrencyAmountInput і навмисно копіює його розміри до пікселя:
 * накрутка стоїть у тому самому ряду, що три грошові поля тиражу, і поле іншої
 * висоти чи з іншим внутрішнім відступом читалось би як поле іншого роду.
 * Різниця рівно одна — суфікс, і саме він каже, що тут відсотки, а не гривні.
 */
export function PercentAmountInput({ className, ...props }: NumberInputProps) {
  return (
    <div className="relative">
      <NumberInput
        {...props}
        className={cn("h-11 rounded-xl bg-background pr-14 font-mono text-lg tabular-nums", className)}
      />
      <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 whitespace-nowrap text-xs font-semibold text-muted-foreground">
        %
      </span>
    </div>
  );
}
