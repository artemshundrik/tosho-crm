import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyStateCard } from "@/components/ui/empty-state-card";
import { SkeletonCard } from "@/components/ui/skeleton-card";
import { NewMatchPrimarySplitCta } from "@/components/app/NewMatchPrimarySplitCta";
import { Link } from "react-router-dom";
import { RotateCw } from "lucide-react";

export type OperationalSummaryKpi = {
  key: string;
  label: string;
  value: string;
  unit?: string;
  hint?: string;
  secondaryValue?: string;
  headerRight?: React.ReactNode;
  footerCta?: {
    label: string;
    to?: string;
    onClick?: () => void;
  };
  icon?: React.ElementType;
  iconTone?: string;
  trend?: {
    value: string;
    direction?: "up" | "down" | "flat";
  };
};

export type OperationalSummaryAction = {
  label: string;
  to?: string;
  onClick?: () => void;
  variant?: "default" | "secondary" | "outline" | "ghost";
  iconLeft?: React.ElementType;
  iconRight?: React.ElementType;
  disabled?: boolean;
};

export type OperationalSummaryProps = {
  className?: string;

  title: string;
  subtitle?: string;

  /**
   * Якщо прокинеш — буде 100% контроль ззовні.
   * Якщо НЕ прокинеш — компонент сам зробить “розумний” skeleton на старті
   * і не покаже empty-state, поки не зачекає трохи (антифлікер).
   */
  nextUpLoading?: boolean;

  nextUp?: {
    eyebrow?: string;
    primary: string;
    secondary?: string;
    icon?: React.ElementType;
    to?: string;

    leagueLogoUrl?: string | null;
    avatars?: Array<{ name: string; src?: string | null }>;

    tournamentName?: string;
    leagueName?: string;
    tourLabel?: string;
  };

  primaryAction?: OperationalSummaryAction;
  secondaryAction?: OperationalSummaryAction;

  kpis?: OperationalSummaryKpi[];
  metaNote?: string;
  nextUpCtaLabel?: string;
  emptyState?: {
    badgeLabel?: string;
    title?: string;
    description?: string;
    actionLabel?: string;
  };
  hideNextUp?: boolean;
};

function ActionButton({ action }: { action: OperationalSummaryAction }) {
  const IconL = action.iconLeft;
  const IconR = action.iconRight;

  const variant = ((v?: OperationalSummaryAction["variant"]) => {
    switch (v) {
      case "default":
        return "primary";
      case "secondary":
        return "secondary";
      case "outline":
        return "secondary";
      case "ghost":
        return "ghost";
      default:
        return "secondary";
    }
  })(action.variant);

  const content = (
    <>
      {IconL ? <IconL className="h-4 w-4" /> : null}
      <span>{action.label}</span>
      {IconR ? <IconR className="h-4 w-4" /> : null}
    </>
  );

  if (action.to) {
    return (
      <Button asChild variant={variant} disabled={action.disabled} className="gap-2">
        <Link to={action.to}>{content}</Link>
      </Button>
    );
  }

  return (
    <Button type="button" variant={variant} disabled={action.disabled} onClick={action.onClick} className="gap-2">
      {content}
    </Button>
  );
}

function AvatarCircle({
  name,
  src,
  size = 24,
}: {
  name: string;
  src?: string | null;
  size?: number;
}) {
  const initials =
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("") || "T";

  return (
    <div
      className="grid place-items-center overflow-hidden rounded-full bg-muted ring-1 ring-border shrink-0"
      style={{ width: size, height: size }}
      aria-label={name}
      title={name}
    >
      {src ? (
        <img src={src} alt={name} className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <span className="text-[10px] font-bold text-muted-foreground">{initials}</span>
      )}
    </div>
  );
}

