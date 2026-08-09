import { ChevronDown } from "lucide-react";

import { toneDotClass } from "@/lib/statusTones";
import { cn } from "@/lib/utils";
import type { RequestGroup } from "./grouping";

/**
 * Підзаголовок групи всередині колонки.
 *
 * Крапка кольору дублює тон, який і так є на кожній картці. Це навмисне
 * повторення: у заголовку вона дає ритм, за яким око стрибає між секціями, не
 * читаючи слів. Для тем тону немає — теми довільні рядки, вигадувати їм колір
 * означало б, що «модалки» червоні з якоїсь причини.
 *
 * Клік згортає групу. Стан памʼятається на ГРУПУ, а не на колонку: згорнув
 * «нове» — воно згорнуте в усіх пʼятьох, бо ховають зазвичай цілий різновид
 * роботи, а не його шматок в одній колонці.
 */
export function GroupHeading({
  group,
  collapsed,
  onToggle,
}: {
  group: RequestGroup;
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={!collapsed}
      title={collapsed ? "Розгорнути" : "Згорнути"}
      className={cn(
        "flex w-full items-center gap-1.5 rounded-[var(--radius)] px-1 pb-1 pt-2 text-left transition-colors",
        "text-3xs font-semibold uppercase tracking-caps text-muted-foreground",
        "hover:text-foreground"
      )}
    >
      <ChevronDown
        className={cn("h-3 w-3 shrink-0 transition-transform", collapsed && "-rotate-90")}
      />
      {group.tone ? (
        <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", toneDotClass[group.tone])} />
      ) : null}
      <span className="min-w-0 truncate">{group.label}</span>
      <span className="h-px flex-1 bg-border/60" />
      <span className="shrink-0 font-mono tabular-nums opacity-70">{group.items.length}</span>
    </button>
  );
}
