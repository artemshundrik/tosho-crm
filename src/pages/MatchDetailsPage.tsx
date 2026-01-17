// src/pages/MatchDetailsPage.tsx
import * as React from "react";

import { supabase } from "../lib/supabaseClient";

import { cn } from "@/lib/utils";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";


import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { DetailSkeleton } from "@/components/app/page-skeleton-templates";
import { logActivity } from "@/lib/activityLogger";
import { usePageData } from "@/hooks/usePageData";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { TableHeaderCell, TableNumericCell } from "@/components/app/table-kit";
import { AvatarBase, PlayerAvatar as PlayerAvatarBase } from "@/components/app/avatar-kit";
import { Image as ImageIcon } from "lucide-react";

import { AppDropdown } from "@/components/app/AppDropdown";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { MatchStatusBadge } from "@/components/app/MatchStatusBadge";

import {
  AlertTriangle,
  Calendar,
  Users,
  Trophy,
  Activity,
  Star,
  ListChecks,
  Pencil,
  Trash2,
  CheckCircle2,
  X,
  ArrowLeft,
  MoreVertical,
} from "lucide-react";

type MatchStatus = "scheduled" | "played" | "canceled";

type Tournament = {
  id: string;
  name: string;
  short_name: string | null;
  season: string | null;
  logo_url: string | null;
  league_name?: string | null;
};

type TeamTournamentRow = {
  tournament_id: string;
  is_primary: boolean | null;
  tournaments: Tournament | Tournament[] | null;
};

type Match = {
  id: string;
  opponent_name: string;
  opponent_logo_url?: string | null;
  match_date: string;
  status: MatchStatus;
  home_away: "home" | "away" | "neutral";
  score_team: number | null;
  score_opponent: number | null;
  team_id: string;
  tournament_id: string | null;
  stage: string | null;
  matchday: number | null;
  tournaments?: Tournament | Tournament[] | null;
};


type Player = {
  id: string;
  first_name: string;
  last_name: string;
  shirt_number: number | null;
  photo_url: string | null;
  position: string | null;
  status?: string | null; // 👈 Додаємо це
};

type EventType =
  | "goal"
  | "own_goal"
  | "penalty_scored"
  | "penalty_missed"
  | "yellow_card"
  | "red_card"
  | "two_minutes"
  | "goalkeeper_save";

type MatchTab = "overview" | "attendance" | "events";

type MatchEvent = {
  id: string;
  match_id: string;
  team_id: string;
  player_id: string | null;
  assist_player_id: string | null;
  event_type: EventType;
  minute: number | null;
  created_at: string | null;
};

type AttendanceRow = {
  player_id: string;
};

type MatchDraft = {
  opponent_name: string;
  opponent_logo_url: string;
  match_date_local: string;
  home_away: "home" | "away" | "neutral";
  status: MatchStatus;
  score_opponent: string;
  tournament_id: string;
  matchday: string;
  stage: string;
};

type MatchDetailsCache = {
  match: Match | null;
  events: MatchEvent[];
  players: Player[];
  teamLogo: string | null;
  tournamentsList: Tournament[];
  attendance: AttendanceRow[];
  attendanceLoaded: boolean;
  draft: MatchDraft;
};

const TEAM_NAME = "FAYNA TEAM";

const eventLabels: Record<EventType, string> = {
  goal: "Гол",
  own_goal: "Автогол",
  penalty_scored: "Пенальті (забито)",
  penalty_missed: "Пенальті (не забито)",
  yellow_card: "Жовта картка",
  red_card: "Червона картка",
  two_minutes: "2 хвилини",
  goalkeeper_save: "Сейв воротаря",
};



function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function isoToLocalInputValue(iso: string) {
  try {
    const d = new Date(iso);
    const yyyy = d.getFullYear();
    const mm = pad2(d.getMonth() + 1);
    const dd = pad2(d.getDate());
    const hh = pad2(d.getHours());
    const mi = pad2(d.getMinutes());
    return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
  } catch {
    return "";
  }
}

function toDatetimeLocalValue(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(
    d.getMinutes()
  )}`;
}

function formatHuman(d: Date) {
  return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()} • ${pad2(d.getHours())}:${pad2(
    d.getMinutes()
  )}`;
}

function tournamentLogoAndName(t?: Tournament | null) {
  if (!t) return null;
  const logo = normalizeLogoUrl(t.logo_url ?? null);
  const name = (t.short_name || t.name || "").trim() || "Турнір";
  return { logo, name };
}

function normalizeText(s: string) {
  return s
    .trim()
    .toLowerCase()
    .replace(/[,\u00A0]/g, " ")
    .replace(/\s+/g, " ");
}

function parseTimeToken(token: string): { h: number; m: number } | null {
  const t = token.trim();

  const m1 = t.match(/^(\d{1,2})[:.-](\d{1,2})$/);
  if (m1) {
    const h = Number(m1[1]);
    const m = Number(m1[2]);
    if (!Number.isInteger(h) || !Number.isInteger(m)) return null;
    if (h < 0 || h > 23) return null;
    if (m < 0 || m > 59) return null;
    return { h, m };
  }

  const m2 = t.match(/^(\d{3,4})$/);
  if (m2) {
    const raw = m2[1];
    const h = Number(raw.slice(0, raw.length - 2));
    const m = Number(raw.slice(-2));
    if (!Number.isInteger(h) || !Number.isInteger(m)) return null;
    if (h < 0 || h > 23) return null;
    if (m < 0 || m > 59) return null;
    return { h, m };
  }

  return null;
}

const MONTHS: Record<string, number> = {
  "січ": 1,
  "січня": 1,
  "лют": 2,
  "лютого": 2,
  "бер": 3,
  "березня": 3,
  "кві": 4,
  "квітня": 4,
  "тра": 5,
  "травня": 5,
  "чер": 6,
  "червня": 6,
  "лип": 7,
  "липня": 7,
  "сер": 8,
  "серпня": 8,
  "вер": 9,
  "вересня": 9,
  "жов": 10,
  "жовтня": 10,
  "лис": 11,
  "листопада": 11,
  "гру": 12,
  "грудня": 12,
  // ru
  "янв": 1,
  "января": 1,
  "фев": 2,
  "февраля": 2,
  "мар": 3,
  "марта": 3,
  "апр": 4,
  "апреля": 4,
  "май": 5,
  "мая": 5,
  "июн": 6,
  "июня": 6,
  "июл": 7,
  "июля": 7,
  "авг": 8,
  "августа": 8,
  "сен": 9,
  "сент": 9,
  "сентября": 9,
  "окт": 10,
  "октября": 10,
  "ноя": 11,
  "ноября": 11,
  "дек": 12,
  "декабря": 12,
};

const WEEKDAYS: Record<string, number> = {
  // JS: 0=Sun
  "пн": 1,
  "пон": 1,
  "понеділок": 1,
  "понеділка": 1,
  "вт": 2,
  "вів": 2,
  "вівторок": 2,
  "вівторка": 2,
  "ср": 3,
  "сер": 3,
  "середа": 3,
  "середи": 3,
  "чт": 4,
  "чет": 4,
  "четвер": 4,
  "четверга": 4,
  "пт": 5,
  "пят": 5,
  "пʼятниця": 5,
  "п'ятниця": 5,
  "пятница": 5,
  "сб": 6,
  "суб": 6,
  "субота": 6,
  "суббота": 6,
  "нд": 0,
  "нед": 0,
  "неділя": 0,
  "вс": 0,
  "воск": 0,
  "воскресенье": 0,
};

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function nextWeekdayDate(targetDow: number, now = new Date()) {
  const today = startOfDay(now);
  const current = today.getDay();
  const delta = (targetDow - current + 7) % 7;
  const res = new Date(today);
  res.setDate(res.getDate() + delta);
  return res;
}