function KpiCard({ kpi }: { kpi: OperationalSummaryKpi }) {
  const Icon = kpi.icon;
  const showUnit = Boolean(kpi.unit && kpi.value !== "—");

  const trendTone =
    kpi.trend?.direction === "up"
      ? "bg-emerald-500/10 text-emerald-600"
      : kpi.trend?.direction === "down"
      ? "bg-rose-500/10 text-rose-600"
      : "bg-muted text-muted-foreground";

  if (kpi.key === "tournament") {
    return (
      <div className={cn("rounded-[var(--radius-inner)] border border-border bg-card/60", "px-4 py-3")}>
        <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
          {Icon ? (
            <span
              className={cn(
                "inline-flex h-8 w-8 items-center justify-center rounded-[12px] ring-1 ring-inset ring-muted-foreground/20",
                "bg-muted text-muted-foreground",
                kpi.iconTone
              )}
            >
              <Icon className="h-4 w-4" />
            </span>
          ) : null}
          <span className="truncate">{kpi.label}</span>
        </div>

        <div className="mt-2 flex items-baseline gap-2">
          <div className="text-[28px] font-bold tracking-tight tabular-nums text-foreground">{kpi.value}</div>
          <span className="text-[28px] font-bold text-muted-foreground">•</span>
          <div className="text-[28px] font-bold tracking-tight text-foreground">{kpi.secondaryValue ?? "—"}</div>
        </div>

        <div className="mt-2 flex items-center justify-between gap-3 text-xs font-medium text-muted-foreground">
          <div className="inline-flex items-center gap-1 leading-none">
            <RotateCw className="h-3 w-3" />
            <span>{kpi.hint ?? "—"}</span>
          </div>
          {kpi.footerCta ? (
            kpi.footerCta.to ? (
              <Link
                to={kpi.footerCta.to}
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/90 leading-none"
              >
                {kpi.footerCta.label}
                <span aria-hidden="true">→</span>
              </Link>
            ) : (
              <button
                type="button"
                onClick={kpi.footerCta.onClick}
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/90 leading-none"
              >
                {kpi.footerCta.label}
                <span aria-hidden="true">→</span>
              </button>
            )
          ) : null}
        </div>
      </div>
    );
  }

  const wdlParts =
    kpi.key === "wdl" ? kpi.value.split(/[–-]/).map((v) => v.trim()).filter(Boolean) : [];
  const wdlValues = wdlParts.length === 3 ? wdlParts : ["—", "—", "—"];
  const wdlColors = ["text-emerald-500 dark:text-emerald-400", "text-muted-foreground", "text-red-500 dark:text-red-400"];

  return (
    <div className={cn("rounded-[var(--radius-inner)] border border-border bg-card/60", "px-4 py-3")}>
      <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
        {Icon ? (
          <span
            className={cn(
              "inline-flex h-8 w-8 items-center justify-center rounded-[12px] ring-1 ring-inset ring-muted-foreground/20",
              "bg-muted text-muted-foreground",
              kpi.iconTone
            )}
          >
            <Icon className="h-4 w-4" />
          </span>
        ) : null}
        <span className="truncate">{kpi.label}</span>
      </div>

      {kpi.trend ? (
        <div className="mt-1 flex items-baseline justify-between gap-3">
          <div className="text-[28px] font-bold tracking-tight tabular-nums">
            {kpi.key === "streak" ? (
              kpi.value.split(" ").map((c, i) => (
                <span
                  key={i}
                  className={
                    c === "W"
                      ? "text-emerald-500 dark:text-emerald-400"
                      : c === "L"
                      ? "text-red-500 dark:text-red-400"
                      : "text-muted-foreground"
                  }
                >
                  {c}{" "}
                </span>
              ))
            ) : (
              <span className="text-foreground">
                {kpi.value}
                {showUnit ? (
                  <span className="ml-1 text-sm font-semibold text-muted-foreground">{kpi.unit}</span>
                ) : null}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-right">
            <span
              className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold", trendTone)}
            >
              {kpi.trend.value}
            </span>
            {kpi.hint ? (
              <span className="text-xs font-medium text-muted-foreground truncate max-w-[120px]">{kpi.hint}</span>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="mt-1">
          <div className="text-[28px] font-bold tracking-tight tabular-nums">
            {kpi.key === "streak" ? (
              kpi.value.split(" ").map((c, i) => (
                <span
                  key={i}
                  className={
                    c === "W"
                      ? "text-emerald-500 dark:text-emerald-400"
                      : c === "L"
                      ? "text-red-500 dark:text-red-400"
                      : "text-muted-foreground"
                  }
                >
                  {c}{" "}
                </span>
              ))
            ) : kpi.key === "wdl" ? (
              <span className="text-foreground">
                {wdlValues.map((val, i) => (
                  <span key={i} className={wdlColors[i]}>
                    {val}
                    {i < wdlValues.length - 1 ? <span className="text-muted-foreground">–</span> : null}
                  </span>
                ))}
              </span>
            ) : (
              <span className="text-foreground">
                {kpi.value}
                {showUnit ? (
                  <span className="ml-1 text-sm font-semibold text-muted-foreground">{kpi.unit}</span>
                ) : null}
              </span>
            )}
          </div>

          {kpi.hint ? (
            <div className="mt-2 text-xs font-medium text-muted-foreground">{kpi.hint}</div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function splitTeamsFromSecondary(secondary: string): { left: string; right: string } | null {
  const s = (secondary ?? "").trim();
  if (!s) return null;

  if (s.includes("—")) {
    const [left, right] = s.split("—").map((p) => p.trim());
    if (left && right) return { left, right };
  }
  if (s.includes("–")) {
    const [left, right] = s.split("–").map((p) => p.trim());
    if (left && right) return { left, right };
  }
  if (s.toLowerCase().includes(" vs ")) {
    const [left, right] = s.split(/ vs /i).map((p) => p.trim());
    if (left && right) return { left, right };
  }
  return null;
}

function parsePrimaryMeta(primary: string): { time: string; dateLine: string } {
  const s = (primary ?? "").trim();
  const timeMatch = s.match(/(\d{1,2}:\d{2})\s*$/);
  const time = timeMatch ? timeMatch[1] : s;
  const dateLine = timeMatch ? s.replace(/,?\s*\d{1,2}:\d{2}\s*$/, "").trim() : "";
  return { time, dateLine };
}

function leagueLabelFromEyebrow(eyebrow?: string) {
  const e = (eyebrow ?? "").trim();
  if (!e) return "";
  if (e.includes("·")) return e.split("·").slice(1).join("·").trim();
  return e;
}

function NextUpHero({
  clickable,
  to,
  time,
  dateLine,
  leagueLogoUrl,
  tournamentName,
  leagueName,
  tourLabel,
  teams,
  avatars,
  detailLine,
  ctaLabel,
}: {
  clickable: boolean;
  to?: string;
  time: string;
  dateLine: string;

  leagueLogoUrl: string | null;
  tournamentName: string;
  leagueName: string;
  tourLabel: string;

  teams: { left: string; right: string } | null;
  avatars: Array<{ name: string; src?: string | null }>;
  detailLine?: string;
  ctaLabel: string;
}) {
  const Container: React.ElementType = clickable && to ? Link : "div";
  const containerProps = clickable && to ? { to } : {};
  const percentValue = (() => {
    const match = time.match(/^(\d+(?:[.,]\d+)?)%$/);
    if (!match) return null;
    const raw = Number(match[1].replace(",", "."));
    if (!Number.isFinite(raw)) return null;
    return Math.max(0, Math.min(100, raw));
  })();
  const showPercentBar = percentValue !== null;

  return (
    <Container
      {...containerProps}
      className={cn(
        "group block",
        "rounded-[var(--radius-inner)] border border-border",
        "bg-gradient-to-b from-card to-card/60",
        "px-6 py-6 sm:px-8 sm:py-7",
        "transition-shadow duration-200 ease-out",
        clickable && "hover:shadow-[var(--shadow-floating)]"
      )}
    >
      {/* CONTEXT */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm sm:text-base font-semibold text-muted-foreground">
        <div className="flex min-w-0 items-center gap-2">
          {leagueLogoUrl ? (
            <div className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full bg-muted/60 ring-1 ring-inset ring-border sm:h-7 sm:w-7">
              <img src={leagueLogoUrl} alt="" className="h-full w-full object-cover" />
            </div>
          ) : null}
          <span className="truncate">{tournamentName}</span>
        </div>
        {tourLabel ? (
          <span className="rounded-full border border-border bg-muted/50 px-3 py-1 text-xs font-semibold text-foreground/80">
            {tourLabel}
          </span>
        ) : null}
      </div>

      {/* TEAMS */}
      {teams ? (
        <div className="mt-6 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-4 sm:gap-10">
          {/* LEFT */}
          <div className="flex items-center justify-end gap-3 text-right min-w-0">
            <div className="text-[13px] sm:text-xl font-bold text-foreground leading-tight break-words whitespace-normal">
              {teams.left}
            </div>
            <AvatarCircle name={avatars[0]?.name ?? teams.left} src={avatars[0]?.src} size={64} />
          </div>

          {/* TIME */}
          <div className="flex flex-col items-center justify-center">
            <div className="text-3xl sm:text-4xl font-black tracking-tight tabular-nums text-foreground">{time}</div>
            <div className="mt-1 text-xs font-medium text-muted-foreground">{dateLine}</div>
          </div>

          {/* RIGHT */}
          <div className="flex items-center justify-start gap-3 text-left min-w-0">
            <AvatarCircle name={avatars[1]?.name ?? teams.right} src={avatars[1]?.src} size={64} />
            <div className="text-[13px] sm:text-xl font-bold text-foreground leading-tight break-words whitespace-normal">
              {teams.right}
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-5 grid gap-4 md:grid-cols-[1.1fr_1fr] md:items-center">
          <div className="flex flex-col gap-2">
            <div className="text-3xl sm:text-4xl font-black tracking-tight tabular-nums text-foreground">
              {time}
            </div>
            {dateLine ? (
              <div className="text-sm font-medium text-muted-foreground">{dateLine}</div>
            ) : showPercentBar ? (
              <div className="text-sm font-medium text-muted-foreground">Середній показник</div>
            ) : null}
            {showPercentBar ? (
              <div className="mt-1 h-2.5 w-full rounded-full bg-muted/50 overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${percentValue}%` }}
                />
              </div>
            ) : null}
          </div>
          {detailLine || avatars.length > 0 ? (
            <div className="rounded-[22px] border border-border/70 bg-muted/30 p-4">
              {detailLine ? (
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {detailLine}
                </div>
              ) : null}
              {avatars.length > 0 ? (
                <div className="mt-2 flex items-center -space-x-2">
                  {avatars.slice(0, 6).map((a, idx) => (
                    <div key={`${a.name}-${idx}`} className="rounded-full ring-2 ring-background">
                      <AvatarCircle name={a.name} src={a.src} size={36} />
                    </div>
                  ))}
                  {avatars.length > 6 ? (
                    <div className="ml-1 flex h-9 min-w-9 items-center justify-center rounded-full border border-border bg-background text-[10px] font-semibold text-muted-foreground">
                      +{avatars.length - 6}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      )}

      {/* CTA */}
      {clickable ? (
        <div className="mt-5 text-center">
          <span className="inline-flex items-center gap-2 text-sm sm:text-base font-semibold text-primary">
            {ctaLabel}
            <span aria-hidden className="inline-block transition-transform duration-200 group-hover:translate-x-0.5">
              →
            </span>
          </span>
        </div>
      ) : null}
    </Container>
  );
}

export function OperationalSummary(props: OperationalSummaryProps) {
  const nextUpClickable = Boolean(props.nextUp?.to);

  const eyebrow = props.nextUp?.eyebrow?.trim();
  const leagueLogoUrl = props.nextUp?.leagueLogoUrl ?? null;
  const avatars = props.nextUp?.avatars ?? [];

  const parsedTeams = props.nextUp?.secondary ? splitTeamsFromSecondary(props.nextUp.secondary) : null;

  const nextMeta = props.nextUp ? parsePrimaryMeta(props.nextUp.primary) : { time: "", dateLine: "" };
  const nextDateLine =
    nextMeta.dateLine || (props.nextUp && nextMeta.time !== props.nextUp.primary ? props.nextUp.primary : "");

  const leagueLabelFallback = leagueLabelFromEyebrow(eyebrow);
  const tournamentName = props.nextUp?.tournamentName ?? leagueLabelFallback ?? "Турнір";
  const leagueName = props.nextUp?.leagueName ?? leagueLabelFallback ?? "Ліга";
  const tourLabel = props.nextUp?.tourLabel ?? "";
  const ctaLabel = props.nextUpCtaLabel ?? "Перейти до матчу";
  const detailLine = props.nextUp?.secondary?.trim() ?? "";

  const MIN_SKELETON_MS = 350;
  const EMPTY_DELAY_MS = 600;

  const externalLoading = props.nextUpLoading;
  const hasNextUp = Boolean(props.nextUp);

  const [phase, setPhase] = React.useState<"skeleton" | "content" | "empty">(() => {
    if (externalLoading === true) return "skeleton";
    if (hasNextUp) return "content";
    return "skeleton";
  });

  const timersRef = React.useRef<number[]>([]);
  const clearTimers = React.useCallback(() => {
    timersRef.current.forEach((t) => window.clearTimeout(t));
    timersRef.current = [];
  }, []);

  React.useEffect(() => {
    clearTimers();

    if (props.nextUpLoading !== undefined) {
      setPhase(props.nextUpLoading ? "skeleton" : hasNextUp ? "content" : "empty");
      return;
    }

    if (hasNextUp) {
      setPhase("content");
      return;
    }

    setPhase("skeleton");

    const t1 = window.setTimeout(() => {
      /* min skeleton */
    }, MIN_SKELETON_MS);

    const t2 = window.setTimeout(() => {
      if (!hasNextUp) setPhase("empty");
    }, Math.max(MIN_SKELETON_MS, EMPTY_DELAY_MS));

    timersRef.current.push(t1, t2);

    return clearTimers;
  }, [props.nextUpLoading, hasNextUp, clearTimers]);

  // ✅ split-режим включаємо для кнопки "Новий матч" / "+ Додати матч"
  const isNewMatchPrimary = React.useMemo(() => {
    const l = (props.primaryAction?.label ?? "").trim().toLowerCase();
    if (!l) return false;
    return l.includes("новий матч") || l.includes("додати матч");
  }, [props.primaryAction?.label]);

  // базовий маршрут для створення (беремо з primaryAction.to якщо є)
  const baseCreateTo = React.useMemo(() => {
    const raw = (props.primaryAction?.to ?? "/matches/new").trim();
    const base = raw.split("?")[0] || "/matches/new";
    return base;
  }, [props.primaryAction?.to]);

  return (
    <section className={cn("rounded-[var(--radius-section)] border border-border bg-card", "p-6", props.className)}>
      {/* Top row */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">{props.title}</h2>
          {props.subtitle ? <p className="mt-1 text-sm text-muted-foreground">{props.subtitle}</p> : null}
        </div>

        {(props.primaryAction || props.secondaryAction) ? (
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            {props.secondaryAction ? <ActionButton action={props.secondaryAction} /> : null}

            {props.primaryAction ? (
              isNewMatchPrimary ? (
                <NewMatchPrimarySplitCta baseTo={baseCreateTo} />
              ) : (
                // звичайна кнопка для інших випадків
                <ActionButton
                  action={{
                    ...props.primaryAction,
                    variant: props.primaryAction.variant ?? "default",
                  }}
                />
              )
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Next up: skeleton → content → empty */}
      {props.hideNextUp ? null : (
        <div className="mt-5">
          {phase === "skeleton" ? (
            <SkeletonCard variant="nextUp" />
          ) : phase === "content" && props.nextUp ? (
            <NextUpHero
              clickable={nextUpClickable}
              to={props.nextUp.to}
              time={nextMeta.time}
              dateLine={nextDateLine}
              leagueLogoUrl={leagueLogoUrl}
              tournamentName={tournamentName}
              leagueName={leagueName}
              tourLabel={tourLabel}
              teams={parsedTeams}
              avatars={avatars}
              detailLine={detailLine || undefined}
              ctaLabel={ctaLabel}
            />
          ) : (
            <EmptyStateCard
              badgeLabel={props.emptyState?.badgeLabel ?? "НАСТУПНИЙ МАТЧ"}
              tone="neutral"
              title={props.emptyState?.title ?? "Немає запланованого матчу"}
              description={props.emptyState?.description ?? "Додай новий матч, щоб команда бачила час, суперника і турнір."}
              actionLabel={props.emptyState?.actionLabel ?? props.primaryAction?.label ?? "+ Додати матч"}
              actionTo={props.primaryAction?.to}
              onAction={props.primaryAction?.onClick}
            />
          )}
        </div>
      )}

      {/* KPI row */}
      {props.kpis && props.kpis.length > 0 ? (
        <div
          className={cn(
            "mt-6 grid grid-cols-1 gap-3",
            props.kpis.length <= 1
              ? "sm:grid-cols-1"
              : props.kpis.length === 2
              ? "sm:grid-cols-2"
              : props.kpis.length === 3
              ? "sm:grid-cols-3"
              : "sm:grid-cols-2 lg:grid-cols-4"
          )}
        >
          {props.kpis.map((k) => (
            <KpiCard key={k.key} kpi={k} />
          ))}
        </div>
      ) : null}

      {/* Meta note */}
      {props.metaNote ? (
        <div className="mt-4 flex items-center justify-end">
          <Badge variant="outline" className="text-xs text-muted-foreground">
            {props.metaNote}
          </Badge>
        </div>
      ) : null}
    </section>
  );
}
