import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ChevronsUpDown, Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { ToShoAiMark } from "@/features/tosho-ai/ToShoAiWordmark";
import { createPortal } from "react-dom";
import { preloadRoute } from "@/routes/routePreload";
import { useIsNarrowViewport } from "@/hooks/useIsNarrowViewport";
import { isTabActive, resolveTabItems, type TabSourceLink } from "@/components/app/tabBarItems";

/**
 * Пружний слайд капсули між вкладками (картка 146, «як у нового iOS-таббара»):
 * капсула не перемальовується на новому місці, а ПЕРЕЇЖДЖАЄ. 260ms — у межах
 * рекомендованих 150–300 для мікровзаємодій; крива з легким овершутом.
 */
const CAPSULE_TRANSITION = "transform 260ms cubic-bezier(0.3, 0.8, 0.3, 1), width 260ms cubic-bezier(0.3, 0.8, 0.3, 1)";

export function TabBar({
  links,
  hidden = false,
  onAsk,
  onMenu,
}: {
  /** Пункти сайдбару після фільтра доступів — смуга не має власного реєстру. */
  links: readonly TabSourceLink[];
  hidden?: boolean;
  onAsk?: () => void;
  /** Тап по слоту меню. Поки що відкриває наявний дровер; далі — попап (картка 146). */
  onMenu?: () => void;
}) {
  const location = useLocation();
  const [mounted, setMounted] = useState(false);
  const isNarrow = useIsNarrowViewport();

  useEffect(() => {
    setMounted(true);
  }, []);

  const items = useMemo(() => resolveTabItems(links), [links]);

  const activeIndex = useMemo(
    () => items.findIndex((tab) => isTabActive(location.pathname, tab.to)),
    [items, location.pathname]
  );

  /**
   * Капсула позиціюється заміром активної вкладки, а не арифметикою індексів:
   * вкладки можуть стискатись на вузьких екранах, і тільки замір дає точні
   * «розміри й заокруглення». null — капсули немає (сторінка поза вкладками
   * або ще не заміряли після монтування).
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
  }, [activeIndex, items]);

  // Широкий екран: смугу не будуємо взагалі — жодних прихованих мобільних
  // гілок (принцип картки 146; md:hidden нижче лишається ременем безпеки).
  // Порожній список — доступи ще вантажаться: краще з'явитися разом із
  // пунктами сайдбару, ніж блимнути не тими вкладками.
  if (!isNarrow || items.length === 0) return null;
  if (!mounted || typeof document === "undefined") return null;

  const itemBaseClass = cn(
    "relative z-base flex h-[44px] w-16 min-w-0 shrink flex-col items-center justify-center gap-0.5",
    "rounded-full text-2xs font-medium",
    "transition-colors duration-[var(--tabbar-transition)] ease-out"
  );

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
        // Док і кружечок AI — сусіди в одному рядку, а не одна смуга: AI це
        // дія, а не розділ. Увесь кластер центрований, док обіймає вміст —
        // «коротка» піґулка, як у Linear, а не смуга на всю ширину.
        className="flex items-center justify-center gap-2"
        style={{
          paddingLeft: "var(--tabbar-inset-x)",
          paddingRight: "var(--tabbar-inset-x)",
          paddingBottom: "var(--tabbar-inset-bottom)",
        }}
      >
        <nav
          aria-label="Primary"
          className={cn(
            "relative flex max-w-full items-center gap-[var(--tabbar-gap)]",
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
            // 6px = (висота смуги 56 − висота вкладки 44) / 2: капсула стоїть
            // на однаковій відстані зверху, знизу й від країв.
            padding: "0 6px",
          }}
        >
          {/* Капсула активної вкладки: ледь сіра підкладка, що переїжджає. */}
          {capsule ? (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 h-[44px] rounded-full motion-reduce:transition-none"
              style={{
                left: 0,
                width: capsule.w,
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
                className={itemBaseClass}
              >
                <Icon
                  className={cn(
                    "h-5 w-5",
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

          {/* Слот меню — завжди останній (картка 146): подвійна стрілочка
              обіцяє перемикач. Підпис є, як і в вкладок, — без підпису лишається
              тільки кружечок AI. */}
          {onMenu ? (
            <button
              type="button"
              onClick={onMenu}
              aria-label="Усі розділи"
              aria-haspopup="menu"
              className={cn(itemBaseClass, "text-[hsl(var(--tabbar-label))]")}
            >
              <span className="flex items-center gap-0.5">
                <Menu className="h-5 w-5 text-[hsl(var(--tabbar-icon))]" />
                <ChevronsUpDown className="h-3 w-3 text-[hsl(var(--tabbar-icon))] opacity-60" />
              </span>
              <span className="h-4 leading-4 opacity-70">Меню</span>
            </button>
          ) : null}
        </nav>

        {/* Кружечок AI: єдиний елемент без підпису — це ДІЯ, а не розділ.
            Суцільний градієнт бренду замість «рідкого скла»: напівпрозорі
            нашарування поруч із матовим доком читались як дешевий стікер. */}
        {onAsk ? (
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
              height: "var(--tabbar-height)",
              width: "var(--tabbar-height)",
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
