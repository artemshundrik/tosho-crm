import type { ReactNode } from "react";

import { toneDotClass, toneTextClass } from "@/lib/statusTones";
import { cn } from "@/lib/utils";
import { PartySection } from "../card/CardParts";
import type { PartyReadiness, PartyReadinessKey } from "../partyReadiness";

/**
 * «Для рахунку 5 з 7» — смуга з сегментів і пігулки того, чого бракує.
 * Пігулка веде до поля, де це вписується (`onJump`): на сторінці — фокус у
 * поле реквізитів, у панелі — поле прямо під блоком.
 *
 * ВИГЛЯД. Бракуюче — пігулки тону `warning`, суцільний зелений — лише рядок
 * «Усе є», де весь текст того ж відтінку (памʼять «Приглушений текст»).
 *
 * `children` — що стоїть під пунктами: поля, яких бракує (у панелі),
 * бухгалтер, підказки з контексту.
 */

const DISPLAY_LABEL: Partial<Record<PartyReadinessKey, string>> = { documentEmail: "email для документів" };

export function ReadinessBlock(props: {
  readiness: PartyReadiness;
  cash: boolean;
  /** Форма оплати не вказана — «можна виставляти рахунок» казати рано. */
  paymentUnknown?: boolean;
  onJump?: (key: PartyReadinessKey) => void;
  children?: ReactNode;
}) {
  const { readiness, cash, paymentUnknown = false, onJump, children } = props;
  const pending = readiness.items.filter((item) => !item.done);

  return (
    <PartySection
      data-testid="readiness-block"
      title={cash ? "Для готівки" : "Для рахунку"}
      aside={
        <span className="flex items-baseline gap-1 text-sm">
          <span className="font-semibold tabular-nums">{readiness.done}</span>
          <span className="text-muted-foreground">з {readiness.total}</span>
        </span>
      }
    >
      <div aria-hidden className="flex h-1.5 gap-0.5">
        {readiness.items.map((item) => (
          <span key={item.key} className={cn("flex-1 rounded-full", item.done ? toneDotClass.success : "bg-border")} />
        ))}
      </div>

      {pending.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          <span className="w-full text-sm text-muted-foreground">{onJump ? "Бракує — клік веде до поля:" : "Бракує:"}</span>
          {pending.map((item) =>
            onJump ? (
              <button
                key={item.key}
                type="button"
                onClick={() => onJump(item.key)}
                className="rounded-full bg-warning-soft px-2 py-0.5 text-xs text-warning-foreground hover:bg-warning-soft/70"
              >
                {DISPLAY_LABEL[item.key] ?? item.label}
              </button>
            ) : (
              <span key={item.key} className="rounded-full bg-warning-soft px-2 py-0.5 text-xs text-warning-foreground">
                {DISPLAY_LABEL[item.key] ?? item.label}
              </span>
            ),
          )}
        </div>
      ) : paymentUnknown ? (
        <p className="text-sm text-muted-foreground">Для рахунку все є — лишилось вибрати форму оплати.</p>
      ) : (
        <p className={cn("text-sm", toneTextClass.success)}>
          {cash ? "Готівка: реквізити не потрібні." : "Усе є — можна виставляти рахунок."}
        </p>
      )}

      {children}
    </PartySection>
  );
}
