import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

import { AvatarBase } from "@/components/app/avatar-kit";
import { SplitBar } from "@/components/app/bento";
import { cn } from "@/lib/utils";

import type { OverviewAsideCard } from "./overviewModel";

/**
 * Бічна колонка: контекст, а не робота.
 *
 * Правило поділу просте — усе, що треба ЗРОБИТИ, живе в черзі; усе, на що
 * достатньо ГЛЯНУТИ, живе тут. Тому в картках немає жодної дії, крім переходу
 * в розділ, і жодного числа, яке вимагало б реакції прямо зараз.
 *
 * На вузькому екрані колонка стає звичайним рядом карток під чергою — саме
 * тому, що вона другорядна: гортати до неї нормально, а от черга мусить бути
 * першим, що видно.
 */

export type OverviewActivityRow = {
  id: string;
  title: string;
  actorName: string;
  avatarUrl: string | null;
  href: string;
  at: string;
};

const getInitials = (name?: string | null) => {
  const source = name?.trim() || "?";
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
  return source.slice(0, 2).toUpperCase();
};

function CardShell({
  title,
  hint,
  to,
  toLabel,
  children,
}: {
  title: string;
  hint: string;
  to?: string;
  toLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border/40 bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-2xs font-bold uppercase tracking-widest text-muted-foreground">{title}</h3>
          <p className="mt-0.5 text-2xs leading-snug text-muted-foreground/80">{hint}</p>
        </div>
        {to ? (
          <Link
            to={to}
            aria-label={toLabel ?? title}
            title={toLabel ?? title}
            className="mt-0.5 shrink-0 text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function FactsBody({ rows }: { rows: Array<{ key: string; label: string; value: string }> }) {
  if (rows.length === 0) {
    return <p className="mt-3 text-xs text-muted-foreground">Поки порожньо.</p>;
  }
  return (
    <div className="mt-2.5">
      {rows.map((row) => (
        <div
          key={row.key}
          className="flex items-baseline justify-between gap-3 border-t border-border/40 py-1.5 text-xs first:border-t-0"
        >
          <span className="min-w-0 truncate text-muted-foreground">{row.label}</span>
          <span className="figure shrink-0 font-medium text-foreground">{row.value}</span>
        </div>
      ))}
    </div>
  );
}

function ActivityBody({ rows }: { rows: OverviewActivityRow[] }) {
  if (rows.length === 0) {
    return <p className="mt-3 text-xs text-muted-foreground">Подій поки немає.</p>;
  }
  return (
    <div className="mt-2.5">
      {rows.map((row) => (
        <Link
          key={row.id}
          to={row.href}
          className="-mx-1.5 flex items-start gap-2 rounded-lg border-t border-border/40 px-1.5 py-2 transition-colors first:border-t-0 hover:bg-muted/40"
        >
          <AvatarBase src={row.avatarUrl} name={row.actorName} fallback={getInitials(row.actorName)} variant="sm" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-medium text-foreground">{row.title}</div>
            <div className="truncate text-2xs text-muted-foreground">
              {row.actorName} · {row.at}
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}

export function OverviewAside({
  cards,
  activity,
  className,
}: {
  cards: OverviewAsideCard[];
  activity: OverviewActivityRow[];
  className?: string;
}) {
  return (
    <div className={cn("grid grid-cols-1 gap-3.5", className)}>
      {cards.map((card) => {
        if (card.kind === "split") {
          return (
            <CardShell key={card.id} title={card.title} hint={card.hint} to={card.to} toLabel={card.toLabel}>
              {card.parts.length > 0 ? (
                <SplitBar parts={card.parts} className="mt-3.5" />
              ) : (
                <p className="mt-3 text-xs text-muted-foreground">Поки порожньо.</p>
              )}
            </CardShell>
          );
        }
        if (card.kind === "facts") {
          return (
            <CardShell key={card.id} title={card.title} hint={card.hint} to={card.to} toLabel={card.toLabel}>
              <FactsBody rows={card.rows} />
            </CardShell>
          );
        }
        return (
          <CardShell key={card.id} title={card.title} hint={card.hint} to="/activity" toLabel="Вся стрічка">
            <ActivityBody rows={activity} />
          </CardShell>
        );
      })}
    </div>
  );
}
