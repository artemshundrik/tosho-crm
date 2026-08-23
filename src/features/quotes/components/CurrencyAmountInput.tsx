import { NumberInput, type NumberInputProps } from "@/components/ui/number-input";
import { cn } from "@/lib/utils";

type CurrencyAmountInputProps = NumberInputProps & {
  /**
   * Код валюти, який стоїть суфіксом усередині поля («UAH», «USD»).
   * Може бути порожнім — у прорахунку валюта не обовʼязкова, і тоді суфікса
   * просто немає, як було й до виносу в компонент.
   */
  currency: string | null | undefined;
};

/**
 * Поле грошової суми: число зліва, код валюти сірим суфіксом справа.
 *
 * НАВІЩО ОКРЕМИЙ КОМПОНЕНТ. У блоці цін тиражу цей шаблон повторювався
 * чотири рази поспіль дослівно: обгортка `relative`, той самий набір класів
 * поля, `pr-14` під суфікс і абсолютно позиційований `span` з валютою.
 *
 * Одна з чотирьох копій відстала: у «Бажаного особистого заробітку» не було ні
 * обгортки, ні `pr-14`, ні суфікса — і число всередині стояло з іншим відступом
 * справа, ніж у сусідніх полях. Помітили це очима, а не кодом (REQ-111).
 *
 * Поки копій чотири, така розбіжність — питання часу. Тепер відступ і суфікс
 * задані в одному місці, і «поїхати» окремо взятому полю нема як.
 */
export function CurrencyAmountInput({ currency, className, ...props }: CurrencyAmountInputProps) {
  return (
    <div className="relative">
      <NumberInput
        {...props}
        className={cn("h-11 rounded-xl bg-background pr-14 font-mono text-lg tabular-nums", className)}
      />
      <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 whitespace-nowrap text-xs font-semibold text-muted-foreground">
        {currency}
      </span>
    </div>
  );
}
