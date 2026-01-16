import * as React from "react";
import { CalendarDays, Trophy, Pencil } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

export type MatchCardStatus = "scheduled" | "played" | "canceled";

export type MatchCardTeam = {
  name: string;
  logoUrl?: string | null;
};

export type MatchCardTournament = {
  name: string;
  shortName?: string | null;
  season?: string | null;
  leagueName?: string | null;
  logoUrl?: string | null;
};

export type MatchCardData = {
  id: string;
  date: string;
  status: MatchCardStatus;

  team: MatchCardTeam;
  opponent: MatchCardTeam;

  scoreTeam: number | null;
  scoreOpponent: number | null;

  tournament?: MatchCardTournament | null;
  matchday?: number | null;
  stage?: string | null;
};

type MatchOutcome = "win" | "loss" | "draw" | "none";

/**
 * UI Truth:
 * - canceled має пріоритет
 * - якщо є рахунок (обидва числа) => played
 * - інакше scheduled
 *
 * Так картка не “ламається”, якщо в БД забули змінити status.
 */
function getEffectiveStatus(data: MatchCardData): MatchCardStatus {
  if (data.status === "canceled") return "canceled";

  const hasScore =
    typeof data.scoreTeam === "number" && typeof data.scoreOpponent === "number";

  if (hasScore) return "played";

  return "scheduled";
}

function getOutcome(data: MatchCardData): MatchOutcome {
  const status = getEffectiveStatus(data);
  if (status !== "played") return "none";

  if (
    typeof data.scoreTeam !== "number" ||
    typeof data.scoreOpponent !== "number"
  )
    return "none";

  if (data.scoreTeam > data.scoreOpponent) return "win";
  if (data.scoreTeam < data.scoreOpponent) return "loss";
  return "draw";
}

