import { AlertTriangle, Lock } from "lucide-react";

import { HoverTip } from "@/components/ui/hover-tip";
import { MIN_MARKUP_RATE } from "@/lib/quoteRuns";

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
  "inline-flex h-8 shrink-0 cursor-default items-center gap-1.5 rounded-lg border border-border/60 bg-muted px-2.5 text-2xs font-medium text-foreground";

const LIST_CLASS = "mt-2 flex flex-col gap-1 border-t border-border/40 pt-2";

/** Тиражі нижче дна без чинного погодження: КП клієнту й «Затверджено» замкнені. */
export function QuoteMarkupGateChip({ blocking }: { blocking: QuoteMarkupGateRun[] }) {
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
          {MIN_MARKUP_RATE} % — потрібне підтвердження СЕО або головного бухгалтера. Рахувати,
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
      <span className={CHIP_CLASS}>
        <Lock className="h-3.5 w-3.5 shrink-0 text-warning-solid" />
        <span className="tabular-nums">{blocking.length}</span> нижче дна
      </span>
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
export function QuoteRunChoiceChip({ items }: { items: Array<{ id: string; title: string }> }) {
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
      <span className={CHIP_CLASS}>
        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-warning-solid" />
        <span className="tabular-nums">{items.length}</span> без вибору
      </span>
    </HoverTip>
  );
}
