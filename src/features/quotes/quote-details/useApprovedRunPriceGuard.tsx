import * as React from "react";
import { AlertTriangle } from "lucide-react";

import { ConfirmDialog } from "@/components/app/ConfirmDialog";
import type { QuoteRun } from "@/lib/toshoApi";

import {
  findApprovedRunPriceChanges,
  revertApprovedRunPrices,
  type ApprovedRunPriceChange,
} from "./approvedRunPriceGuard";
import { formatCurrency } from "./config";

/**
 * Питання перед тим, як переписати ціну, яку клієнт уже погодив (REQ-178#p10).
 *
 * ЧОМУ ОКРЕМИМ ХУКОМ, а не десятком рядків у картці прорахунку: сторінка
 * стоїть під ратчетом розміру, і кожен такий «десяток» уже раз перетворив її
 * на сім тисяч рядків. Тут вікно, його стан і правило живуть разом, а картка
 * бачить три виклики.
 *
 * ПИТАЄМО РАЗ НА ВІДКРИТТЯ КАРТКИ. Тиражі зберігаються самі, без кнопки, тож
 * без цієї межі вікно спливало б на кожне автозбереження — тобто кілька разів,
 * поки правлять одне число. Людина, яка вже сказала «так», не мусить казати це
 * знову; лічильник скидається на іншому прорахунку.
 *
 * ВІДМОВА ПОВЕРТАЄ ЦІНУ, А НЕ ПРОСТО НЕ ЗБЕРІГАЄ. Мовчазне «не зберіг» лишило б
 * на екрані нову суму, якої немає в базі, — і наступний захід зберіг би її вже
 * без питання, бо порівнюємо з тим, що збережено.
 */
export function useApprovedRunPriceGuard(quoteId: string | null | undefined, currency?: string | null) {
  const askedRef = React.useRef(false);
  const [pending, setPending] = React.useState<{
    changes: ApprovedRunPriceChange[];
    settle: (ok: boolean) => void;
  } | null>(null);

  React.useEffect(() => {
    askedRef.current = false;
  }, [quoteId]);

  /** Чи можна зберігати. `changes` порожній — питання не виникало. */
  const confirm = React.useCallback(
    async (next: QuoteRun[], original: QuoteRun[]) => {
      const changes = findApprovedRunPriceChanges(next, original);
      if (changes.length === 0 || askedRef.current) return { ok: true, changes };
      const ok = await new Promise<boolean>((resolve) => {
        let settled = false;
        setPending({
          changes,
          settle: (value: boolean) => {
            if (settled) return;
            settled = true;
            setPending(null);
            resolve(value);
          },
        });
      });
      if (ok) askedRef.current = true;
      return { ok, changes };
    },
    []
  );

  const revert = React.useCallback(
    (current: QuoteRun[], original: QuoteRun[], changes: ApprovedRunPriceChange[]) =>
      revertApprovedRunPrices(current, original, changes),
    []
  );

  const change = pending?.changes[0] ?? null;
  const dialog = (
    <ConfirmDialog
      open={pending !== null}
      onOpenChange={(open) => {
        if (!open) pending?.settle(false);
      }}
      title="Цю ціну вже погоджено із замовником"
      description={
        change ? (
          <>
            Тираж {change.quantity} шт:{" "}
            <span className="font-semibold text-foreground">{formatCurrency(change.before, currency)}</span> →{" "}
            <span className="font-semibold text-foreground">{formatCurrency(change.after, currency)}</span>.
            {pending && pending.changes.length > 1 ? ` Ще змінених погоджених тиражів: ${pending.changes.length - 1}.` : ""}{" "}
            Замовник бачив попередню суму — точно міняємо?
          </>
        ) : undefined
      }
      icon={<AlertTriangle className="h-5 w-5 tone-text-warning" />}
      confirmLabel="Так, міняємо"
      cancelLabel="Не чіпати"
      onConfirm={() => pending?.settle(true)}
    />
  );

  return { confirm, revert, dialog };
}
