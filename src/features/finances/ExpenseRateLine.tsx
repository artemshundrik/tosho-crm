import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatOrderMoney } from "@/features/orders/orderRecords";
import { fxRateFor, type FxCurrency, type FxRates } from "@/lib/fxRates";
import { parseAmountInput } from "./expenseFormat";

/*
 * Свій курс валютної витрати. Оренду власниця рахує за міжбанком чи обмінником,
 * а не за НБУ, — і гривні в CRM мають збігатись із тим, що вона виставляє.
 * Курс пишеться в той самий expense.fx_rate, що й зафіксований курс разової
 * витрати, тож усі читачі (список, звіти, журнал) підхоплюють його без змін.
 *
 * Порожнє поле = курс НБУ: у регулярної — поточний, у разової — фіксується при збереженні.
 */

/** Свій курс далі ніж на 30% від НБУ не приймаємо. */
const MAX_RATE_DEVIATION = 0.3;

const linkClass =
  "font-medium text-foreground underline decoration-dotted underline-offset-2 hover:decoration-solid";

export function useExpenseFxRate({
  initialRate,
  currency,
  setCurrency,
  rates,
}: {
  initialRate: number | null;
  currency: FxCurrency;
  setCurrency: (next: FxCurrency) => void;
  rates: FxRates;
}) {
  const [rateInput, setRateInput] = React.useState(initialRate ? String(initialRate) : "");
  const nbuRate = fxRateFor(currency, rates);
  const parsed = rateInput.trim() ? parseAmountInput(rateInput) : null;
  const ownRate = parsed !== null && parsed > 0 ? parsed : null;

  return {
    nbuRate,
    ownRate,
    // Курс прив'язаний до валюти: змінили валюту — свій курс більше не має сенсу.
    changeCurrency: (next: FxCurrency) => {
      if (next !== currency) setRateInput("");
      setCurrency(next);
    },
    /** Курс для збереження: свій, інакше НБУ дня для разової і нічого для регулярної. */
    rateToSave: (isRecurring: boolean) => (currency === "UAH" ? null : ownRate ?? (isRecurring ? null : nbuRate)),
    /** false + тост, якщо в полі курсу не число або одрук («41,541,5» читається як 41541,5). */
    ensureValid: () => {
      if (currency === "UAH" || !rateInput.trim()) return true;
      if (ownRate === null) {
        toast.error("Перевірте курс", { description: `«${rateInput.trim()}» — не схоже на курс. Приклад: 41,50` });
        return false;
      }
      // Міжбанк і обмінники від НБУ на десятки відсотків не відходять — це одрук.
      if (nbuRate && Math.abs(ownRate / nbuRate - 1) > MAX_RATE_DEVIATION) {
        toast.error("Перевірте курс", {
          description: `${ownRate.toFixed(2)} надто далеко від курсу НБУ ${nbuRate.toFixed(2)} — схоже на одрук.`,
        });
        return false;
      }
      return true;
    },
    lineProps: { currency, nbuRate, ownRate, rateInput, onRateInputChange: setRateInput },
  };
}

/** Рядок «≈ 44 910 грн за курсом 44.91 НБУ · свій курс» під сумою витрати. */
export function ExpenseRateLine({
  currency,
  ...rest
}: ReturnType<typeof useExpenseFxRate>["lineProps"] & { uahValue: number | null }) {
  return (
    <div className="-mt-2 flex min-h-[16px] flex-wrap items-center gap-x-2 gap-y-1 text-2xs leading-4 text-muted-foreground sm:col-span-2">
      {currency === "UAH" ? null : <RateLineBody key={currency} currency={currency} {...rest} />}
    </div>
  );
}

function RateLineBody({
  currency,
  uahValue,
  nbuRate,
  rateInput,
  ownRate,
  onRateInputChange,
}: {
  currency: FxCurrency;
  uahValue: number | null;
  nbuRate: number | null;
  rateInput: string;
  ownRate: number | null;
  onRateInputChange: (value: string) => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const rate = ownRate ?? nbuRate;

  if (editing) {
    return (
      <>
        <span>Курс: 1 {currency} =</span>
        <Input
          value={rateInput}
          onChange={(e) => onRateInputChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              setEditing(false);
            }
          }}
          inputMode="decimal"
          placeholder={nbuRate ? nbuRate.toFixed(2) : "0.00"}
          autoFocus
          aria-label={`Свій курс ${currency}`}
          controlSize="sm"
          className="w-24 tabular-nums"
        />
        <span>грн</span>
        <Button type="button" size="xs" variant="outline" onClick={() => setEditing(false)}>
          Готово
        </Button>
        <span>Порожнє поле — курс НБУ{nbuRate ? ` (${nbuRate.toFixed(2)})` : ""}.</span>
      </>
    );
  }

  if (!rate) {
    return (
      <>
        <span>Курс ще не завантажився — гривневий еквівалент з'явиться пізніше.</span>
        <button type="button" onClick={() => setEditing(true)} className={linkClass}>
          свій курс
        </button>
      </>
    );
  }

  // Свій курс, що відрізняється від НБУ, — показуємо НБУ поруч, щоб різницю було видно.
  const suffix =
    ownRate === null
      ? " НБУ"
      : nbuRate !== null && Math.abs(ownRate - nbuRate) >= 0.005
        ? ` (НБУ сьогодні ${nbuRate.toFixed(2)})`
        : "";

  return (
    <>
      <span>
        ≈ {formatOrderMoney(uahValue ?? 0, "UAH")} за курсом {rate.toFixed(2)}
        {suffix}
      </span>
      <button type="button" onClick={() => setEditing(true)} className={linkClass}>
        {ownRate === null ? "свій курс" : "змінити курс"}
      </button>
      {ownRate !== null ? (
        <button type="button" onClick={() => onRateInputChange("")} className={linkClass}>
          за НБУ
        </button>
      ) : null}
    </>
  );
}
