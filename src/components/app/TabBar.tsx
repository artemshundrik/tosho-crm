import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Calculator, Factory, Palette, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { ToShoAiMark } from "@/features/tosho-ai/ToShoAiWordmark";
import { createPortal } from "react-dom";
import { preloadRoute } from "@/routes/routePreload";

type TabItem = {
  label: string;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  isActive: (pathname: string) => boolean;
};

const TAB_ITEMS: TabItem[] = [
  {
    label: "Прорахунки",
    to: "/orders/estimates",
    icon: Calculator,
    isActive: (pathname) => pathname.startsWith("/orders/estimates"),
  },
  {
    label: "Замовники",
    to: "/orders/customers",
    icon: Users,
    isActive: (pathname) => pathname.startsWith("/orders/customers"),
  },
  {
    label: "Замовлення",
    to: "/orders/production",
    icon: Factory,
    isActive: (pathname) => pathname.startsWith("/orders/production"),
  },
  {
    label: "Дизайн",
    to: "/design",
    icon: Palette,
    isActive: (pathname) => pathname.startsWith("/design"),
  },
];

export function TabBar({ hidden = false, onAsk }: { hidden?: boolean; onAsk?: () => void }) {
  const location = useLocation();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const activeKey = useMemo(() => {
    const found = TAB_ITEMS.find((tab) => tab.isActive(location.pathname));
    return found?.to ?? null;
  }, [location.pathname]);

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
        // Плашка з розділами і кружечок AI — сусіди в одному рядку, а не одна
        // смуга: AI це дія, а не розділ, і ставити її поруч із навігацією
        // означало питати «куди піти?» там, де відповідь «нікуди».
        className="flex w-full items-center justify-center gap-2"
        style={{
          paddingLeft: "var(--tabbar-inset-x)",
          paddingRight: "var(--tabbar-inset-x)",
          paddingBottom: "var(--tabbar-inset-bottom)",
        }}
      >
        <nav
          aria-label="Primary"
          className={cn(
            "flex min-w-0 flex-1 max-w-[420px] items-center justify-between gap-[var(--tabbar-gap)]",
            // Прихована смуга мусить і кліки пропускати крізь себе. Доти вона
            // ставала прозорою, але лишалась «pointer-events: auto» — і поверх
            // відкритої палітри ловила дотики замість поля вводу й мікрофона:
            // видно її не було, а натиснути нічого не вдавалось.
            hidden ? "pointer-events-none" : "pointer-events-auto"
          )}
          style={{
            height: "var(--tabbar-height)",
            borderRadius: "var(--tabbar-radius)",
            backgroundColor: "hsl(var(--tabbar-bg) / var(--tabbar-bg-alpha))",
            border: "1px solid hsl(var(--tabbar-border) / 0.35)",
            boxShadow: "var(--tabbar-shadow)",
            backdropFilter: "blur(var(--tabbar-backdrop-blur)) saturate(var(--tabbar-backdrop-saturate))",
            WebkitBackdropFilter: "blur(var(--tabbar-backdrop-blur)) saturate(var(--tabbar-backdrop-saturate))",
            // 6px = (висота смуги 56 − висота вкладки 44) / 2. Тоді активна
            // пігулка стоїть на однаковій відстані і зверху, і знизу, і від
            // лівого краю, коли вона перша.
            padding: "0 6px",
          }}
        >
          {TAB_ITEMS.map((tab) => {
            const active = activeKey === tab.to;
            const Icon = tab.icon;

            return (
              <Link
                key={tab.to}
                to={tab.to}
                onMouseEnter={() => preloadRoute(tab.to)}
                onFocus={() => preloadRoute(tab.to)}
                onTouchStart={() => preloadRoute(tab.to)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex h-[44px] flex-1 flex-col items-center justify-center gap-0.5 overflow-hidden rounded-full text-2xs font-medium",
                  "transition-[background-color,border-color,color,box-shadow,transform,opacity] duration-[var(--tabbar-transition)] ease-out",
                  active
                    ? "border border-[hsl(var(--tabbar-active-border)/var(--tabbar-active-border-alpha))] bg-[hsl(var(--tabbar-active-bg)/var(--tabbar-active-bg-alpha))] text-[hsl(var(--tabbar-label-active))] backdrop-blur-xl"
                    : "border border-transparent text-muted-foreground/60"
                )}
              >
                {active ? (
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-3 top-0 h-px bg-white/35"
                  />
                ) : null}
                <Icon
                  className={cn(
                    "relative z-base h-5 w-5",
                    active ? "text-[hsl(var(--tabbar-icon-active))]" : "text-[hsl(var(--tabbar-icon))]"
                  )}
                />
                <span
                  className={cn(
                    "relative z-base h-4 leading-4 transition-opacity duration-[var(--tabbar-transition)]",
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

        {/* Кружечок AI: та сама висота й та сама поверхня, що в плашки, але
            окремо від неї. Причина не косметична — це ДІЯ, а не розділ: вона
            нікуди не веде, а відкриває палітру. Поки вона стояла п'ятою
            вкладкою, чотири підписи тіснились, і сама вона читалась як ще один
            розділ. Підпису немає навмисно: він є в самій палітрі. */}
        {onAsk ? (
          <button
            type="button"
            onClick={onAsk}
            aria-label="Знайти або спитати ToSho AI"
            className={cn(
              "flex shrink-0 items-center justify-center rounded-full text-white",
              // Схована смуга не має ловити дотики — те саме, що й у навігації.
              hidden ? "pointer-events-none" : "pointer-events-auto",
              "transition-[background-color,border-color,color,box-shadow,transform] duration-[var(--tabbar-transition)] ease-out",
              "active:scale-95"
            )}
            style={{
              height: "var(--tabbar-height)",
              width: "var(--tabbar-height)",
              // Рідке скло, підфарбоване кольором підбренду: напівпрозора
              // заливка поверх розмиття, світлий відблиск згори й тонке біле
              // кільце. Суцільний колір читався як плаский стікер поруч зі
              // скляною плашкою.
              backgroundColor: "hsl(var(--ai-accent) / 0.9)",
              backgroundImage:
                "linear-gradient(180deg, hsl(0 0% 100% / 0.3), hsl(0 0% 100% / 0) 58%)",
              border: "1px solid hsl(0 0% 100% / 0.35)",
              boxShadow:
                "inset 0 1px 0 hsl(0 0% 100% / 0.5), 0 10px 26px -10px hsl(var(--ai-accent) / 0.7)",
              backdropFilter: "blur(var(--tabbar-backdrop-blur)) saturate(var(--tabbar-backdrop-saturate))",
              WebkitBackdropFilter: "blur(var(--tabbar-backdrop-blur)) saturate(var(--tabbar-backdrop-saturate))",
            }}
          >
            <ToShoAiMark className="h-[22px] w-[22px]" />
          </button>
        ) : null}
      </div>
    </div>
  );

  if (!mounted || typeof document === "undefined") return null;
  return createPortal(content, document.body);
}
