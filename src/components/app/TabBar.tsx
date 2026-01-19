import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Dumbbell, Home, Trophy, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { createPortal } from "react-dom";

type TabItem = {
  label: string;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  isActive: (pathname: string) => boolean;
};

const TAB_ITEMS: TabItem[] = [
  {
    label: "Огляд",
    to: "/overview",
    icon: Home,
    isActive: (pathname) => pathname === "/overview",
  },
  {
    label: "Матчі",
    to: "/matches-shadcn",
    icon: Trophy,
    isActive: (pathname) => pathname.startsWith("/matches"),
  },
  {
    label: "Тренування",
    to: "/admin/trainings",
    icon: Dumbbell,
    isActive: (pathname) => pathname.startsWith("/admin/trainings"),
  },
  {
    label: "Фінанси",
    to: "/finance",
    icon: Wallet,
    isActive: (pathname) => pathname.startsWith("/finance"),
  },
];

export function TabBar() {
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
    <div className="fixed inset-x-0 bottom-0 z-[60] flex justify-center md:hidden pointer-events-none transform-gpu">
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
          className="mx-auto flex items-center justify-between gap-[var(--tabbar-gap)] pointer-events-auto"
          style={{
            height: "var(--tabbar-height)",
            borderRadius: "var(--tabbar-radius)",
            backgroundColor: "hsl(var(--tabbar-bg) / 0.72)",
            border: "1px solid hsl(var(--tabbar-border) / 0.35)",
            boxShadow: "var(--tabbar-shadow)",
            backdropFilter: "blur(var(--tabbar-backdrop-blur)) saturate(var(--tabbar-backdrop-saturate))",
            WebkitBackdropFilter: "blur(var(--tabbar-backdrop-blur)) saturate(var(--tabbar-backdrop-saturate))",
            padding: "0 10px",
          }}
        >
          {TAB_ITEMS.map((tab) => {
            const active = activeKey === tab.to;
            const Icon = tab.icon;

            return (
              <Link
                key={tab.to}
                to={tab.to}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium",
                  "transition-[color,transform,opacity] duration-[var(--tabbar-transition)] ease-out",
                  active ? "text-primary" : "text-muted-foreground/60"
                )}
                style={{
                  transform: active ? "scale(var(--tabbar-active-scale))" : "scale(1)",
                }}
              >
                <Icon
                  className={cn(
                    "h-6 w-6",
                    active ? "text-[hsl(var(--tabbar-icon-active))]" : "text-[hsl(var(--tabbar-icon))]"
                  )}
                />
                <span
                  className={cn(
                    "h-4 leading-4 transition-opacity duration-[var(--tabbar-transition)]",
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
