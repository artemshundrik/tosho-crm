import * as React from "react";
import { Repeat, type LucideIcon } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { getExpenseCategoryIcon } from "./expenseCategoryIcons";
import type { ExpenseCategoryKind } from "./types";

// Плитка витрати: лого сервісу, якщо він упізнаваний, інакше — іконка статті витрат
// (оренда → будівля, прибирання → спрей, пошти → фура). Монограми з ініціалів тут
// не працюють: «ОО» і «БН» нічого не пояснюють, а іконка читається з першого погляду.
// Форма — прямокутник зі скругленням, а не коло: це сервіс/стаття, а не людина.

const TONE_COUNT = 6;

const toneClass = (seed: string) => {
  const normalized = seed.trim().toLowerCase();
  if (!normalized) return "entity-avatar-shell-tone-1";
  const hash = Array.from(normalized).reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return `entity-avatar-shell-tone-${(hash % TONE_COUNT) + 1}`;
};

// Явна іконка → іконка статті витрат → здогадка по назві сервісу («Домени та пошта» → Wi-Fi).
function resolveIcon(
  icon: LucideIcon | null | undefined,
  categoryName: string | null | undefined,
  categoryKind: ExpenseCategoryKind | null | undefined,
  name: string
): LucideIcon {
  if (icon) return icon;
  const kind = categoryKind ?? "fixed";
  if (categoryName?.trim()) return getExpenseCategoryIcon(categoryName, kind);
  if (name.trim()) return getExpenseCategoryIcon(name, kind);
  return Repeat;
}

type SubscriptionLogoProps = {
  logoUrl?: string | null;
  name: string;
  categoryName?: string | null;
  categoryKind?: ExpenseCategoryKind | null;
  /** Іконка, задана явно, — переважає над здогадкою по назві статті. */
  icon?: LucideIcon | null;
  size?: number;
  className?: string;
};

export function SubscriptionLogo({
  logoUrl,
  name,
  categoryName,
  categoryKind,
  icon,
  size = 36,
  className,
}: SubscriptionLogoProps) {
  const src = logoUrl?.trim() || null;
  const Icon = resolveIcon(icon, categoryName, categoryKind, name);
  const iconSize = Math.round(size * 0.46);

  return (
    <Avatar
      className={cn(
        "shrink-0 rounded-xl border",
        src ? "border-border/60 bg-card" : toneClass(categoryName || name),
        className
      )}
      style={{ width: size, height: size }}
    >
      {src ? (
        // object-contain + падінг: фавікони квадратні, обрізати їх по колу не можна.
        <AvatarImage src={src} alt={name} loading="lazy" className="rounded-xl object-contain p-1" />
      ) : null}
      <AvatarFallback className={cn("rounded-xl bg-transparent", !src && toneClass(categoryName || name))}>
        {/* createElement, а не <Icon/>: компонент береться з мапи по назві статті,
            і React Compiler інакше вважає це створенням компонента під час рендеру. */}
        {React.createElement(Icon, { style: { width: iconSize, height: iconSize }, strokeWidth: 1.9 })}
      </AvatarFallback>
    </Avatar>
  );
}
