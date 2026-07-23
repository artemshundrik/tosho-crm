import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

// Липкий компактний бар розділу Фінансів: тримається верху скрол-панелі канвасу,
// щоб контекст (місяць/фільтр) і головна дія лишались на екрані під час скролу.
// Негативні відступи компенсують падінги контент-панелі (px-4 pt-4 / lg:p-6);
// негативний top на lg — бо Chrome липить top-0 ПІД паддінгом скрол-контейнера,
// лишаючи зверху смужку, крізь яку просвічує контент.
export function FinanceStickyBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="sticky top-0 z-20 -mx-4 -mt-4 flex items-center gap-1.5 border-b border-border/50 bg-background/95 px-4 py-2 backdrop-blur-md lg:-top-6 lg:-mx-6 lg:-mt-6 lg:px-6">
      {children}
    </div>
  );
}

// Бар зі степером місяця: ‹ Місяць Рік › [Поточний] … [дії розділу праворуч].
// Один компонент на всі місячні розділи (Витрати, Виплати команді, …), щоб
// вигляд і поведінка не розповзались.
export function FinanceMonthBar({
  label,
  onPrev,
  onNext,
  onReset,
  showReset,
  children,
}: {
  label: string;
  onPrev: () => void;
  onNext: () => void;
  /** Повернутись до поточного місяця; кнопка показується лише при showReset. */
  onReset?: () => void;
  showReset?: boolean;
  /** Дії розділу праворуч (напр. «Додати витрату»). */
  children?: React.ReactNode;
}) {
  return (
    <FinanceStickyBar>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-8 w-8 shrink-0"
        aria-label="Попередній місяць"
        onClick={onPrev}
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <div className="min-w-[128px] text-center text-sm font-semibold">{label}</div>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-8 w-8 shrink-0"
        aria-label="Наступний місяць"
        onClick={onNext}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
      {showReset && onReset ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 shrink-0 text-muted-foreground"
          onClick={onReset}
        >
          Поточний
        </Button>
      ) : null}
      {children ? <div className="ml-auto flex shrink-0 items-center gap-1.5">{children}</div> : null}
    </FinanceStickyBar>
  );
}
