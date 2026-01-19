import React, { useEffect, useMemo, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { useLocation, Link } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { DashboardSkeleton } from "@/components/app/page-skeleton-templates";
import { useMinimumLoading } from "@/hooks/useMinimumLoading";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  TableCenterHeaderCell,
  TableHeaderCell,
  TableNumberCell,
  TableNumberHeaderCell,
  TableTextHeaderCell,
} from "@/components/app/table-kit";
import { PlayerAvatar as PlayerAvatarBase } from "@/components/app/avatar-kit";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { usePageHeaderActions } from "@/components/app/page-header-actions";
import { usePageCache } from "@/hooks/usePageCache";

import { Trophy, TrendingUp, Search, X, Filter, ChevronUp, ChevronDown, Minus, Star, HelpCircle, Crown, Info, Calendar, ArrowRight, Gem } from "lucide-react";
import { cn } from "@/lib/utils";
import "@/styles/ratings.css";

// --- Types ---
type Mode = "players" | "team";
type MatchStatus = "scheduled" | "played" | "canceled";
type MatchResult = "W" | "D" | "L";
type FormStatus = "good" | "bad" | "neutral" | "win_bonus";

type TournamentInfo = {
  id: string;
  name: string;
  short_name: string | null;
  season: string | null;
};

type MatchRow = {
  id: string;
  status: MatchStatus;
  score_team: number | null;
  score_opponent: number | null;
  opponent_name: string | null;
  opponent_logo_url: string | null;
  match_date: string;
  tournament_id: string | null;
  tournaments?: TournamentInfo | TournamentInfo[] | null;
};

type MatchEventRow = {
  id: string;
  match_id: string;
  team_id: string;
  player_id: string | null;
  assist_player_id: string | null;
  event_type: string;
  minute: number | null;
  created_at: string;
  player?: PlayerDbRow | null;
  assist?: PlayerDbRow | null;
};

type MatchEventJoinRow = Omit<MatchEventRow, "player" | "assist"> & {
  player?: PlayerDbRow | PlayerDbRow[] | null;
  assist?: PlayerDbRow | PlayerDbRow[] | null;
};

type MatchAttendanceRow = {
  match_id: string;
  player_id: string;
  created_at: string;
};

type PlayerDbRow = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  shirt_number?: number | null;
  position?: string | null;
  photo_url?: string | null;
  team_id?: string | null;
  is_active?: boolean | null;
};

type FormItem = {
  matchId: string;
  status: FormStatus;
  matchDate: string;
  result: MatchResult;
  score: string; 
  opponent: string; 
  opponentLogoUrl: string | null;
  stats: { goals: number; assists: number; red: boolean }; 
  description: string; 
};

type RatingBreakdown = {
  base: number;
  performance: number; 
  experience: number;
  discipline: number;
  label?: string; 
};

type PlayerStat = {
  playerId: string;
  name: string;
  avatarUrl: string | null;
  shirtNumber: number | null;
  position: string | null;
  matches: number;
  goals: number;
  assists: number;
  yellow: number;
  red: number;
  rankDelta: number; 
  rating: number; 
  ratingBreakdown: RatingBreakdown; 
  last5: FormItem[]; 
  rawPoints: number; 
};

type TeamKpi = {
  matches: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  attendanceRate30d: number;
};

type MinMatchesKey = "0" | "5" | "10" | "20";
type SortKey = "rating" | "points" | "goals" | "assists" | "discipline" | "matches" | "form";
type SortDirection = "asc" | "desc";

const TEAM_ID = "389719a7-5022-41da-bc49-11e7a3afbd98";

// --- Helpers & Styles ---
const CONTROL_BASE = cn(
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

function getModeFromPath(pathname: string): Mode {
  if (pathname.startsWith("/analytics/team")) return "team";
  return "players";
}

function outcome(scoreTeam: number, scoreOpp: number): MatchResult {
  if (scoreTeam > scoreOpp) return "W";
  if (scoreTeam < scoreOpp) return "L";
  return "D";
}

function normalizeText(s: string) {
  return (s ?? "").toString().trim();
}

function resolvePlayerName(p: PlayerDbRow): string {
  const fn = normalizeText(p.first_name ?? "");
  const ln = normalizeText(p.last_name ?? "");
  const combined = `${fn} ${ln}`.trim();
  if (combined) return combined;
  return "Без імені";
}

function normalizeAssetUrl(url: string | null | undefined): string | null {
  const u = normalizeText(url ?? "");
  if (!u) return null;
  if (u.startsWith("http://") || u.startsWith("https://") || u.startsWith("data:")) return u;
  if (u.startsWith("/")) {
      const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string)?.replace(/\/+$/, "");
      return `${supabaseUrl}/storage/v1/object/public${u}`;
  }
  return u;
}

function isGoalkeeperPosition(position: string | null | undefined) {
  return normalizeText(position ?? "").toUpperCase() === "GK";
}

function roleLabelCompact(position: string | null | undefined) {
  return isGoalkeeperPosition(position) ? "ВР" : "УН";
}

function roleLabelText(position: string | null | undefined) {
  return isGoalkeeperPosition(position) ? "Голкіпер" : "Універсал";
}

function formatDisciplineNode(p: PlayerStat) {
  return (
    <span className="inline-flex items-center gap-1 tabular-nums">
      <span className="text-yellow-500 font-black">{p.yellow}</span>
      <span className="text-muted-foreground/50">·</span>
      <span className="text-red-500 font-black">{p.red}</span>
    </span>
  );
}

function isGoalEvent(t: string) {
  const x = (t ?? "").toLowerCase().trim();
  return x === "goal" || x === "penalty_scored";
}
function isYellow(t: string) {
  return (t ?? "").toLowerCase().trim() === "yellow_card";
}
function isRed(t: string) {
  return (t ?? "").toLowerCase().trim() === "red_card";
}

function normalizeTournament(t: TournamentInfo | TournamentInfo[] | null | undefined): TournamentInfo | null {
  if (!t) return null;
  return Array.isArray(t) ? (t[0] ?? null) : t;
}

function normalizeJoinedPlayer(p: PlayerDbRow | PlayerDbRow[] | null | undefined): PlayerDbRow | null {
  if (!p) return null;
  return Array.isArray(p) ? (p[0] ?? null) : p;
}

async function fetchTeamPlayers(teamId: string) {
  const { data, error } = await supabase
    .from("players")
    .select("id, first_name, last_name, shirt_number, position, photo_url, team_id, is_active")
    .eq("team_id", teamId)
    .order("shirt_number", { ascending: true });

  if (error) return [] as PlayerDbRow[];
  return (data as PlayerDbRow[]) ?? [];
}

async function fetchPlayersByIds(ids: string[]) {
  if (ids.length === 0) return [] as PlayerDbRow[];
  const chunkSize = 150;
  const res: PlayerDbRow[] = [];
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from("players")
      .select("id, first_name, last_name, shirt_number, position, photo_url, team_id, is_active")
      .in("id", chunk);
    if (!error && data) res.push(...(data as PlayerDbRow[]));
  }
  return res;
}

async function fetchMatchAttendanceByMatchIds(ids: string[]) {
  if (ids.length === 0) return [] as MatchAttendanceRow[];
  const chunkSize = 150;
  const res: MatchAttendanceRow[] = [];
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from("match_attendance")
      .select("match_id, player_id, created_at")
      .in("match_id", chunk);
    if (!error && data) res.push(...(data as MatchAttendanceRow[]));
  }
  return res;
}

// === ФІНАЛЬНА ФОРМУЛА "Low Base, High Ceilings" ===
function calculateRatingWithBreakdown(
  player: { goals: number; assists: number; matches: number; yellow: number; red: number; position: string | null },
  rawPoints: number, 
  contextMaxMatches: number,
  contextMaxPoints: number 
): { value: number; breakdown: RatingBreakdown } {
  
  const BASE_RATING = 50; 
  const isShortTournament = contextMaxMatches < 6;

  const xpThreshold = isShortTournament ? contextMaxMatches : 15;
  const participationRate = Math.min(1.0, player.matches / Math.max(1, xpThreshold));
  const MAX_XP_BONUS = 20;
  const xpScore = participationRate * MAX_XP_BONUS;

  const discipline = (player.yellow * 0.3) + (player.red * 2);

  let calculatedRawPoints = rawPoints;
  if (!calculatedRawPoints && calculatedRawPoints !== 0) {
      if (roleLabelCompact(player.position) === "ВР") {
        calculatedRawPoints = (player.goals * 4) + (player.assists * 4);
      } else {
        calculatedRawPoints = (player.goals * 4) + (player.assists * 3);
      }
  }

  let skillPool = 0;
  let softCap = 0;
  let compression = 0;
  let hardCap = 0;

  if (isShortTournament) {
      skillPool = 30; 
      softCap = 85;
      compression = 0.4;
      hardCap = 97;
  } else {
      skillPool = 55;
      softCap = 85;
      compression = 0.2; 
      hardCap = 96; 
  }

  const relativeStrength = contextMaxPoints > 0 ? (calculatedRawPoints / contextMaxPoints) : 0;
  const adjustedStrength = isShortTournament ? Math.sqrt(relativeStrength) : relativeStrength;
  const skillScore = adjustedStrength * skillPool;

  const pointsPerMatch = player.matches > 0 ? (calculatedRawPoints / player.matches) : 0;
  const formMult = isShortTournament ? 3.5 : 2.0; 
  const gkMult = isShortTournament ? 7.0 : 4.0;
  const factor = roleLabelCompact(player.position) === "ВР" ? gkMult : formMult;
  const confidence = Math.min(1.0, Math.pow(player.matches / (isShortTournament ? contextMaxMatches : 8), 1.2));
  const formCap = isShortTournament ? 20 : 10;
  const formScore = Math.min(formCap, (pointsPerMatch * factor) * confidence);

  let totalRaw = BASE_RATING + xpScore + skillScore + formScore - discipline;
  let finalRating = totalRaw;

  if (finalRating > softCap) {
      const excess = finalRating - softCap;
      finalRating = softCap + (excess * compression);
  }

  if (finalRating > hardCap) finalRating = hardCap;
  if (finalRating < 50) finalRating = 50;

  const performanceDisplay = Number((skillScore + formScore).toFixed(1));

  return {
    value: Math.round(finalRating),
    breakdown: {
      base: BASE_RATING,
      performance: performanceDisplay,
      experience: Number(xpScore.toFixed(1)),
      discipline,
      label: "Skill"
    }
  };
}

