import type { HTMLAttributes, PropsWithChildren } from "react";
import { cn } from "@/lib/utils";

/**
 * Оболонка картки канбану — спільна для всіх дошок.
 *
 * НАВІЩО КОМПОНЕНТ, А НЕ РЯДОК КЛАСІВ. До 22.08.2026 цей файл віддавав лише
 * рамку, а рецепт оболонки був виписаний інлайном у чотирьох місцях: прорахунки
 * (QuotesPage), дизайн-задачі (DesignPage), замовлення (OrdersProductionPage) і
 * запити на доробку (DevRequestBoard). Копіювали свідомо — у коментарі до
 * картки запитів так і написано: «класи ті самі, що на дошках дизайну та
 * прорахунків». Рядок збігався на 95%, а розходився там, де ніхто нічого не
 * вирішував:
 *
 *   фон        плаский у двох, градієнт у двох
 *   відступ    p-2.5 / p-3 / p-3 / p-4 — чотири щільності
 *   тягнеться  ring-primary/30+opacity-90 / ring-primary/40 / нічого / opacity-50
 *
 * Останній рядок — чотири різні відповіді на одне питання, і побачити це можна
 * було, лише поклавши картки поруч. Тепер форма живе тут: правка відступу чи
 * ховера робиться один раз і діє на всі дошки.
 *
 * ЩО СЮДИ НЕ ЇДЕ. Начинка. У дизайн-задачі меню на дванадцять пунктів, у
 * замовлення його немає взагалі — зводити це в один компонент означало б
 * двадцять пропсів, яких ніхто не наважиться чіпати. Оболонка володіє формою,
 * сторінка приносить вміст.
 *
 * СТАН ПЕРЕТЯГУВАННЯ переїхав сюди 26.08.2026 (REQ-159) — саме так, як тут і
 * було записано: спершу подивитись на три дошки поруч, обрати один рецепт, і аж
 * тоді зводити. Поруч вони давали три різні відповіді на одне питання:
 *
 *   прорахунки  ring-2 ring-primary/30 + opacity-90
 *   дизайн      ring-2 ring-primary/40
 *   беклог      opacity-50
 *
 * Обраний рецепт — СІРИЙ і той самий на всіх дошках. Взята картка не
 * підсвічується, а навпаки гасне й сідає: те, що ти тримаєш, зараз під курсором,
 * а на дошці лишилась ямка, з якої його вийняли. Пунктирна рамка каже те саме
 * без жодного кольору. Основний колір звідси прибрано свідомо: на дошці без
 * заливки колонок синя рамка ставала єдиною кольоровою плямою на весь екран.
 */

/** Щільність вмісту. Три значення — рівно ті, що вже були на дошках. */
export type KanbanCardDensity = "compact" | "regular" | "roomy";

/** Поверхня: плаский фон із `.kanban-estimate-card` або градієнт поверх нього. */
export type KanbanCardSurface = "flat" | "raised";

const DENSITY: Record<KanbanCardDensity, string> = {
  compact: "p-2.5",
  regular: "p-3",
  roomy: "p-4",
};

const SURFACE: Record<KanbanCardSurface, string> = {
  flat: "",
  raised: "bg-gradient-to-br from-card via-card/95 to-card/75",
};

export type KanbanCardProps = PropsWithChildren<HTMLAttributes<HTMLDivElement>> & {
  density?: KanbanCardDensity;
  surface?: KanbanCardSurface;
  /** Картка відкривається кліком: курсор і підсвітка межі під курсором. */
  interactive?: boolean;
  /** Відкрити не можна (немає прав, немає куди): курсор-заборона й приглушення. */
  disabled?: boolean;
  /** Саме цю картку зараз тягнуть: на дошці лишається приглушена ямка. */
  dragging?: boolean;
};

export function KanbanCard({
  className,
  children,
  density = "regular",
  surface = "flat",
  interactive = true,
  disabled = false,
  dragging = false,
  ...props
}: KanbanCardProps) {
  return (
    <div
      data-kanban-card="true"
      data-dragging={dragging ? "true" : undefined}
      className={cn(
        // `.kanban-estimate-card` (index.css) дає плаский фон картки; градієнт
        // із `surface="raised"` лягає поверх як background-image і не конфліктує.
        "kanban-estimate-card rounded-2xl border border-border/60",
        // Перелік властивостей поіменно, не `transition-all`: `all` возить і
        // відступи, через що картка «розгортається» після появи (та сама
        // причина, що в CONTROL_BASE). Opacity тут тому, що ним показують
        // перетягування й недоступність.
        //
        // `scale`, А НЕ `transform` — це не синонім. Tailwind v4 віддає
        // `scale-[0.98]` окремою властивістю `scale`, а не збирає її в
        // `transform`. Перший захід перелічив тут `transform`, і заміром у
        // браузері вийшло `scale: 0.98` при `transform: none`: властивість, яку
        // ми анімуємо, не та, яка змінюється, — картка сідала стрибком.
        "transition-[border-color,opacity,scale] duration-220 ease-out motion-reduce:transition-none",
        DENSITY[density],
        SURFACE[surface],
        disabled
          ? "cursor-not-allowed opacity-70"
          : interactive && "cursor-pointer hover:border-foreground/24 dark:hover:border-foreground/22",
        // Після disabled/interactive, щоб перетягування перебивало ховер:
        // курсор фізично стоїть над карткою, і без цього вона підсвічувалась би
        // межею рівно тоді, коли має гаснути.
        dragging && "scale-[0.98] border-dashed border-foreground/25 opacity-40",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
