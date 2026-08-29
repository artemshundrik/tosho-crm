import * as React from "react";

import { useSegmentedSlider } from "@/components/ui/segmented-group";
import { cn } from "@/lib/utils";

/**
 * Смуга вкладок із підкресленням, що ПЕРЕЇЖДЖАЄ.
 *
 * ЧОМУ ОДИН КОМПОНЕНТ. Ця розмітка жила трьома копіями — головна смуга картки
 * прорахунку, смуга картки людини і `variant="underline"` у вкладках Radix.
 * Копії вже розходились у дрібницях (десь `py-3`, десь `py-2.5`), але дорожча
 * була не косметика: рух доводилось лагодити в кожній окремо, і одна копія
 * лишалась мертвою — рівно те, що видно на скріншотах Артема.
 *
 * ЧОМУ ПІДКРЕСЛЕННЯ ОКРЕМИМ ВУЗЛОМ, А НЕ `after:` НА КНОПЦІ. Псевдоелемент на
 * кожній кнопці вміє лише одне: згаснути в одному місці й засвітитись в
 * іншому. Рискa при цьому не рухається — а саме руху й бракувало. Тут риска
 * ОДНА на всю смугу, вона міряє активну кнопку й переїжджає до неї.
 *
 * ЧОМУ ЦЕ НЕ View Transitions. Знімок сторінки прибирає з екрана живий DOM:
 * риска їхала б у схованому дереві, а на екрані стояли б два нерухомі кадри.
 * Тобто перехід не додав би руху, а З'ЇВ би його. Тому смуга анімується
 * локально, а вміст під нею — класом `tab-panel` (index.css).
 *
 * ДЕ ВМІСТ. Компонент малює ЛИШЕ смугу: у картки прорахунку розділи лежать
 * поруч і перемикаються класом, у Radix-вкладок вміст свій. Спільною лишається
 * механіка, а не спосіб зберігати вміст.
 */

/** Ряд вкладок. `relative` обов'язковий — риска позиціонується від нього. */
export const TAB_BAR_ROW =
  "relative flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

/**
 * Одна вкладка. Висота, відступи й ваги — саме ті, що були в копіях, щоб
 * заміна не зрушила жодного пікселя.
 */
export const TAB_BAR_ITEM =
  "relative inline-flex h-11 shrink-0 cursor-pointer items-center gap-2 px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20";

export const TAB_BAR_ITEM_ACTIVE = "font-semibold text-foreground";
export const TAB_BAR_ITEM_IDLE = "font-medium text-muted-foreground hover:text-foreground";

type TabBarProps = {
  /** Активна вкладка. */
  value: string;
  children: React.ReactNode;
  className?: string;
  /** Клас на зовнішній обгортці з нижньою межею. */
  wrapperClassName?: string;
};

const TabBarContext = React.createContext<string | null>(null);

export function TabBar({ value, children, className, wrapperClassName }: TabBarProps) {
  // Та сама механіка, що й у сегментованого перемикача: риска міряє активний
  // тригер за `aria-pressed` і їде до нього. Один хук на два види підсвітки.
  const { ref, indicator } = useSegmentedSlider<HTMLDivElement>("underline");

  return (
    <TabBarContext.Provider value={value}>
      <div className={wrapperClassName}>
        <div ref={ref} className={cn(TAB_BAR_ROW, className)} role="tablist">
          {indicator}
          {children}
        </div>
      </div>
    </TabBarContext.Provider>
  );
}

// `onSelect` прибираємо з нативних пропів свідомо: у <button> він уже є (подія
// виділення тексту), і без цього наш обробник конфліктував би з ним за типом.
type TabBarItemProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "value" | "onSelect"> & {
  value: string;
  onSelect: (value: string) => void;
};

export function TabBarItem({ value, onSelect, className, children, ...props }: TabBarItemProps) {
  const active = React.useContext(TabBarContext) === value;

  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      // `aria-pressed` тут не заради доступності (її дає `aria-selected`), а
      // тому, що саме за ним риска знаходить активну вкладку. Прибереш —
      // підсвітка тихо зникне.
      aria-pressed={active}
      onClick={() => onSelect(value)}
      className={cn(TAB_BAR_ITEM, active ? TAB_BAR_ITEM_ACTIVE : TAB_BAR_ITEM_IDLE, className)}
      {...props}
    >
      {children}
    </button>
  );
}
