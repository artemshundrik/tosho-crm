import { Banknote, MapPin, Palette, Sparkles, Users, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FeatureCategory, FeatureGroup } from "@/lib/featureCatalog";

/**
 * Ліва рейка розділів каталогу — зміст, а не фільтр: усе полотно лишається
 * на сторінці, клік лише гортає до розділу, а активний пункт підсвічується
 * під час прокрутки. Плюс кільце «скільки вже спробував» — тихий дотиск
 * замість гейміфікації з вигуками.
 */

const CATEGORY_ICON: Record<FeatureCategory, typeof Users> = {
  core: Users,
  sales: MapPin,
  design: Palette,
  ai: Sparkles,
  finance: Wallet,
  team: Banknote,
};

/** Тон розділу — лише для іконки, щоб рейка читалась із першого погляду. */
const CATEGORY_TONE: Record<FeatureCategory, string> = {
  core: "bg-primary/10 text-primary",
  sales: "bg-info-soft text-info-foreground",
  design: "bg-accent text-foreground",
  ai: "bg-primary/10 text-primary",
  finance: "bg-success-soft text-success-foreground",
  team: "bg-warning-soft text-warning-foreground",
};

type Props = {
  groups: FeatureGroup[];
  activeCategory: FeatureCategory | null;
  onPick: (category: FeatureCategory) => void;
  triedCount: number;
  totalCount: number;
};

export function FeatureRail({ groups, activeCategory, onPick, triedCount, totalCount }: Props) {
  const percent = totalCount > 0 ? Math.round((triedCount / totalCount) * 100) : 0;

  return (
    <nav aria-label="Розділи можливостей" className="grid content-start gap-0.5">
      {totalCount > 0 ? (
        <div className="mb-2 flex items-center gap-3 px-1.5 pb-3">
          <ProgressRing percent={percent} label={`${triedCount}/${totalCount}`} />
          <p className="text-xs leading-5 text-muted-foreground">
            спробовано
            <br />
            {triedCount} із {totalCount}
          </p>
        </div>
      ) : null}

      <p className="px-2.5 pb-1.5 font-mono text-3xs uppercase tracking-widest text-muted-foreground">
        Розділи
      </p>

      {groups.map((group) => {
        const Icon = CATEGORY_ICON[group.category];
        const active = activeCategory === group.category;
        return (
          <button
            key={group.category}
            type="button"
            onClick={() => onPick(group.category)}
            aria-current={active ? "true" : undefined}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors",
              active
                ? "bg-secondary font-medium text-foreground"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground"
            )}
          >
            <span
              className={cn(
                "grid h-6 w-6 shrink-0 place-items-center rounded-md",
                CATEGORY_TONE[group.category]
              )}
            >
              <Icon className="h-3.5 w-3.5" />
            </span>
            <span className="min-w-0 flex-1 truncate">{group.label}</span>
            <span className="font-mono text-2xs tabular-nums opacity-70">
              {group.features.length}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

/**
 * Кільце прогресу на conic-gradient: без svg і без залежностей.
 * Тільки токени, тож у темній темі працює само собою.
 */
function ProgressRing({ percent, label }: { percent: number; label: string }) {
  return (
    <span
      className="grid h-12 w-12 shrink-0 place-items-center rounded-full"
      style={{
        background: `conic-gradient(hsl(var(--success-foreground)) ${percent}%, hsl(var(--muted)) 0)`,
      }}
      role="img"
      aria-label={`Спробовано ${label}`}
    >
      <span className="grid h-9 w-9 place-items-center rounded-full bg-background font-mono text-3xs font-semibold tabular-nums">
        {label}
      </span>
    </span>
  );
}
