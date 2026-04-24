import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Calculator, Palette, Users } from "lucide-react";
import { cn } from "@/lib/utils";
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
    label: "Дизайн",
    to: "/design",
    icon: Palette,
    isActive: (pathname) => pathname.startsWith("/design"),
  },
];

export function TabBar({ hidden = false }: { hidden?: boolean }) {
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
        "fixed inset-x-0 bottom-0 z-[60] flex justify-center md:hidden pointer-events-none transform-gpu",
        "transition-[opacity,transform] duration-150 ease-out",
        hidden ? "opacity-0 translate-y-2" : "opacity-100 translate-y-0"
      )}
      aria-hidden={hidden}
    >
      <div
        className="w-full"
        style={{
          paddingLeft: "var(--tabbar-inset-x)",
          paddingRight: "var(--tabbar-inset-x)",
          paddingBottom: "var(--tabbar-inset-bottom)",
        }}
      >
        <nav
          aria-label="Primary"
          className="mx-auto flex max-w-[420px] items-center justify-between gap-[var(--tabbar-gap)] pointer-events-auto"
          style={{
            height: "var(--tabbar-height)",
            borderRadius: "var(--tabbar-radius)",
            backgroundColor: "hsl(var(--tabbar-bg) / 0.72)",
            border: "1px solid hsl(var(--tabbar-border) / 0.35)",
            boxShadow: "var(--tabbar-shadow)",
            backdropFilter: "blur(var(--tabbar-backdrop-blur)) saturate(var(--tabbar-backdrop-saturate))",
            WebkitBackdropFilter: "blur(var(--tabbar-backdrop-blur)) saturate(var(--tabbar-backdrop-saturate))",
            padding: "0 8px",
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
                  "relative flex h-[44px] flex-1 flex-col items-center justify-center gap-0.5 overflow-hidden rounded-full text-[11px] font-medium",
                  "transition-[background-color,border-color,color,box-shadow,transform,opacity] duration-[var(--tabbar-transition)] ease-out",
                  active
                    ? "border border-[hsl(var(--tabbar-active-border)/var(--tabbar-active-border-alpha))] bg-[hsl(var(--tabbar-active-bg)/var(--tabbar-active-bg-alpha))] text-[hsl(var(--tabbar-label-active))] shadow-[inset_0_1px_0_hsl(0_0%_100%/0.18),0_8px_24px_hsl(0_0%_0%/0.12)] backdrop-blur-xl"
                    : "border border-transparent text-muted-foreground/60"
                )}
                style={{
                  transform: active ? "scale(var(--tabbar-active-scale))" : "scale(1)",
                }}
              >
                {active ? (
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-3 top-0 h-px bg-white/35"
                  />
                ) : null}
                <Icon
                  className={cn(
                    "relative z-[1] h-5 w-5",
                    active ? "text-[hsl(var(--tabbar-icon-active))]" : "text-[hsl(var(--tabbar-icon))]"
                  )}
                />
                <span
                  className={cn(
                    "relative z-[1] h-4 leading-4 transition-opacity duration-[var(--tabbar-transition)]",
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
      </div>
    </div>
  );

  if (!mounted || typeof document === "undefined") return null;
  return createPortal(content, document.body);
}
