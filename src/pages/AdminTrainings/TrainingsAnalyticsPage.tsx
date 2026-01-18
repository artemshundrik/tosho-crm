// src/pages/AdminTrainings/TrainingsAnalyticsPage.tsx
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  CalendarRange,
  CheckCircle2,
  HeartPulse,
  ClipboardCheck,
  TrendingUp,
  XCircle,
  ChevronDown,
  ChevronUp
} from "lucide-react";

import { getTrainings } from "../../api/trainings";
import type { Training } from "../../types/trainings";
import { supabase } from "../../lib/supabaseClient";

import { cn } from "@/lib/utils";
import { Card, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FilterBar } from "@/components/app/FilterBar";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  TableCenterCell,
  TableHeaderCell,
  TableNumberCell,
  TableNumberHeaderCell,
} from "@/components/app/table-kit";
import { PlayerAvatar as PlayerAvatarBase } from "@/components/app/avatar-kit";
import { OperationalSummary } from "@/components/app/OperationalSummary";
import { usePageHeaderActions } from "@/components/app/page-header-actions";
import { DashboardSkeleton } from "@/components/app/page-skeleton-templates";
import { usePageData } from "@/hooks/usePageData";

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

type SortKey = "trainings" | "present" | "injuries" | "percent";
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

function SortableHead({
  label,
  sKey,
  sortConfig,
  onSort,
  align = "center",
  width,
}: {
  label: ReactNode;
  sKey: SortKey;
  sortConfig: { key: SortKey; direction: SortDirection };
  onSort: (k: SortKey) => void;
  align?: "left" | "center" | "right";
  width?: string;
}) {
  const isActive = sortConfig.key === sKey;

  return (
    <TableHeaderCell
      align={align}
      widthClass={width}
      className={cn(
        "cursor-pointer select-none transition-all active:scale-[0.98]",
        "whitespace-nowrap",
        isActive ? "text-primary" : "hover:text-foreground/80 hover:bg-muted/30"
      )}
      onClick={() => onSort(sKey)}
    >
      <div
        className={cn(
          "flex items-center gap-1.5",
          align === "center" && "justify-center",
          align === "right" && "justify-end"
        )}
      >
        {label}
        <span className="inline-flex h-3 w-3 items-center justify-center">
          {isActive ? (
            sortConfig.direction === "desc" ? (
              <ChevronDown className="h-3 w-3" strokeWidth={3} />
            ) : (
              <ChevronUp className="h-3 w-3" strokeWidth={3} />
            )
          ) : (
            <span className="h-3 w-3 opacity-0" />
          )}
        </span>
      </div>
    </TableHeaderCell>
  );
}

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
        <PlayerAvatarBase
          src={safePhotoUrl}
          name={name}
          fallback={initials}
          size={48}
          className="border-border/50 bg-muted/40 shadow-sm"
        />
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
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");
  const [preset, setPreset] = useState<"month" | "last_month" | "year" | "all">("month");
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection }>({
    key: "percent",
    direction: "desc"
  });
  const { data, showSkeleton } = usePageData<{
    trainings: Training[];
    attendance: any[];
    players: any[];
  }>({
    cacheKey: "trainings-analytics",
    loadFn: async () => {
      const [trData, attRes, plRes] = await Promise.all([
        getTrainings(TEAM_ID),
        supabase.from("training_attendance").select("training_id, player_id, status, created_at"),
        // ❗ ФІЛЬТРАЦІЯ: Прибираємо колишніх гравців для чистої статистики
        supabase
          .from("players")
          .select("id, first_name, last_name, photo_url, shirt_number")
          .eq("team_id", TEAM_ID)
          .neq("status", "inactive"),
      ]);

      if (attRes.error) {
        throw new Error(attRes.error.message || "Не вдалося завантажити відвідуваність");
      }
      if (plRes.error) {
        throw new Error(plRes.error.message || "Не вдалося завантажити гравців");
      }

      return {
        trainings: trData,
        attendance: attRes.data || [],
        players: plRes.data || [],
      };
    },
  });

  const navigate = useNavigate();

  const formatDateInput = (date: Date) => {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  };

  const applyPreset = (next: "month" | "last_month" | "year" | "all") => {
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
    if (next === "last_month") {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      setFromDate(formatDateInput(start));
      setToDate(formatDateInput(end));
      setPreset(next);
      return;
    }
    const start = new Date(now.getFullYear(), 0, 1);
    setFromDate(formatDateInput(start));
    setToDate(formatDateInput(now));
    setPreset(next);
  };

  useEffect(() => {
    if (!data) return;
    setTrainings(data.trainings);
    setAttendance(data.attendance);
    setPlayers(data.players);
  }, [data]);

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

    const rows = Array.from(map.values()).map(r => ({
      ...r,
      attendancePercent: (r.presentCount + r.absentCount) > 0 
        ? Math.round((r.presentCount / (r.presentCount + r.absentCount)) * 100) 
        : 0
    }));

    const withFallbackNumber = (value: number | string | null | undefined) => {
      if (value === null || value === undefined || value === "") return Number.POSITIVE_INFINITY;
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
    };
    const fallbackByNumber = (a: PlayerAttendanceRow, b: PlayerAttendanceRow) => {
      const numDiff = withFallbackNumber(a.shirtNumber) - withFallbackNumber(b.shirtNumber);
      if (numDiff !== 0) return numDiff;
      return a.name.localeCompare(b.name);
    };

    rows.sort((a, b) => {
      let diff = 0;
      if (sortConfig.key === "trainings") {
        diff = a.trainingsTracked - b.trainingsTracked;
      } else if (sortConfig.key === "present") {
        diff = a.presentCount - b.presentCount;
      } else if (sortConfig.key === "injuries") {
        diff = (a.injuredCount + a.sickCount) - (b.injuredCount + b.sickCount);
      } else if (sortConfig.key === "percent") {
        diff = a.attendancePercent - b.attendancePercent;
        if (diff === 0) {
          diff = a.presentCount - b.presentCount;
        }
        if (diff === 0) {
          diff = (a.injuredCount + a.sickCount) - (b.injuredCount + b.sickCount);
        }
        if (diff === 0) {
          diff = a.trainingsTracked - b.trainingsTracked;
        }
      }

      if (diff === 0) return fallbackByNumber(a, b);
      return sortConfig.direction === "asc" ? diff : -diff;
    });

    return rows;
  }, [players, attendance, completedTrainings, sortConfig]);

  const handleSort = (key: SortKey) => {
    const defaultDirection: SortDirection = "desc";
    setSortConfig((current) => ({
      key,
      direction: current.key === key ? (current.direction === "desc" ? "asc" : "desc") : defaultDirection,
    }));
  };

  const topPlayers = useMemo(() => 
    playerRows.slice(0, 5).map(p => ({ 
      name: p.name, 
      src: normalizeAssetUrl(p.photoUrl)
    })), 
  [playerRows]);

  const headerActions = useMemo(
    () => (
      <Button variant="primary" onClick={() => navigate("/admin/trainings/create")}>
        Нове тренування
      </Button>
    ),
    [navigate]
  );

  usePageHeaderActions(headerActions, [navigate]);

  return showSkeleton ? (
    <DashboardSkeleton />
  ) : (
    <div className="flex flex-col gap-6">
      <OperationalSummary
        title="Аналітика тренувань"
        subtitle="Глибокий аналіз відвідуваності та активності команди"
        titleVariant="hidden"
        sectionLabel="Аналітика тренувань"
        sectionIcon={ClipboardCheck}
        nextUpLoading={false}
        nextUp={{
          tournamentName: "Середня відвідуваність",
          primary: `${playerRows.length > 0 ? Math.round(playerRows.reduce((a, b) => a + b.attendancePercent, 0) / playerRows.length) : 0}%`,
          secondary: "Лідери за присутністю",
          avatars: topPlayers,
          icon: TrendingUp,
          tourLabel: `За період: ${completedTrainings.length} тренувань`,
        }}
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
                { value: "last_month", label: "Минулий місяць" },
                { value: "year", label: "Цей рік" },
                { value: "all", label: "Весь час" },
              ],
            }}
            rightSlot={
              <div className="relative flex items-center text-xs text-muted-foreground">
                <CalendarRange className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <div className="flex h-10 items-center rounded-[var(--radius-lg)] border border-input bg-background pl-9 pr-3 focus-within:ring-2 focus-within:ring-primary/30 focus-within:border-primary/40">
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

        <Table variant="analytics" size="md">
          <TableHeader>
            <TableRow>
              <TableNumberHeaderCell widthClass="w-[60px]">#</TableNumberHeaderCell>
              <TableHeaderCell align="left">Гравець</TableHeaderCell>
              <SortableHead
                label="Тренування"
                sKey="trainings"
                sortConfig={sortConfig}
                onSort={handleSort}
                align="center"
              />
              <SortableHead
                label="Присутній"
                sKey="present"
                sortConfig={sortConfig}
                onSort={handleSort}
                align="center"
              />
              <SortableHead
                label="Травми/Хвороби"
                sKey="injuries"
                sortConfig={sortConfig}
                onSort={handleSort}
                align="center"
              />
              <SortableHead
                label="% явки"
                sKey="percent"
                sortConfig={sortConfig}
                onSort={handleSort}
                align="right"
                width="pr-8"
              />
            </TableRow>
          </TableHeader>
          <TableBody>
            {playerRows.length > 0 ? (
              playerRows.map((row, idx) => (
                <TableRow
                  key={row.playerId}
                  className="group cursor-pointer border-b border-border/50 transition-colors hover:bg-muted/40"
                  onClick={() => navigate(`/player/${row.playerId}`)}
                >
                  <TableNumberCell align="center" className="text-muted-foreground/60">
                    {idx + 1}
                  </TableNumberCell>
                  <TableCell>
                    <PlayerInfoCell 
                      name={row.name}
                      number={row.shirtNumber}
                      position={row.position}
                      photoUrl={row.photoUrl}
                      status={row.status} // ❗ Передаємо глобальний статус
                    />
                  </TableCell>
                  <TableCell className="text-center font-semibold text-muted-foreground">{row.trainingsTracked}</TableCell>
                  <TableCenterCell>
                    <span className="inline-flex h-6 min-w-[28px] items-center justify-center rounded-[var(--radius)] bg-emerald-500/10 px-1.5 text-xs font-black text-emerald-600">
                      {row.presentCount}
                    </span>
                  </TableCenterCell>
                  <TableCenterCell>
                    <span className="inline-flex h-6 min-w-[28px] items-center justify-center rounded-[var(--radius)] bg-amber-500/10 px-1.5 text-xs font-black text-amber-600">
                      {row.injuredCount + row.sickCount}
                    </span>
                  </TableCenterCell>
                  <TableCell className="text-right">
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
                      <span className="text-sm font-black w-10 text-right">{row.attendancePercent}%</span>
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