function formatMatchDateTimeHuman(iso: string) {
  const d = new Date(iso);
  const now = new Date();

  const startOfDay = (x: Date) =>
    new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();

  const diffDays =
    (startOfDay(d) - startOfDay(now)) / (24 * 60 * 60 * 1000);

  let prefix: string;

  if (diffDays === 0) {
    prefix = "Сьогодні";
  } else if (diffDays === 1) {
    prefix = "Завтра";
  } else {
    prefix = new Intl.DateTimeFormat("uk-UA", {
      weekday: "short",
    })
      .format(d)
      .replace(".", "")
      .replace(/^./u, (c) => c.toUpperCase());
  }

  const date = new Intl.DateTimeFormat("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);

  const time = new Intl.DateTimeFormat("uk-UA", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);

  return `${prefix} • ${date} • ${time}`;
}

function getStatusText(data: MatchCardData): string {
  const status = getEffectiveStatus(data);

  if (status === "scheduled") return "ЗАПЛАНОВАНИЙ";
  if (status === "canceled") return "СКАСОВАНИЙ";

  const outcome = getOutcome(data);
  if (outcome === "win") return "ВИГРАЛИ";
  if (outcome === "loss") return "ПРОГРАЛИ";
  if (outcome === "draw") return "НІЧИЯ";

  return "Зіграний";
}

/**
 * Статусні бейджі:
 * — scheduled → info
 * — canceled → destructive
 * — win/loss/draw → semantic
 */
function statusBadgeToneByOutcome(data: MatchCardData):
  | "neutral"
  | "info"
  | "success"
  | "danger"
  | "destructive" {
  const status = getEffectiveStatus(data);

  if (status === "scheduled") return "info";
  if (status === "canceled") return "destructive";

  const outcome = getOutcome(data);
  if (outcome === "win") return "success";
  if (outcome === "loss") return "danger";
  if (outcome === "draw") return "neutral";

  return "neutral";
}

function formatTimeOnlyUA(iso: string) {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("uk-UA", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function startOfDayLocal(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function dayDiffLocal(a: Date, b: Date) {
  const ms = 24 * 60 * 60 * 1000;
  return Math.round(
    (startOfDayLocal(b).getTime() - startOfDayLocal(a).getTime()) / ms
  );
}

function getScheduledLabelUA(iso: string): string | null {
  const now = new Date();
  const match = new Date(iso);
  const diff = dayDiffLocal(now, match);

  if (diff < 0) return null;
  if (diff === 0) return "Сьогодні";
  if (diff === 1) return "Завтра";
  if (diff >= 2 && diff <= 6) {
    const wd = new Intl.DateTimeFormat("uk-UA", { weekday: "short" }).format(
      match
    );
    return wd.replace(".", "").replace(/^./u, (c) => c.toUpperCase());
  }
  return null;
}

function scheduledLabelClass(label: string) {
  if (label === "Сьогодні") return "text-primary font-semibold";
  if (label === "Завтра") return "text-primary/70 font-semibold";
  return "text-muted-foreground font-semibold";
}

function initials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("") || "T"
  );
}

function Logo({
  name,
  logoUrl,
  size = 60,
}: {
  name: string;
  logoUrl?: string | null;
  size?: number;
}) {
  return (
    <div
      className="grid place-items-center overflow-hidden rounded-full bg-muted ring-1 ring-border"
      style={{ width: size, height: size }}
      aria-label={name}
    >
      {logoUrl ? (
        <img
          src={logoUrl}
          alt={name}
          className="h-full w-full object-cover"
          loading="lazy"
        />
      ) : (
        <span className="text-xs font-bold text-muted-foreground">
          {initials(name)}
        </span>
      )}
    </div>
  );
}

function ScoreBox({
  a,
  b,
  status,
  date,
}: {
  a: number | null;
  b: number | null;
  status: MatchCardStatus;
  date: string;
}) {
  const hasScore = typeof a === "number" && typeof b === "number";

  if (status === "scheduled" && !hasScore) {
    const label = getScheduledLabelUA(date);
    const time = formatTimeOnlyUA(date);

    return (
      <div className="flex h-[64px] items-center justify-center">
        <div className="flex flex-col items-center leading-none">
          {label ? (
            <span
              className={cn(
                "text-[11px] uppercase tracking-wide",
                scheduledLabelClass(label)
              )}
            >
              {label}
            </span>
          ) : null}

          <span className="mt-0.5 text-xl sm:text-2xl font-semibold tabular-nums tracking-tight text-muted-foreground">
            {time}
          </span>
        </div>
      </div>
    );
  }

  const text = hasScore ? `${a}:${b}` : "—";

  return (
    <div className="flex h-[64px] items-center justify-center">
      <span className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
        {text}
      </span>
    </div>
  );
}

function LeagueMeta({
  leagueLabel,
  matchday,
  logoUrl,
}: {
  leagueLabel: string | null;
  matchday?: number | null;
  logoUrl?: string | null;
}) {
  if (!leagueLabel && typeof matchday !== "number") return null;

  const [logoFailed, setLogoFailed] = React.useState(false);
  const trimmedLogo = (logoUrl ?? "").trim();
  const showLogo = Boolean(trimmedLogo) && !logoFailed;

  React.useEffect(() => {
    setLogoFailed(false);
  }, [trimmedLogo]);

  return (
    <div className="flex max-w-[70%] items-center gap-2">
      <div className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full bg-muted/60 ring-1 ring-inset ring-border">
        {showLogo ? (
          <img
            src={trimmedLogo}
            alt={leagueLabel ?? "Ліга"}
            className="h-full w-full object-cover"
            loading="lazy"
            onError={() => setLogoFailed(true)}
          />
        ) : (
          <Trophy className="h-3.5 w-3.5 text-muted-foreground opacity-60" />
        )}
      </div>

      <span className="min-w-0 truncate text-[13px] font-semibold text-foreground">
        {leagueLabel}
        {typeof matchday === "number" ? (
          <span className="text-muted-foreground">{` • Тур ${matchday}`}</span>
        ) : null}
      </span>
    </div>
  );
}

export function MatchCard({ data }: { data: MatchCardData }) {
  const leagueLabel =
    data.tournament?.leagueName ||
    data.tournament?.shortName ||
    data.tournament?.name ||
    null;

  const effectiveStatus = getEffectiveStatus(data);

  return (
    <div
      className={cn(
        "group relative w-full overflow-hidden",
        "rounded-[var(--radius-section)] bg-card border border-border",
        "p-6 min-h-[240px]",
        "shadow-[var(--shadow-surface)]",
        "transition-all duration-200 ease-out",
        "cursor-pointer select-none",
        "hover:-translate-y-[1px] hover:shadow-[var(--shadow-floating)]",
        "active:translate-y-0 active:shadow-[var(--shadow-pressed)]"
      )}
    >
      {/* subtle overlay */}
      <div className="pointer-events-none absolute inset-0 rounded-[var(--radius-section)] bg-foreground/[0.02] opacity-0 transition-opacity duration-200 ease-out group-hover:opacity-100" />

      {/* hover pencil */}
      <Link
        to={`/matches/${data.id}/events`}
        aria-label="Редагувати події матчу"
        title="Редагувати події матчу"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
className={cn(
  "absolute bottom-4 right-4 z-10",
  "grid h-9 w-9 place-items-center",

  // базовий стан
  "rounded-[var(--radius-md)]",
  "bg-transparent",
  "text-muted-foreground",

  // показ тільки на hover картки
  "opacity-0 translate-y-1 pointer-events-none",
  "transition-all duration-200 ease-out",
  "group-hover:opacity-100 group-hover:translate-y-0 group-hover:pointer-events-auto",

  // hover саме на олівці
  "hover:bg-card/90 hover:border hover:border-border hover:rounded-[var(--radius-lg)]",
  "hover:text-foreground",

  // focus (keyboard)
  "focus:opacity-100 focus:pointer-events-auto",
  "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
)}



      >
        <Pencil className="h-4 w-4 text-muted-foreground" />
      </Link>

      <div className="relative">
        <div className="flex items-start justify-between gap-4">
          <LeagueMeta
            leagueLabel={leagueLabel}
            matchday={data.matchday ?? null}
            logoUrl={data.tournament?.logoUrl ?? null}
          />

          <Badge tone={statusBadgeToneByOutcome(data)} pill size="sm" className="shrink-0">
            {getStatusText(data)}
          </Badge>
        </div>

        <div className="mt-6 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-4 sm:gap-6">
          <div className="min-w-0 flex flex-col items-center">
            <Logo
              name={data.opponent.name}
              logoUrl={data.opponent.logoUrl}
              size={60}
            />
            <div className="mt-3 min-h-[44px] w-full max-w-[240px] text-center">
              <div
                className={cn(
                  "line-clamp-2 text-[15px] sm:text-base font-semibold leading-[1.15] tracking-tight text-foreground",
                  "break-words"
                )}
                title={data.opponent.name}
              >
                {data.opponent.name}
              </div>
            </div>
          </div>

          <div className="flex flex-col items-center">
            <ScoreBox
              a={data.scoreOpponent}
              b={data.scoreTeam}
              status={effectiveStatus}
              date={data.date}
            />
          </div>

          <div className="min-w-0 flex flex-col items-center">
            <Logo name={data.team.name} logoUrl={data.team.logoUrl} size={60} />
            <div className="mt-3 min-h-[44px] w-full max-w-[240px] text-center">
              <div
                className={cn(
                  "line-clamp-2 text-[15px] sm:text-base font-semibold leading-[1.15] tracking-tight text-foreground",
                  "break-words"
                )}
                title={data.team.name}
              >
                {data.team.name}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-center gap-2 text-sm font-semibold text-muted-foreground">
          <CalendarDays className="h-4 w-4" />
          <span>{formatMatchDateTimeHuman(data.date)}</span>
        </div>
      </div>
    </div>
  );
}

export function mapDbMatchToCardData(params: {
  match: any;
  teamName: string;
  teamLogo: string | null;
}): MatchCardData {
  const m = params.match;
  const t = Array.isArray(m.tournaments) ? m.tournaments[0] : m.tournaments;

  return {
    id: m.id,
    date: m.match_date,
    status: m.status as MatchCardStatus,

    team: { name: params.teamName, logoUrl: params.teamLogo },
    opponent: { name: m.opponent_name, logoUrl: m.opponent_logo_url ?? null },

    scoreTeam: m.score_team ?? null,
    scoreOpponent: m.score_opponent ?? null,

    tournament: t
      ? {
          name: t.name,
          shortName: t.short_name ?? null,
          season: t.season ?? null,
          leagueName: t.league_name ?? null,
          logoUrl: t.logo_url ?? null,
        }
      : null,

    matchday: m.matchday ?? null,
    stage: m.stage ?? null,
  };
}
