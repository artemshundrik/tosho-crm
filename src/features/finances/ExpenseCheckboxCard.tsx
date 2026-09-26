import type * as React from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

/**
 * Галочка-картка у вікні витрати: рамка на всю ширину, назва й пояснення під
 * нею. Так у формі виглядають перемикачі, що міняють ПОВЕДІНКУ витрати
 * («Сума змінна», «Рахунок приходить наступного місяця»), а не звичайні поля.
 *
 * Окремим файлом, бо `FinanceExpenses.tsx` стоїть під ратчетом розміру.
 */
export function ExpenseCheckboxCard({
  checked,
  onCheckedChange,
  title,
  hint,
  className,
}: {
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  title: React.ReactNode;
  hint: React.ReactNode;
  className?: string;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-2.5 rounded-xl border border-border/60 bg-muted/10 p-3",
        className
      )}
    >
      <Checkbox checked={checked} onCheckedChange={(v) => onCheckedChange(v === true)} className="mt-0.5" />
      <span className="text-sm">
        <span className="font-medium text-foreground">{title}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span>
      </span>
    </label>
  );
}

/**
 * «Рахунок приходить наступного місяця» (REQ-314).
 *
 * Комуналку по офісу виставляють 6–8 числа НАСТУПНОГО місяця, тож нагадування
 * 25-го («до кінця вересня не внесено») і навіть 5-го приходило, коли вносити
 * було ще нічого, — і його читали як докір за минулий місяць. Позначена так
 * витрата свій місяць закриває 10-го числа наступного: тоді ж приходить
 * нагадування і загоряється бейдж «не внесено». Вода, прибирання й решта, що
 * вноситься в межах свого місяця, лишаються на 25-му.
 */
export function BilledNextMonthCard({
  checked,
  onCheckedChange,
}: {
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
}) {
  return (
    <ExpenseCheckboxCard
      className="sm:col-span-2"
      checked={checked}
      onCheckedChange={onCheckedChange}
      title="Рахунок приходить наступного місяця"
      hint="Як у комуналки: рахунок за вересень приходить на початку жовтня. Тоді нагадаємо внести його 10-го числа наступного місяця, а не 25-го, і до 10-го місяць не світитиметься «не внесеним»."
    />
  );
}