function parseSmartDateTime(input: string, now = new Date()): { date: Date; confidence: "high" | "medium" } | null {
  const raw = normalizeText(input);
  if (!raw) return null;

  const tokens = raw.split(" ");

  let time: { h: number; m: number } | null = null;
  for (let i = 0; i < tokens.length; i++) {
    const t = parseTimeToken(tokens[i]);
    if (t) {
      time = t;
      break;
    }
    if (i + 1 < tokens.length && /^\d{1,2}$/.test(tokens[i]) && /^\d{1,2}$/.test(tokens[i + 1])) {
      const h = Number(tokens[i]);
      const m = Number(tokens[i + 1]);
      if (Number.isInteger(h) && Number.isInteger(m) && h >= 0 && h <= 23 && m >= 0 && m <= 59) {
        time = { h, m };
        break;
      }
    }
  }
  if (!time) return null;

  // weekday + time: "сб 14:50"
  {
    const wdToken = tokens[0];
    const key = wdToken ? wdToken.replace(".", "") : "";
    const dow = WEEKDAYS[key] ?? WEEKDAYS[key.slice(0, 3)];
    if (typeof dow === "number") {
      const base = nextWeekdayDate(dow, now);
      base.setHours(time.h, time.m, 0, 0);
      if (!Number.isNaN(base.getTime())) return { date: base, confidence: "medium" };
    }
  }

  // relative
  if (
    raw.startsWith("сьогодні") ||
    raw.startsWith("сегодня") ||
    raw.startsWith("вчора") ||
    raw.startsWith("вчера") ||
    raw.startsWith("завтра")
  ) {
    const base = new Date(now);
    if (raw.startsWith("вчора") || raw.startsWith("вчера")) base.setDate(base.getDate() - 1);
    if (raw.startsWith("завтра")) base.setDate(base.getDate() + 1);
    base.setHours(time.h, time.m, 0, 0);
    if (!Number.isNaN(base.getTime())) return { date: base, confidence: "medium" };
  }

  // DD.MM[.YYYY]
  const dmy = raw.match(/(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2,4}))?/);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    let year = dmy[3] ? Number(dmy[3]) : now.getFullYear();
    if (dmy[3] && dmy[3].length === 2) year = 2000 + year;

    if (Number.isInteger(day) && Number.isInteger(month) && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const d = new Date(year, month - 1, day, time.h, time.m, 0, 0);
      if (!Number.isNaN(d.getTime())) return { date: d, confidence: dmy[3] ? "high" : "medium" };
    }
  }

  // "27 вер 14:40" (+ optional year)
  for (let i = 0; i < tokens.length; i++) {
    const dayNum = Number(tokens[i]);
    if (!Number.isInteger(dayNum) || dayNum < 1 || dayNum > 31) continue;

    const monthToken = tokens[i + 1];
    if (!monthToken) continue;

    const mt = monthToken.replace(".", "");
    const month = MONTHS[mt] ?? MONTHS[mt.slice(0, 3)];
    if (!month) continue;

    let year = now.getFullYear();
    const yearToken = tokens[i + 2];
    if (yearToken && /^\d{2,4}$/.test(yearToken)) {
      let y = Number(yearToken);
      if (yearToken.length === 2) y = 2000 + y;
      if (y >= 2000 && y <= 2100) year = y;
    }

    const d = new Date(year, month - 1, dayNum, time.h, time.m, 0, 0);
    if (!Number.isNaN(d.getTime())) return { date: d, confidence: yearToken ? "high" : "medium" };
  }

  return null;
}

function formatDateTimeUA(iso: string) {
  const d = new Date(iso);
  const date = new Intl.DateTimeFormat("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
  const time = new Intl.DateTimeFormat("uk-UA", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
  return `${date} • ${time}`;
}

function safeDateTimeUA(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    return formatDateTimeUA(iso);
  } catch {
    return "—";
  }
}
function formatTimeOnly(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat("uk-UA", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  } catch {
    return "—";
  }
}

function formatPlayerLabel(p?: Player | null) {
  if (!p) return "—";
  const num = p.shirt_number !== null && p.shirt_number !== undefined ? `№${p.shirt_number} ` : "";
  return `${num}${p.last_name} ${p.first_name}`.trim();
}

function normalizeLogoUrl(url?: string | null) {
  if (!url) return null;
  const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/+$/, "");
  if (!supabaseUrl) return url;
  const looksRelative = url.startsWith("/") || !/^https?:\/\//i.test(url);
  return looksRelative ? `${supabaseUrl}/${url.replace(/^\/+/, "")}` : url;
}

const TEAM_LOGO_FALLBACK = normalizeLogoUrl(import.meta.env.VITE_TEAM_LOGO_URL as string | undefined);

function sortEventsStable(a: MatchEvent, b: MatchEvent) {
  const am = a.minute;
  const bm = b.minute;

  const aHas = typeof am === "number";
  const bHas = typeof bm === "number";

  if (aHas && bHas) {
    if (am! !== bm!) return am! - bm!;
  } else if (aHas && !bHas) {
    return -1;
  } else if (!aHas && bHas) {
    return 1;
  }

  const ac = a.created_at ? new Date(a.created_at).getTime() : Number.POSITIVE_INFINITY;
  const bc = b.created_at ? new Date(b.created_at).getTime() : Number.POSITIVE_INFINITY;

  if (ac !== bc) return ac - bc;
  return a.id.localeCompare(b.id);
}


function eventPillClasses(type: EventType) {
  switch (type) {
    case "goal":
    case "penalty_scored":
      return "bg-primary/10 border-primary/20";
    case "own_goal":
    case "penalty_missed":
      return "bg-destructive/10 border-destructive/20";
    case "yellow_card":
      return "bg-yellow-500/15 border-yellow-500/25";
    case "red_card":
      return "bg-red-500/15 border-red-500/25";
    default:
      return "bg-muted/40 border-border";
  }
}

function eventIcon(type: EventType) {
  if (type === "goal" || type === "penalty_scored") {
    return <span className="inline-flex h-4 w-4 items-center justify-center text-[14px] leading-none">⚽</span>;
  }
  if (type === "yellow_card") {
    return <span className="inline-flex h-4 w-4 items-center justify-center text-[14px] leading-none">🟨</span>;
  }
  if (type === "red_card") {
    return <span className="inline-flex h-4 w-4 items-center justify-center text-[14px] leading-none">🟥</span>;
  }
  if (type === "goalkeeper_save") {
    return <span className="inline-flex h-4 w-4 items-center justify-center text-[14px] leading-none">🧤</span>;
  }
  if (type === "two_minutes") {
    return <span className="inline-flex h-4 w-4 items-center justify-center text-[14px] leading-none">⏱️</span>;
  }
  return <span className="inline-flex h-4 w-4 items-center justify-center text-[14px] leading-none">🏁</span>;
}

function PlayerAvatar({ player, size = 36, isOldMatch = false }: { player: Player; size?: number; isOldMatch?: boolean }) {
  const initials =
    (player.first_name?.[0] || "") + (player.last_name?.[0] || "");
  const initialsLabel = initials.toUpperCase() || "•";
  
  // Якщо матч старий, ми ігноруємо поточну травму для візуальних ефектів
  const showInjuryStyle = !isOldMatch && (player.status === 'injured' || player.status === 'sick' || player.status === 'away');

  return (
    <div className="relative shrink-0">
      <PlayerAvatarBase
        src={player.photo_url}
        name={`${player.first_name ?? ""} ${player.last_name ?? ""}`.trim()}
        fallback={initialsLabel}
        size={size}
        referrerPolicy="no-referrer"
        className={cn(showInjuryStyle && "opacity-60 grayscale-[0.5]")}
      />
      {/* 🔴 Пульсуючий індикатор лише для нових матчів */}
      {!isOldMatch && player.status && player.status !== 'active' && (
        <div className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-background bg-destructive animate-pulse" />
      )}
    </div>
  );
}

function toNonNegIntOrNull(v: string) {
  const t = v.trim();
  if (!t) {
    return { value: null, invalid: false };
  }

  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) {
    return { value: null, invalid: true };
  }

  return { value: Math.floor(n), invalid: false };
}

function isGoalkeeper(p: Player) {
  return String(p.position || "").trim().toUpperCase() === "GK";
}

function roleLabel(p: Player) {
  return isGoalkeeper(p) ? "🧤 Воротар" : "Універсал";
}




