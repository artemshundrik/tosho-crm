import React, { useEffect, useMemo, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";

// UI Components
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { 
  ArrowLeft, Calendar, Trophy, Zap, Activity, 
  TrendingUp, Shirt, Star, Timer, Target, Info
} from "lucide-react";

// Charts
import { 
  XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, AreaChart, Area 
} from "recharts";

import { cn } from "@/lib/utils";
// Імпортуємо картку (переконайтеся, що шлях правильний до вашого файлу StatsPageFinal)
import { FifaCard } from "./StatsPage"; 

// --- TYPES ---
type Player = {
  id: string;
  first_name: string;
  last_name: string;
  shirt_number: number | null;
  position: string | null;
  birthday: string | null;
  photo_url: string | null;
  team_id: string;
};

type MatchRow = {
  id: string;
  opponent_name: string | null;
  opponent_logo_url: string | null;
  match_date: string;
  status: "scheduled" | "played" | "canceled";
  score_team: number | null;
  score_opponent: number | null;
  tournament_id: string | null;
  tournaments?: { short_name: string | null } | { short_name: string | null }[] | null;
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
};

type MatchAttendanceRow = {
  match_id: string;
  player_id: string;
  created_at: string;
};

type TrainingAttendanceRow = {
  training_id: string;
  player_id: string;
  status: "present" | "absent" | "injured" | "sick";
  created_at: string;
};

type TrainingRow = {
  id: string;
  date: string;
  time: string | null;
};

type TrainingSession = {
  id: string;
  date: string;
  time: string | null;
  status: TrainingAttendanceRow["status"];
};

type RatingBreakdown = {
  base: number;
  performance: number;
  experience: number;
  discipline: number;
  label?: string;
};

// --- HELPERS ---

function getAge(birthday: string | null) {
  if (!birthday) return null;
  const ageDifMs = Date.now() - new Date(birthday).getTime();
  const ageDate = new Date(ageDifMs);
  return Math.abs(ageDate.getUTCFullYear() - 1970);
}

function getPositionLabel(pos: string | null) {
  if (!pos) return "Гравець";
  const p = pos.toLowerCase();
  if (p.includes("gk") || p.includes("goalkeeper")) return "Воротар";
  return "Універсал";
}

function roleLabelCompact(position: string | null | undefined) {
  return (position ?? "").toUpperCase() === "GK" ? "ВР" : "УН";
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

function normalizeAssetUrl(url: string | null | undefined): string | null {
  const u = (url ?? "").trim();
  if (!u) return null;
  if (u.startsWith("http://") || u.startsWith("https://") || u.startsWith("data:")) return u;
  // Якщо це відносний шлях з Supabase Storage
  if (u.startsWith("/")) {
      const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string)?.replace(/\/+$/, "");
      return `${supabaseUrl}/storage/v1/object/public${u}`;
  }
  return u;
}

// --- ПОВНА ЛОГІКА РЕЙТИНГУ (з StatsPageFinal) ---
function calculateRatingWithBreakdown(
  player: { goals: number; assists: number; matches: number; yellow: number; red: number; position: string | null },
  rawPoints: number,
  contextMaxMatches: number,
  contextMaxPoints: number
): { value: number; breakdown: RatingBreakdown } {
  
  const BASE_RATING = 50;
  // Логіка визначення "короткого турніру" або "сезону"
  // Якщо maxMatches у команді мало (наприклад, старт сезону),
  // то формула має адаптуватися, щоб не занижувати рейтинг.
  const isShortTournament = contextMaxMatches < 6;

  const xpThreshold = isShortTournament ? contextMaxMatches : 15;
  const participationRate = Math.min(1.0, player.matches / Math.max(1, xpThreshold));
  const MAX_XP_BONUS = 20;
  const xpScore = participationRate * MAX_XP_BONUS;

  const discipline = (player.yellow * 0.3) + (player.red * 2);

  let calculatedRawPoints = rawPoints;
  // Авто-розрахунок очок, якщо не передали
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

  // Soft Cap Compression
  if (finalRating > softCap) {
      const excess = finalRating - softCap;
      finalRating = softCap + (excess * compression);
  }

  if (finalRating > hardCap) finalRating = hardCap;
  if (finalRating < 50) finalRating = 50;

  return {
    value: Math.round(finalRating),
    breakdown: {
      base: BASE_RATING,
      performance: Number((skillScore + formScore).toFixed(1)),
      experience: Number(xpScore.toFixed(1)),
      discipline,
      label: "Skill"
    }
  };
}

function monthKeyUA(date: string) {
  const d = new Date(date);
  const m = new Intl.DateTimeFormat("uk-UA", { month: "short" }).format(d);
  const y = new Intl.DateTimeFormat("uk-UA", { year: "numeric" }).format(d);
  return `${m.charAt(0).toUpperCase() + m.slice(1)} ${y}`;
}

function formatTrainingMeta(date: string, time: string | null) {
  const d = new Date(`${date}T${time || "00:00"}`);
  const weekday = new Intl.DateTimeFormat("uk-UA", { weekday: "short" })
    .format(d)
    .replace(".", "");
  const dateLabel = new Intl.DateTimeFormat("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
  const timeLabel = time
    ? time.slice(0, 5)
    : new Intl.DateTimeFormat("uk-UA", { hour: "2-digit", minute: "2-digit" }).format(d);
  return `${weekday.charAt(0).toUpperCase() + weekday.slice(1)} • ${dateLabel} • ${timeLabel}`;
}

const trainingStatusMeta: Record<
  TrainingAttendanceRow["status"],
  { label: string; tone: "success" | "neutral" | "danger" | "info" }
> = {
  present: { label: "Присутній", tone: "success" },
  absent: { label: "Відсутній", tone: "neutral" },
  injured: { label: "Травма", tone: "danger" },
  sick: { label: "Хворів", tone: "info" },
};

// --- UI COMPONENTS ---

// 1. Bento Grid Stat Card
function StatCard({ label, value, subLabel, icon: Icon, colorClass, trend }: any) {
  return (
    <div className="relative overflow-hidden rounded-[20px] border border-white/5 bg-card p-5 shadow-sm transition-all hover:shadow-md hover:bg-muted/20 group">
      <div className="flex items-start justify-between z-10 relative">
        <div className="space-y-1">
           <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground opacity-80">{label}</p>
           <div className={cn("text-3xl font-black tabular-nums tracking-tight group-hover:scale-105 transition-transform origin-left duration-300", colorClass)}>
             {value}
           </div>
           {subLabel && <p className="text-xs text-muted-foreground font-medium">{subLabel}</p>}
           {trend && (
             <div className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-bold text-emerald-500 mt-1">
                <TrendingUp className="h-3 w-3" /> {trend}
             </div>
           )}
        </div>
        <div className={cn("flex h-10 w-10 items-center justify-center rounded-2xl bg-muted/30 transition-colors group-hover:bg-muted/50", colorClass && "bg-opacity-10")}>
           <Icon className={cn("h-5 w-5 opacity-60", colorClass)} />
        </div>
      </div>
      {/* Decorative gradient blob */}
      <div className={cn("absolute -bottom-6 -right-6 h-20 w-20 rounded-full blur-2xl opacity-10 transition-opacity group-hover:opacity-20", colorClass?.replace('text-', 'bg-'))} />
    </div>
  );
}

// 2. Recent Form (Visual Timeline)
function FormTimeline({ matches, playerId }: { matches: any[], playerId: string }) {
  if (!matches.length) return <div className="text-xs text-muted-foreground">Немає зіграних матчів</div>;
  
  const last5 = matches.slice(0, 5);
  
  return (
    <div className="flex gap-2">
      {last5.map((m) => {
        const isWin = m.match.score_team > m.match.score_opponent;
        const isDraw = m.match.score_team === m.match.score_opponent;
        
        let bgColor = "bg-slate-500/20 text-slate-500 border-slate-500/30"; // Draw/Loss default
        let label = "D";
        
        if (isWin) {
            bgColor = "bg-emerald-500/20 text-emerald-500 border-emerald-500/30 shadow-[0_0_10px_-3px_rgba(16,185,129,0.3)]";
            label = "W";
        } else if (!isDraw) {
            bgColor = "bg-red-500/20 text-red-500 border-red-500/30";
            label = "L";
        }

        const oppLogo = normalizeAssetUrl(m.match.opponent_logo_url);

        return (
          <div key={m.match.id} className="flex flex-col items-center gap-1.5">
             <div 
                className={cn("flex h-8 w-8 items-center justify-center rounded-full border text-[10px] font-black transition-transform hover:scale-110 cursor-default", bgColor)}
                title={`${new Date(m.match.match_date).toLocaleDateString()} vs ${m.match.opponent_name}`}
             >
                {label}
             </div>
             {/* Opponent Mini Logo if available */}
             <div className="h-4 w-4 overflow-hidden rounded-full bg-muted border border-border/50">
                {oppLogo ? (
                    <img src={oppLogo} alt="" className="h-full w-full object-cover" />
                ) : (
                    <div className="h-full w-full flex items-center justify-center text-[6px] text-muted-foreground font-bold">VS</div>
                )}
             </div>
          </div>
        );
      })}
    </div>
  );
}

// 3. Match Row Item (Refined)
function MatchRowItem({ match, contribution }: any) {
  const isWin = match.score_team > match.score_opponent;
  const isDraw = match.score_team === match.score_opponent;
  
  const resultClass = isWin 
    ? "text-emerald-500" 
    : isDraw 
      ? "text-slate-500" 
      : "text-red-500";
  
  const tournament = Array.isArray(match.tournaments) ? match.tournaments[0] : match.tournaments;
  const oppLogo = normalizeAssetUrl(match.opponent_logo_url);

  return (
    <div className="group relative flex items-center justify-between rounded-xl border border-border/40 bg-card/40 p-3 transition-all hover:bg-card hover:border-border/80 hover:shadow-sm">
       {/* Left: Date & Opponent */}
       <div className="flex items-center gap-3">
          <div className="flex flex-col items-center justify-center rounded-lg bg-muted/30 px-2 py-1 min-w-[40px]">
             <span className="text-[10px] font-bold uppercase text-muted-foreground">
                {new Date(match.match_date).toLocaleDateString("uk-UA", { month: 'short' }).replace('.', '')}
             </span>
             <span className="text-sm font-black text-foreground">
                {new Date(match.match_date).getDate()}
             </span>
          </div>
          
          <div className="flex items-center gap-3">
             <div className="h-8 w-8 overflow-hidden rounded-full bg-white/5 border border-white/10 p-0.5">
                {oppLogo ? (
                   <img src={oppLogo} alt={match.opponent_name} className="h-full w-full object-cover rounded-full" />
                ) : (
                   <div className="h-full w-full flex items-center justify-center bg-muted text-[8px] font-bold text-muted-foreground">OP</div>
                )}
             </div>
             <div className="flex flex-col">
                <span className="text-sm font-bold leading-tight">{match.opponent_name || "Суперник"}</span>
                <span className="text-[10px] text-muted-foreground">{tournament?.short_name || "Турнір"}</span>
             </div>
          </div>
       </div>

       {/* Right: Score & Stats */}
       <div className="flex items-center gap-4">
          {/* Stats Badges */}
          <div className="flex gap-1">
             {contribution.goals > 0 && (
                <Badge variant="secondary" className="h-5 px-1.5 text-[10px] bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 border-0 font-bold">
                    {contribution.goals}G
                </Badge>
             )}
             {contribution.assists > 0 && (
                <Badge variant="secondary" className="h-5 px-1.5 text-[10px] bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 border-0 font-bold">
                    {contribution.assists}A
                </Badge>
             )}
          </div>

          <div className={cn("text-lg font-black tabular-nums tracking-tight", resultClass)}>
             {match.score_team}:{match.score_opponent}
          </div>
       </div>
    </div>
  );
}


// --- MAIN PAGE COMPONENT ---

export function PlayerPage() {
  const { playerId } = useParams();
  const [loading, setLoading] = useState(true);
  const [player, setPlayer] = useState<Player | null>(null);
  
  // States
  const [stats, setStats] = useState({ matches: 0, goals: 0, assists: 0, points: 0, yellow: 0, red: 0 });
  const [recentMatches, setRecentMatches] = useState<any[]>([]);
  const [trainingData, setTrainingData] = useState<any[]>([]); 
  const [trainingSummary, setTrainingSummary] = useState({ present: 0, absent: 0, percent: 0, total: 0 });
  const [trainingSessions, setTrainingSessions] = useState<TrainingSession[]>([]);
  const [trainingBreakdown, setTrainingBreakdown] = useState({
    total: 0,
    present: 0,
    absent: 0,
    injured: 0,
    sick: 0,
  });
  const [trainingFilter, setTrainingFilter] = useState<"all" | TrainingAttendanceRow["status"]>("all");
  
  // Rating
  const [rating, setRating] = useState(60);
  const [ratingBreakdown, setRatingBreakdown] = useState<RatingBreakdown | null>(null);

  // --- DATA LOADING ---
  useEffect(() => {
    async function load() {
      if (!playerId) return;
      setLoading(true);

      // 1. Fetch Player
      const { data: playerData } = await supabase
        .from("players")
        .select("id, first_name, last_name, shirt_number, position, birthday, photo_url, team_id")
        .eq("id", playerId)
        .single();

      if (!playerData) {
        setPlayer(null);
        setLoading(false);
        return;
      }
      setPlayer(playerData as Player);
      const teamId = playerData.team_id;

      // 2. PARALLEL FETCHING:
      // - Matches (played)
      // - Team Roster (to know total players)
      // - Training Attendance
      // - TEAM STATS (Critical for correct Rating!)
      const [matchesRes, rosterRes, trainingAttendanceRes, teamEventsRes] = await Promise.all([
        supabase
          .from("matches")
          .select(`
            id, opponent_name, opponent_logo_url, match_date, status, score_team, score_opponent, tournament_id,
            tournaments:tournament_id ( short_name )
          `)
          .eq("team_id", teamId)
          .eq("status", "played")
          .order("match_date", { ascending: false })
          .limit(300),
        
        supabase.from("players").select("id, position").eq("team_id", teamId),
        
        supabase.from("training_attendance")
          .select("training_id, player_id, status, created_at")
          .eq("player_id", playerId),

        // Fetch ALL events for the team to calc Context Max Values
        supabase.from("match_events")
          .select("player_id, assist_player_id, event_type")
          .eq("team_id", teamId)
      ]);

      const matches = ((matchesRes.data ?? []) as MatchRow[]) ?? [];
      const roster = (rosterRes.data ?? []) as { id: string; position: string | null }[];
      const trainingAttendance = (trainingAttendanceRes.data ?? []) as TrainingAttendanceRow[];
      const allTeamEvents = (teamEventsRes.data ?? []) as { player_id: string | null, assist_player_id: string | null, event_type: string }[];

      const matchIds = matches.map((m) => m.id);

      // 3. Fetch Details for matches (Attendance & Events for THIS player context)
      const [attendanceRes, eventsRes] = matchIds.length > 0 
        ? await Promise.all([
            supabase.from("match_attendance").select("match_id, player_id").in("match_id", matchIds),
            supabase.from("match_events").select("*").eq("team_id", teamId).in("match_id", matchIds)
          ])
        : [{ data: [] }, { data: [] }];

      const attendanceRows = (attendanceRes.data ?? []) as MatchAttendanceRow[];
      const eventRows = (eventsRes.data ?? []) as MatchEventRow[];

      // --- CALCULATIONS ---

      // A. Match Attendance Map
      const attendanceByMatch = new Map<string, Set<string>>();
      // Count total matches per player for rating context
      const matchesPerPlayer = new Map<string, number>();

      attendanceRows.forEach(row => {
          if (!attendanceByMatch.has(row.match_id)) attendanceByMatch.set(row.match_id, new Set());
          attendanceByMatch.get(row.match_id)?.add(row.player_id);

          // Increment global match count for context
          matchesPerPlayer.set(row.player_id, (matchesPerPlayer.get(row.player_id) || 0) + 1);
      });

      // B. Match Events Map (Specific to this player view)
      const eventsByMatchAndPlayer = new Map<string, Map<string, { goals: number; assists: number; red: boolean }>>();
      eventRows.forEach(e => {
         if (!eventsByMatchAndPlayer.has(e.match_id)) eventsByMatchAndPlayer.set(e.match_id, new Map());
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
         if (isGoalEvent(t)) { update(e.player_id, "goal"); update(e.assist_player_id, "assist"); }
         if (isRed(t)) update(e.player_id, "red");
      });

      // C. Player Specific Stats
      let pMatches = 0, pGoals = 0, pAssists = 0, pYellow = 0, pRed = 0;
      const recent = [];

      for (const m of matches) {
          const playersInMatch = attendanceByMatch.get(m.id);
          if (playersInMatch?.has(playerId)) {
              pMatches++;
              const contribution = eventsByMatchAndPlayer.get(m.id)?.get(playerId) ?? { goals: 0, assists: 0, red: false };
              recent.push({ match: m, contribution });
          }
      }

      // Aggregate totals from all events for accurate summary
      // We re-loop specifically for totals to be safe
      eventRows.forEach(e => {
         if (e.player_id === playerId) {
            const t = (e.event_type ?? "").toLowerCase().trim();
            if (isGoalEvent(t)) pGoals++;
            if (isYellow(t)) pYellow++;
            if (isRed(t)) pRed++;
         }
         if (e.assist_player_id === playerId) {
            const t = (e.event_type ?? "").toLowerCase().trim();
            if (isGoalEvent(t)) pAssists++;
         }
      });

      // D. RATING CONTEXT CALCULATION (CRITICAL!)
      // Calculate max points among all teammates to normalize rating
      const teamStatsMap = new Map<string, { goals: number, assists: number }>();
      
      allTeamEvents.forEach(e => {
          const t = (e.event_type ?? "").toLowerCase().trim();
          if (isGoalEvent(t) && e.player_id) {
             const s = teamStatsMap.get(e.player_id) || { goals: 0, assists: 0 };
             s.goals++;
             teamStatsMap.set(e.player_id, s);
          }
          if (isGoalEvent(t) && e.assist_player_id) {
             const s = teamStatsMap.get(e.assist_player_id) || { goals: 0, assists: 0 };
             s.assists++;
             teamStatsMap.set(e.assist_player_id, s);
          }
      });

      let maxRawPointsInContext = 1;
      let maxMatchesInContext = 1;

      // Iterate all known players to find maxes
      roster.forEach(p => {
         const s = teamStatsMap.get(p.id) || { goals: 0, assists: 0 };
         const isGk = roleLabelCompact(p.position) === "ВР";
         const rp = (s.goals * 4) + (s.assists * (isGk ? 4 : 3));
         if (rp > maxRawPointsInContext) maxRawPointsInContext = rp;

         const m = matchesPerPlayer.get(p.id) || 0;
         if (m > maxMatchesInContext) maxMatchesInContext = m;
      });

      // E. Calculate Final Rating
      const isGk = roleLabelCompact(playerData.position) === "ВР";
      const calculatedRawPoints = (pGoals * 4) + (pAssists * (isGk ? 4 : 3));
      
      const { value: computedRating, breakdown: ratingBreakdownLocal } = calculateRatingWithBreakdown(
          { 
            goals: pGoals, assists: pAssists, matches: pMatches, 
            yellow: pYellow, red: pRed, position: playerData.position 
          },
          calculatedRawPoints,
          maxMatchesInContext, // Now using REAL context
          maxRawPointsInContext // Now using REAL context
      );

      // F. Process Training Data (latest status per training)
      const latestByTraining = new Map<string, TrainingAttendanceRow>();
      trainingAttendance.forEach((row) => {
        const prev = latestByTraining.get(row.training_id);
        if (!prev) {
          latestByTraining.set(row.training_id, row);
          return;
        }
        const prevTs = prev?.created_at ? new Date(prev.created_at).getTime() : -Infinity;
        const nextTs = row?.created_at ? new Date(row.created_at).getTime() : -Infinity;
        if (nextTs >= prevTs) latestByTraining.set(row.training_id, row);
      });

      const trainingIds = Array.from(latestByTraining.keys());
      const trainingsRes = trainingIds.length > 0 
         ? await supabase.from("trainings").select("id, date, time").in("id", trainingIds)
         : { data: [] };
      const trainings = (trainingsRes.data ?? []) as TrainingRow[];
      const trainingById = new Map(trainings.map(t => [t.id, t]));

      const sessions: TrainingSession[] = [];
      latestByTraining.forEach((row, trainingId) => {
        const t = trainingById.get(trainingId);
        if (!t?.date) return;
        sessions.push({
          id: trainingId,
          date: t.date,
          time: t.time ?? null,
          status: row.status,
        });
      });

      sessions.sort((a, b) => {
        const ta = new Date(`${a.date}T${a.time || "00:00"}`).getTime();
        const tb = new Date(`${b.date}T${b.time || "00:00"}`).getTime();
        return tb - ta;
      });

      const monthMap = new Map<string, { present: number; total: number; sortKey: number }>();
      sessions.forEach((row) => {
        const key = monthKeyUA(row.date);
        const d = new Date(row.date);
        const sortKey = new Date(d.getFullYear(), d.getMonth(), 1).getTime();

        const entry = monthMap.get(key) ?? { present: 0, total: 0, sortKey };
        entry.total++;
        if (row.status === "present") entry.present++;
        monthMap.set(key, entry);
      });

      const trainingSeries = Array.from(monthMap.entries())
         .sort((a, b) => a[1].sortKey - b[1].sortKey)
         .map(([name, val]) => ({
             name,
             percent: val.total > 0 ? Math.round((val.present / val.total) * 100) : 0
         }));
      
      const trainingCounts = sessions.reduce(
        (acc, row) => {
          acc.total += 1;
          if (row.status === "present") acc.present += 1;
          if (row.status === "absent") acc.absent += 1;
          if (row.status === "injured") acc.injured += 1;
          if (row.status === "sick") acc.sick += 1;
          return acc;
        },
        { total: 0, present: 0, absent: 0, injured: 0, sick: 0 }
      );

      const tTotal = trainingCounts.total;
      const tPresent = trainingCounts.present;

      // Update State
      setStats({
          matches: pMatches, goals: pGoals, assists: pAssists,
          points: pGoals + pAssists, yellow: pYellow, red: pRed
      });
      setRecentMatches(recent);
      setTrainingData(trainingSeries);
      setTrainingSessions(sessions);
      setTrainingBreakdown(trainingCounts);
      setTrainingSummary({
          present: tPresent,
          absent: tTotal - tPresent,
          total: tTotal,
          percent: tTotal > 0 ? Math.round((tPresent / tTotal) * 100) : 0
      });
      setRating(computedRating);
      setRatingBreakdown(ratingBreakdownLocal);
      setLoading(false);
    }

    load();
  }, [playerId]);

  const trainingFilters = useMemo(
    () => [
      { id: "all" as const, label: "Усі", count: trainingBreakdown.total },
      { id: "present" as const, label: "Присутній", count: trainingBreakdown.present },
      { id: "absent" as const, label: "Відсутній", count: trainingBreakdown.absent },
      { id: "injured" as const, label: "Травма", count: trainingBreakdown.injured },
      { id: "sick" as const, label: "Хворів", count: trainingBreakdown.sick },
    ],
    [trainingBreakdown]
  );

  const filteredTrainingSessions = useMemo(() => {
    if (trainingFilter === "all") return trainingSessions;
    return trainingSessions.filter((s) => s.status === trainingFilter);
  }, [trainingFilter, trainingSessions]);

  const groupedTrainingSessions = useMemo(() => {
    const map = new Map<string, { items: TrainingSession[]; sortKey: number }>();
    filteredTrainingSessions.forEach((session) => {
      const key = monthKeyUA(session.date);
      const ts = new Date(session.date).getTime();
      const entry = map.get(key) ?? { items: [], sortKey: ts };
      entry.items.push(session);
      entry.sortKey = Math.max(entry.sortKey, ts);
      map.set(key, entry);
    });
    return Array.from(map.entries()).sort((a, b) => b[1].sortKey - a[1].sortKey);
  }, [filteredTrainingSessions]);

  // Training Chart Calc
  const trainingCircumference = 2 * Math.PI * 40; 
  const trainingOffset = trainingSummary.total > 0
    ? trainingCircumference - (trainingCircumference * trainingSummary.percent) / 100
    : trainingCircumference;

  // Loading Screen
  if (loading) {
     return (
       <div className="space-y-6 pt-6">
         <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
           <Skeleton className="h-[300px] w-full rounded-[2.5rem]" />
           <Skeleton className="h-[300px] w-full rounded-[2.5rem]" />
         </div>
       </div>
     );
  }

  if (!player) return <div className="p-10 text-center text-muted-foreground">Гравця не знайдено</div>;

  const fullName = `${player.first_name} ${player.last_name}`.trim();
  const positionLabel = getPositionLabel(player.position);
  
  return (
    <div className="flex flex-col gap-6 pb-12 animate-in fade-in duration-500">
      
{/* --- HERO SECTION --- */}
      <div className="hero-card-premium group mb-8">
         
         {/* Background Effects (Subtle in Light, Rich in Dark) */}
         <div className="absolute inset-0 z-0">
            {/* Тільки в темній темі показуємо кольорові плями */}
            <div className="dark:block hidden">
               <div className="absolute -top-[50%] -left-[20%] w-[800px] h-[800px] bg-blue-600/20 rounded-full blur-[100px] mix-blend-screen pointer-events-none" />
               <div className="absolute top-[20%] -right-[10%] w-[600px] h-[600px] bg-indigo-600/20 rounded-full blur-[100px] mix-blend-screen pointer-events-none" />
            </div>
            {/* Шум і сітка */}
            <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-5 mix-blend-overlay pointer-events-none" />
         </div>

         <div className="relative z-10 flex flex-col lg:flex-row p-8 lg:p-12 gap-10 items-center lg:items-start">
            
            {/* LEFT: 3D CARD */}
            <div className="shrink-0 perspective-container flex justify-center">
               <div className="relative transition-all duration-500 hover:scale-105 hover:-rotate-1">
                 <FifaCard 
                    player={{ name: fullName, avatarUrl: player.photo_url }}
                    rating={rating}
                    position={roleLabelCompact(player.position)}
                    // Адаптивна тінь для самої картки всередині
                    className="w-[260px] h-[360px] shadow-2xl ring-1 ring-black/5 dark:ring-white/10"
                 />
               </div>
            </div>

            {/* RIGHT: PLAYER INFO */}
            <div className="flex-1 w-full text-center lg:text-left space-y-8 pt-4 z-10">
               
               <div className="space-y-1">
                  {/* Badges Row (Adaptive Colors) */}
                  <div className="flex flex-wrap items-center justify-center lg:justify-start gap-3 mb-6 opacity-90">
                      {/* Shirt Number */}
                      <div className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold border backdrop-blur-md transition-colors
                                      bg-slate-100 border-slate-200 text-slate-700
                                      dark:bg-white/10 dark:border-white/5 dark:text-white">
                          <Shirt className="h-3.5 w-3.5 opacity-70" />
                          <span>#{player.shirt_number ?? "-"}</span>
                      </div>
                      
                      {/* Age */}
                      <div className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold border backdrop-blur-md transition-colors
                                      bg-slate-100 border-slate-200 text-slate-700
                                      dark:bg-white/5 dark:border-white/5 dark:text-slate-300">
                          <span>{getAge(player.birthday)} років</span>
                      </div>

                      {/* Rating */}
                      <div className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold border backdrop-blur-md transition-colors
                                      bg-indigo-50 border-indigo-200 text-indigo-700
                                      dark:bg-indigo-500/20 dark:border-indigo-500/30 dark:text-indigo-200">
                          <Star className="h-3.5 w-3.5 fill-current" />
                          <span>Rating {rating}</span>
                      </div>
                  </div>
                  
                  {/* NAME */}
                  <h1 className="flex flex-col">
                    <span className="hero-subtitle-name">
                      {player.first_name}
                    </span>
                    <span className="hero-title-name">
                      {player.last_name}
                    </span>
                  </h1>
                  
                  {/* TEAM INFO */}
                  <p className="text-lg flex items-center justify-center lg:justify-start gap-3 pt-2 font-medium">
                     <span className="px-2 py-0.5 rounded text-sm uppercase tracking-wide
                                      bg-indigo-100 text-indigo-700
                                      dark:bg-indigo-500/10 dark:text-indigo-400">
                        {positionLabel}
                     </span> 
                     
                     <span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-600"></span> 
                     
                     <span className="hero-text-team">
                        FAYNA TEAM
                     </span>
                  </p>
               </div>

               {/* --- STATS GRID (FIXED) --- */}
               <div className="grid grid-cols-3 gap-3 max-w-[420px] mx-auto lg:mx-0 pt-2">
                  
                  {/* 1. MATCHES */}
                  <div className="hero-stat-box group">
                     <span className="stat-lbl stat-lbl-neutral">Матчі</span>
                     <span className="stat-val-neutral">{stats.matches}</span>
                  </div>
                  
                  {/* 2. GOALS */}
                  <div className="hero-stat-box group">
                     {/* Hover effect background */}
                     <div className="stat-box-blue-hover" />
                     
                     <span className="stat-lbl group-hover:text-blue-600 dark:group-hover:text-blue-300 transition-colors">
                        Голи
                     </span>
                     <span className="stat-val-blue">
                        {stats.goals}
                     </span>
                  </div>
                  
                  {/* 3. ASSISTS */}
                  <div className="hero-stat-box group">
                     {/* Hover effect background */}
                     <div className="stat-box-emerald-hover" />
                     
                     <span className="stat-lbl group-hover:text-emerald-600 dark:group-hover:text-emerald-300 transition-colors">
                        Асисти
                     </span>
                     <span className="stat-val-emerald">
                        {stats.assists}
                     </span>
                  </div>
               </div>

               {/* Back Button */}
               <div className="pt-4">
                  <Button variant="ghost" className="rounded-full px-6 transition-all duration-300 group -ml-4
                                                     text-slate-500 hover:bg-slate-100 hover:text-slate-900
                                                     dark:text-slate-400 dark:hover:text-white dark:hover:bg-white/5" asChild>
                     <Link to="/admin/players">
                        <ArrowLeft className="mr-2 h-4 w-4 transition-transform group-hover:-translate-x-1"/> 
                        <span className="font-medium">До списку гравців</span>
                     </Link>
                  </Button>
               </div>
            </div>
         </div>
      </div>

      {/* --- 2. TABS & CONTENT --- */}
      <Tabs defaultValue="overview" className="space-y-6">
        <div className="sticky top-0 z-40 bg-background/80 backdrop-blur-lg border-b border-border pb-px -mx-4 px-4 md:mx-0 md:px-0 md:static md:bg-transparent md:border-0">
            <TabsList className="bg-transparent p-0 gap-6 w-full justify-start h-auto overflow-x-auto no-scrollbar">
            {[
                { id: "overview", label: "Огляд" },
                { id: "matches", label: "Матчі" },
                { id: "training", label: "Тренування" },
                { id: "tournaments", label: "Турніри" }
            ].map(tab => (
                <TabsTrigger 
                    key={tab.id} 
                    value={tab.id}
                    className="relative rounded-none border-b-2 border-transparent bg-transparent px-2 pb-3 pt-2 font-semibold text-muted-foreground shadow-none transition-all data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none hover:text-foreground text-sm md:text-base md:px-4"
                >
                    {tab.label}
                </TabsTrigger>
            ))}
            </TabsList>
        </div>

        {/* --- TAB: OVERVIEW --- */}
        <TabsContent value="overview" className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
           
           {/* BENTO GRID KPI */}
           <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard label="Рейтинг" value={rating} icon={Star} colorClass="text-yellow-600" />
              <StatCard label="Гол + Пас" value={stats.points} icon={Zap} colorClass="text-indigo-500" />
              <StatCard label="Ефективність" value={stats.matches ? (stats.points / stats.matches).toFixed(2) : "0.0"} subLabel="дії за матч" icon={Target} colorClass="text-rose-500" />
              <StatCard label="Хвилин" value={stats.matches * 50} subLabel="приблизно" icon={Timer} colorClass="text-slate-500" /> 
           </div>

           <div className="grid md:grid-cols-3 gap-6">
              
              {/* LEFT COL: FORM & MATCHES */}
              <div className="md:col-span-2 space-y-6">
                 {/* Recent Form Card */}
                 <Card className="rounded-[24px] border-border shadow-sm overflow-hidden">
                    <CardHeader className="flex flex-row items-center justify-between pb-4 border-b border-border/50 bg-muted/20">
                       <div className="space-y-1">
                          <CardTitle className="text-lg flex items-center gap-2">
                             <Activity className="h-5 w-5 text-primary" />
                             Ігрова форма
                          </CardTitle>
                       </div>
                       <div className="flex items-center gap-3">
                          <span className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">Останні 5 ігор</span>
                          <FormTimeline matches={recentMatches} playerId={player.id} />
                       </div>
                    </CardHeader>
                    <CardContent className="grid gap-2 pt-4 p-4">
                       {recentMatches.length > 0 ? (
                          recentMatches.slice(0, 4).map((m: any) => (
                             <MatchRowItem key={m.match.id} match={m.match} contribution={m.contribution} />
                          ))
                       ) : (
                          <div className="py-12 text-center text-muted-foreground flex flex-col items-center">
                             <Calendar className="h-10 w-10 opacity-20 mb-2" />
                             <span>Матчів ще не зіграно</span>
                          </div>
                       )}
                       {recentMatches.length > 0 && (
                           <Button variant="ghost" className="w-full text-muted-foreground mt-2 hover:text-foreground" asChild>
                             <Link to="?tab=matches">Всі матчі <ArrowLeft className="ml-1 h-4 w-4 rotate-180" /></Link>
                           </Button>
                       )}
                    </CardContent>
                 </Card>

                 {/* Activity Chart */}
                 <Card className="rounded-[24px] border-border shadow-sm">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-lg">Активність гравця</CardTitle>
                        <CardDescription>Відсоток відвідування тренувань</CardDescription>
                    </CardHeader>
                    <CardContent className="h-[240px] w-full pt-2">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={trainingData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                            <defs>
                                <linearGradient id="colorPercent" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                                </linearGradient>
                            </defs>
                            <XAxis dataKey="name" stroke="#888888" fontSize={11} tickLine={false} axisLine={false} />
                            <YAxis stroke="#888888" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v: number) => `${v}%`} />
                            <RechartsTooltip 
                                contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1)", backgroundColor: 'var(--card)', fontSize: '12px' }}
                                itemStyle={{ color: 'var(--foreground)' }}
                            />
                            <Area 
                                type="monotone" 
                                dataKey="percent" 
                                stroke="#3b82f6" 
                                strokeWidth={3} 
                                fillOpacity={1} 
                                fill="url(#colorPercent)" 
                            />
                            </AreaChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
              </div>

              {/* RIGHT COL: DISCIPLINE & BREAKDOWN */}
              <div className="space-y-6">
                 {/* Training Circle */}
                 <Card className="rounded-[24px] border-border shadow-sm flex flex-col overflow-hidden">
                    <CardHeader className="pb-0 text-center pt-6">
                       <CardTitle className="text-lg">Дисципліна</CardTitle>
                       <CardDescription>Загальна статистика</CardDescription>
                    </CardHeader>
                    <CardContent className="flex-1 flex flex-col items-center justify-center py-8">
                       <div className="relative h-44 w-44 flex items-center justify-center">
                          <svg className="h-full w-full -rotate-90 transform" viewBox="0 0 100 100">
                             <circle cx="50" cy="50" r="40" fill="transparent" stroke="currentColor" strokeWidth="6" className="text-muted/20" />
                             <circle 
                                cx="50" cy="50" r="40" 
                                fill="transparent" 
                                stroke="currentColor" 
                                strokeWidth="6" 
                                strokeLinecap="round"
                                strokeDasharray={2 * Math.PI * 40}
                                strokeDashoffset={2 * Math.PI * 40 - (2 * Math.PI * 40 * trainingSummary.percent) / 100}
                                className="text-primary transition-all duration-1000 ease-out"
                             />
                          </svg>
                          <div className="absolute inset-0 flex flex-col items-center justify-center">
                             <span className="text-5xl font-black tracking-tighter text-foreground">{trainingSummary.percent}%</span>
                             <span className="text-[10px] font-bold uppercase text-muted-foreground mt-1">Присутність</span>
                          </div>
                       </div>
                       
                       <div className="flex w-full justify-between px-8 mt-6">
                          <div className="text-center">
                             <div className="text-2xl font-bold text-foreground">{trainingSummary.present}</div>
                             <div className="text-xs text-muted-foreground font-medium">Був</div>
                          </div>
                          <div className="h-10 w-px bg-border" />
                          <div className="text-center">
                             <div className="text-2xl font-bold text-muted-foreground/50">{trainingSummary.absent}</div>
                             <div className="text-xs text-muted-foreground font-medium">Пропустив</div>
                          </div>
                       </div>
                    </CardContent>
                 </Card>

                 {/* Rating Breakdown Mini */}
                 {ratingBreakdown && (
                     <Card className="rounded-[24px] border-border shadow-sm bg-muted/20">
                        <CardHeader className="pb-2">
                           <CardTitle className="text-base flex items-center gap-2">
                              <Info className="h-4 w-4 text-muted-foreground" /> 
                              Деталі рейтингу
                           </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3 text-sm">
                           <div className="flex justify-between">
                              <span className="text-muted-foreground">Ефективність</span>
                              <span className="font-bold text-emerald-600">+{ratingBreakdown.performance}</span>
                           </div>
                           <div className="flex justify-between">
                              <span className="text-muted-foreground">Досвід (XP)</span>
                              <span className="font-bold text-blue-500">+{ratingBreakdown.experience}</span>
                           </div>
                           <div className="flex justify-between">
                              <span className="text-muted-foreground">Дисципліна</span>
                              <span className="font-bold text-red-500">-{ratingBreakdown.discipline.toFixed(1)}</span>
                           </div>
                           <Separator />
                           <div className="flex justify-between text-xs text-muted-foreground">
                              <span>База: {ratingBreakdown.base}</span>
                              <span>М'який ліміт: 85</span>
                           </div>
                        </CardContent>
                     </Card>
                 )}
              </div>

           </div>
           
        </TabsContent>

        {/* --- OTHER TABS (Simpler) --- */}
        <TabsContent value="matches">
            <Card className="rounded-[24px]">
               <CardHeader><CardTitle>Всі матчі</CardTitle></CardHeader>
               <CardContent className="grid gap-2">
                  {recentMatches.map((m: any) => (
                      <MatchRowItem key={m.match.id} match={m.match} contribution={m.contribution} />
                  ))}
               </CardContent>
            </Card>
        </TabsContent>

         <TabsContent value="training" className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
              <div className="rounded-[20px] border border-border bg-card/60 p-4 shadow-sm">
                <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Всього</div>
                <div className="mt-2 text-2xl font-black tabular-nums text-foreground">{trainingBreakdown.total}</div>
              </div>
              <div className="rounded-[20px] border border-border bg-emerald-500/5 p-4 shadow-sm">
                <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-500">Присутній</div>
                <div className="mt-2 text-2xl font-black tabular-nums text-emerald-600">{trainingBreakdown.present}</div>
              </div>
              <div className="rounded-[20px] border border-border bg-muted/40 p-4 shadow-sm">
                <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Відсутній</div>
                <div className="mt-2 text-2xl font-black tabular-nums text-foreground">{trainingBreakdown.absent}</div>
              </div>
              <div className="rounded-[20px] border border-border bg-rose-500/5 p-4 shadow-sm">
                <div className="text-[11px] font-bold uppercase tracking-wider text-rose-500">Травма</div>
                <div className="mt-2 text-2xl font-black tabular-nums text-rose-600">{trainingBreakdown.injured}</div>
              </div>
              <div className="rounded-[20px] border border-border bg-sky-500/5 p-4 shadow-sm">
                <div className="text-[11px] font-bold uppercase tracking-wider text-sky-500">Хворів</div>
                <div className="mt-2 text-2xl font-black tabular-nums text-sky-600">{trainingBreakdown.sick}</div>
              </div>
            </div>

            <Card className="rounded-[24px] border-border shadow-sm">
              <CardHeader className="flex flex-col gap-4 border-b border-border/50 pb-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <CardTitle className="text-lg">Відвідування тренувань</CardTitle>
                  <CardDescription>Детальна історія по кожному тренуванню</CardDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                  {trainingFilters.map((filter) => (
                    <button
                      key={filter.id}
                      type="button"
                      onClick={() => setTrainingFilter(filter.id)}
                      className={cn(
                        "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
                        trainingFilter === filter.id
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-muted/30 text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <span>{filter.label}</span>
                      <span className="rounded-full bg-background/70 px-1.5 py-0.5 text-[10px] font-black tabular-nums text-foreground">
                        {filter.count}
                      </span>
                    </button>
                  ))}
                </div>
              </CardHeader>
              <CardContent className="p-4">
                {trainingSessions.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border bg-muted/10 p-10 text-center text-sm text-muted-foreground">
                    Ще немає відвідувань тренувань.
                  </div>
                ) : filteredTrainingSessions.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border bg-muted/10 p-10 text-center text-sm text-muted-foreground">
                    Немає тренувань з цим статусом.
                  </div>
                ) : (
                  <div className="space-y-6">
                    {groupedTrainingSessions.map(([month, group]) => (
                      <div key={month} className="space-y-3">
                        <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                          {month}
                        </div>
                        <div className="space-y-2">
                          {group.items.map((session) => {
                            const meta = trainingStatusMeta[session.status];
                            return (
                              <Link
                                key={session.id}
                                to={`/admin/trainings/${session.id}`}
                                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card/40 px-4 py-3 transition-colors hover:bg-muted/40"
                              >
                                <div className="flex flex-col">
                                  <span className="text-sm font-semibold text-foreground">
                                    {formatTrainingMeta(session.date, session.time)}
                                  </span>
                                  <span className="text-xs text-muted-foreground">Тренування</span>
                                </div>
                                <Badge tone={meta.tone} size="sm" pill>
                                  {meta.label}
                                </Badge>
                              </Link>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
         </TabsContent>
         
         <TabsContent value="tournaments">
            <div className="p-10 text-center text-muted-foreground bg-muted/10 rounded-3xl border border-dashed border-border">
               Статистика по турнірах (Coming soon...)
            </div>
         </TabsContent>
      </Tabs>

    </div>
  );
}
