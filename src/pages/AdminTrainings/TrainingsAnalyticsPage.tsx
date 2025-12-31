// src/pages/AdminTrainings/TrainingsAnalyticsPage.tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CalendarRange,
  CheckCircle2,
  HeartPulse,
  Loader2,
  TrendingUp,
  XCircle,
  Plus
} from "lucide-react";

import { getTrainings } from "../../api/trainings";
import type { Training } from "../../types/trainings";
import { supabase } from "../../lib/supabaseClient";

import { cn } from "@/lib/utils";
import { Card, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { FilterBar } from "@/components/app/FilterBar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { OperationalSummary } from "@/components/app/OperationalSummary";

const TEAM_ID = "389719a7-5022-41da-bc49-11e7a3afbd98";

// Мапа амплуа українською
const positionUkMap: Record<string, string> = {
  gk: "Воротар",
  df: "Захисник",
  mf: "Півзахисник",
  fw: "Нападник",
  univ: "Універсал",
  universal: "Універсал"
};

// Функція нормалізації URL для Supabase Storage
function normalizeAssetUrl(url: string | null | undefined): string | null {
  const u = (url ?? "").toString().trim();
  if (!u) return null;
  if (u.startsWith("http://") || u.startsWith("https://") || u.startsWith("data:")) return u;
  if (u.startsWith("/")) {
      const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string)?.replace(/\/+$/, "");
      return `${supabaseUrl}/storage/v1/object/public${u}`;
  }
  return u;
}

type SortKey = "name" | "percent";
type SortDirection = "asc" | "desc";

type PlayerAttendanceRow = {
  playerId: string;
  shirtNumber: number | null;
  photoUrl: string | null;
  name: string;
  position: string;
  status: string; // Додано для індикації статусу
  trainingsTracked: number;
  presentCount: number;
  absentCount: number;
  injuredCount: number;
  sickCount: number;
  attendancePercent: number;
};