const FormSection = React.memo(function FormSection({
  title,
  subtitle,
  className,
  children,
}: {
  title: string;
  subtitle?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("rounded-[var(--radius-inner)] border border-border bg-card/60 p-4", className)}>
      <div className="mb-3">
        <div className="text-sm font-semibold text-foreground">{title}</div>
        {subtitle ? <div className="mt-0.5 text-xs text-muted-foreground">{subtitle}</div> : null}
      </div>
      <div className="grid gap-3">{children}</div>
    </div>
  );
});
function TeamAvatar({
  name,
  logoUrl,
  size = 48,
}: {
  name: string;
  logoUrl?: string | null;
  size?: number;
}) {
  return (
    <AvatarBase
      src={logoUrl}
      name={name}
      size={size}
      shape="circle"
      className="shrink-0"
      imageClassName="object-cover"
      referrerPolicy="no-referrer"
    />
  );
}


export function MatchDetailsPage() {
  const navigate = useNavigate();

  const { matchId } = useParams<{ matchId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();

  const tabParam = searchParams.get("tab");
  const isTab = (tab: string | null): tab is MatchTab =>
    tab === "overview" || tab === "attendance" || tab === "events";

  const initialTab: MatchTab = isTab(tabParam) ? tabParam : "overview";

  const [activeTab, setActiveTab] = React.useState<MatchTab>(initialTab);

  React.useEffect(() => {
    setActiveTab(initialTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabParam]);

  const cacheKey = matchId ? `match-details:${matchId}` : "match-details:unknown";
  const {
    data,
    showSkeleton,
    error,
    refetch,
    clearCache,
  } = usePageData<MatchDetailsCache>({
    cacheKey,
    loadFn: async () => {
      if (!matchId) {
        throw new Error("Не вказаний matchId");
      }

      let nextTournamentsList: Tournament[] = [];

      const { data: matchData, error: matchError } = await supabase
        .from("matches")
        .select(
          `
          id,
          opponent_name,
          opponent_logo_url, 
          match_date,
          status,
          home_away,
          score_team,
          score_opponent,
          team_id,
          tournament_id,
          stage,
          matchday,
          tournaments(
            id,
            name,
            short_name,
            season,
            logo_url,
            league_name
          )
        `
        )
        .eq("id", matchId)
        .single();

      if (matchError || !matchData) {
        throw new Error(matchError?.message || "Матч не знайдено");
      }

      const typedMatch = matchData as Match;

      const { data: ttData, error: ttErr } = await supabase
        .from("team_tournaments")
        .select(
          `
          tournament_id,
          is_primary,
          tournaments (
            id,
            name,
            short_name,
            season,
            logo_url,
            league_name
          )
        `
        )
        .eq("team_id", typedMatch.team_id);

      if (!ttErr) {
        const rows = (ttData || []) as TeamTournamentRow[];

        const list = rows
          .flatMap((r) => {
            const t = r.tournaments;
            if (!t) return [];
            return Array.isArray(t) ? t : [t];
          })
          .filter((t): t is Tournament => Boolean(t));

        const primary = rows.find((r) => r.is_primary)?.tournament_id || null;
        const unique = Array.from(new Map(list.map((t) => [t.id, t])).values());

        const sorted = unique.slice().sort((a, b) => {
          if (primary) {
            if (a.id === primary && b.id !== primary) return -1;
            if (b.id === primary && a.id !== primary) return 1;
          }
          const as = (a.season || "").trim();
          const bs = (b.season || "").trim();
          if (as !== bs) return bs.localeCompare(as);
          return (a.name || "").localeCompare(b.name || "");
        });

        nextTournamentsList = sorted;
      }

      const local = isoToLocalInputValue(typedMatch.match_date);

      const nextDraft: MatchDraft = {
        opponent_name: typedMatch.opponent_name || "",
        opponent_logo_url: typedMatch.opponent_logo_url ? String(typedMatch.opponent_logo_url) : "",
        match_date_local: local,
        home_away: typedMatch.home_away,
        status: typedMatch.status,
        score_opponent:
          typedMatch.score_opponent !== null && typedMatch.score_opponent !== undefined
            ? String(typedMatch.score_opponent)
            : "",
        tournament_id: typedMatch.tournament_id ?? "none",
        matchday: typeof typedMatch.matchday === "number" ? String(typedMatch.matchday) : "",
        stage: typedMatch.stage ?? "",
      };

      const [{ data: eventsData, error: eventsErr }, { data: attendanceData, error: attErr }] = await Promise.all([
        supabase
          .from("match_events")
          .select("id, match_id, team_id, player_id, assist_player_id, event_type, minute, created_at")
          .eq("match_id", matchId),
        supabase.from("match_attendance").select("player_id").eq("match_id", matchId),
      ]);

      let rosterSet: Set<string> | null = null;
      if (typedMatch.tournament_id) {
        const { data: rosterData, error: rosterErr } = await supabase
          .from("team_tournament_players")
          .select("player_id")
          .eq("team_id", typedMatch.team_id)
          .eq("tournament_id", typedMatch.tournament_id);

        if (!rosterErr) {
          const ids = (rosterData || [])
            .map((r: { player_id: string }) => r.player_id)
            .filter(Boolean);
          if (ids.length > 0) {
            rosterSet = new Set(ids);
          }
        }
      }

      const { data: playersData, error: playersErr } = await supabase
        .from("players")
        .select("id, first_name, last_name, shirt_number, photo_url, position, status")
        .eq("team_id", typedMatch.team_id)
        .neq("status", "inactive")
        .order("shirt_number", { ascending: true });

      const allPlayers = playersErr ? [] : ((playersData || []) as Player[]);
      const filteredPlayers = rosterSet ? allPlayers.filter((p) => rosterSet!.has(p.id)) : allPlayers;

      let teamLogoUrl: string | null = null;
      const { data: teamData } = await supabase
        .from("teams")
        .select("logo_url, club_id")
        .eq("id", typedMatch.team_id)
        .maybeSingle();

      if (teamData?.logo_url) {
        teamLogoUrl = normalizeLogoUrl(teamData.logo_url as string);
      } else if (teamData?.club_id) {
        const { data: clubData } = await supabase
          .from("clubs")
          .select("logo_url")
          .eq("id", teamData.club_id as string)
          .maybeSingle();
        if (clubData?.logo_url) {
          teamLogoUrl = normalizeLogoUrl(clubData.logo_url as string);
        }
      } else {
        const { data: clubRow } = await supabase.from("clubs").select("logo_url").limit(1).maybeSingle();
        if (clubRow?.logo_url) {
          teamLogoUrl = normalizeLogoUrl(clubRow.logo_url as string);
        }
      }

      return {
        match: typedMatch,
        events: eventsErr ? [] : ((eventsData || []) as MatchEvent[]).slice().sort(sortEventsStable),
        players: filteredPlayers,
        teamLogo: teamLogoUrl || TEAM_LOGO_FALLBACK || null,
        tournamentsList: nextTournamentsList,
        attendance: attErr ? [] : ((attendanceData || []) as AttendanceRow[]),
        attendanceLoaded: !attErr,
        draft: nextDraft,
      };
    },
  });

  const errorMessage = error?.message ?? null;

  const [match, setMatch] = React.useState<Match | null>(data?.match ?? null);
  const [events, setEvents] = React.useState<MatchEvent[]>(data?.events ?? []);
  const [players, setPlayers] = React.useState<Player[]>(data?.players ?? []);
  const [teamLogo, setTeamLogo] = React.useState<string | null>(data?.teamLogo ?? null);
  const sortedPlayers = React.useMemo(() => {
  return [...players].sort((a, b) => {
    const agk = isGoalkeeper(a);
    const bgk = isGoalkeeper(b);

    // GK на початок
    if (agk && !bgk) return -1;
    if (!agk && bgk) return 1;

    // далі — за номером
    return (a.shirt_number ?? 999) - (b.shirt_number ?? 999);
  });
}, [players]);

  const [attendance, setAttendance] = React.useState<AttendanceRow[]>(data?.attendance ?? []);
  const [attendanceLoaded, setAttendanceLoaded] = React.useState(data?.attendanceLoaded ?? false);

  const [attendanceSavingId, setAttendanceSavingId] = React.useState<string | null>(null);
  const [attendanceError, setAttendanceError] = React.useState<string | null>(null);
  const [rosterSyncing, setRosterSyncing] = React.useState(false);
  const rosterAutoAppliedRef = React.useRef<string | null>(null);

  const [editOpen, setEditOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);

  const [metaSaving, setMetaSaving] = React.useState(false);
  const [metaError, setMetaError] = React.useState<string | null>(null);
  const [metaSuccess, setMetaSuccess] = React.useState<string | null>(null);

  const [tournamentsList, setTournamentsList] = React.useState<Tournament[]>(data?.tournamentsList ?? []);

  const [smartDateInput, setSmartDateInput] = React.useState("");
  const [smartDateHint, setSmartDateHint] = React.useState<string | null>(null);
  const [smartDateError, setSmartDateError] = React.useState<string | null>(null);

  const [draft, setDraft] = React.useState<MatchDraft>(
    data?.draft ?? {
      opponent_name: "",
      opponent_logo_url: "",
      match_date_local: "",
      home_away: "home",
      status: "scheduled",
      score_opponent: "",
      tournament_id: "none",
      matchday: "",
      stage: "",
    }
  );

  const SECTION_BASE = cn(
    "rounded-[var(--radius-section)] border border-border bg-card",
    "shadow-none",
  );

  const CARD_BASE = SECTION_BASE;
  const CONTROL_BASE = cn(
    "shadow-none",
    "h-10 rounded-[var(--radius-lg)] bg-background",
    "border border-input",
    "text-foreground placeholder:text-muted-foreground",
    "transition-colors",
    "hover:border-foreground/20 hover:bg-muted/20",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:border-primary/40",
    "disabled:opacity-50 disabled:cursor-not-allowed",
    "[&>svg]:text-muted-foreground [&>svg]:opacity-100 [&>svg]:transition-colors",
    "hover:[&>svg]:text-foreground"
  );

  const prevMatchIdRef = React.useRef<string | undefined>(undefined);

  React.useEffect(() => {
    if (!matchId) return;
    if (prevMatchIdRef.current && prevMatchIdRef.current !== matchId) {
      clearCache();
      refetch();
    }
    prevMatchIdRef.current = matchId;
  }, [matchId, clearCache, refetch]);

  React.useEffect(() => {
    if (!data) return;
    setMatch(data.match);
    setEvents(data.events);
    setPlayers(data.players);
    setTeamLogo(data.teamLogo);
    setTournamentsList(data.tournamentsList);
    setAttendance(data.attendance);
    setAttendanceLoaded(data.attendanceLoaded);
    setDraft(data.draft);
  }, [data]);

  // коли відкрив діалог — підставимо “людську” дату в smart поле з draft
  React.useEffect(() => {
    if (!editOpen) return;

    setSmartDateHint(null);
    setSmartDateError(null);

    try {
      if (draft.match_date_local) {
        const d = new Date(draft.match_date_local);
        if (!Number.isNaN(d.getTime())) {
          setSmartDateInput(formatHuman(d));
        }
      }
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editOpen]);

  // smart parse
  React.useEffect(() => {
    if (!editOpen) return;

    if (!smartDateInput.trim()) {
      setSmartDateHint(null);
      setSmartDateError(null);
      return;
    }

    const handle = window.setTimeout(() => {
      const parsed = parseSmartDateTime(smartDateInput);
      if (!parsed) {
        setSmartDateHint(null);
        setSmartDateError("Не можу розпізнати. Приклад: 27.09 14:40 / 27 вер 14:40 / вчора 19:00 / сб 14:50");
        return;
      }

      setSmartDateError(null);
      setSmartDateHint(
        `Розпізнано: ${formatHuman(parsed.date)}${parsed.confidence === "medium" ? " (може потребувати уточнення)" : ""}`
      );

      const nextVal = toDatetimeLocalValue(parsed.date);
      setDraft((p) => (p.match_date_local === nextVal ? p : { ...p, match_date_local: nextVal }));
    }, 220);

    return () => window.clearTimeout(handle);
  }, [smartDateInput, editOpen]);

  const tournament = React.useMemo(() => {
    if (!match) return null;
    const t = Array.isArray(match.tournaments) ? match.tournaments[0] : match.tournaments;
    return t || null;
  }, [match]);

  const attendanceIds = React.useMemo(() => new Set(attendance.map((a) => a.player_id)), [attendance]);
  const isOldMatch = React.useMemo(() => {
    if (!match?.match_date) return false;
    const matchTime = new Date(match.match_date).getTime();
    if (Number.isNaN(matchTime)) return match?.status !== "scheduled";
    return matchTime < Date.now() || match?.status !== "scheduled";
  }, [match]);

  const playerById = React.useMemo(() => {
    const map = new Map<string, Player>();
    for (const p of players) map.set(p.id, p);
    return map;
  }, [players]);

  const toggleAttendance = React.useCallback(
    async (playerId: string) => {
      if (!match) return;

      setAttendanceError(null);
      setAttendanceSavingId(playerId);

      const isPresent = attendanceIds.has(playerId);

      try {
        if (isPresent) {
          const { error } = await supabase
            .from("match_attendance")
            .delete()
            .eq("match_id", match.id)
            .eq("player_id", playerId);
          if (error) throw error;
          setAttendance((prev) => prev.filter((a) => a.player_id !== playerId));
        } else {
          const { error } = await supabase.from("match_attendance").insert([{ match_id: match.id, player_id: playerId }]);
          if (error) throw error;
          setAttendance((prev) => [...prev, { player_id: playerId }]);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Не вдалося зберегти присутність";
        setAttendanceError(msg);
      } finally {
        setAttendanceSavingId(null);
      }
    },
    [match, attendanceIds]
  );

  const applyTournamentRoster = React.useCallback(async () => {
    if (!match?.tournament_id) return;

    setAttendanceError(null);
    setRosterSyncing(true);

    try {
      const { data, error } = await supabase
        .from("team_tournament_players")
        .select("player_id")
        .eq("team_id", match.team_id)
        .eq("tournament_id", match.tournament_id);

      if (error) throw error;

      const ids = (data || []).map((r: { player_id: string }) => r.player_id).filter(Boolean);
      if (ids.length === 0) {
        setAttendanceError("У заявці турніру немає гравців.");
        return;
      }

      const payload = ids.map((player_id) => ({ match_id: match.id, player_id }));
      const { error: upsertErr } = await supabase
        .from("match_attendance")
        .upsert(payload, { onConflict: "match_id,player_id" });

      if (upsertErr) throw upsertErr;

      setAttendance((prev) => {
        const merged = new Map(prev.map((a) => [a.player_id, a]));
        ids.forEach((id) => merged.set(id, { player_id: id }));
        return Array.from(merged.values());
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Не вдалося перенести склад";
      setAttendanceError(msg);
    } finally {
      setRosterSyncing(false);
    }
  }, [match]);

  React.useEffect(() => {
    if (!match?.tournament_id || !match?.id) return;
    if (match.status !== "scheduled") return;
    if (!attendanceLoaded) return;
    if (rosterSyncing || attendanceIds.size > 0) return;

    if (rosterAutoAppliedRef.current === match.id) return;
    rosterAutoAppliedRef.current = match.id;

    applyTournamentRoster();
  }, [applyTournamentRoster, attendanceIds.size, match?.id, match?.tournament_id, rosterSyncing, attendanceLoaded]);

  const scoreboard = React.useMemo(() => {
    if (!match) {
      return {
        leftName: TEAM_NAME,
        rightName: "—",
        leftLogo: null as string | null,
        rightLogo: null as string | null,
        leftScore: "—",
        rightScore: "—",
        leftTag: "Дім",
        rightTag: "Гості",
      };
    }

    const opponentName = match.opponent_name || "Суперник";
    const opponentLogo = normalizeLogoUrl(match.opponent_logo_url ?? null);
    const teamLogoUrl = normalizeLogoUrl(teamLogo);

    // scores
    const teamScore = typeof match.score_team === "number" ? String(match.score_team) : "—";
    const oppScore = typeof match.score_opponent === "number" ? String(match.score_opponent) : "—";

    // left/right must reflect home/away
    if (match.home_away === "away") {
      return {
        leftName: opponentName,         // home
        rightName: TEAM_NAME,           // away
        leftLogo: opponentLogo,
        rightLogo: teamLogoUrl,
        leftScore: oppScore,
        rightScore: teamScore,
        leftTag: "Дім",
        rightTag: "Гості",
      };
    }

    // home or neutral -> keep FAYNA on the left
    return {
      leftName: TEAM_NAME,
      rightName: opponentName,
      leftLogo: teamLogoUrl,
      rightLogo: opponentLogo,
      leftScore: teamScore,
      rightScore: oppScore,
      leftTag: match.home_away === "neutral" ? "Команда" : "Дім",
      rightTag: match.home_away === "neutral" ? "Суперник" : "Гості",
    };
  }, [match, teamLogo]);


  const metaLine = React.useMemo(() => {
    if (!match) return "";
    const tShort = (tournament?.short_name || tournament?.name || "").trim();
    const season = (tournament?.season || "").trim();
    const leagueName = (tournament?.league_name || "").trim();
    const tour = typeof match.matchday === "number" ? `Тур ${match.matchday}` : "";
    const stage = (match.stage || "").trim();

    const parts = [leagueName || tShort, season, tour, stage].filter((x) => String(x || "").trim());
    return parts.join(" • ");
  }, [match, tournament]);

  const stats = React.useMemo(() => {
    const goals = events.filter((e) => e.event_type === "goal" || e.event_type === "penalty_scored").length;
    const ownGoals = events.filter((e) => e.event_type === "own_goal").length;
    const yellow = events.filter((e) => e.event_type === "yellow_card").length;
    const red = events.filter((e) => e.event_type === "red_card").length;
    const saves = events.filter((e) => e.event_type === "goalkeeper_save").length;
    const twoMin = events.filter((e) => e.event_type === "two_minutes").length;
    return { goals, ownGoals, yellow, red, saves, twoMin };
  }, [events]);

  const mvp = React.useMemo(() => {
    type Slot = { player: Player; goals: number; assists: number; score: number };

    const map = new Map<string, { player: Player; goals: number; assists: number }>();

    const ensure = (id: string) => {
      const p = playerById.get(id);
      if (!p) return null;
      if (!map.has(id)) map.set(id, { player: p, goals: 0, assists: 0 });
      return map.get(id)!;
    };

    for (const e of events) {
      const isGoalLike = e.event_type === "goal" || e.event_type === "penalty_scored";
      if (isGoalLike && e.player_id) {
        const s = ensure(e.player_id);
        if (s) s.goals += 1;
      }
      if (isGoalLike && e.assist_player_id) {
        const s = ensure(e.assist_player_id);
        if (s) s.assists += 1;
      }
    }

    const arr: Slot[] = Array.from(map.values()).map((x) => ({
      ...x,
      score: x.goals * 3 + x.assists * 2,
    }));

    if (!arr.length) return null;
    arr.sort((a, b) => b.score - a.score);
    if (arr[0].score <= 0) return null;
    return arr[0];
  }, [events, playerById]);

    async function saveMatchDetails() {
    // HARD FRONTEND GUARDS — щоб редагування НІКОЛИ не могло створити дубль
    if (!matchId) {
      setMetaError("Помилка: у URL немає matchId (редагування заблоковано).");
      return;
    }

    if (!match || !match.id) {
      setMetaError("Помилка: матч не завантажено або відсутній match.id (редагування заблоковано).");
      return;
    }

    // найважливіше: редагуємо ТІЛЬКИ той матч, що відкритий у URL
    if (match.id !== matchId) {
      setMetaError(
        `Помилка: match.id не збігається з matchId у URL (${match.id} ≠ ${matchId}). Редагування заблоковано, щоб не створити дубль.`
      );
      return;
    }

    setMetaError(null);
    setMetaSuccess(null);

    if (!draft.opponent_name.trim()) {
      setMetaError("Суперник не може бути порожнім");
      return;
    }

    if (!draft.match_date_local) {
      setMetaError("Вкажи дату і час");
      return;
    }

    const scoreOppParsed = toNonNegIntOrNull(draft.score_opponent);
    if (scoreOppParsed.invalid) {
      setMetaError("Рахунок суперника має бути невідʼємним числом або порожнім");
      return;
    }
    const scoreOpp = scoreOppParsed.value;

    const matchdayVal = draft.matchday.trim() ? Math.floor(Number(draft.matchday.trim())) : null;
    if (matchdayVal !== null && (Number.isNaN(matchdayVal) || matchdayVal < 0)) {
      setMetaError("Тур має бути невідʼємним числом або порожнім");
      return;
    }

    const matchDate = new Date(draft.match_date_local);
    if (Number.isNaN(matchDate.getTime())) {
      setMetaError("Некоректна дата/час. Перевір формат.");
      return;
    }

    const matchDateIso = matchDate.toISOString();
    const eventDate = matchDateIso.slice(0, 10);
    const eventTime = `${String(matchDate.getHours()).padStart(2, "0")}:${String(matchDate.getMinutes()).padStart(2, "0")}`;

    setMetaSaving(true);

    const payload = {
  opponent_name: draft.opponent_name.trim(),
  opponent_logo_url: draft.opponent_logo_url.trim() ? draft.opponent_logo_url.trim() : null, // ✅
  match_date: matchDateIso,
  home_away: draft.home_away,
  status: draft.status,
  score_opponent: scoreOpp,
  tournament_id: draft.tournament_id === "none" ? null : draft.tournament_id,
  matchday: matchdayVal,
  stage: draft.stage.trim() ? draft.stage.trim() : null,
};


    // Важливо: змушуємо Supabase повернути рядок, який оновився.
    // Якщо нічого не повернулось — значить update НЕ застосувався (наприклад, неправильний id / RLS),
    // і ми НЕ робимо вигляд що все ок.
    const { data: updatedRow, error } = await supabase
      .from("matches")
      .update(payload)
      .eq("id", match.id)
      .select("id")
      .maybeSingle();

    setMetaSaving(false);

    if (error) {
      setMetaError(error.message || "Не вдалося зберегти деталі матчу");
      return;
    }

    if (!updatedRow?.id) {
      setMetaError(
        "Оновлення не застосувалося (0 рядків). Редагування зупинено, щоб уникнути дублювання. Перевір права (RLS) або id."
      );
      return;
    }

        // локально оновити можна, але join (match.tournaments) так не оновиться
    setMatch((prev) => (prev ? { ...prev, ...payload } : prev));

    // ✅ важливо: підтягнути match разом із tournaments join, щоб metaLine/шапка оновились
    await refreshMatch();

    logActivity({
      teamId: match.team_id,
      action: "update_match",
      entityType: "matches",
      entityId: match.id,
      title: `Оновлено матч проти ${payload.opponent_name}`,
      href: `/matches/${match.id}`,
      metadata: {
        event_date: eventDate,
        event_time: eventTime,
      },
    });
    setMetaSuccess("Деталі матчу збережено");
    setEditOpen(false);

  }
    async function refreshMatch() {
    if (!matchId) return;

    const { data: matchData, error: matchError } = await supabase
      .from("matches")
      .select(
        `
          id,
          opponent_name,
          match_date,
          status,
          home_away,
          score_team,
          score_opponent,
          team_id,
          tournament_id,
          stage,
          matchday,
          tournaments(
            id,
            name,
            short_name,
            season,
            logo_url,
            league_name
          )
        `
      )
      .eq("id", matchId)
      .single();

    if (!matchError && matchData) {
      setMatch(matchData as Match);
    }
  }


  async function deleteMatch() {
    if (!match) return;

    setMetaError(null);
    setMetaSuccess(null);
    setMetaSaving(true);

    const [evDel, attDel] = await Promise.all([
      supabase.from("match_events").delete().eq("match_id", match.id),
      supabase.from("match_attendance").delete().eq("match_id", match.id),
    ]);

    if (evDel.error || attDel.error) {
      setMetaSaving(false);
      setMetaError((evDel.error?.message || attDel.error?.message) ?? "Не вдалося очистити залежні дані");
      return;
    }

    const { error } = await supabase.from("matches").delete().eq("id", match.id);

    setMetaSaving(false);

    if (error) {
      setMetaError(error.message || "Не вдалося видалити матч");
      return;
    }

    logActivity({
      teamId: match.team_id,
      action: "delete_match",
      entityType: "matches",
      entityId: match.id,
      title: `Видалено матч проти ${match.opponent_name}`,
      href: "/matches-shadcn",
    });
    window.location.href = "/matches-shadcn";
  }

  if (showSkeleton) {
    return <DetailSkeleton />;
  }

  if (errorMessage || !match) {
    return (
      <div className="flex flex-col gap-6">
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Помилка</AlertTitle>
          <AlertDescription className="text-sm">{errorMessage || "Матч не знайдено"}</AlertDescription>
        </Alert>

        <Card className={cn(CARD_BASE, "p-10")}>
          <div className="text-base font-semibold text-foreground">Матч не знайдено</div>
          <div className="mt-2 text-sm text-muted-foreground">Перевір URL або доступ до запису в Supabase.</div>
          <div className="mt-4">
            <Button asChild variant="secondary">
              <Link to="/matches-shadcn">Повернутись до матчів</Link>
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className={cn(CARD_BASE, "p-6")}>
  {/* Breadcrumb + actions */}
  <div className="flex flex-wrap items-center justify-between gap-3">
    <Link
      to="/matches-shadcn"
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-2",
        "text-sm font-medium text-muted-foreground transition-colors",
        "hover:bg-muted/40 hover:text-foreground"
      )}
    >
      <ArrowLeft className="h-4 w-4" />
      Матчі
    </Link>

    <div className="flex items-center gap-2">
      {/* Primary action */}
      <Button
        type="button"
        className="gap-2"
        onClick={() => {
          setMetaSuccess(null);
          setMetaError(null);
          setEditOpen(true);
        }}
      >
        <Pencil className="h-4 w-4" />
        Редагувати
      </Button>

      {/* Overflow actions */}
      <AppDropdown
        align="end"
        contentClassName="w-56"
        trigger={
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="rounded-[var(--radius-lg)]"
            aria-label="Додаткові дії"
          >
            <MoreVertical className="h-5 w-5" />
          </Button>
        }
        items={[
          {
            key: "events",
            label: (
              <>
                <Activity className="h-4 w-4" />
                Події матчу
              </>
            ),
            onSelect: () => navigate(`/matches/${match.id}/events`),
          },
          {
            key: "delete",
            label: (
              <>
                <Trash2 className="h-4 w-4" />
                Видалити матч
              </>
            ),
            onSelect: () => setDeleteOpen(true),
            destructive: true,
          },
          { key: "sep-back", type: "separator" },
          {
            key: "back",
            label: (
              <>
                <ArrowLeft className="h-4 w-4" />
                До списку матчів
              </>
            ),
            onSelect: () => navigate("/matches-shadcn"),
            muted: true,
          },
        ]}
      />


    </div>
  </div>

  {/* Tournament badge row */}
  <div className="mt-1 grid w-full place-items-center">

    {(() => {
      const tData = tournamentLogoAndName(tournament);
      if (!tData) return null;
      return (
        <div className="flex items-center gap-2 text-center text-sm text-muted-foreground">
          <TeamAvatar name={tData.name} logoUrl={tData.logo} size={28} />
          <span className="font-medium text-foreground">{tData.name}</span>
        </div>
      );
    })()}
  </div>

  {/* Spacer instead of divider */}


{/* Scoreboard (fixed optical alignment) */}
<div className="mx-auto -mt-6 w-full max-w-[980px] pt-8">



 <div className="flex items-center justify-center gap-4 md:gap-5">

    {/* LEFT SIDE (fixed width) */}
    <div className="flex w-[280px] items-center justify-end gap-3 min-w-0">
      <div className="min-w-0 text-right">
        <div className="truncate text-lg font-semibold tracking-tight text-foreground">
          {scoreboard.leftName}
        </div>
      </div>
      <TeamAvatar name={scoreboard.leftName} logoUrl={scoreboard.leftLogo} size={48} />
    </div>

    {/* CENTER (fixed width) */}
    <div className="flex w-[132px] flex-col items-center justify-center">
      {match.status === "scheduled" ? (
  <div className="text-3xl font-semibold tabular-nums tracking-tight text-foreground">
    {formatTimeOnly(match.match_date)}
  </div>
) : (
  <div className="flex items-baseline justify-center gap-2">
    <div className="text-4xl font-semibold tabular-nums text-foreground">
      {scoreboard.leftScore}
    </div>
    <div className="text-3xl font-semibold tabular-nums text-muted-foreground">:</div>
    <div className="text-4xl font-semibold tabular-nums text-foreground">
      {scoreboard.rightScore}
    </div>
  </div>
)}


      <div className="mt-2 flex items-center justify-center">
        <MatchStatusBadge status={match.status} scoreTeam={match.score_team} scoreOpponent={match.score_opponent} />
      </div>
    </div>

    {/* RIGHT SIDE (fixed width) */}
    <div className="flex w-[280px] items-center justify-start gap-3 min-w-0">
      <TeamAvatar name={scoreboard.rightName} logoUrl={scoreboard.rightLogo} size={48} />
      <div className="min-w-0 text-left">
        <div className="truncate text-lg font-semibold tracking-tight text-foreground">
          {scoreboard.rightName}
        </div>
      </div>
    </div>
  </div>

  {/* Meta line (centered to the same axis as scoreboard) */}
  <div className="mt-4 flex items-center justify-center">
    <div className="flex max-w-[760px] flex-wrap items-center justify-center gap-3 text-sm text-muted-foreground">
      {[
        {
          key: "tournament",
          content: (
            <>
              <Trophy className="h-4 w-4" />
              <span className="truncate">{metaLine || "Турнір"}</span>
            </>
          ),
        },
        {
          key: "date",
          content: (
            <>
              <Calendar className="h-4 w-4" />
              {safeDateTimeUA(match.match_date)}
            </>
          ),
        },
      ].map((item, idx, arr) => (
        <React.Fragment key={item.key}>
          <span className="inline-flex items-center gap-2">{item.content}</span>
          {idx < arr.length - 1 ? <span className="text-muted-foreground/50">•</span> : null}
        </React.Fragment>
      ))}
    </div>
  </div>
</div>


</Card>

      <Card className={cn(CARD_BASE, "p-6")}>
        <Tabs
          value={activeTab}
          onValueChange={(v) => {
            if (!isTab(v)) return;
            const next = v;
            setActiveTab(next);

            const nextParams = new URLSearchParams(searchParams);
            nextParams.set("tab", next);
            setSearchParams(nextParams, { replace: true });
          }}
          className="w-full"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-base font-semibold text-foreground">Деталі матчу</div>
              <div className="mt-1 text-sm text-muted-foreground">Огляд, склад, події та статистика — в одному місці.</div>
            </div>

            <TabsList className={cn("inline-flex h-10 items-center rounded-[var(--radius-lg)] p-1", "bg-muted border border-border")}>
              <TabsTrigger
                value="overview"
                className={cn(
                  "h-8 rounded-[var(--radius-md)] px-4 text-sm transition-colors",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
                  "data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm",
                  "data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground"
                )}
              >
                Огляд
              </TabsTrigger>

              <TabsTrigger
                value="attendance"
                className={cn(
                  "h-8 rounded-[var(--radius-md)] px-4 text-sm transition-colors",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
                  "data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm",
                  "data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground"
                )}
              >
                Склад
              </TabsTrigger>

              <TabsTrigger
                value="events"
                className={cn(
                  "h-8 rounded-[var(--radius-md)] px-4 text-sm transition-colors",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
                  "data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm",
                  "data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground"
                )}
              >
                Події
              </TabsTrigger>

           
            </TabsList>
          </div>

          <TabsContent value="overview" className="mt-5">
            <div className="grid gap-4 md:grid-cols-3">
              <Card className={cn("rounded-[var(--radius-inner)] border border-border bg-card/60","shadow-none", "px-4 py-3")}>
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Activity className="h-4 w-4" />
                  Коротко
                </div>
                <div className="mt-2 text-sm text-muted-foreground">{metaLine || "Матч без привʼязки до турніру"}</div>
                <Separator className="my-4" />
                <div className="grid gap-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Подій</span>
                    <span className="font-semibold text-foreground tabular-nums">{events.length}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Присутніх</span>
                    <span className="font-semibold text-foreground tabular-nums">{attendanceIds.size}</span>
                  </div>
                </div>
              </Card>

              <Card className={cn("rounded-[var(--radius-inner)] border border-border bg-card/60","shadow-none", "px-4 py-3")}>
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <ListChecks className="h-4 w-4" />
                  Дисципліна
                </div>
                <div className="mt-2 grid grid-cols-2 gap-3">
                  <div className={cn("rounded-[var(--radius-inner)] border border-border bg-card/60 p-3 text-center")}>
                    <div className="text-xs text-muted-foreground">Жовті</div>
                    <div className="mt-1 text-lg font-semibold tabular-nums">{stats.yellow}</div>
                  </div>
                  <div className={cn("rounded-[var(--radius-inner)] border border-border bg-card/60 p-3 text-center")}>
                    <div className="text-xs text-muted-foreground">Червоні</div>
                    <div className="mt-1 text-lg font-semibold tabular-nums">{stats.red}</div>
                  </div>
                </div>
              </Card>

              <Card className={cn("rounded-[var(--radius-inner)] border border-border bg-card/60","shadow-none", "px-4 py-3")}>
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Star className="h-4 w-4" />
                  MVP (чернетка)
                </div>
                <div className="mt-2 text-sm text-muted-foreground">Формула: гол = 3, асист = 2</div>
                <Separator className="my-4" />
                {mvp ? (
                  <div className="space-y-1">
                    <div className="text-base font-semibold text-foreground">👑 {formatPlayerLabel(mvp.player)}</div>
                    <div className="text-sm text-muted-foreground">
                      Голи: <span className="font-medium text-foreground">{mvp.goals}</span> • Асисти:{" "}
                      <span className="font-medium text-foreground">{mvp.assists}</span>
                    </div>
                    <div className="mt-2">
                      <Badge variant="secondary" className="rounded-full">
                        {mvp.score} балів
                      </Badge>
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">Немає даних для MVP.</div>
                )}
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="attendance" className="mt-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Users className="h-4 w-4" />
                  Склад та присутність
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  Відмічені гравці: <span className="font-medium text-foreground">{attendanceIds.size}</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {match?.tournament_id ? (
                  <Button
                    type="button"
                    variant="secondary"
                    className="rounded-full"
                    onClick={applyTournamentRoster}
                    disabled={rosterSyncing || !!attendanceSavingId}
                  >
                    {rosterSyncing ? "Переношу…" : "Заповнити зі заявки"}
                  </Button>
                ) : null}
                <Badge variant="secondary" className="rounded-full">
                  Клік по гравцю = toggle
                </Badge>
              </div>
            </div>

            <Separator className="my-4" />

            {attendanceError ? (
              <Alert className="mb-4">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Не збережено</AlertTitle>
                <AlertDescription className="text-sm">{attendanceError}</AlertDescription>
              </Alert>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {sortedPlayers.map((p) => {

                const present = attendanceIds.has(p.id);
                const saving = attendanceSavingId === p.id;

                return (
                  <Button
  key={p.id}
  type="button"
  variant="card"
  size="md"
  onClick={() => toggleAttendance(p.id)}
  disabled={!!attendanceSavingId}
  className={cn(
    "h-auto shadow-[var(--shadow-surface)] transition-shadow duration-200 ease-out",
    "hover:shadow-[var(--shadow-floating)]",
    "p-4",
    "flex w-full items-center justify-between gap-3",
    "disabled:opacity-60 disabled:cursor-not-allowed"
  )}
>
  <div className="flex min-w-0 items-center gap-3">
    <PlayerAvatar 
  player={p} 
  size={36} 
  isOldMatch={isOldMatch} 
/>
    <div className="min-w-0">
      <div className="flex items-center gap-1.5">
        <div className="truncate text-sm font-semibold text-foreground">
          {formatPlayerLabel(p)}
        </div>
     
       
      </div>
      <div className="mt-1 text-[10px] uppercase font-black tracking-widest text-muted-foreground/60">
        {saving ? "Збереження…" : roleLabel(p)}
      </div>
    </div>
  </div>

  <Badge variant={present ? "default" : "secondary"} className="rounded-full">
    {present ? "Присутній" : "Відсутній"}
  </Badge>
                  </Button>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="events" className="mt-5">
            <Separator className="my-4" />

            {events.length === 0 ? (
              <div className={cn("rounded-[var(--radius-inner)] border border-border bg-card/40 p-6 text-center")}>
                <div className="text-base font-semibold text-foreground">Поки немає подій</div>
                <div className="mt-2 text-sm text-muted-foreground">Додай події в адмінці — і тут зʼявиться таймлайн.</div>
                <div className="mt-4">
                  <Button asChild>
                    <Link to={`/matches/${match.id}/events`}>Додати події</Link>
                  </Button>
                </div>
              </div>
            ) : (
              <div className={cn("rounded-[var(--radius-inner)] border border-border bg-card/40")}>
                <Table variant="analytics" size="sm" className="w-full">
                  <TableHeader>
                    <TableRow>
                      <TableHeaderCell widthClass="w-[70px]">Хв.</TableHeaderCell>
                      <TableHeaderCell widthClass="w-[220px]">Тип</TableHeaderCell>
                      <TableHeaderCell>Автор</TableHeaderCell>
                      <TableHeaderCell>Асист</TableHeaderCell>
                      <TableHeaderCell widthClass="w-[190px]">Створено</TableHeaderCell>
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {events.map((ev) => {
                      const authorPlayer = ev.player_id ? playerById.get(ev.player_id) || null : null;
                      const assistPlayer = ev.assist_player_id ? playerById.get(ev.assist_player_id) || null : null;

                      return (
                        <TableRow key={ev.id} className="hover:bg-muted/40 transition-colors">
                          <TableNumericCell align="left" className="align-middle font-medium text-foreground">
                            {typeof ev.minute === "number" ? ev.minute : "—"}
                          </TableNumericCell>

                          <TableCell className="align-middle">
                            <div className={cn("inline-flex items-center gap-2 rounded-full border px-3 py-1.5", eventPillClasses(ev.event_type))}>
                              <span className="inline-flex h-5 w-5 items-center justify-center">{eventIcon(ev.event_type)}</span>
                              <span className="font-semibold text-foreground">{eventLabels[ev.event_type] ?? ev.event_type}</span>
                            </div>
                          </TableCell>

                          <TableCell className="align-middle font-medium text-foreground">
                            {ev.player_id && authorPlayer ? (
                              <Link to={`/player/${ev.player_id}`} className="flex items-center gap-3 hover:opacity-90">
                                <PlayerAvatar player={authorPlayer} size={36} isOldMatch={isOldMatch} />
                                <span className="underline underline-offset-4 decoration-border hover:decoration-foreground">{formatPlayerLabel(authorPlayer)}</span>
                              </Link>
                            ) : (
                              "—"
                            )}
                          </TableCell>

                          <TableCell className="align-middle text-sm text-muted-foreground">
                            {ev.assist_player_id && assistPlayer ? (
                              <Link to={`/player/${ev.assist_player_id}`} className="flex items-center gap-3 hover:opacity-90">
                                <PlayerAvatar player={assistPlayer} size={36} isOldMatch={isOldMatch} />
                                <span className="underline underline-offset-4 decoration-border hover:decoration-foreground">{formatPlayerLabel(assistPlayer)}</span>
                              </Link>
                            ) : (
                              "—"
                            )}
                          </TableCell>

                          <TableCell className="align-middle text-sm text-muted-foreground">{safeDateTimeUA(ev.created_at)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </Card>

      {/* Edit match details dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
       <DialogContent
  className={cn(
    "max-w-5xl overflow-hidden p-0 border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80",
    // Fix X button colors in dark
    "[&>button]:text-foreground/70 [&>button:hover]:text-foreground [&>button:focus-visible]:ring-primary/30"
  )}
>

          {/* Header */}
          <div className="border-b border-border bg-card/70 px-6 py-5">
            <DialogHeader>
              <DialogTitle className="text-lg text-foreground">Редагувати деталі матчу</DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">
                Онови суперника, дату/час, турнір, статус та рахунок суперника.
              </DialogDescription>
            </DialogHeader>

            {metaError ? (
              <Alert className="mt-4">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Помилка</AlertTitle>
                <AlertDescription className="text-sm">{metaError}</AlertDescription>
              </Alert>
            ) : null}

            {metaSuccess ? (
              <Alert className="mt-4">
                <CheckCircle2 className="h-4 w-4" />
                <AlertTitle>Готово</AlertTitle>
                <AlertDescription className="text-sm">{metaSuccess}</AlertDescription>
              </Alert>
            ) : null}
          </div>

          {/* Body */}
         <div className="max-h-[82vh] overflow-auto bg-background px-6 py-5">


            <div className="grid gap-4 md:grid-cols-2">
              <FormSection title="Основне" subtitle="Те, що видно в шапці матчу">
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Суперник</Label>
                  <Input
                    value={draft.opponent_name}
                    onChange={(e) => setDraft((p) => ({ ...p, opponent_name: e.target.value }))}
                    className={CONTROL_BASE}
                  />
                </div>
                <div className="space-y-2">
  <Label className="text-xs text-muted-foreground">Лого суперника (URL, опційно)</Label>

  <div className="flex flex-wrap items-center gap-3">
    <div className="h-12 w-12 overflow-hidden rounded-full border border-border bg-muted/40 flex items-center justify-center">
      {draft.opponent_logo_url.trim() ? (
        <img
          src={draft.opponent_logo_url.trim()}
          alt="Opponent logo"
          className="h-full w-full object-cover"
          style={{ objectPosition: "50% 50%" }}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
      ) : (
        <ImageIcon className="h-5 w-5 text-muted-foreground" />
      )}
    </div>

    <Input
      value={draft.opponent_logo_url}
      onChange={(e) => setDraft((p) => ({ ...p, opponent_logo_url: e.target.value }))}
      placeholder="https://.../logo.png"
      className={cn(CONTROL_BASE, "min-w-[280px] flex-1")}
    />
  </div>

  <div className="text-xs text-muted-foreground">
    Можна вставити прямий URL на png/jpg/webp або svg (якщо браузер дозволяє).
  </div>
</div>

                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Дата та час</Label>

                  <div className="space-y-2">

                    <Input
                      value={smartDateInput}
                      onChange={(e) => setSmartDateInput(e.target.value)}
                      placeholder="Напр: 27 вер 14:40 / 27.09 14:40 / вчора 19:00 / сб 14:50"
                      className={CONTROL_BASE}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") e.preventDefault();
                      }}
                    />

                    {smartDateHint ? <div className="text-xs text-muted-foreground">{smartDateHint}</div> : null}
                    {smartDateError ? <div className="text-xs text-destructive">{smartDateError}</div> : null}

                    {draft.match_date_local ? (
                      <div className="text-xs text-muted-foreground">
                        Збережеться як:{" "}
                        <span className="font-medium text-foreground">{draft.match_date_local.replace("T", " ")}</span>
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground">Поки не розпізнано дату/час.</div>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Дім / Виїзд / Нейтрально</Label>
                  <Select
                    value={draft.home_away}
                    onValueChange={(v) => {
                      if (v === "home" || v === "away" || v === "neutral") {
                        setDraft((p) => ({ ...p, home_away: v }));
                      }
                    }}
                  >
                    <SelectTrigger className={CONTROL_BASE}>
                      <SelectValue placeholder="Обрати" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="home">Дім</SelectItem>
                      <SelectItem value="away">Виїзд</SelectItem>
                      <SelectItem value="neutral">Нейтрально</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </FormSection>

              <FormSection title="Турнір" subtitle="Опційно, якщо матч у турнірі">
                <Select
  value={draft.tournament_id || "none"}
  onValueChange={(v) => setDraft((p) => ({ ...p, tournament_id: v }))}
>
  <SelectTrigger className={CONTROL_BASE}>
    <SelectValue placeholder="Обрати турнір" />
  </SelectTrigger>

  <SelectContent>
    <SelectItem value="none">Без турніру</SelectItem>

    {tournamentsList.map((t) => {
      const label = [t.league_name || t.short_name || t.name, t.season].filter(Boolean).join(" • ");
      return (
        <SelectItem key={t.id} value={t.id}>
          {label || t.name}
        </SelectItem>
      );
    })}
  </SelectContent>
</Select>




                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Тур (опц.)</Label>
                    <Input
                      inputMode="numeric"
                      type="number"
                      min={0}
                      placeholder="3"
                      value={draft.matchday}
                      onChange={(e) => setDraft((p) => ({ ...p, matchday: e.target.value }))}
                      className={CONTROL_BASE}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Stage (опц.)</Label>
                    <Input
                      placeholder="Напр. Плей-оф"
                      value={draft.stage}
                      onChange={(e) => setDraft((p) => ({ ...p, stage: e.target.value }))}
                      className={CONTROL_BASE}
                    />
                  </div>
                </div>
              </FormSection>

              <FormSection title="Статус та рахунок" subtitle="Рахунок суперника — вручну, наші голи — через події" className="md:col-span-2">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
  {/* Статус */}
  <div className="md:col-span-2 space-y-2">
    <Label className="text-xs text-muted-foreground">Статус</Label>
    <Select
  value={draft.status}
  onValueChange={(v) => setDraft((p) => ({ ...p, status: v as MatchStatus }))}
>
  <SelectTrigger className={CONTROL_BASE}>
    <SelectValue placeholder="Обрати статус" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="scheduled">Запланований</SelectItem>
    <SelectItem value="played">Зіграний</SelectItem>
    <SelectItem value="canceled">Скасований</SelectItem>
  </SelectContent>
</Select>

  </div>

  {/* Голи суперника */}
  <div className="space-y-2">
    <Label className="text-xs text-muted-foreground">Голи суперника</Label>
    <Input
      type="number"
      min={0}
      inputMode="numeric"
      value={draft.score_opponent}
      onChange={(e) => setDraft((p) => ({ ...p, score_opponent: e.target.value }))}
      className={CONTROL_BASE}
    />
  </div>
</div>


                <div className="text-xs text-muted-foreground">
  Порада: голи — через події, тут лише голи суперника.
</div>

              </FormSection>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 border-t border-border bg-card/70 px-6 py-4">
            <Button type="button" variant="secondary" className="gap-2" onClick={() => setEditOpen(false)} disabled={metaSaving}>
              <X className="h-4 w-4" />
              Закрити
            </Button>
            <Button type="button" className="gap-2" onClick={saveMatchDetails} disabled={metaSaving}>
              <CheckCircle2 className="h-4 w-4" />
              Зберегти
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete match confirm */}
{/* Delete match confirm (Dialog-based, uses our Button) */}
<Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
  <DialogContent
  className={cn(
    // ⬇️ ЦЕНТРУВАННЯ (ОБОВʼЯЗКОВО)
    "fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2",

    // ⬇️ ТВОЇ СТИЛІ
    "max-w-xl w-full overflow-hidden p-0 border-border",
    "bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80",

    // ⬇️ МʼЯКА АНІМАЦІЯ
    "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:duration-150",
    "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:duration-120",
    "data-[state=open]:slide-in-from-bottom-2 data-[state=closed]:slide-out-to-bottom-2",

    // ⬇️ X button
    "[&>button]:text-foreground/70 [&>button:hover]:text-foreground [&>button:focus-visible]:ring-primary/30"
  )}
>

    {/* Header */}
    <div className="border-b border-border bg-card/70 px-6 py-5">
      <DialogHeader>
        <DialogTitle className="text-lg text-foreground">Видалити матч?</DialogTitle>
        <DialogDescription className="text-sm text-muted-foreground">
          Це видалить матч, події та відмітки присутності. Дію неможливо скасувати.
        </DialogDescription>
      </DialogHeader>
    </div>

    {/* Footer */}
    <div className="flex items-center justify-end gap-2 bg-card/70 px-6 py-4">
      <Button
        type="button"
        variant="secondary"
        onClick={() => setDeleteOpen(false)}
        disabled={metaSaving}
      >
        Скасувати
      </Button>

      <Button
        type="button"
        variant="destructive"
        onClick={async () => {
          await deleteMatch();
          // deleteMatch і так редіректить, але на всяк — закриємо
          setDeleteOpen(false);
        }}
        disabled={metaSaving}
      >
        Видалити
      </Button>
    </div>
  </DialogContent>
</Dialog>


    </div>
  );
}
