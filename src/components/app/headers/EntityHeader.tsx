import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

import { ArrowLeft } from "@/components/icons/appIcons";
import { HoverCopyText } from "@/components/ui/hover-copy-text";
import { cn } from "@/lib/utils";

/**
 * Шапка картки запису (хвиля Б3): прорахунок, дизайн-задача, замовлення.
 *
 * ЧОМУ ОДНА. Три картки мали три будови: у прорахунку номер стояв замість назви,
 * а статус синьою кнопкою виглядав як головна дія; у дизайн-задачі властивості
 * сповзали в чотири рядки, бо ділили ширину з кнопками; у замовленні знову
 * інакше. Тепер будова одна, а картка віддає лише вміст рядків:
 *
 *   1. крихти «Розділ / НОМЕР» і дії праворуч (одна чорна — наступний крок);
 *   2. людська назва;
 *   3. властивості одним рядком чипів (`EntityProp`), стан — теж чип.
 *
 * Вкладки під шапкою лишаються спільним `TabBar` — він живе в тілі сторінки,
 * бо в кожної картки свій спосіб тримати вміст вкладок.
 */
export function EntityHeader({
  section,
  onBack,
  number,
  numberCopyMessage,
  actions,
  title,
  properties,
  className,
}: {
  /** Назва розділу в крихтах — і кнопка «назад» до нього. */
  section: string;
  onBack: () => void;
  /** Номер запису: моно, копіюється наведенням. */
  number: string;
  numberCopyMessage: string;
  actions?: ReactNode;
  title?: ReactNode;
  properties?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("@container space-y-2 pb-3 pt-2", className)}>
      <div className="flex min-h-9 flex-wrap items-center gap-x-2 gap-y-2">
        <nav aria-label="Крихти" className="flex min-w-0 shrink-0 items-center gap-1 text-sm text-muted-foreground">
          <button
            type="button"
            onClick={onBack}
            className="-ml-1.5 inline-flex h-7 items-center gap-1.5 rounded-md pl-1.5 pr-1 transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {section}
          </button>
          <span aria-hidden className="text-muted-foreground/60">/</span>
          <HoverCopyText
            value={number}
            textClassName="font-mono text-sm tabular-nums text-foreground"
            successMessage={numberCopyMessage}
            copyLabel="Скопіювати номер"
          >
            {number}
          </HoverCopyText>
        </nav>
        {actions ? <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-1.5">{actions}</div> : null}
      </div>
      {title ? <div className="min-w-0 text-xl font-semibold leading-tight tracking-tight text-foreground">{title}</div> : null}
      {properties ? <div className="flex min-w-0 flex-wrap items-center gap-1.5">{properties}</div> : null}
    </header>
  );
}

/** Чип властивості: рамка, 28 px, підпис сірим. Клікабельний — `EntityPropButton`. */
export const ENTITY_PROP =
  "inline-flex h-7 max-w-full shrink-0 items-center gap-1.5 rounded-md border border-line-strong bg-background px-2 text-xs font-medium text-foreground";

const ENTITY_PROP_INTERACTIVE =
  "cursor-pointer transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 disabled:cursor-default disabled:opacity-60 disabled:hover:bg-background";

export function EntityProp({
  label,
  children,
  className,
}: {
  label?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={cn(ENTITY_PROP, className)}>
      {label ? <span className="text-muted-foreground">{label}</span> : null}
      {children}
    </span>
  );
}

/** Той самий чип кнопкою — для стану, типу, дедлайну: змінюється кліком по ньому. */
export const EntityPropButton = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { label?: ReactNode }
>(function EntityPropButton({ label, children, className, type = "button", ...props }, ref) {
  return (
    <button ref={ref} type={type} className={cn(ENTITY_PROP, ENTITY_PROP_INTERACTIVE, className)} {...props}>
      {label ? <span className="text-muted-foreground">{label}</span> : null}
      {children}
    </button>
  );
});
