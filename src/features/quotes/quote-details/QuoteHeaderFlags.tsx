import { AlertTriangle, Lock } from "lucide-react";

import { HoverTip } from "@/components/ui/hover-tip";
import { cn } from "@/lib/utils";
import { formatRatePercent, minMarkupRateFor, type QuoteDealType } from "@/lib/quoteDealType";

/**
 * Прапорці біля статусу прорахунку — те, що тримає двері назовні зачиненими.
 *
 * ЧОМУ ТУТ, А НЕ СМУГОЮ НАД СТОРІНКОЮ (REQ-175#p56). Обидва були жовтими
 * банерами на всю ширину: майже метр кольору заради одного речення, яке до того
 * ж нічого не блокує в самій роботі — рахувати, редагувати й зберігати можна
 * далі. Тепер вони стоять поруч зі статусом, тобто рівно там, де людина
 * натисне й упреться, а пояснення приходить по наведенню.
 *
 * ЧОМУ ПОІМЕННО (REQ-175#p61, p64). Лічильник без імені змушує переглядати всі
 * тиражі всіх товарів руками: у звичайному прорахунку їх шість, і «1 нижче
 * дна» не каже, у котрому. Кожен прапорець називає винуватця.
 */

export type QuoteMarkupGateRun = {
  id: string;
  /** «Куртка софтшел чоловіча · 50 шт.» — щоб не шукати очима по всій сторінці. */
  label: string;
  /** «15,65 %» — уже відформатований відсоток. */
  rateLabel: string;
};

const CHIP_CLASS =
  "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-border/60 bg-muted px-2.5 text-2xs font-medium text-foreground transition-colors hover:border-border hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20";

const LIST_CLASS = "mt-2 flex flex-col gap-1 border-t border-border/40 pt-2";

/** Тиражі нижче дна без чинного погодження: КП клієнту й «Затверджено» замкнені. */
export function QuoteMarkupGateChip({
  blocking,
  dealType,
  onFocus,
}: {
  blocking: QuoteMarkupGateRun[];
  /** Дно називаємо числом цього прорахунку, а не спільним для всіх (REQ-182). */
  dealType: QuoteDealType | null | undefined;
  /** Довезти до першого винуватця: сам лічильник не каже, де він на сторінці. */
  onFocus?: (runId: string) => void;
}) {
  if (blocking.length === 0) return null;
  return (
    <HoverTip
      side="bottom"
      contentClassName="max-w-[340px] px-3 py-2 text-2xs leading-relaxed"
      label={
        <span>
          <span className="font-semibold text-foreground">
            КП клієнту й перехід у «Затверджено» замкнені.
          </span>{" "}
          {blocking.length === 1
            ? "Один тираж стоїть нижче дна "
            : `${blocking.length} тиражі стоять нижче дна `}
          {formatRatePercent(minMarkupRateFor(dealType))} % — потрібне підтвердження СЕО або
          головного бухгалтера. Рахувати,
          редагувати й зберігати прорахунок це не заважає.
          <span className={LIST_CLASS}>
            {blocking.map((run) => (
              <span key={run.id} className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate">{run.label}</span>
                <span className="shrink-0 font-semibold tabular-nums text-foreground">
                  {run.rateLabel}
                </span>
              </span>
            ))}
          </span>
        </span>
      }
    >
      <button type="button" className={CHIP_CLASS} onClick={() => onFocus?.(blocking[0].id)}>
        <Lock className="h-3.5 w-3.5 shrink-0 text-warning-solid" />
        <span className="tabular-nums">{blocking.length}</span> нижче дна
      </button>
    </HoverTip>
  );
}

/**
 * Товари, де тиражів кілька й жоден не позначений як погоджений клієнтом.
 *
 * Це ТЕЖ двері (REQ-175#p64): поки вибору немає, замовлення з прорахунку не
 * зробити — з чого брати кількість і ціну, невідомо. Досі про це знав лише той,
 * хто дивився на конкретну картку товару; у шапці не було нічого, і причину
 * заблокованого замовлення доводилось шукати.
 */
export function QuoteRunChoiceChip({
  items,
  onFocus,
}: {
  items: Array<{ id: string; title: string }>;
  onFocus?: (itemId: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <HoverTip
      side="bottom"
      contentClassName="max-w-[340px] px-3 py-2 text-2xs leading-relaxed"
      label={
        <span>
          <span className="font-semibold text-foreground">Тираж не позначено.</span>{" "}
          {items.length === 1
            ? "В одному товарі тиражів кілька, і жоден не позначений як погоджений клієнтом."
            : `У ${items.length} товарах тиражів кілька, і жоден не позначений як погоджений клієнтом.`}{" "}
          Поки вибору немає, замовлення з прорахунку не зробити: з чого брати кількість і ціну —
          невідомо.
          <span className={LIST_CLASS}>
            {items.map((item) => (
              <span key={item.id} className="block min-w-0 truncate">
                {item.title}
              </span>
            ))}
          </span>
        </span>
      }
    >
      <button type="button" className={CHIP_CLASS} onClick={() => onFocus?.(items[0].id)}>
        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-warning-solid" />
        <span className="tabular-nums">{items.length}</span> без вибору
      </button>
    </HoverTip>
  );
}

/**
 * Тиражі, чиї числа ще не в базі: гейт ПДВ тримає їх у браузері.
 *
 * ТРЕТІ ДВЕРІ, і найпідступніші (REQ-242, REQ-243). Ті двоє хоч видно на місці
 * — тут же людина бачить своє число в полі й у переліку, тож має всі підстави
 * вважати, що зберегла. Тому прапорець стоїть поруч зі статусом, куди вона й
 * піде натискати «Прораховано», і по кліку везе просто до незбереженого поля.
 */
export function QuoteUnsavedRunChip({
  runs,
  onFocus,
}: {
  runs: QuoteMarkupGateRun[];
  onFocus?: (runId: string) => void;
}) {
  if (runs.length === 0) return null;
  return (
    <HoverTip
      side="bottom"
      contentClassName="max-w-[340px] px-3 py-2 text-2xs leading-relaxed"
      label={
        <span>
          <span className="font-semibold text-foreground">
            {runs.length === 1 ? "Тираж не збережено." : `${runs.length} тиражі не збережено.`}
          </span>{" "}
          Вартість товару введена, але не сказано, з ПДВ вона чи без, — і поки цього немає, сума
          лишається в браузері й не їде в базу. Прорахунок не перевести в «Прораховано». Натисніть,
          щоб перейти до тиражу.
          <span className={LIST_CLASS}>
            {runs.map((run) => (
              <span key={run.id} className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate">{run.label}</span>
                <span className="shrink-0 font-semibold tabular-nums text-foreground">
                  {run.rateLabel}
                </span>
              </span>
            ))}
          </span>
        </span>
      }
    >
      <button
        type="button"
        // cn, а не шаблонний рядок: без tailwind-merge переможця між
        // text-foreground і text-destructive вирішував би порядок у зібраному
        // CSS, тобто лотерея.
        className={cn(
          CHIP_CLASS,
          "border-destructive/40 bg-danger-soft/40 text-destructive hover:border-destructive/60 hover:bg-danger-soft/60"
        )}
        onClick={() => onFocus?.(runs[0].id)}
      >
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
        <span className="tabular-nums">{runs.length}</span> не збережено
      </button>
    </HoverTip>
  );
}