// === UI COMPONENTS ===

function PortalTooltip({ 
  content, 
  children,
  side = "bottom" 
}: { 
  content: React.ReactNode; 
  children: React.ReactNode;
  side?: "top" | "bottom" | "left" | "right";
}) {
  const [coords, setCoords] = useState<{ top: number; left: number; side: string } | null>(null);
  const [visible, setVisible] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const updatePosition = () => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    let top = 0;
    let left = 0;
    let finalSide = side;
    const gap = 8;

    if (side === "bottom" && (rect.bottom + 150 > window.innerHeight)) {
      finalSide = "top";
    }

    if (finalSide === "bottom") {
      top = rect.bottom + gap;
      left = rect.left + rect.width / 2;
    } else if (finalSide === "top") {
      top = rect.top - gap;
      left = rect.left + rect.width / 2;
    } else if (finalSide === "left") {
      top = rect.top + rect.height / 2;
      left = rect.left - gap;
    } else if (finalSide === "right") {
      top = rect.top + rect.height / 2;
      left = rect.right + gap;
    }

    setCoords({ top, left, side: finalSide });
  };

  const handleMouseEnter = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    updatePosition();
    setVisible(true);
  };

  const handleMouseLeave = () => {
    timeoutRef.current = setTimeout(() => {
        setVisible(false);
    }, 200); 
  };

  useEffect(() => {
    if (visible) {
      window.addEventListener('scroll', updatePosition, true);
      window.addEventListener('resize', updatePosition);
    }
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [visible]);

  return (
    <>
      <div 
        ref={triggerRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className="inline-flex items-center justify-center"
      >
        {children}
      </div>
      {visible && coords && createPortal(
        <div 
          className="fixed z-[9999]"
          style={{ 
            top: coords.top, 
            left: coords.left,
            transform: coords.side === "left" 
              ? "translate(-100%, -50%)" 
              : coords.side === "right" 
                ? "translate(0, -50%)"
                : coords.side === "top" 
                  ? "translate(-50%, -100%)" 
                  : "translate(-50%, 0)" 
          }}
          onMouseEnter={handleMouseEnter} 
          onMouseLeave={handleMouseLeave}
        >
          <div className="bg-popover border border-border text-popover-foreground text-xs rounded-[var(--radius-lg)] shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            {content}
            <div 
              className={cn(
                "absolute w-0 h-0 border-4 border-transparent",
                coords.side === "bottom" && "border-b-popover -top-2 left-1/2 -translate-x-1/2 border-b-[8px]",
                coords.side === "top" && "border-t-popover -bottom-2 left-1/2 -translate-x-1/2 border-t-[8px]",
                coords.side === "left" && "border-l-popover -right-2 top-1/2 -translate-y-1/2 border-l-[8px]",
                coords.side === "right" && "border-r-popover -left-2 top-1/2 -translate-y-1/2 border-r-[8px]"
              )}
            />
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

// Form Indicator
function FormIndicator({
  results,
  ourLogo,
  ourName,
}: {
  results: FormItem[];
  ourLogo: string | null;
  ourName: string;
}) {
  const displayResults = [...results].reverse(); 
  
  return (
    <div className="flex items-center justify-center gap-1">
      {displayResults.map((item, i) => {
        let dotColorClass = "form-dot-neutral";

        if (item.status === "good") {
          dotColorClass = "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]";
        } else if (item.status === "bad") {
          dotColorClass = "bg-red-500";
        } else if (item.status === "win_bonus") {
          dotColorClass = "bg-blue-500"; 
        }

        let headerColor = "bg-slate-100 dark:bg-slate-800 text-slate-600 border-slate-200";
        let statusText = "НІЧИЯ";
        let scoreColor = "text-slate-700 dark:text-slate-300";

        if (item.result === 'W') {
             headerColor = "bg-emerald-500/10 text-emerald-600 border-emerald-500/20";
             statusText = "ПЕРЕМОГА";
             scoreColor = "text-emerald-600 dark:text-emerald-400";
        } else if (item.result === 'L') {
             headerColor = "bg-red-500/10 text-red-600 border-red-500/20";
             statusText = "ПОРАЗКА";
             scoreColor = "text-red-600 dark:text-red-400";
        }

        const dateStr = new Date(item.matchDate).toLocaleDateString("uk-UA", { day: '2-digit', month: 'long', year: 'numeric' });
        
        const safeTeamName = ourName?.trim() || "FAYNA TEAM";
        const myTeamLogoUrl =
          ourLogo ||
          `https://ui-avatars.com/api/?name=${encodeURIComponent(safeTeamName)}&background=0D8ABC&color=fff&size=64&font-size=0.35&length=2`;
        
        const opponentInitial = item.opponent ? item.opponent.substring(0, 2).toUpperCase() : "OP";
        const opponentFallback = `https://ui-avatars.com/api/?name=${encodeURIComponent(opponentInitial)}&background=random&color=fff&size=64&font-size=0.5&length=2`;
        const opponentLogoSrc = item.opponentLogoUrl || opponentFallback;

        const tooltipContent = (
             <div className="w-[280px] overflow-hidden rounded-[var(--radius-lg)]">
                 <div className={cn("px-4 py-3 border-b flex justify-between items-center", headerColor)}>
                    <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider opacity-90">
                        <Calendar className="h-3 w-3" />
                        {dateStr}
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-widest bg-white/50 dark:bg-black/20 px-2 py-0.5 rounded">
                        {statusText}
                    </span>
                 </div>
                 
                 <div className="p-4 bg-background/95 backdrop-blur">
                    <div className="flex items-center justify-between gap-2 mb-4">
                        <div className="flex flex-col items-center gap-1 w-1/3">
                            <div className="w-12 h-12 rounded-full p-0.5 bg-gradient-to-br from-blue-500 to-indigo-600 shadow-md flex items-center justify-center overflow-hidden">
                                <img
                                  src={myTeamLogoUrl}
                                  alt={safeTeamName}
                                  className="w-full h-full rounded-full object-cover border-2 border-white bg-white"
                                />
                            </div>
                            <span className="text-[10px] font-bold text-center leading-tight text-muted-foreground truncate w-full">
                              {safeTeamName}
                            </span>
                        </div>

                        <div className={cn("text-4xl font-black tracking-tighter tabular-nums drop-shadow-sm", scoreColor)}>
                             {item.score}
                        </div>

                        <div className="flex flex-col items-center gap-1 w-1/3">
                             <div className="w-12 h-12 rounded-full p-0.5 bg-gradient-to-br from-gray-200 to-gray-400 shadow-md flex items-center justify-center overflow-hidden">
                                <img src={opponentLogoSrc} alt={item.opponent} className="w-full h-full rounded-full object-cover border-2 border-white bg-white" />
                            </div>
                            <span className="text-[10px] font-bold text-center leading-tight text-muted-foreground truncate w-full">{item.opponent}</span>
                        </div>
                    </div>

                    <div className="h-px bg-border w-full mb-3" />

                    <div className="space-y-2">
                         <div className="flex justify-between items-center text-xs">
                             <span className="text-muted-foreground font-medium">Ваша статистика:</span>
                         </div>
                         <div className="grid grid-cols-2 gap-2">
                             <div className="bg-muted/30 rounded p-1.5 flex flex-col items-center justify-center border border-border/50">
                                 <span className="text-[10px] text-muted-foreground uppercase font-bold">Голи</span>
                                 <span className={cn("text-lg font-black leading-none", item.stats.goals > 0 ? "text-emerald-600" : "text-foreground/30")}>{item.stats.goals}</span>
                             </div>
                             <div className="bg-muted/30 rounded p-1.5 flex flex-col items-center justify-center border border-border/50">
                                 <span className="text-[10px] text-muted-foreground uppercase font-bold">Асисти</span>
                                 <span className={cn("text-lg font-black leading-none", item.stats.assists > 0 ? "text-blue-600" : "text-foreground/30")}>{item.stats.assists}</span>
                             </div>
                         </div>
                         {item.stats.red && (
                            <div className="bg-red-100 dark:bg-red-900/30 text-red-600 text-[10px] font-bold text-center py-1 rounded border border-red-200 dark:border-red-900/50">
                                ОТРИМАНО ЧЕРВОНУ КАРТКУ
                            </div>
                         )}
                    </div>

                    <Link 
                        to={`/matches/${item.matchId}`} 
                        className="mt-4 flex w-full items-center justify-center gap-2 rounded-[var(--radius-lg)] bg-primary py-2 text-xs font-bold text-primary-foreground transition-all hover:bg-primary/90 active:scale-[0.98]"
                    >
                        <span>Деталі матчу</span>
                        <ArrowRight className="h-3 w-3" />
                    </Link>
                 </div>
             </div>
        );

        return (
          <PortalTooltip key={i} content={tooltipContent} side="top">
             <div 
               className={cn("h-2 w-2 rounded-full transition-all cursor-pointer hover:scale-150 ring-offset-background hover:ring-2 hover:ring-ring hover:ring-offset-1", dotColorClass)} 
             />
          </PortalTooltip>
        );
      })}
      {Array.from({ length: 5 - displayResults.length }).map((_, i) => (
        <div key={`empty-${i}`} className="h-1.5 w-1.5 rounded-full bg-muted/30" />
      ))}
    </div>
  );
}

function SortableHead({ 
  label, 
  sKey, 
  sortConfig, 
  onSort, 
  align = "center",
  width,
  title,
  children
}: { 
  label: React.ReactNode; 
  sKey: SortKey; 
  sortConfig: { key: SortKey; direction: SortDirection }; 
  onSort: (k: SortKey) => void;
  align?: "left" | "center" | "right";
  width?: string;
  title?: string;
  children?: React.ReactNode; 
}) {
  const isActive = sortConfig.key === sKey;
  
  return (
    <TableHeaderCell
      align={align}
      widthClass={width}
      className={cn(
        "cursor-pointer select-none transition-all active:scale-[0.98]",
        "whitespace-nowrap",
        isActive ? "text-primary font-bold" : "hover:text-foreground/80 hover:bg-muted/30"
      )}
      onClick={() => onSort(sKey)}
      title={title}
    >
      <div className={cn(
        "flex items-center gap-1.5", 
        align === "center" && "justify-center",
        align === "right" && "justify-end"
      )}>
        {label}
        <span className="inline-flex h-3 w-3 items-center justify-center">
          {isActive ? (
            sortConfig.direction === "desc" 
              ? <ChevronDown className="h-3 w-3 animate-in fade-in zoom-in" strokeWidth={3} />
              : <ChevronUp className="h-3 w-3 animate-in fade-in zoom-in" strokeWidth={3} />
          ) : (
            <span className="h-3 w-3 opacity-0" />
          )}
        </span>
        {children}
      </div>
    </TableHeaderCell>
  );
}

function FormLegendTooltip() {
    const content = (
        <div className="w-52 space-y-2 p-3"> 
            <div className="text-[10px] font-bold text-muted-foreground mb-2 uppercase tracking-wider text-center border-b border-border pb-1">
                Легенда форми
            </div>
            <div className="space-y-1.5 text-xs">
                <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.4)]" />
                    <span className="text-foreground font-medium">Гол або Асист</span>
                </div>
                 <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-blue-500" />
                    <span className="text-foreground font-medium">Команда виграла</span>
                </div>
                 <div className="flex items-center gap-2">
                    {/* 👇 Тут використовуємо наш новий клас з index.css */}
                    <div className="h-2 w-2 rounded-full form-dot-neutral" />
                    <span className="text-muted-foreground">Зіграв (Без дій/перемог)</span>
                </div>
                 <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-red-500" />
                    <span className="text-red-500 font-medium">Червона картка</span>
                </div>
            </div>
             <div className="text-[10px] text-muted-foreground pt-1 italic text-center">
                *Пріоритет: Червона {'>'} Гол {'>'} Перемога
            </div>
        </div>
    );

    return (
        <PortalTooltip side="top" content={content}>
             <div className="ml-1 p-0.5 rounded-full hover:bg-muted/50 text-muted-foreground/50 hover:text-primary transition-colors cursor-help">
                 <Info className="h-3 w-3" />
             </div>
        </PortalTooltip>
    );
}

function FormHeaderStreak() {
  return (
    <span className="inline-flex items-center gap-1">
      {Array.from({ length: 5 }).map((_, i) => (
        <span key={i} className="h-2 w-2 rounded-full form-dot-neutral" />
      ))}
    </span>
  );
}

function CardTiersLegendTooltip() {
  const content = (
    <div className="w-52 p-3 space-y-3">
      <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider text-center border-b border-border pb-2">
        Рівні карток
      </div>
      <div className="space-y-2 text-xs">
        {/* Legendary */}
        <div className="flex items-center justify-between group">
          <div className="flex items-center gap-2">
            <Crown className="h-3.5 w-3.5 text-[#a17a23] fill-[#FFFACD]" strokeWidth={1.5} />
            <span className="font-bold text-foreground">Legendary</span>
          </div>
          <span className="font-mono font-bold text-[#a17a23]">97+</span>
        </div>
        
        {/* Elite */}
        <div className="flex items-center justify-between group">
          <div className="flex items-center gap-2">
            <Gem className="h-3.5 w-3.5 text-blue-400" />
            <span className="font-medium text-foreground">Elite</span>
          </div>
          <span className="font-mono font-bold text-blue-400">94-96</span>
        </div>

        {/* Gold */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-[#e8c689] shadow-[0_0_6px_rgba(234,179,8,0.4)]" />
            <span className="text-foreground/90">Gold</span>
          </div>
          <span className="font-mono text-muted-foreground">85-93</span>
        </div>

        {/* Silver */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-slate-300" />
            <span className="text-foreground/80">Silver</span>
          </div>
          <span className="font-mono text-muted-foreground">75-84</span>
        </div>

        {/* Bronze */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-[#a87860]" />
            <span className="text-foreground/70">Bronze</span>
          </div>
          <span className="font-mono text-muted-foreground">&lt; 75</span>
        </div>
      </div>
    </div>
  );

  return (
    <PortalTooltip side="bottom" content={content}>
      <Button
        type="button"
        variant="textMuted"
        size="xxs"
        className="h-auto items-center gap-1.5"
      >
        <Info className="h-3.5 w-3.5" />
        <span>Ранги</span>
      </Button>
    </PortalTooltip>
  );
}

function RatingLegendTooltip() {
    const content = (
      <div className="w-60 p-3 space-y-3"> 
         <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider text-center border-b border-border pb-2">
            Формула рейтингу
          </div>
          <div className="text-xs space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Базова оцінка</span>
              <span className="font-mono font-bold text-foreground">50</span>
            </div>
            
            <div className="h-px bg-border/50" />
            
            <div className="space-y-1">
                <div className="flex justify-between text-indigo-500">
                    <span>⚡ Ефективність</span>
                    {/* 👇 Виправлено з +75 на +65 (55 Skill + 10 Form) */}
                    <span className="font-bold font-mono">max +65</span>
                </div>
                <div className="text-[10px] text-muted-foreground leading-tight pl-4">
                    Голи, асисти та ігрова форма
                </div>
            </div>

            <div className="space-y-1">
                <div className="flex justify-between text-blue-500">
                    <span>🛡️ Досвід (XP)</span>
                    <span className="font-bold font-mono">max +20</span>
                </div>
                <div className="text-[10px] text-muted-foreground leading-tight pl-4">
                    Кількість зіграних матчів
                </div>
            </div>
            
            <div className="flex justify-between text-red-500">
              <span>🟥 Дисципліна</span>
              <span className="font-bold font-mono">-бали</span>
            </div>
          </div>
      </div>
    );
  
    return (
      <PortalTooltip side="top" content={content}>
         <div className="ml-1 p-0.5 rounded-full hover:bg-muted/50 text-muted-foreground/50 hover:text-primary transition-colors cursor-help">
            <HelpCircle className="h-3 w-3" />
         </div>
      </PortalTooltip>
    );
}
function RatingInfoTooltip() {
  const content = (
    <div className="w-64 space-y-2.5 p-3"> 
       <div className="text-xs font-bold text-foreground mb-2 uppercase tracking-wider flex items-center gap-1.5 border-b border-border pb-2">
          <Star className="h-3.5 w-3.5 fill-orange-400 text-orange-500" />
          Формула рейтингу (0-99)
        </div>
        <div className="text-xs text-muted-foreground">
           <p className="leading-snug mb-2">
             Динамічний рейтинг з високою конкуренцією в топі.
           </p>
          <div className="grid gap-1.5 bg-muted/30 p-2 rounded-[var(--radius-lg)] border border-border/50">
            <div className="flex justify-between items-center">
              <span>🚀 База</span>
              <span className="font-mono font-bold text-foreground">50</span>
            </div>
            <div className="h-px bg-border/50 my-0.5" />
            <div className="flex justify-between">
              <span>💎 Вклад + Форма</span>
              {/* 👇 Виправлено з +75 на +65 */}
              <span className="text-indigo-600 font-bold">max +65</span>
            </div>
            <div className="flex justify-between">
              <span>🛡️ Участь</span>
              <span className="text-blue-500 font-bold">max +20</span>
            </div>
            <div className="flex justify-between text-red-500/80">
              <span>🟥 Штрафи</span>
              <span className="font-bold">-0.3 / -2</span>
            </div>
          </div>
        </div>
    </div>
  );

  return (
    <PortalTooltip side="bottom" content={content}>
      <Button
        type="button"
        variant="textMuted"
        size="xxs"
        className="h-auto items-center gap-1.5"
      >
        <HelpCircle className="h-3.5 w-3.5" />
        <span>Як це працює?</span>
      </Button>
    </PortalTooltip>
  );
}
function PlayerAvatar({ player, size = 36 }: { player: PlayerStat; size?: number }) {
  const initials =
    player.name
      .split(" ")
      .slice(0, 2)
      .map((x) => x?.[0] ?? "")
      .join("")
      .toUpperCase() || "•";

  return (
    <PlayerAvatarBase
      src={player.avatarUrl}
      name={player.name}
      fallback={initials}
      size={size}
      referrerPolicy="no-referrer"
    />
  );
}

function RatingBreakdownTooltipContent({
  base,
  performance,
  experience,
  discipline,
  label,
  totalRating,
}: {
  base: number;
  performance: number;
  experience: number;
  discipline: number;
  label?: string;
  totalRating: number;
}) {
  return (
    <div className="w-44 space-y-1.5 p-3"> 
      <div className="text-[10px] font-bold text-muted-foreground mb-2 uppercase tracking-wider text-center border-b border-border pb-1">
        Аналіз рейтингу
      </div>
      <div className="space-y-1 text-xs">
        <div className="flex justify-between items-center text-muted-foreground">
          <span>Старт</span>
          <span className="font-mono">{base}</span>
        </div>
        <div className="flex justify-between items-center text-emerald-600">
          <span>{label || "Ефективність"}</span>
          <span className="font-mono font-bold">+{Number(performance).toFixed(1)}</span>
        </div>
        <div className="flex justify-between items-center text-blue-500">
          <span>Досвід</span>
          <span className="font-mono font-bold">+{Number(experience).toFixed(1)}</span>
        </div>
        {discipline > 0 && (
          <div className="flex justify-between items-center text-red-500">
            <span>Штраф</span>
            {/* 👇 ДОДАНО .toFixed(1) ЩОБ ПРИБРАТИ ДОВГІ ДРОБИ */}
            <span className="font-mono font-bold">-{Number(discipline).toFixed(1)}</span>
          </div>
        )}
        <div className="h-px bg-border my-1" />
        <div className="flex justify-between items-center text-foreground font-bold">
          <span>Разом</span>
          <span>{totalRating}</span>
        </div>
      </div>
    </div>
  );
}

function RankChangeIndicatorWithTooltip({ 
  delta, 
  ratingBreakdown, 
  totalRating 
}: { 
  delta: number, 
  ratingBreakdown: RatingBreakdown, 
  totalRating: number 
}) {
  const isPositive = delta > 0;
  const isNegative = delta < 0;

  const tooltipContent = (
    <RatingBreakdownTooltipContent
      base={ratingBreakdown.base}
      performance={ratingBreakdown.performance}
      experience={ratingBreakdown.experience}
      discipline={ratingBreakdown.discipline}
      label={ratingBreakdown.label}
      totalRating={totalRating}
    />
  );

  return (
    <div className="flex items-center justify-center w-full h-full">
      <PortalTooltip 
        side="bottom"
        content={tooltipContent}
      >
        <div 
          className={cn(
            "flex items-center justify-center gap-0.5 text-xs font-bold tabular-nums py-1 px-1.5 rounded hover:bg-muted/50 transition-colors cursor-default",
            isPositive ? "text-emerald-600" : isNegative ? "text-red-500" : "opacity-30 text-muted-foreground"
          )}
        >
          {isPositive ? (
            <>
              <ChevronUp className="h-3 w-3" strokeWidth={3} />
              <span>{Math.abs(delta)}</span>
            </>
          ) : isNegative ? (
            <>
              <ChevronDown className="h-3 w-3" strokeWidth={3} />
              <span>{Math.abs(delta)}</span>
            </>
          ) : (
            <Minus className="h-3 w-3" />
          )}
        </div>
      </PortalTooltip>
    </div>
  );
}

function PlayerRatingTooltip({ player, children }: { player: PlayerStat, children: React.ReactNode }) {
  const { base, performance, experience, discipline, label } = player.ratingBreakdown;

  const content = (
    <RatingBreakdownTooltipContent
      base={base}
      performance={performance}
      experience={experience}
      discipline={discipline}
      label={label}
      totalRating={player.rating}
    />
  );

  return (
    <div className="flex justify-center">
      <PortalTooltip side="bottom" content={content}>
        <div className="cursor-default">
          {children}
        </div>
      </PortalTooltip>
    </div>
  );
}

function LeaderName({
  player,
  className,
}: {
  player: { name: string };
  className?: string;
}) {
  const parts = (player.name || "").trim().split(/\s+/).filter(Boolean);
  const lastName = parts.length > 1 ? parts[parts.length - 1] : parts[0];
  const firstName = parts.length > 1 ? parts.slice(0, -1).join(" ") : "";

  return (
    <div className={cn("flex flex-col leading-tight", className)}>
      {firstName ? (
        <span className="text-sm font-normal text-muted-foreground">{firstName}</span>
      ) : null}
      <span className="text-lg font-bold uppercase tracking-tight text-foreground">{lastName}</span>
    </div>
  );
}


export function FifaCard({
  player,
  rating,
  position,
  className,
}: {
  player: { name: string; avatarUrl: string | null };
  rating: string | number;
  position: string;
  className?: string;
  clubLogoUrl?: string | null;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<React.CSSProperties>({});
  const [isHovering, setIsHovering] = useState(false);

  const numRating = typeof rating === "string" ? parseInt(rating, 10) : rating;

  // --- TIERS ---
  const isLegendary = numRating >= 97;
  const isElite = numRating >= 94 && numRating < 97;
  const isGold = numRating >= 85 && numRating < 94;
  const isSilver = numRating >= 75 && numRating < 85;
  const isBronze = numRating < 75;

  // --- MOUSE PHYSICS ---
  const updateShineCoords = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Normalized -1 to 1
    const xPct = (x / rect.width - 0.5) * 2;
    const yPct = (y / rect.height - 0.5) * 2;

    // 0 to 100%
    const shineX = x / rect.width;
    const shineY = y / rect.height;

    return { 
      shineX: shineX * 100, 
      shineY: shineY * 100,
      xPct, yPct,
      rawX: shineX,
      rawY: shineY
    };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const coords = updateShineCoords(e);
    if (!coords) return;
    const { shineX, shineY, xPct, yPct, rawX, rawY } = coords;

    const rotateX = -yPct * 10; 
    const rotateY = xPct * 10;

    setStyle({
      transform: `perspective(800px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.03, 1.03, 1.03)`,
      transition: "transform 0.1s ease-out",
      "--shine-x": `${shineX}%`,
      "--shine-y": `${shineY}%`,
      "--shine-x-raw": rawX,
      "--shine-y-raw": rawY,
      zIndex: 50,
    } as React.CSSProperties);
  };

  const handleMouseEnter = () => setIsHovering(true);
  
  const handleMouseLeave = () => {
    setIsHovering(false);
    setStyle((prev) => ({
      ...prev,
      transform: "perspective(800px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)",
      transition: "transform 0.5s cubic-bezier(0.2, 0.8, 0.2, 1)",
      zIndex: 0,
    } as React.CSSProperties));
  };

  // --- STYLING CONFIG ---
  let bgStyle: React.CSSProperties = {};
  let borderClass = "";
  let ratingStyle: React.CSSProperties = {};
  let labelStyle: React.CSSProperties = {};
  let iconElement = null;
  
  // Shine Config
  let shineBackground = "";
  let shineBlendMode: React.CSSProperties["mixBlendMode"] = "overlay";
  let shineOpacity = "opacity-0";

  // 1. LEGENDARY (Magenta/Cyan Splash)
  if (isLegendary) {
    bgStyle = {
        background: `
          radial-gradient(circle at 0% 0%, rgba(240, 171, 252, 0.5) 0%, transparent 45%),
          radial-gradient(circle at 100% 100%, rgba(34, 211, 238, 0.5) 0%, transparent 45%),
          linear-gradient(135deg, #ffffff 0%, #f0f9ff 45%, #fff1f2 55%, #ffffff 100%)
        `,
        boxShadow: "0 10px 40px -10px rgba(212, 175, 55, 0.4), inset 0 0 0 1px rgba(255,255,255,1), inset 0 0 12px rgba(212,175,55,0.15)"
    };
    borderClass = "border border-[#dcb866]/60"; 

    ratingStyle = {
      color: "#a17a23", 
      filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.1))"
    };

    labelStyle = {
        color: "#a17a23",
        fontWeight: 800
    };

    iconElement = (
      <div className="relative drop-shadow-sm filter">
         <Crown className="w-4 h-4 fill-[#FFFACD] text-[#a17a23]" strokeWidth={1.5} />
      </div>
    );

    // Soft Prism
    shineBackground = `
      conic-gradient(
        from calc(var(--shine-x-raw) * -20deg) at var(--shine-x) var(--shine-y),
        transparent 0deg,
        rgba(0, 255, 255, 0.25) 45deg,
        rgba(255, 0, 255, 0.25) 135deg,
        rgba(255, 255, 0, 0.25) 225deg,
        transparent 360deg
      )
    `;
    shineBlendMode = "color-dodge";
    shineOpacity = isHovering ? "opacity-100" : "opacity-0";
  } 
  // 2. ELITE (Brushed Blue Steel - Fixed)
  else if (isElite) {
    bgStyle = { 
        // 1. Deep Blue Gradient Base
        // 2. Brushed Metal Texture (Repeating Lines)
        background: `
            repeating-linear-gradient(90deg, transparent 0, transparent 2px, rgba(255,255,255,0.03) 2px, rgba(255,255,255,0.03) 4px),
            linear-gradient(135deg, #0f172a 0%, #1e3a8a 40%, #172554 100%)
        `,
        boxShadow: "0 15px 40px -10px rgba(37, 99, 235, 0.5), inset 0 0 0 1px rgba(96,165,250,0.3), inset 0 0 20px rgba(30,58,138,0.4)"
    };
    borderClass = "border border-blue-500/40";
    
    // Solid Electric Blue Text
    ratingStyle = {
      color: "#60a5fa", 
      filter: "drop-shadow(0 0 8px rgba(37, 99, 235, 0.6))"
    };
    
    labelStyle = { color: "#60a5fa", fontWeight: 800 };
    iconElement = <Gem className="w-3.5 h-3.5 text-blue-400 drop-shadow-[0_0_8px_rgba(59,130,246,0.8)]" />;
    
    // FIXED SHINE: Soft White Radial using OVERLAY
    // Це створює ефект, ніби метал ловить світло, а не світить сам
    shineBackground = `radial-gradient(circle at var(--shine-x) var(--shine-y), rgba(255,255,255,0.5) 0%, transparent 60%)`;
    shineBlendMode = "overlay"; 
    shineOpacity = isHovering ? "opacity-100" : "opacity-0";
  } 
  // 3. OTHERS
  else {
     shineBackground = `radial-gradient(circle at var(--shine-x) var(--shine-y), rgba(255,255,255,0.7) 0%, transparent 50%)`;
     shineBlendMode = "overlay";
     shineOpacity = isHovering ? "opacity-100" : "opacity-0";

     if (isGold) {
        bgStyle = { 
            background: "linear-gradient(135deg, #e8c689 0%, #b7903c 100%)",
            boxShadow: "0 10px 30px -5px rgba(234, 179, 8, 0.4)"
        };
        borderClass = "border border-[#fde68a]/30";
        ratingStyle = { color: "#422006" };
        labelStyle = { color: "#592a08" };
     } else if (isSilver) {
        bgStyle = { 
            background: "linear-gradient(135deg, #f1f5f9 0%, #cbd5e1 100%)",
            boxShadow: "0 10px 30px -5px rgba(148, 163, 184, 0.4)"
        };
        borderClass = "border border-white/40";
        ratingStyle = { color: "#1e293b" };
        labelStyle = { color: "#334155" };
     } else {
        bgStyle = { 
            background: "linear-gradient(135deg, #e6beaa 0%, #a87860 100%)",
            boxShadow: "0 10px 30px -5px rgba(180, 83, 9, 0.4)"
        };
        borderClass = "border border-white/20";
        ratingStyle = { color: "#431407" };
        labelStyle = { color: "#5D3A2E" };
     }
  }

  return (
    <div
      ref={cardRef}
      onMouseEnter={handleMouseEnter}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{ ...style, ...bgStyle }}
      className={cn(
        "relative isolate w-[104px] h-[140px] rounded-[var(--radius-lg)] select-none transition-all duration-200 ease-out overflow-hidden",
        borderClass,
        className
      )}
    >
      {/* 1. Subtle Noise */}
      <div 
        className="absolute inset-0 pointer-events-none z-0 opacity-[0.04]"
        style={{ backgroundImage: "url('https://grainy-gradients.vercel.app/noise.svg')" }} 
      />

      {/* 2. Pearl Texture (Legendary only) */}
      {isLegendary && (
        <div 
           className="absolute inset-0 z-0 pointer-events-none opacity-40 mix-blend-overlay"
           style={{
             background: "conic-gradient(from 0deg at 50% 50%, #fbcfe8 0deg, #e0f2fe 120deg, #fbcfe8 240deg, #e0f2fe 360deg)",
             filter: "blur(30px)"
           }}
        />
      )}

      {/* 3. Elite Tech/Mesh Grid - REPLACED WITH BRUSHED EFFECT IN BG */}
      {/* We removed the dots to make it look cleaner like metal plate */}

      {/* --- PHOTO --- */}
      <div className="absolute inset-0 z-10 flex items-end justify-center">
        {player.avatarUrl ? (
          <img
            src={player.avatarUrl}
            alt={player.name}
            className="w-full h-full object-cover object-top translate-x-5 translate-y-2 scale-[1.12]"
            style={{
              maskImage: "linear-gradient(to bottom, black 65%, transparent 100%)",
              WebkitMaskImage: "linear-gradient(to bottom, black 65%, transparent 100%)",
            }}
          />
        ) : (
           <div className="w-full h-full flex items-end justify-center pb-4 opacity-10">
             <Trophy className="w-12 h-12" />
           </div>
        )}
      </div>

      {/* --- VIGNETTE --- */}
      <div className="absolute inset-0 z-20 pointer-events-none bg-[radial-gradient(circle_at_50%_30%,transparent_50%,rgba(0,0,0,0.05)_100%)]" />

      {/* --- INFO PANEL --- */}
      <div className="absolute top-2.5 left-2.5 z-30 flex flex-col items-center w-8">
        
        {/* RATING NUMBER */}
        <span 
          className="text-[32px] font-[900] leading-[0.8] tracking-tighter block" 
          style={ratingStyle}
        >
          {rating}
        </span>
        
        {/* SEPARATOR */}
        <div 
          className="w-[20px] h-[1.5px] my-1 opacity-80 rounded-full"
          style={{ 
             background: isLegendary 
                ? "linear-gradient(90deg, transparent, #a17a23, transparent)" 
                : isElite 
                    ? "linear-gradient(90deg, transparent, #60a5fa, transparent)"
                    : "currentColor",
             color: labelStyle.color 
          }}
        />
        
        {/* POSITION */}
        <span 
            className="text-[10px] font-black uppercase leading-none"
            style={labelStyle}
        >
          {position}
        </span>
        
        {/* FLAG */}
        <div className="mt-1.5 w-4 h-3 rounded-[2px] overflow-hidden shadow-sm ring-1 ring-black/10 opacity-90">
           <img src="https://flagcdn.com/w40/ua.png" alt="UA" className="w-full h-full object-cover" />
        </div>
        
        {/* ICON */}
        <div className="mt-2">
            {iconElement}
        </div>
      </div>

      {/* --- SHINE EFFECT --- */}
      <div 
        className={cn(
          "absolute inset-0 rounded-[var(--radius-lg)] pointer-events-none z-50 transition-opacity duration-200", 
          shineOpacity
        )}
        style={{
            background: shineBackground,
            mixBlendMode: shineBlendMode,
        }}
      />
      
      {/* BORDER HIGHLIGHT */}
      <div className="absolute inset-0 rounded-[var(--radius-lg)] border border-white/40 pointer-events-none z-[51]" />
    </div>
  );
}

type StatsPageCache = {
  matches: MatchRow[];
  events: MatchEventRow[];
  matchAttendance: MatchAttendanceRow[];
  teamName: string;
  teamLogo: string | null;
  teamTournaments: Array<{ id: string; name: string; season: string | null }>;
  playersById: Array<[string, { name: string; avatarUrl: string | null; shirtNumber: number | null; position: string | null }]>;
  rosterCount: number;
};

export function StatsPage() {
  const location = useLocation();
  const mode: Mode = useMemo(() => getModeFromPath(location.pathname), [location.pathname]);

  usePageHeaderActions(null, []);

  const cacheKey = `stats:${mode}:v3`;
  const { cached, setCache } = usePageCache<StatsPageCache>(cacheKey);
  const hasCache = Boolean(cached);

  const [loading, setLoading] = useState(!hasCache);
  const [rosterCount, setRosterCount] = useState(cached?.rosterCount ?? 0);
  
  useEffect(() => {
    if (hasCache && loading) {
      setLoading(false);
    }
  }, [hasCache, loading]);

  const showSkeleton = useMinimumLoading(loading && !hasCache);

  // Data
  const [matches, setMatches] = useState<MatchRow[]>(cached?.matches ?? []);
  const [events, setEvents] = useState<MatchEventRow[]>(cached?.events ?? []);
  const [matchAttendance, setMatchAttendance] = useState<MatchAttendanceRow[]>(cached?.matchAttendance ?? []);
  const [teamName, setTeamName] = useState<string>(cached?.teamName ?? "FAYNA TEAM");
  // LOGO STATE
  const [teamLogo, setTeamLogo] = useState<string | null>(cached?.teamLogo ?? null);
  const [teamTournaments, setTeamTournaments] = useState<
    Array<{ id: string; name: string; season: string | null }>
  >(cached?.teamTournaments ?? []);

  // Meta map
  const [playersById, setPlayersById] = useState<
    Map<string, { name: string; avatarUrl: string | null; shirtNumber: number | null; position: string | null }>
  >(new Map(cached?.playersById ?? []));

  // Filters state
  const [minMatches, setMinMatches] = useState<MinMatchesKey>("0"); 
  const [selectedTournamentId, setSelectedTournamentId] = useState<string>("all");
  const [query, setQuery] = useState("");
  
  // State object for bi-directional sorting
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection }>({
    key: "rating",
    direction: "desc"
  });

  // Handler for sorting
  const handleSort = (key: SortKey) => {
    setSortConfig(current => ({
      key,
      direction: current.key === key && current.direction === "desc" ? "asc" : "desc"
    }));
  };

  const availableTournaments = useMemo(() => {
    const map = new Map<string, string>();
    if (teamTournaments.length > 0) {
      teamTournaments.forEach((t) => {
        const name = t.name || "Турнір";
        const season = t.season ? ` (${t.season})` : "";
        map.set(t.id, `${name}${season}`);
      });
    } else {
      matches.forEach((m) => {
        const tournament = normalizeTournament(m.tournaments);
        if (tournament) {
          const name = tournament.name || "Турнір";
          const season = tournament.season ? ` (${tournament.season})` : "";
          map.set(tournament.id, `${name}${season}`);
        }
      });
    }
    return Array.from(map.entries()).map(([id, label]) => ({ id, label }));
  }, [matches, teamTournaments]);

  const teamKpi = useMemo<TeamKpi>(() => {
    let wins = 0, draws = 0, losses = 0;
    let gf = 0, ga = 0;
    for (const m of matches) {
      if (selectedTournamentId !== "all" && m.tournament_id !== selectedTournamentId) continue;
      const st = m.score_team ?? 0;
      const so = m.score_opponent ?? 0;
      gf += st;
      ga += so;
      const r = outcome(st, so);
      if (r === "W") wins += 1;
      else if (r === "D") draws += 1;
      else losses += 1;
    }
    const since30dIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const matchIds30d = new Set(
      matches.filter((m) => m.match_date >= since30dIso).map((m) => m.id)
    );
    const presentCount = matchAttendance.filter((a) => matchIds30d.has(a.match_id)).length;
    const totalSlots = rosterCount * matchIds30d.size;
    const attendanceRate30d = totalSlots ? Math.round((presentCount / totalSlots) * 100) : 0;
    return {
      matches: wins + draws + losses,
      wins,
      draws,
      losses,
      goalsFor: gf,
      goalsAgainst: ga,
      attendanceRate30d,
    };
  }, [matches, matchAttendance, rosterCount, selectedTournamentId]); 

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!hasCache) {
        setLoading(true);
      }

      const matchesPromise = supabase
        .from("matches")
        .select(`
          id, status, score_team, score_opponent, opponent_name, opponent_logo_url, match_date, tournament_id,
          tournaments ( id, name, short_name, season )
        `)
        .eq("team_id", TEAM_ID)
        .eq("status", "played")
        .order("match_date", { ascending: false })
        .limit(120);

      const rosterPromise = fetchTeamPlayers(TEAM_ID);

      const teamPromise = supabase
        .from("teams")
        .select("logo_url, club_id, name, clubs(name, logo_url)")
        .eq("id", TEAM_ID)
        .single();

      const tournamentsPromise = supabase
        .from("team_tournaments")
        .select("tournament:tournament_id (id, name, season)")
        .eq("team_id", TEAM_ID);

      const [matchesRes, roster, teamRes, tournamentsRes] = await Promise.all([
        matchesPromise,
        rosterPromise,
        teamPromise,
        tournamentsPromise,
      ]);

      const teamData = teamRes.data as {
        logo_url?: string | null;
        club_id?: string | null;
        name?: string | null;
        clubs?: { name?: string | null; logo_url?: string | null } | { name?: string | null; logo_url?: string | null }[] | null;
      } | null;
      let resolvedName = (teamData?.name || "").trim() || "FAYNA TEAM";
      let resolvedLogo: string | null = teamData?.logo_url ? normalizeAssetUrl(teamData.logo_url) : null;

      if (!resolvedLogo && teamData?.club_id) {
        const club = Array.isArray(teamData?.clubs) ? teamData?.clubs[0] : teamData?.clubs;
        if (club?.logo_url) {
          resolvedLogo = normalizeAssetUrl(club.logo_url as string);
        }
        if (club?.name) {
          resolvedName = String(club.name);
        }
      } else if (!teamData?.club_id) {
        const { data: clubRow } = await supabase
          .from("clubs")
          .select("name, logo_url")
          .limit(1)
          .maybeSingle();
        if (clubRow?.logo_url) {
          resolvedLogo = normalizeAssetUrl(clubRow.logo_url as string);
        }
        if (clubRow?.name) {
          resolvedName = String(clubRow.name);
        }
      }

      if (!cancelled) {
        setTeamLogo(resolvedLogo);
        setTeamName(resolvedName);
      }

      const allMatches = ((matchesRes.data ?? []) as MatchRow[]) ?? [];
      const matchIds = allMatches.map((m) => m.id);
      const safeMatchIds = matchIds.slice(0, 120);

      const teamTournamentsList = (tournamentsRes.data ?? [])
        .flatMap((row) => {
          const raw = (row as { tournament?: { id: string; name: string; season: string | null } | { id: string; name: string; season: string | null }[] | null })
            .tournament;
          if (!raw) return [];
          return Array.isArray(raw) ? raw : [raw];
        })
        .filter((t) => t && t.id)
        .map((t) => ({
          id: t.id,
          name: t.name || "Турнір",
          season: t.season ?? null,
        }));

      const uniqueTournaments = Array.from(
        new Map(teamTournamentsList.map((t) => [t.id, t])).values()
      );

      const attendancePromise = fetchMatchAttendanceByMatchIds(matchIds);
      const eventsPromise = safeMatchIds.length
        ? supabase
            .from("match_events")
            .select(`
              id, match_id, team_id, player_id, assist_player_id, event_type, minute, created_at,
              player:player_id ( id, first_name, last_name, shirt_number, position, photo_url ),
              assist:assist_player_id ( id, first_name, last_name, shirt_number, position, photo_url )
            `)
            .eq("team_id", TEAM_ID)
            .in("match_id", safeMatchIds)
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [] });

      const [attendance, eventsRes] = await Promise.all([attendancePromise, eventsPromise]);

      const rows = (((eventsRes as { data?: MatchEventJoinRow[] }).data ?? []) as MatchEventJoinRow[]) ?? [];
      const ev = rows.map((row) => ({
        ...row,
        player: normalizeJoinedPlayer(row.player),
        assist: normalizeJoinedPlayer(row.assist),
      }));

      const meta = new Map<string, { name: string; avatarUrl: string | null; shirtNumber: number | null; position: string | null }>();
      const addPlayerToMeta = (p: PlayerDbRow) => {
        const name = resolvePlayerName(p);
        const avatarUrl = normalizeAssetUrl(p.photo_url ?? null);
        meta.set(p.id, {
          name,
          avatarUrl,
          shirtNumber: p.shirt_number ?? null,
          position: p.position ?? null,
        });
      };

      for (const p of roster) addPlayerToMeta(p);
      for (const e of ev) {
        if (e.player) addPlayerToMeta(e.player);
        if (e.assist) addPlayerToMeta(e.assist);
      }

      const idsFromEvents = Array.from(
        new Set(ev.flatMap((e) => [e.player_id, e.assist_player_id]).filter(Boolean))
      ) as string[];

      const missingIds = idsFromEvents.filter((id) => !meta.has(id));
      if (missingIds.length > 0) {
        const extraPlayers = await fetchPlayersByIds(missingIds);
        for (const p of extraPlayers) addPlayerToMeta(p);
      }

      if (cancelled) return;

      setMatches(allMatches);
      setMatchAttendance(attendance);
      setRosterCount(roster.length);
      setEvents(ev);
      setPlayersById(meta);
      setTeamLogo(resolvedLogo);
      setTeamName(resolvedName);
      setTeamTournaments(uniqueTournaments);
      
      setCache({
        matches: allMatches,
        events: ev,
        matchAttendance: attendance,
        teamName: resolvedName,
        teamLogo: resolvedLogo,
        teamTournaments: uniqueTournaments,
        playersById: Array.from(meta.entries()),
        rosterCount: roster.length,
      });
      
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const playerStats = useMemo<PlayerStat[]>(() => {
    const validMatches = matches.filter((m) => {
      if (selectedTournamentId !== "all" && m.tournament_id !== selectedTournamentId) return false;
      return true;
    });

    const matchMetaMap = new Map<string, { result: MatchResult; date: string; score: string; opponent: string; opponentLogo: string | null }>();
    validMatches.forEach(m => {
       const res = outcome(m.score_team ?? 0, m.score_opponent ?? 0);
       const score = `${m.score_team ?? 0} : ${m.score_opponent ?? 0}`;
       const opponent = m.opponent_name || "Суперник";
       matchMetaMap.set(m.id, {
         result: res,
         date: m.match_date,
         score,
         opponent,
         opponentLogo: normalizeAssetUrl(m.opponent_logo_url),
       });
    });

    const attendanceByMatch = new Map<string, string[]>(); 
    matchAttendance.forEach(row => {
        if (!attendanceByMatch.has(row.match_id)) attendanceByMatch.set(row.match_id, []);
        attendanceByMatch.get(row.match_id)?.push(row.player_id);
    });

    const eventsByMatchAndPlayer = new Map<string, Map<string, { goals: number; assists: number; red: boolean }>>();
    
    events.forEach(e => {
        if (!eventsByMatchAndPlayer.has(e.match_id)) {
            eventsByMatchAndPlayer.set(e.match_id, new Map());
        }
        const matchEvents = eventsByMatchAndPlayer.get(e.match_id)!;
        
        const update = (pid: string | null, type: "goal" | "assist" | "red") => {
            if (!pid) return;
            if (!matchEvents.has(pid)) matchEvents.set(pid, { goals: 0, assists: 0, red: false });
            const flags = matchEvents.get(pid)!;
            if (type === "goal") flags.goals += 1;
            if (type === "assist") flags.assists += 1;
            if (type === "red") flags.red = true;
        };

        const t = (e.event_type ?? "").toLowerCase().trim();
        if (isGoalEvent(t)) {
            update(e.player_id, "goal");
            update(e.assist_player_id, "assist");
        }
        if (isRed(t)) {
            update(e.player_id, "red");
        }
    });

    const uniqueDates = Array.from(new Set(validMatches.map(m => m.match_date.split("T")[0]))).sort().reverse();
    const latestDate = uniqueDates[0];
    const lastDateMatchIds = new Set(
      latestDate ? validMatches.filter((m) => m.match_date.split("T")[0] === latestDate).map((m) => m.id) : []
    );
    const lastDateParticipants = new Set<string>();
    if (lastDateMatchIds.size > 0) {
      lastDateMatchIds.forEach((mid) => {
        const ids = attendanceByMatch.get(mid) || [];
        ids.forEach((pid) => lastDateParticipants.add(pid));
      });
    }

    const calculateStats = (
      excludeLatestDate: boolean,
      opts?: { oldRankMap?: Map<string, number>; lastDateParticipants?: Set<string> }
    ) => {
       const map = new Map<string, PlayerStat>();
       
       const targetMatchIds = new Set<string>();
       validMatches.forEach(m => {
           const mDate = m.match_date.split("T")[0];
           if (excludeLatestDate && mDate === latestDate) return;
           targetMatchIds.add(m.id);
       });

       if (excludeLatestDate && targetMatchIds.size === 0) return [];

       const ensure = (playerId: string) => {
        if (!map.has(playerId)) {
          const meta = playersById.get(playerId);
          map.set(playerId, {
            playerId,
            name: meta?.name ?? "Без імені",
            avatarUrl: meta?.avatarUrl ?? null,
            shirtNumber: meta?.shirtNumber ?? null,
            position: meta?.position ?? null,
            matches: 0,
            goals: 0,
            assists: 0,
            yellow: 0,
            red: 0,
            rankDelta: 0,
            rating: 60, 
            ratingBreakdown: { base: 60, performance: 0, experience: 0, discipline: 0 },
            last5: [],
            rawPoints: 0
          });
        }
        return map.get(playerId)!;
      };

      validMatches.forEach(match => {
         if (!targetMatchIds.has(match.id)) return;
         
         const playersInMatch = attendanceByMatch.get(match.id) || [];
         const matchEventsMap = eventsByMatchAndPlayer.get(match.id);
         const matchInfo = matchMetaMap.get(match.id);
         const matchResult = matchInfo?.result || "D";
         const matchScore = matchInfo?.score || "0 : 0";
         const matchOpponent = matchInfo?.opponent || "Суперник";
         const matchOpponentLogo = matchInfo?.opponentLogo || null;

         playersInMatch.forEach(pid => {
             const p = ensure(pid);
             p.matches += 1;

             if (p.last5.length < 5) {
                let status: FormStatus = "neutral";
                let description = "Участь у матчі";
                let stats = { goals: 0, assists: 0, red: false };
                
                if (matchEventsMap && matchEventsMap.has(pid)) {
                    stats = matchEventsMap.get(pid)!;
                }

                if (stats.red) {
                    status = "bad";
                    description = "Червона картка";
                } else if (stats.goals > 0 || stats.assists > 0) {
                    status = "good";
                    const parts = [];
                    if (stats.goals > 0) parts.push(`${stats.goals} Гол${stats.goals > 1 ? "и" : ""}`);
                    if (stats.assists > 0) parts.push(`${stats.assists} Асист${stats.assists > 1 ? "и" : ""}`);
                    description = parts.join(", ");
                } else if (matchResult === "W") {
                    status = "win_bonus"; 
                    description = "Перемога команди";
                }

                p.last5.push({
                   matchId: match.id, 
                   status,
                   matchDate: match.match_date,
                   result: matchResult,
                   score: matchScore,
                   opponent: matchOpponent,
                   opponentLogoUrl: matchOpponentLogo, 
                   stats,
                   description
                });
             }
         });
      });

      for (const e of events) {
        if (!targetMatchIds.has(e.match_id)) continue;
        const t = (e.event_type ?? "").toLowerCase().trim();
        if (isGoalEvent(t)) {
          if (e.player_id) ensure(e.player_id).goals += 1;
          if (e.assist_player_id) ensure(e.assist_player_id).assists += 1;
        }
        if (isYellow(t) && e.player_id) ensure(e.player_id).yellow += 1;
        if (isRed(t) && e.player_id) ensure(e.player_id).red += 1;
      }

      let arr = Array.from(map.values());

      const maxMatchesInContext = Math.max(...arr.map(p => p.matches), 1);
      
      const playersWithPoints = arr.map(p => {
          const isGk = roleLabelCompact(p.position) === "ВР";
          const rawPoints = (p.goals * 4) + (p.assists * (isGk ? 4 : 3));
          return { ...p, rawPoints };
      });

      const maxRawPointsInContext = Math.max(...playersWithPoints.map(p => p.rawPoints), 1);

      playersWithPoints.forEach(p => {
          const { value, breakdown } = calculateRatingWithBreakdown(
              p, 
              p.rawPoints, 
              maxMatchesInContext, 
              maxRawPointsInContext
          );
          p.rating = value;
          p.ratingBreakdown = breakdown;
      });
      
      arr = playersWithPoints;

      arr.sort((a, b) => {
        let diff = 0;
        const { key } = sortConfig;
        const oldRankMap = opts?.oldRankMap;
        const lastDateParticipants = opts?.lastDateParticipants;
        const aPlayedLast = !!lastDateParticipants?.has(a.playerId);
        const bPlayedLast = !!lastDateParticipants?.has(b.playerId);

        const aPoints = a.goals + a.assists;
        const bPoints = b.goals + b.assists;
        const aCards = a.red * 2 + a.yellow;
        const bCards = b.red * 2 + b.yellow;

        if (key === "rating") {
            if (!aPlayedLast && !bPlayedLast && oldRankMap) {
                const aOld = oldRankMap.get(a.playerId);
                const bOld = oldRankMap.get(b.playerId);
                if (typeof aOld === "number" && typeof bOld === "number") {
                    return aOld - bOld;
                }
            }
            if (b.rating !== a.rating) diff = a.rating - b.rating;
            else if (aPoints !== bPoints) diff = aPoints - bPoints;
            else diff = a.goals - b.goals;
        }
        else if (key === "points") {
            if (bPoints !== aPoints) diff = aPoints - bPoints;
            else if (b.goals !== a.goals) diff = a.goals - b.goals;
            else diff = bCards - aCards;
        }
        else if (key === "goals") {
            if (b.goals !== a.goals) diff = a.goals - b.goals;
            else diff = a.assists - b.assists;
        }
        else if (key === "assists") {
            if (b.assists !== a.assists) diff = a.assists - b.assists;
            else diff = a.goals - b.goals;
        }
        else if (key === "discipline") {
            if (bCards !== aCards) diff = aCards - bCards;
            else diff = bPoints - aPoints; 
        }
        else if (key === "matches") {
            if (b.matches !== a.matches) diff = a.matches - b.matches;
            else diff = aPoints - bPoints;
        }
        else {
            return a.name.localeCompare(b.name);
        }

        if (diff === 0) {
             return b.rating - a.rating;
        }

        return sortConfig.direction === "asc" ? diff : -diff;
      });

      return arr;
    };

    let oldRankMap = new Map<string, number>();
    if (uniqueDates.length > 1) {
       const oldList = calculateStats(true);
       oldList.forEach((p, idx) => oldRankMap.set(p.playerId, idx + 1));
    }

    const currentList = calculateStats(false, {
      oldRankMap,
      lastDateParticipants,
    });
    
    const finalList = currentList.map((p, idx) => {
        const currentRank = idx + 1;
        const oldRank = oldRankMap.get(p.playerId);
        const delta = oldRank ? (oldRank - currentRank) : 0;
        return { ...p, rankDelta: delta };
    });

    const minM = parseInt(minMatches, 10);
    const filteredByMatches = finalList.filter(p => p.matches >= minM);

    if (query.trim()) {
      const q = query.toLowerCase();
      return filteredByMatches.filter((p) => p.name.toLowerCase().includes(q));
    }

    return filteredByMatches;
  }, [events, matches, playersById, minMatches, selectedTournamentId, query, sortConfig, matchAttendance]); 

  const leaders = useMemo(() => {
    const withValue = (
      key: string,
      label: string,
      getValue: (p: PlayerStat) => number,
      accent: string,
      options?: {
        hideZeros?: boolean;
        emptyText?: string;
        topLabel?: (p: PlayerStat) => string;
      }
    ) => {
      const list = [...playerStats].sort((a, b) => getValue(b) - getValue(a));
      const top = list[0];
      const topValue = top ? getValue(top) : 0;
      const topRating = top ? String(top.rating) : "—";

      const filtered = options?.hideZeros ? list.filter((p) => getValue(p) > 0) : list;
      const listWithoutTop = top ? filtered.filter((p) => p.playerId !== top.playerId) : filtered;
      const showList = listWithoutTop.slice(0, 2);
      const isEmpty = options?.hideZeros ? filtered.length === 0 : list.length === 0;

      return {
        key,
        label,
        accent,
        list,
        showList,
        top,
        topValue,
        topRating,
        getValue,
        emptyText: options?.emptyText ?? "Нема даних",
        hideZeros: !!options?.hideZeros,
        isEmpty,
      };
    };

    const points = (p: PlayerStat) => p.goals + p.assists;
    const disciplineScore = (p: PlayerStat) => p.yellow + p.red * 2;
    const efficiency = (p: PlayerStat) => {
      if (!p.matches) return 0;
      return Math.round(((p.goals + p.assists) / p.matches) * 10) / 10;
    };

    return [
      withValue("goals", "Голи", (p) => p.goals, "text-blue-600"),
      withValue("assists", "Асисти", (p) => p.assists, "text-emerald-600"),
      withValue("points", "ГОЛИ+ПЕРЕДАЧІ", points, "text-indigo-600"),
      withValue("matches", "Матчі", (p) => p.matches, "text-cyan-600"),
      withValue("discipline", "Дисципліна", disciplineScore, "text-yellow-700"),
      withValue("eff", "Ефективність", efficiency, "text-slate-500 dark:text-slate-400", {
        topLabel: (p) => p.name,
      }),
    ];
  }, [playerStats]);

  if (showSkeleton) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="flex flex-col gap-6">
      {mode === "players" ? (
        <>
          <Card className="!rounded-[var(--radius-section)] border border-border bg-card shadow-none">
            <div className="border-b border-border p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-lg)] border border-primary/40 bg-primary/5 text-primary">
                    <Crown className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-foreground">Лідери команди</div>
                    <div className="text-xs text-muted-foreground whitespace-nowrap">Топ-3 гравці у кожній метриці</div>
                  </div>
                </div>
                <div className="ml-auto">
                  <CardTiersLegendTooltip />
                </div>
              </div>
            </div>

            {loading ? (
              <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-3">
                {Array(6).fill(0).map((_, i) => (
                  <Skeleton key={i} className="min-h-[232px] w-full rounded-[var(--radius-inner)]" />
                ))}
              </div>
            ) : (
              <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-3">
                {leaders.map((board) => {
                  const top = board.top;
                  const topNumber =
                    board.key === "eff"
                      ? (board.topValue ? board.topValue.toFixed(1) : "—")
                      : board.key === "discipline"
                        ? (top ? formatDisciplineNode(top) : "—")
                        : (top ? String(board.topValue) : "—");

                  const badgeTone =
                    board.key === "goals"
                      ? "leader-badge--goals"
                      : board.key === "assists"
                        ? "leader-badge--assists"
                        : board.key === "points"
                          ? "leader-badge--points"
                          : board.key === "matches"
                            ? "leader-badge--matches"
                            : board.key === "discipline"
                              ? "leader-badge--discipline"
                              : "leader-badge--efficiency";

                  return (
                    <Card
                      key={board.key}
                      className="relative min-h-[232px] overflow-visible rounded-[var(--radius-inner)] border border-border shadow-none flex flex-col z-0"
                    >
                      <div className="border-b border-border p-4 flex-1">
                        <div className="flex items-start justify-between gap-4 h-full">
                          <div className="min-w-0 flex flex-col justify-between h-full">
                            <Badge
                              variant="outline"
                              pill
                              size="sm"
                              className={cn(
                                "leader-badge",
                                badgeTone
                              )}
                            >
                              {board.label}
                            </Badge>
                            <div className="mt-auto mb-0">
                                {board.key === "eff" ? (
                                  <div className="flex items-end gap-2">
                                    <div className={cn("text-6xl font-black tabular-nums leading-none", board.accent)}>
                                      {topNumber}
                                    </div>
                                    <div className="pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/60">
                                      /матч
                                    </div>
                                  </div>
                                ) : (
                                  <div className={cn("text-6xl font-black tabular-nums leading-none", board.accent)}>
                                    {topNumber}
                                  </div>
                                )}
                            </div>
                            <div className="mt-1">
                              {top ? (
                                <LeaderName player={{ name: top.name }} />
                              ) : (
                                <div className="text-sm font-semibold text-foreground truncate">—</div>
                              )}
                            </div>
                          </div>
                          <div className="shrink-0 self-center perspective-container" style={{ perspective: "1000px" }}>
                            {top ? (
                              <FifaCard
                                player={{
                                  name: top.name,
                                  avatarUrl: top.avatarUrl ?? null,
                                }}
                                rating={board.topRating} 
                                position={roleLabelCompact(top.position)}
                                clubLogoUrl={teamLogo}
                              />
                            ) : null}
                          </div>
                        </div>
                      </div>
                      {board.showList.length === 0 && board.isEmpty ? (
                        <div className="p-4 text-sm text-muted-foreground bg-muted/5">
                          {board.emptyText}
                        </div>
                      ) : (
                        <div className="divide-y divide-border bg-muted/5">
                          {board.showList.map((p, idx) => (
                            <div
                              key={`${board.key}-${p.playerId}`}
                              className="flex items-center justify-between px-4 py-2.5 text-sm hover:bg-muted/20 transition-colors"
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <span className="w-4 text-[10px] font-bold text-muted-foreground/50 text-center">
                                  0{idx + 2}
                                </span>
                                <PlayerAvatar player={p} size={28} />
                                <span className="font-medium text-foreground truncate text-sm">
                                  {p.name}
                                </span>
                              </div>
                              <span className="font-bold tabular-nums text-foreground/90 pl-2">
                                {board.key === "eff"
                                  ? (board.getValue(p) ? board.getValue(p).toFixed(1) : "0.0")
                                  : board.key === "discipline"
                                    ? formatDisciplineNode(p)
                                    : board.getValue(p)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>
            )}
          </Card>

          <Card className="rounded-[var(--radius-section)] border border-border bg-card shadow-none">
            <div className="border-b border-border p-5">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-lg)] border border-primary/40 bg-primary/5 text-primary">
                    <Filter className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-foreground">Статистика гравців</div>
                    <div className="text-xs text-muted-foreground">Фільтруй та аналізуй</div>
                  </div>
                </div>

                <div className="flex flex-1 flex-wrap items-center justify-end gap-3">
                  <Select value={selectedTournamentId} onValueChange={setSelectedTournamentId}>
                    <SelectTrigger className={cn(CONTROL_BASE, "w-[240px]")}>
                      <SelectValue placeholder="Турнір" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Всі турніри</SelectItem>
                      {availableTournaments.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <div className="relative w-full max-w-[240px]">
                    <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      className={cn(CONTROL_BASE, "pl-9 pr-8")}
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Пошук..."
                    />
                    {query && (
                      <Button
                        type="button"
                        variant="control"
                        size="iconSm"
                        onClick={() => setQuery("")}
                        className="absolute right-2 top-1/2 -translate-y-1/2"
                        aria-label="Очистити пошук"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="p-0 overflow-visible">
              {loading ? (
                <div className="space-y-2 p-5">
                  {Array(6).fill(0).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : playerStats.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                  <Search className="mb-2 h-8 w-8 opacity-20" />
                  <p>Гравців не знайдено</p>
                  <p className="text-xs">Спробуй змінити фільтри</p>
                </div>
              ) : (
                <Table variant="analytics" size="md">
                  <TableHeader>
                    <TableRow>
                      <TableNumberHeaderCell widthClass="w-[24px]">#</TableNumberHeaderCell>
                      <TableCenterHeaderCell widthClass="w-[24px]" title="Зміна позиції">Δ</TableCenterHeaderCell>
                      <TableTextHeaderCell widthClass="w-[260px]">Гравець</TableTextHeaderCell>
                      
                      <TableHeaderCell widthClass="w-[100px]" title="Останні 5 матчів (Особисті дії)">
                        <div className="flex items-center gap-1">
                          <span>Форма</span>
                          <FormLegendTooltip />
                        </div>
                      </TableHeaderCell>
                      <SortableHead 
                        label="Матчі" 
                        sKey="matches" 
                        sortConfig={sortConfig} 
                        onSort={handleSort} 
                        width="w-[80px]"
                      />
                      <SortableHead 
                        label="Голи" 
                        sKey="goals" 
                        sortConfig={sortConfig} 
                        onSort={handleSort} 
                        width="w-[80px]"
                      />
                       <SortableHead 
                        label="Асисти" 
                        sKey="assists" 
                        sortConfig={sortConfig} 
                        onSort={handleSort} 
                        width="w-[80px]"
                      />
                       <SortableHead 
                        label="Г+П" 
                        sKey="points" 
                        sortConfig={sortConfig} 
                        onSort={handleSort} 
                        width="w-[80px]"
                      />
                      <SortableHead 
                        label="ЖК" 
                        sKey="discipline" 
                        sortConfig={sortConfig} 
                        onSort={handleSort} 
                        width="w-[60px]"
                        title="Жовті картки"
                      />
                      <SortableHead 
                        label="ЧК" 
                        sKey="discipline" 
                        sortConfig={sortConfig} 
                        onSort={handleSort} 
                        width="w-[60px]"
                        title="Червоні картки"
                      />

                      <SortableHead 
                        label={
                           <div className="flex items-center justify-center gap-1">
                              <Star className="h-3 w-3 fill-orange-400 text-orange-500" />
                              <span>RTG</span>
                           </div>
                        }
                        sKey="rating" 
                        sortConfig={sortConfig} 
                        onSort={handleSort} 
                        width="w-[90px]"
                      >
                        <RatingLegendTooltip />
                      </SortableHead>
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {playerStats.map((p, idx) => (
                      <TableRow key={p.playerId} className="group hover:bg-muted/40">
                        <TableNumberCell align="center" className="px-1 text-foreground/60">
                          {idx + 1}
                        </TableNumberCell>

                        <TableCell className="text-center px-0">
                          <RankChangeIndicatorWithTooltip 
                            delta={p.rankDelta} 
                            ratingBreakdown={p.ratingBreakdown}
                            totalRating={p.rating}
                          />
                        </TableCell>

                        <TableCell className="w-[260px]">
                          <Link
                            to={`/player/${p.playerId}`}
                            className="flex items-center gap-3 group/player focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 rounded-[var(--radius-md)]"
                          >
                            <PlayerAvatar player={p} size={36} />
                            
                            <div className="flex flex-col min-w-0">
                              <span className="text-sm font-semibold text-foreground truncate leading-tight group/player-hover:underline group/player-hover:decoration-border group/player-hover:underline-offset-4">
                                {p.name}
                              </span>

                              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                                {p.shirtNumber !== null ? (
                                  <>
                                    <span className="font-mono font-medium text-muted-foreground/80">
                                      #{p.shirtNumber}
                                    </span>
                                    <span className="text-muted-foreground/30">•</span>
                                  </>
                                ) : null}
                                <span className="text-muted-foreground/80">
                                  {roleLabelText(p.position)}
                                </span>
                              </div>
                            </div>
                          </Link>
                        </TableCell>

                        <TableCell className="text-center px-0">
                           <FormIndicator results={p.last5} ourLogo={teamLogo} ourName={teamName} />
                        </TableCell>

                        <TableCell className="text-center font-medium text-foreground/90">
                          {p.matches || <span className="text-muted-foreground/30">—</span>}
                        </TableCell>
                        <TableCell className="text-center font-medium text-foreground/90">
                          {p.goals || <span className="text-muted-foreground/30">—</span>}
                        </TableCell>
                        <TableCell className="text-center font-medium text-foreground/90">
                          {p.assists || <span className="text-muted-foreground/30">—</span>}
                        </TableCell>

                        <TableCell className="text-center text-muted-foreground">
                          {p.goals + p.assists}
                        </TableCell>

                        <TableCell className="text-center">
                          {p.yellow > 0 ? (
                            <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-[var(--radius)] bg-yellow-500/10 px-1 text-xs font-bold text-yellow-600">
                              {p.yellow}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/30">—</span>
                          )}
                        </TableCell>

                        <TableCell className="text-center">
                          {p.red > 0 ? (
                            <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-[var(--radius)] bg-red-500/10 px-1 text-xs font-bold text-red-600">
                              {p.red}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/30">—</span>
                          )}
                        </TableCell>

                        <TableCell className="text-center">
    <PlayerRatingTooltip player={p}>
        <div className="flex justify-center">
            <Badge
              variant="outline"
              className={cn(
                "rating-badge",
                // Bronze (< 75)
                p.rating < 75 && "rating-badge--bronze",

                // Silver (75-84)
                p.rating >= 75 && p.rating < 85 && "rating-badge--silver",

                // Gold (85-93)
                p.rating >= 85 && p.rating < 94 && "rating-badge--gold",

                // Elite (94-96)
                p.rating >= 94 && p.rating < 97 && "rating-badge--elite",

                // Legendary (97+)
                p.rating >= 97 && "rating-badge--legendary"
              )}
            >
              {p.rating}
            </Badge>
        </div>
    </PlayerRatingTooltip>
</TableCell>

                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </Card>
        </>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
           <Card className="rounded-[var(--radius-section)] shadow-none border border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Trophy className="h-4 w-4 text-primary" /> Результати команди
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-20 rounded-[var(--radius-lg)]" />
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-border pb-2">
                    <span className="text-sm text-muted-foreground">Матчі</span>
                    <span className="text-lg font-bold">{teamKpi.matches}</span>
                  </div>
                  <div className="flex items-center justify-between border-b border-border pb-2">
                    <span className="text-sm text-muted-foreground">Перемоги / Нічиї / Поразки</span>
                    <div className="flex gap-1 text-lg font-bold">
                      <span className="text-green-600">{teamKpi.wins}</span> /
                      <span className="text-muted-foreground">{teamKpi.draws}</span> /
                      <span className="text-red-500">{teamKpi.losses}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-sm text-muted-foreground">Різниця м'ячів</span>
                    <span className="text-lg font-bold">
                      {teamKpi.goalsFor} : {teamKpi.goalsAgainst}
                      <span
                        className={cn(
                          "ml-2 text-sm",
                          (teamKpi.goalsFor - teamKpi.goalsAgainst) >= 0 ? "text-green-600" : "text-red-500"
                        )}
                      >
                        ({teamKpi.goalsFor - teamKpi.goalsAgainst > 0 ? "+" : ""}
                        {teamKpi.goalsFor - teamKpi.goalsAgainst})
                      </span>
                    </span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-[var(--radius-section)] shadow-none border border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" /> Відвідуваність
              </CardTitle>
              <p className="text-sm text-muted-foreground">Активність за останні 30 днів</p>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-20 rounded-[var(--radius-lg)]" />
              ) : (
                <div className="flex flex-col items-center justify-center py-4">
                  <div className="text-4xl font-black text-foreground">{teamKpi.attendanceRate30d}%</div>
                  <div className="mt-2 text-xs text-muted-foreground">Середня явка гравців</div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
