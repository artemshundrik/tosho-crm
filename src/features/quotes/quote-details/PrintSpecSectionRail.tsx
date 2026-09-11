import { cn } from "@/lib/utils";
import type { PrintSpecSectionInfo } from "@/components/quotes/PrintSpecFields";

/**
 * Рейка розділів ліворуч у вікні «Параметри виробу» (варіант А, обраний 11.09.2026).
 *
 * ЩО ЦЕ ЛІКУЄ. Щоденник — це вісім розділів і двадцять видимих полів; у вікні на
 * одну прокрутку не було видно ні де ти зараз, ні скільки лишилось, ні що вже
 * заповнено. Рейка відповідає на всі три питання, не займаючи висоти: вона стоїть
 * збоку, поки вміст їде.
 *
 * ЧОМУ ЛИШЕ ВІД ТРЬОХ РОЗДІЛІВ. У листівки їх два, і список із двох рядків не
 * каже нічого, чого не видно в самій формі, — зате з'їдає 248 px ширини. Рішення
 * приймає не рейка, а панель: тут просто нічого не малюється.
 *
 * ЧОМУ МОНОХРОМ. Активний розділ — це «де я», а не стан справи. Колір у цій CRM
 * означає стан, тож поточний рядок просто темнішає підкладкою.
 */
export function PrintSpecSectionRail({
  sections,
  activeIndex,
  onPick,
}: {
  sections: PrintSpecSectionInfo[];
  activeIndex: number;
  onPick: (index: number) => void;
}) {
  const total = sections.reduce((sum, section) => sum + section.fields.length, 0);
  const filled = sections.reduce((sum, section) => sum + section.filled, 0);

  return (
    <div className="hidden w-60 shrink-0 flex-col border-r border-border/50 bg-muted/25 md:flex">
      <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-3">
        {sections.map((section, index) => (
          <button
            key={section.title}
            type="button"
            onClick={() => onPick(index)}
            className={cn(
              "flex h-9 w-full items-center gap-2 rounded-lg px-3 text-left text-sm font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20",
              index === activeIndex ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/60"
            )}
          >
            <span className="min-w-0 flex-1 truncate">{section.title}</span>
            <span
              className={cn(
                "shrink-0 text-2xs tabular-nums",
                section.filled === section.fields.length ? "text-foreground" : "text-muted-foreground/75"
              )}
            >
              {section.filled}/{section.fields.length}
            </span>
          </button>
        ))}
      </div>

      <div className="border-t border-border/50 px-6 py-4">
        <div className="flex items-baseline gap-1.5">
          <span className="text-xl font-semibold tabular-nums tracking-tight text-foreground">{filled}</span>
          <span className="text-xs text-muted-foreground">з {total} полів</span>
        </div>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-border/60">
          <div
            className="h-full bg-foreground transition-[width] duration-base ease-out motion-reduce:transition-none"
            style={{ width: `${total === 0 ? 0 : Math.round((filled / total) * 100)}%` }}
          />
        </div>
        {/* Порожнє поле тут — робочий стан, а не борг: параметри дозаповнюють
            у міру того, як замовник відповідає. Тому смуга не червоніє. */}
        <div className="mt-2 text-2xs leading-snug text-muted-foreground/80">
          Порожні поля не блокують ні збереження, ні статус прорахунку.
        </div>
      </div>
    </div>
  );
}
