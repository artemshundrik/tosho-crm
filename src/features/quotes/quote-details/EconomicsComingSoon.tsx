import { Banknote, Check, Clock } from "lucide-react";

/**
 * Вкладка «Економіка» — заглушка, а не порожній екран.
 *
 * Розкладка ціни вже працює в «Активному підсумку» справа, тож тут чесно
 * сказано, що саме додасться і чому воно ще не додане. Формулу ціни ця вкладка
 * не чіпає: доки відкриті питання не закриті, все рахується так, як рахувалось.
 */
export function EconomicsComingSoon() {
  return (
    <div className="mx-auto flex max-w-[560px] flex-col items-center gap-4 py-10 text-center">
      <div
        className="grid h-12 w-12 place-items-center rounded-2xl border border-border/60 bg-muted text-muted-foreground"
        aria-hidden
      >
        <Banknote className="h-5 w-5" />
      </div>
      <div className="space-y-1.5">
        <h2 className="text-lg font-semibold tracking-tight">Економіка — скоро</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Тут буде розкладка ціни, фактичні витрати замовлення й порівняння тиражів. Вкладку ще
          узгоджують — доки рішення не ухвалені, прорахунок рахує ціну так само, як рахував.
        </p>
      </div>
      <div className="grid w-full gap-2 text-left">
        <div className="flex items-start gap-2.5 rounded-xl border border-border/50 bg-card px-3.5 py-2.5">
          <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success-foreground" aria-hidden />
          <p className="text-xs leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground">Розкладка ціни вже працює.</span> Собівартість,
            потрібний ВП, сталі витрати й податки видно в «Активному підсумку» праворуч.
          </p>
        </div>
        <div className="flex items-start gap-2.5 rounded-xl border border-border/50 bg-card px-3.5 py-2.5">
          <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <p className="text-xs leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground">Є відкриті питання.</span> Кілька рішень щодо
            вкладки ще не ухвалені, тому тут заглушка, а не вигаданий екран.
          </p>
        </div>
      </div>
    </div>
  );
}
