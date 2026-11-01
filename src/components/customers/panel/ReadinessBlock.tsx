import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { CheckCircle2 } from "@/components/icons/appIcons";
import { toneDotClass, toneSubtleClass, toneTextClass } from "@/lib/statusTones";
import { cn } from "@/lib/utils";
import type { PartyReadiness, PartyReadinessKey } from "../partyReadiness";

/**
 * «Готово 5 з 7» і що саме бракує — перший блок панелі замовника й ліда.
 *
 * ВИГЛЯД. Бракуюче — нейтральна картка з маленькою крапкою `warning`, а не
 * жовта плашка: на тінті кнопка «Додати» й сірий текст читаються як бруд
 * (памʼять «Приглушений текст»). Суцільний зелений — лише рядок «Можна
 * виставляти рахунок», де весь текст того ж відтінку.
 *
 * `children` — картки під пунктами: бухгалтер, підказки з контексту.
 */

const DISPLAY_LABEL: Partial<Record<PartyReadinessKey, string>> = { documentEmail: "Пошта для документів" };
const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

export function ReadinessBlock(props: {
  readiness: PartyReadiness;
  cash: boolean;
  /** Форма оплати не вказана — «можна виставляти рахунок» казати рано. */
  paymentUnknown?: boolean;
  onJump: (key: PartyReadinessKey) => void;
  children?: ReactNode;
}) {
  const { readiness, cash, paymentUnknown = false, onJump, children } = props;
  const pending = readiness.items.filter((item) => !item.done);
  const done = readiness.items.filter((item) => item.done);

  return (
    <section data-testid="readiness-block" className="space-y-2.5 border-b border-border px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="flex-1 text-xs font-medium text-muted-foreground">
          {cash ? "До продажу за готівку" : "До рахунку й договору"}
        </span>
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          Готово {readiness.done} з {readiness.total}
        </span>
      </div>
      <div aria-hidden className="flex h-1.5 gap-0.5">
        {readiness.items.map((item) => (
          <span
            key={item.key}
            className={cn("flex-1 rounded-full", item.done ? toneDotClass.success : "bg-border")}
          />
        ))}
      </div>

      {pending.length > 0 ? (
        <ul className="divide-y divide-border rounded-lg border border-border bg-card">
          {pending.map((item) => (
            <li key={item.key} className="flex min-h-9 items-center gap-2 px-3 py-1.5 text-sm">
              <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", toneDotClass.warning)} />
              <span className="flex-1 font-medium">{DISPLAY_LABEL[item.key] ?? capitalize(item.label)}</span>
              <Button type="button" variant="outline" size="xs" onClick={() => onJump(item.key)}>
                Додати
              </Button>
            </li>
          ))}
        </ul>
      ) : paymentUnknown ? (
        <p className="text-sm text-muted-foreground">Для рахунку все є — лишилось вибрати форму оплати.</p>
      ) : (
        <div className={cn("flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium", toneSubtleClass.success, toneTextClass.success)}>
          <CheckCircle2 className="size-4" />
          {cash ? "Готівка: реквізити не потрібні" : "Можна виставляти рахунок"}
        </div>
      )}

      {done.length > 0 && pending.length > 0 ? (
        <p className="text-xs text-muted-foreground">Є: {done.map((item) => item.label).join(", ")}.</p>
      ) : null}

      {children}
    </section>
  );
}