// --- Секція гравця з індикатором статусу та зумом аватара ---
function PlayerInfoCell({ 
  name, 
  number, 
  position, 
  photoUrl,
  status // Новий проп
}: { 
  name: string; 
  number?: number | null; 
  position?: string | null; 
  photoUrl?: string | null;
  status?: string;
}) {
  const initials = name.split(" ").map(n => n[0]).join("").toUpperCase();
  const uaPosition = position ? (positionUkMap[position.toLowerCase()] || position) : "Універсал";
  const safePhotoUrl = normalizeAssetUrl(photoUrl);
  
  return (
    <div className="flex items-center gap-3">
      <div className="relative shrink-0">
        <div className="h-10 w-10 overflow-hidden rounded-full border border-border/50 bg-muted/40 shadow-sm">
          {safePhotoUrl ? (
            <img
              src={safePhotoUrl}
              alt={name}
              className="h-full w-full object-cover object-top"
              style={{ transform: "scale(1.8)", objectPosition: "50% -90%" }}
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[10px] font-bold text-muted-foreground uppercase">
              {initials}
            </div>
          )}
        </div>
        {/* Пульсуючий індикатор статусу (як у турнірах) */}
        {status && status !== 'active' && (
          <div className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-background bg-destructive animate-pulse" />
        )}
      </div>
      <div className="flex flex-col min-w-0 text-left">
        <span className="text-sm font-semibold text-foreground truncate leading-tight">
          {name}
        </span>
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground tracking-tight">
          {number !== null && <span>#{number}</span>}
          {number !== null && <span className="opacity-30">•</span>}
          <span>{uaPosition}</span>
        </div>
      </div>
    </div>
  );
}

export function TrainingsAnalyticsPage() {
  const [trainings, setTrainings] = useState<Training[]>([]);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [players, setPlayers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");
  const [query, setQuery] = useState("");
  const [preset, setPreset] = useState<"month" | "year" | "all">("month");
  const [sortConfig] = useState<{ key: SortKey; direction: SortDirection }>({
    key: "percent",
    direction: "desc"
  });

  const navigate = useNavigate();

  const formatDateInput = (date: Date) => {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  };

  const applyPreset = (next: "month" | "year" | "all") => {
    const now = new Date();
    if (next === "all") {
      setFromDate("");
      setToDate("");
      setPreset(next);
      return;
    }
    if (next === "month") {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      setFromDate(formatDateInput(start));
      setToDate(formatDateInput(now));
      setPreset(next);
      return;
    }
    const start = new Date(now.getFullYear(), 0, 1);
    setFromDate(formatDateInput(start));
    setToDate(formatDateInput(now));
    setPreset(next);
  };

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [trData, attRes, plRes] = await Promise.all([
          getTrainings(TEAM_ID),
          supabase.from("training_attendance").select("*"),
          // ❗ ФІЛЬТРАЦІЯ: Прибираємо колишніх гравців для чистої статистики
          supabase.from("players").select("*").eq("team_id", TEAM_ID).neq("status", "inactive"),
        ]);
        setTrainings(trData);
        setAttendance(attRes.data || []);
        setPlayers(plRes.data || []);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  useEffect(() => {
    applyPreset("month");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const completedTrainings = useMemo(() => {
    const now = Date.now();
    return trainings.filter(t => {
      const ts = new Date(`${t.date}T${t.time || "00:00"}`).getTime();
      if (fromDate && t.date < fromDate) return false;
      if (toDate && t.date > toDate) return false;
      return ts <= now;
    });
  }, [trainings, fromDate, toDate]);

  const playerRows = useMemo(() => {
    const map = new Map<string, PlayerAttendanceRow>();
    players.forEach(p => {
      map.set(p.id, {
        playerId: p.id, shirtNumber: p.shirt_number, photoUrl: p.photo_url,
        name: `${p.first_name} ${p.last_name}`, position: p.position,
        status: p.status, // Зберігаємо глобальний статус
        trainingsTracked: completedTrainings.length,
        presentCount: 0, absentCount: 0, injuredCount: 0, sickCount: 0, attendancePercent: 0
      });
    });

    const activeIds = new Set(completedTrainings.map(t => t.id));
    const latestByKey = new Map<string, any>();
    attendance.filter(a => activeIds.has(a.training_id)).forEach(a => {
      const key = `${a.training_id}_${a.player_id}`;
      const prev = latestByKey.get(key);
      if (!prev) {
        latestByKey.set(key, a);
        return;
      }
      const prevTs = prev?.created_at ? new Date(prev.created_at).getTime() : -Infinity;
      const nextTs = a?.created_at ? new Date(a.created_at).getTime() : -Infinity;
      if (nextTs >= prevTs) latestByKey.set(key, a);
    });
    
    latestByKey.forEach(a => {
      const row = map.get(a.player_id);
      if (!row) return;
      if (a.status === "present") row.presentCount++;
      else if (a.status === "absent") row.absentCount++;
      else if (a.status === "injured") row.injuredCount++;
      else if (a.status === "sick") row.sickCount++;
    });

    return Array.from(map.values()).map(r => ({
      ...r,
      attendancePercent: (r.presentCount + r.absentCount) > 0 
        ? Math.round((r.presentCount / (r.presentCount + r.absentCount)) * 100) 
        : 0
    })).filter(r => r.name.toLowerCase().includes(query.toLowerCase()))
       .sort((a, b) => {
         const factor = sortConfig.direction === "desc" ? 1 : -1;
         if (sortConfig.key === "percent") return (b.attendancePercent - a.attendancePercent) * factor;
         return a.name.localeCompare(b.name) * factor;
       });
  }, [players, attendance, completedTrainings, query, sortConfig]);

  const topPlayers = useMemo(() => 
    playerRows.slice(0, 5).map(p => ({ 
      name: p.name, 
      src: normalizeAssetUrl(p.photoUrl)
    })), 
  [playerRows]);

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-20 gap-4">
      <Loader2 className="animate-spin h-8 w-8 text-primary"/>
      <span className="text-muted-foreground font-medium">Завантаження аналітики...</span>
    </div>
  );

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-500">
      <OperationalSummary
        title="Аналітика тренувань"
        subtitle="Глибокий аналіз відвідуваності та активності команди"
        nextUpLoading={false}
        nextUp={{
          tournamentName: "Середня відвідуваність",
          primary: `${playerRows.length > 0 ? Math.round(playerRows.reduce((a, b) => a + b.attendancePercent, 0) / playerRows.length) : 0}%`,
          secondary: "Лідери за присутністю",
          avatars: topPlayers,
          icon: TrendingUp,
          tourLabel: `За період: ${completedTrainings.length} тренувань`,
        }}
        kpis={[
          { key: "p", label: "Присутні", value: String(playerRows.reduce((a, b) => a + b.presentCount, 0)), icon: CheckCircle2, iconTone: "text-emerald-500 bg-emerald-500/10" },
          { key: "a", label: "Відсутні", value: String(playerRows.reduce((a, b) => a + b.absentCount, 0)), icon: XCircle, iconTone: "text-rose-500 bg-rose-500/10" },
          { key: "i", label: "Травми", value: String(playerRows.reduce((a, b) => a + b.injuredCount, 0)), icon: HeartPulse, iconTone: "text-amber-500 bg-amber-500/10" },
          { key: "s", label: "Хвороби", value: String(playerRows.reduce((a, b) => a + b.sickCount, 0)), icon: HeartPulse, iconTone: "text-sky-500 bg-sky-500/10" },
        ]}
        primaryAction={{ label: "Нове тренування", to: "/admin/trainings/create", iconLeft: Plus }}
      />

      <Card className="rounded-[var(--radius-section)] border-border bg-card shadow-none overflow-hidden">
        <CardHeader className="border-b border-border bg-muted/20 pb-6 pt-6">
          <FilterBar
            className="border-0 bg-transparent p-0 shadow-none"
            tabs={{
              value: preset,
              onChange: applyPreset,
              items: [
                { value: "month", label: "Цей місяць" },
                { value: "year", label: "Цей рік" },
                { value: "all", label: "Весь час" },
              ],
            }}
            search={{
              value: query,
              onChange: setQuery,
              placeholder: "Пошук гравця...",
              widthClassName: "max-w-[260px]",
            }}
            rightSlot={
              <div className="relative flex items-center text-xs text-muted-foreground">
                <CalendarRange className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <div className="flex h-10 items-center rounded-[var(--radius-lg)] border border-input bg-background pl-9 pr-3">
                  <Input
                    type="date"
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                    className="h-8 w-[96px] cursor-pointer border-none bg-transparent p-0 text-right text-xs font-medium tabular-nums shadow-none focus-visible:ring-0"
                  />
                  <span className="text-muted-foreground mx-1">—</span>
                  <Input
                    type="date"
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                    className="h-8 w-[96px] cursor-pointer border-none bg-transparent p-0 text-xs font-medium tabular-nums shadow-none focus-visible:ring-0"
                  />
                </div>
              </div>
            }
          />
        </CardHeader>

        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30 border-b border-border hover:bg-muted/30">
              <TableHead className="w-[60px] text-center text-xs font-semibold text-muted-foreground pl-6">#</TableHead>
              <TableHead className="text-xs font-semibold text-muted-foreground">Гравець</TableHead>
              <TableHead className="text-center text-xs font-semibold text-muted-foreground">Тренування</TableHead>
              <TableHead className="text-center text-xs font-semibold text-muted-foreground">Присутній</TableHead>
              <TableHead className="text-center text-xs font-semibold text-muted-foreground">Травми/Хвороби</TableHead>
              <TableHead className="text-right text-xs font-semibold text-muted-foreground pr-8">% явки</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {playerRows.length > 0 ? (
              playerRows.map((row, idx) => (
                <TableRow 
                  key={row.playerId} 
                  className="group hover:bg-muted/40 transition-colors border-b border-border/50 cursor-pointer"
                  onClick={() => navigate(`/admin/players/${row.playerId}`)} 
                >
                  <TableCell className="text-center text-xs font-bold text-muted-foreground/40 pl-6 tabular-nums">{idx + 1}</TableCell>
                  <TableCell>
                    <PlayerInfoCell 
                      name={row.name}
                      number={row.shirtNumber}
                      position={row.position}
                      photoUrl={row.photoUrl}
                      status={row.status} // ❗ Передаємо глобальний статус
                    />
                  </TableCell>
                  <TableCell className="text-center tabular-nums font-semibold text-muted-foreground">{row.trainingsTracked}</TableCell>
                  <TableCell className="text-center">
                    <span className="inline-flex h-6 min-w-[28px] items-center justify-center rounded-md bg-emerald-500/10 px-1.5 text-xs font-black text-emerald-600">
                      {row.presentCount}
                    </span>
                  </TableCell>
                  <TableCell className="text-center">
                    <span className="inline-flex h-6 min-w-[28px] items-center justify-center rounded-md bg-amber-500/10 px-1.5 text-xs font-black text-amber-600">
                      {row.injuredCount + row.sickCount}
                    </span>
                  </TableCell>
                  <TableCell className="text-right pr-8">
                    <div className="flex items-center justify-end gap-4">
                      <div className="w-24 h-1.5 rounded-full bg-secondary overflow-hidden hidden sm:block">
                        <div 
                          className={cn(
                            "h-full rounded-full transition-all duration-1000 ease-out", 
                            row.attendancePercent >= 80 ? "bg-emerald-500" : row.attendancePercent >= 50 ? "bg-amber-500" : "bg-primary"
                          )}
                          style={{ width: `${row.attendancePercent}%` }}
                        />
                      </div>
                      <span className="text-sm font-black tabular-nums w-10 text-right">{row.attendancePercent}%</span>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                  За вибраний період даних не знайдено
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}