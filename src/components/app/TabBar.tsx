import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { ToShoAiMark } from "@/features/tosho-ai/ToShoAiWordmark";
import { createPortal } from "react-dom";
import { preloadRoute } from "@/routes/routePreload";
import { useIsNarrowViewport } from "@/hooks/useIsNarrowViewport";
import { isTabActive, resolveTabItems, type TabSourceLink } from "@/components/app/tabBarItems";
import {
  getServerTabBarPrefs,
  getTabBarPrefs,
  subscribeTabBarPrefs,
  tabSlotCount,
} from "@/components/app/tabBarSettings";

/**
 * Пружний слайд капсули між вкладками (картка 146, «як у нового iOS-таббара»):
 * капсула не перемальовується на новому місці, а ПЕРЕЇЖДЖАЄ. 260ms — у межах
 * рекомендованих 150–300 для мікровзаємодій; крива з легким овершутом.
 */
const CAPSULE_TRANSITION =
  "transform 260ms cubic-bezier(0.3, 0.8, 0.3, 1), width 260ms cubic-bezier(0.3, 0.8, 0.3, 1)";

export function TabBar({
  links,
  hidden = false,
  onAsk,
}: {
  /** Пункти сайдбару після фільтра доступів — смуга не має власного реєстру. */
  links: readonly TabSourceLink[];
  hidden?: boolean;
  onAsk?: () => void;
}) {
  const location = useLocation();
  const [mounted, setMounted] = useState(false);
  const isNarrow = useIsNarrowViewport();
  const prefs = useSyncExternalStore(subscribeTabBarPrefs, getTabBarPrefs, getServerTabBarPrefs);

  useEffect(() => {
    setMounted(true);
  }, []);

  const items = useMemo(
    () => resolveTabItems(links, tabSlotCount(prefs.ai), prefs.tabs),
    [links, prefs.ai, prefs.tabs]
  );

  const activeIndex = useMemo(
    () => items.findIndex((tab) => isTabActive(location.pathname, tab.to)),
    [items, location.pathname]
  );

  /**
   * Капсула позиціюється заміром активної вкладки, а не арифметикою індексів:
   * вкладки тягнуться по доступній ширині, і тільки замір дає точні розміри.
   * null — капсули немає (сторінка поза вкладками або ще не заміряли).
   */
  const itemRefs = useRef<Array<HTMLAnchorElement | null>>([]);
  const [capsule, setCapsule] = useState<{ x: number; w: number } | null>(null);

  useLayoutEffect(() => {
    const measure = () => {
      const el = activeIndex >= 0 ? itemRefs.current[activeIndex] : null;
      if (!el) {
        setCapsule(null);
        return;
      }
      setCapsule({ x: el.offsetLeft, w: el.offsetWidth });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
    // `mounted` у залежностях обов'язковий: до монтування порталу вкладок у
    // DOM ще немає, замір дає null — і без переміру після монтування капсула
    // не з'являлась би до першої зміни розділу чи повороту екрана.
  }, [activeIndex, items, mounted]);

  // Широкий екран: смугу не будуємо взагалі — жодних прихованих мобільних
  // гілок (принцип картки 146; md:hidden нижче лишається ременем безпеки).
  // Порожній список — доступи ще вантажаться: краще з'явитися разом із
  // пунктами сайдбару, ніж блимнути не тими вкладками.
  if (!isNarrow || items.length === 0) return null;
  if (!mounted || typeof document === "undefined") return null;

  const content = (
    <div
      className={cn(
        "fixed inset-x-0 bottom-0 z-floating flex justify-center md:hidden pointer-events-none transform-gpu",
        "transition-[opacity,transform] duration-150 ease-out",
        hidden ? "opacity-0 translate-y-2" : "opacity-100 translate-y-0"
      )}
      aria-hidden={hidden}
    >
      <div
        // Смуга тягнеться по всій доступній ширині, а не обіймає вміст: що
        // ширші вкладки, то більше вміщає підпис — «Прорахунки» й «До
        // відвантаження» мусять читатись, а не обриватись трьома крапками.
        className="flex w-full items-center justify-center gap-1.5"
        style={{
          paddingLeft: "var(--tabbar-inset-x)",
          paddingRight: "var(--tabbar-inset-x)",
          paddingBottom: "var(--tabbar-inset-bottom)",
        }}
      >
        <nav
          aria-label="Primary"
          className={cn(
            "relative flex min-w-0 flex-1 items-center gap-[var(--tabbar-gap)]",
            // Прихована смуга мусить і кліки пропускати крізь себе — інакше
            // поверх відкритої палітри вона ловила дотики замість поля вводу.
            hidden ? "pointer-events-none" : "pointer-events-auto"
          )}
          style={{
            height: "var(--tabbar-height)",
            borderRadius: "var(--tabbar-radius)",
            backgroundColor: "hsl(var(--tabbar-bg) / var(--tabbar-bg-alpha))",
            border: "1px solid hsl(var(--tabbar-border) / 0.5)",
            boxShadow: "var(--tabbar-shadow)",
            backdropFilter: "blur(var(--tabbar-backdrop-blur)) saturate(var(--tabbar-backdrop-saturate))",
            WebkitBackdropFilter: "blur(var(--tabbar-backdrop-blur)) saturate(var(--tabbar-backdrop-saturate))",
            // 4px, а не 6: капсула мусить майже сягати країв смуги — вузька
            // рамка навколо неї і є тим «щільним» виглядом нового таббара.
            padding: "0 4px",
          }}
        >
          {/* Капсула активної вкладки: ледь сіра підкладка, що переїжджає. */}
          {capsule ? (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 rounded-full motion-reduce:transition-none"
              style={{
                left: 0,
                width: capsule.w,
                // 48 із 56 висоти смуги: зверху й знизу лишається по 4px —
                // рівно стільки ж, скільки з боків. Капсула читається як
                // щільна вставка, а не як маленька пігулка посеред порожнечі.
                height: 48,
                transform: `translate(${capsule.x}px, -50%)`,
                backgroundColor: "hsl(var(--tabbar-active-bg) / var(--tabbar-active-bg-alpha))",
                transition: CAPSULE_TRANSITION,
              }}
            />
          ) : null}

          {items.map((tab, index) => {
            const active = index === activeIndex;
            const Icon = tab.icon;

            return (
              <Link
                key={tab.to}
                to={tab.to}
                ref={(el) => {
                  itemRefs.current[index] = el;
                }}
                onMouseEnter={() => preloadRoute(tab.to)}
                onFocus={() => preloadRoute(tab.to)}
                onTouchStart={() => preloadRoute(tab.to)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative z-base flex h-12 min-w-0 flex-1 flex-col items-center justify-center gap-0.5",
                  "rounded-full px-0.5 text-2xs font-medium",
                  "transition-colors duration-[var(--tabbar-transition)] ease-out"
                )}
              >
                <Icon
                  className={cn(
                    "h-5 w-5 shrink-0",
                    active ? "text-[hsl(var(--tabbar-icon-active))]" : "text-[hsl(var(--tabbar-icon))]"
                  )}
                />
                <span
                  className={cn(
                    "h-4 max-w-full truncate leading-4 transition-opacity duration-[var(--tabbar-transition)]",
                    active
                      ? "opacity-100 text-[hsl(var(--tabbar-label-active))]"
                      : "opacity-70 text-[hsl(var(--tabbar-label))]"
                  )}
                >
                  {tab.label}
                </span>
              </Link>
            );
          })}
        </nav>

        {/* Кружечок AI: єдиний елемент без підпису — це ДІЯ, а не розділ.
            Суцільний градієнт бренду замість «рідкого скла»: напівпрозорі
            нашарування поруч із матовою смугою читались як дешевий стікер.
            Вимикається в налаштуваннях смуги — тоді слот іде під п'яту вкладку. */}
        {onAsk && prefs.ai ? (
          <button
            type="button"
            onClick={onAsk}
            aria-label="Знайти або спитати ToSho AI"
            className={cn(
              "flex shrink-0 items-center justify-center rounded-full text-white",
              hidden ? "pointer-events-none" : "pointer-events-auto",
              "transition-[background-color,border-color,color,box-shadow,transform] duration-[var(--tabbar-transition)] ease-out",
              "active:scale-95"
            )}
            style={{
              // 48, а не на всю висоту смуги: вісім зекономлених пікселів ідуть
              // у підписи вкладок. Тач-таргет лишається в нормі (мінімум 44).
              height: 48,
              width: 48,
              backgroundColor: "hsl(var(--ai-accent))",
              backgroundImage: "linear-gradient(180deg, hsl(0 0% 100% / 0.28), hsl(0 0% 100% / 0) 58%)",
              border: "1px solid hsl(0 0% 100% / 0.5)",
              boxShadow:
                "inset 0 1px 0 hsl(0 0% 100% / 0.55), 0 1px 3px hsl(var(--ai-accent) / 0.35), 0 10px 24px -10px hsl(var(--ai-accent) / 0.55)",
            }}
          >
            <ToShoAiMark className="h-[22px] w-[22px]" />
          </button>
        ) : null}
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
