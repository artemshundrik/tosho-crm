import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatOrderMoney } from "@/features/orders/orderRecords";
import { cn } from "@/lib/utils";
import type { MonthCost } from "./expenseMonth";
import { parseAmountInput } from "./expenseFormat";
import { canOverrideMonth, expenseMonthOverride, type FinanceExpense } from "./types";

/*
 * Сума сталої витрати за вибраний місяць — з поправкою саме на цей місяць.
 *
 * Оренду ($1 000) власниця щомісяця перераховує у гривні за своїм курсом
 * (міжбанк/обмінник), і рахунок розходиться з «сума × НБУ». Курс у неї щомісяця
 * інший, тож поправляємо не курс, а суму конкретного місяця: вписали 41 500 за
 * жовтень — жовтень у підсумках, звітах і календарі рахується як 41 500, а решта
 * місяців лишається розрахунковою.
 */
export function ExpenseMonthAmount({
  expense,
  cost,
  monthKey,
  monthText,
  onSave,
}: {
  expense: FinanceExpense;
  cost: MonthCost;
  monthKey: string;
  /** «жовтень 2026» — для заголовка. */
  monthText: string;
  /** null = прибрати поправку. Кидає помилку, якщо не збереглось. */
  onSave: (uah: number | null) => Promise<void>;
}) {
  const monthly = cost.uah;
  const override = expenseMonthOverride(expense, monthKey);
  // Розрахункова сума: без поправки це те саме, що показано; з поправкою — estimateUah.
  const calculated = override === null ? monthly : cost.estimateUah;
  const editable = canOverrideMonth(expense);

  const [open, setOpen] = React.useState(false);
  const [value, setValue] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const amountBlock = (
    <div className="text-right">
      <div className="text-sm font-semibold tabular-nums text-foreground">
        {monthly === null ? "—" : formatOrderMoney(monthly, "UAH")}
      </div>
      <div className="text-3xs text-muted-foreground">
        {monthly === null ? "курс невідомий" : override !== null ? "за рахунком" : "на місяць"}
      </div>
    </div>
  );

  if (!editable) return amountBlock;

  const save = async (uah: number | null) => {
    setSaving(true);
    try {
      await onSave(uah);
      setOpen(false);
    } catch (error) {
      toast.error("Не вдалося зберегти суму", {
        description: error instanceof Error ? error.message : "Спробуйте ще раз.",
      });
    } finally {
      setSaving(false);
    }
  };

  const submit = () => {
    const parsed = value.trim() ? parseAmountInput(value) : null;
    if (parsed === null || parsed <= 0) {
      toast.error("Перевірте суму", { description: `«${value.trim()}» — не схоже на суму. Приклад: 41 500` });
      return;
    }
    void save(Math.round(parsed * 100) / 100);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) setValue(monthly === null ? "" : String(Math.round(monthly * 100) / 100).replace(".", ","));
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          title={`Виправити суму за ${monthText}`}
          className={cn(
            "rounded-lg px-2 py-1 hover:bg-muted/50",
            override !== null && "bg-info-soft/40"
          )}
        >
          {amountBlock}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[300px] space-y-3 p-3">
        <div>
          <div className="text-sm font-semibold text-foreground">Сума за {monthText}</div>
          <p className="mt-1 text-xs text-muted-foreground">
            Якщо рахунок за цей місяць інший — наприклад, власниця рахує за своїм курсом, — впиши суму з
            рахунку. Інші місяці не зміняться.
          </p>
        </div>
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            inputMode="decimal"
            autoFocus
            aria-label={`Сума за ${monthText}, грн`}
            className="tabular-nums"
          />
          <span className="text-xs text-muted-foreground">грн</span>
          <Button type="submit" disabled={saving}>
            Зберегти
          </Button>
        </form>
        {calculated !== null ? (
          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>
              {expense.currency === "UAH" ? "Звичайна сума" : "За курсом НБУ"}: {formatOrderMoney(calculated, "UAH")}
            </span>
            {override !== null ? (
              <Button type="button" size="xs" variant="ghost" disabled={saving} onClick={() => void save(null)}>
                Повернути розрахункову
              </Button>
            ) : null}
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
