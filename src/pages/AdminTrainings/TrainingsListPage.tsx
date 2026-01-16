import { useEffect, useMemo, useState, type ElementType } from "react";
import { Link, useNavigate } from "react-router-dom";

import { getTrainings } from "../../api/trainings";
import type { Attendance, Training } from "../../types/trainings";
import { supabase } from "../../lib/supabaseClient";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { OperationalSummary, type OperationalSummaryKpi } from "@/components/app/OperationalSummary";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { usePageHeaderActions } from "@/components/app/page-header-actions";
import { useMinimumLoading } from "@/hooks/useMinimumLoading";

import {
  BarChart3,
  Brain,
  CalendarDays,
  Clock,
  Dumbbell,
  HeartPulse,
  MapPin,
  Swords,
  Users,
} from "lucide-react";

import { cn } from "@/lib/utils";

const TEAM_ID = "389719a7-5022-41da-bc49-11e7a3afbd98";

const typeLabels: Record<Training["type"], string> = {
  regular: "Тренування",
  tactics: "Тактичне",
  fitness: "Фізпідготовка",
  sparring: "Спаринг",
};

const typeIcons: Record<Training["type"], ElementType> = {
  regular: Dumbbell,
  tactics: Brain,
  fitness: HeartPulse,
  sparring: Swords,
};

function formatDateParts(date: Date) {
  const month = date.toLocaleString("uk-UA", { month: "short" }).toUpperCase();
  const day = date.getDate().toString().padStart(2, "0");
  const weekday = date.toLocaleString("uk-UA", { weekday: "long" });
  const time = date.toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" });
  return { month, day, weekday, time };
}

function monthKeyUA(iso: string) {
  const d = new Date(iso);
  const m = new Intl.DateTimeFormat("uk-UA", { month: "long" }).format(d);
  const y = new Intl.DateTimeFormat("uk-UA", { year: "numeric" }).format(d);
  const mm = m.charAt(0).toUpperCase() + m.slice(1);
  return `${mm} ${y}`;
}

function TrainingCard({
  training,
  present,
  total,
  presentPlayers,
  onClick,
  isUpcoming = false,
  showAttendance = true,
}: {
  training: Training;
  present: number;
  total: number;
  presentPlayers: { id: string; first_name: string; last_name: string; photo_url?: string | null }[];
  onClick: () => void;
  isUpcoming?: boolean;
  showAttendance?: boolean;
}) {
  const date = new Date(`${training.date}T${training.time || "00:00"}`);
  const { month, day, weekday, time } = formatDateParts(date);
  const Icon = typeIcons[training.type];
  const typeLabel = typeLabels[training.type];
  const location = training.location || "—";
  
  const progress = total ? Math.min(100, Math.round((present / total) * 100)) : 0;
  const weekdayLabel = `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)}`;

  return (
    <div
      onClick={onClick}
      className={cn(
        "group relative flex w-full cursor-pointer overflow-hidden",
        
        // --- СТИЛІЗАЦІЯ З MATCH CARD ---
        "rounded-[var(--radius-section)]", // Заокруглення як у MatchCard
        "bg-card border border-border",
        "shadow-[var(--shadow-surface)]",   // Базова тінь як у MatchCard
        "min-h-[240px]",
        
        // Анімація
        "transition-all duration-200 ease-out",
        
        // Ховер ефект (ідентичний MatchCard)
        "hover:-translate-y-[1px] hover:shadow-[var(--shadow-floating)]",
        
        // Active ефект (ідентичний MatchCard)
        "active:translate-y-0 active:shadow-[var(--shadow-pressed)]"
      )}
    >
      {/* Ліва частина - Дата */}
      <div className="flex w-[85px] shrink-0 flex-col items-center justify-center border-r border-border bg-muted/30 p-5 text-center group-hover:bg-muted/50 transition-colors">
        <span className="text-[11px] font-bold uppercase tracking-wider text-primary">
          {month}
        </span>
        <span className="mt-0.5 text-3xl font-black tracking-tight text-foreground">
          {day}
        </span>
      </div>

      {/* Права частина - Основний контент */}
      <div className="flex flex-1 flex-col p-6">
        
        {/* Верхній рядок */}
        <div className="flex items-start justify-between">
          <div>
            <div className="text-base font-bold text-foreground">{weekdayLabel}</div>
            <div className="mt-1 flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              <span>{time || "Час не вказано"}</span>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {isUpcoming ? (
              <Badge
                variant="secondary"
                className="rounded-[var(--radius-md)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide bg-emerald-500/10 text-emerald-600 shadow-none"
              >
                Майбутнє
              </Badge>
            ) : null}
            <Badge
              variant="secondary"
              className="rounded-[var(--radius-md)] px-2.5 py-1 text-xs font-semibold shadow-none bg-muted hover:bg-muted/80 text-foreground"
            >
              <Icon className="mr-1.5 h-3.5 w-3.5 text-primary" />
              {typeLabel}
            </Badge>
          </div>
        </div>

        {/* Інфо-гріди */}
        <div className="mt-5 grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
              <MapPin className="h-3 w-3" />
              Локація
            </div>
            <div className="line-clamp-1 text-sm font-semibold text-foreground">
              {location}
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
              <Swords className="h-3 w-3" />
              Суперник
            </div>
            <div className="flex items-center gap-2">
               {training.type === "sparring" ? (
                <>
                  {training.sparring_logo_url && (
                    <img
                      src={training.sparring_logo_url}
                      alt="Logo"
                      className="h-4 w-4 rounded-full object-cover bg-muted"
                    />
                  )}
                  <span className="line-clamp-1 text-sm font-semibold text-foreground">
                    {training.sparring_opponent || "—"}
                  </span>
                </>
              ) : (
                <span className="text-sm font-medium text-muted-foreground">—</span>
              )}
            </div>
          </div>
        </div>

        {/* Прогрес та Аватарки */}
        {showAttendance ? (
          <div className="mt-6 flex flex-col gap-3">
            <div className="flex items-end justify-between text-xs">
              <span className="font-medium text-muted-foreground">Присутність</span>
              <span className="font-bold text-foreground">
                {present} <span className="text-muted-foreground font-normal">/ {total}</span>
              </span>
            </div>

            <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-primary transition-all duration-500 shadow-[var(--shadow-primary-glow)]"
                style={{ width: `${progress}%` }}
              />
            </div>

            <div className="mt-1 flex items-center pl-1">
              {presentPlayers.length > 0 ? (
                <>
                  {presentPlayers.slice(0, 6).map((p, idx) => {
                    const initials = `${p.first_name?.[0] || ""}${p.last_name?.[0] || ""}` || "?";
                    return (
                      <Avatar
                        key={p.id}
                        className={cn(
                          "h-6 w-6 border-2 border-card bg-muted ring-1 ring-border transition-transform hover:z-10 hover:scale-110",
                          idx > 0 && "-ml-2.5"
                        )}
                      >
                        <AvatarImage src={p.photo_url || ""} alt={p.first_name} />
                        <AvatarFallback className="text-[8px] font-bold bg-muted text-muted-foreground">
                          {initials}
                        </AvatarFallback>
                      </Avatar>
                    );
                  })}
                  {presentPlayers.length > 6 && (
                    <div className="-ml-2.5 flex h-6 w-6 items-center justify-center rounded-full border-2 border-card bg-secondary text-[9px] font-bold text-muted-foreground ring-1 ring-border">
                      +{presentPlayers.length - 6}
                    </div>
                  )}
                </>
              ) : (
                <span className="text-xs text-muted-foreground italic">Поки нікого немає</span>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function TrainingsListPage() {
  const [trainings, setTrainings] = useState<Training[]>([]);
  const [players, setPlayers] = useState<
    { id: string; first_name: string; last_name: string; photo_url?: string | null }[]
  >([]);
  const [attendance, setAttendance] = useState<Record<string, Attendance[]>>({});
  const [playersCount, setPlayersCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"upcoming" | "past" | "all">("all");
  const navigate = useNavigate();
  const showSkeleton = useMinimumLoading(loading);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [tr, playersRes] = await Promise.all([
          getTrainings(TEAM_ID),
          supabase.from("players").select("id, first_name, last_name, photo_url").eq("team_id", TEAM_ID),
        ]);
        setTrainings(tr);
        const playerList = (playersRes.data || []) as {
          id: string;
          first_name: string;
          last_name: string;
          photo_url?: string | null;
        }[];
        setPlayers(playerList);
        setPlayersCount(playerList.length);

        setLoading(false);

        if (tr.length > 0) {
          const nowTs = Date.now();
          const pastIds = tr
            .filter((t) => new Date(`${t.date}T${t.time || "00:00"}`).getTime() < nowTs)
            .map((t) => t.id);
          if (pastIds.length > 0) {
            setAttendanceLoading(true);
            const { data, error: attError } = await supabase
              .from("training_attendance")
              .select("training_id, player_id, status, created_at")
              .in("training_id", pastIds);
            if (attError) throw attError;
            const map: Record<string, Attendance[]> = {};
            (data || []).forEach((row: any) => {
              const key = `${row.training_id}_${row.player_id}`;
              const list = map[row.training_id] || [];
              const existingIdx = list.findIndex((x) => `${x.training_id}_${x.player_id}` === key);
              const entry = row as Attendance & { created_at?: string | null };
              if (existingIdx >= 0) {
                const prev = list[existingIdx] as Attendance & { created_at?: string | null };
                const prevTs = prev?.created_at ? new Date(prev.created_at).getTime() : -Infinity;
                const ts = entry?.created_at ? new Date(entry.created_at).getTime() : -Infinity;
                if (ts >= prevTs) {
                  list[existingIdx] = entry;
                }
              } else {
                list.push(entry);
              }
              map[row.training_id] = list;
            });
            setAttendance(map);
            setAttendanceLoading(false);
          } else {
            setAttendance({});
          }
        } else {
          setAttendance({});
        }
      } catch (e: any) {
        console.error(e);
        setError(e.message || "Не вдалося завантажити тренування");
      } finally {
        setLoading(false);
        setAttendanceLoading(false);
      }
    }

    load();
  }, []);

  const sortedTrainings = useMemo(
    () => [...trainings].sort((a, b) => `${a.date} ${a.time || ""}`.localeCompare(`${b.date} ${b.time || ""}`)),
    [trainings]
  );

  const nowTs = Date.now();
  const upcomingTrainings = sortedTrainings.filter((t) => new Date(`${t.date}T${t.time || "00:00"}`).getTime() >= nowTs);
  const pastTrainings = sortedTrainings
    .filter((t) => new Date(`${t.date}T${t.time || "00:00"}`).getTime() < nowTs)
    .sort((a, b) => `${b.date} ${b.time || ""}`.localeCompare(`${a.date} ${a.time || ""}`));

  const totalTrainings = pastTrainings.length;
  const sparringsCount = pastTrainings.filter((t) => t.type === "sparring").length;
  const upcomingCount = upcomingTrainings.length;
  const pastTrainingIds = new Set(pastTrainings.map((t) => t.id));
  const pastAttendance = Object.entries(attendance).reduce((acc, [trainingId, list]) => {
    if (!pastTrainingIds.has(trainingId)) return acc;
    return acc + list.filter((a) => a.status === "present").length;
  }, 0);
  const maxAttendance = playersCount * pastTrainingIds.size;
  const avgAttendancePercent = maxAttendance > 0 ? Math.round((pastAttendance / maxAttendance) * 100) : 0;

  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  const today = new Date();
  const startOfWeek = new Date(today);
  const day = startOfWeek.getDay() || 7;
  startOfWeek.setHours(0, 0, 0, 0);
  startOfWeek.setDate(startOfWeek.getDate() - day + 1);
  const startOfPrevWeek = new Date(startOfWeek.getTime() - sevenDays);
  const endOfPrevWeek = new Date(startOfWeek.getTime() - 1);

  const pastWeekIds = new Set(
    pastTrainings
      .filter((t) => {
        const ts = new Date(`${t.date}T${t.time || "00:00"}`).getTime();
        return ts >= startOfWeek.getTime();
      })
      .map((t) => t.id)
  );
  const prevWeekIds = new Set(
    pastTrainings
      .filter((t) => {
        const ts = new Date(`${t.date}T${t.time || "00:00"}`).getTime();
        return ts >= startOfPrevWeek.getTime() && ts <= endOfPrevWeek.getTime();
      })
      .map((t) => t.id)
  );

  const calcWeekAttendance = (ids: Set<string>) => {
    const max = playersCount * ids.size;
    if (max === 0) return 0;
    let presentCount = 0;
    ids.forEach((id) => {
      const list = attendance[id] || [];
      presentCount += list.filter((a) => a.status === "present").length;
    });
    return Math.round((presentCount / max) * 100);
  };

  const currentWeekPct = calcWeekAttendance(pastWeekIds);
  const prevWeekPct = calcWeekAttendance(prevWeekIds);
  const diffPct = currentWeekPct - prevWeekPct;
  const attendanceTrendValue =
    pastWeekIds.size === 0 || maxAttendance === 0
      ? ""
      : diffPct > 0
        ? `+${diffPct}%`
        : diffPct < 0
          ? `${diffPct}%`
          : "0%";
  const attendanceTrendDirection: "up" | "down" | "flat" | undefined =
    pastWeekIds.size === 0 || maxAttendance === 0
      ? undefined
      : diffPct > 0
        ? "up"
        : diffPct < 0
          ? "down"
          : "flat";
  const attendanceHint =
    pastWeekIds.size === 0 || maxAttendance === 0 ? "" : "до мин. тижня";

  const nextTraining = upcomingTrainings[0];
  const nextTrainingMeta = useMemo(() => {
    if (!nextTraining) return null;
    const date = new Date(`${nextTraining.date}T${nextTraining.time || "00:00"}`);
    const weekday = new Intl.DateTimeFormat("uk-UA", { weekday: "long" }).format(date);
    const dateLabel = new Intl.DateTimeFormat("uk-UA", { day: "numeric", month: "long" }).format(date);
    const time = date.toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" });
    const weekdayLabel = `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)}`;
    return {
      primary: `${weekdayLabel}, ${dateLabel} ${time}`,
      time,
      dateLine: `${weekdayLabel}, ${dateLabel}`,
    };
  }, [nextTraining]);

  const nextTrainingDetail = useMemo(() => {
    if (!nextTraining) return "";
    const typeLabel = typeLabels[nextTraining.type];
    const location = (nextTraining.location || "").trim();
    return [typeLabel, location].filter(Boolean).join(" · ");
  }, [nextTraining]);

  const trainingKpis = useMemo<OperationalSummaryKpi[] | undefined>(() => {
    if (loading || error || attendanceLoading) return undefined;
    return [
      {
        key: "total",
        label: "Всього тренувань",
        value: String(totalTrainings),
        icon: CalendarDays,
        iconTone: "bg-blue-500/10 text-blue-600",
      },
      {
        key: "upcoming",
        label: "Майбутні",
        value: String(upcomingCount),
        icon: Users,
        iconTone: "bg-emerald-500/10 text-emerald-600",
      },
      {
        key: "sparring",
        label: "Спаринги",
        value: String(sparringsCount),
        icon: Swords,
        iconTone: "bg-amber-500/10 text-amber-600",
      },
      {
        key: "attendance",
        label: "Сер. відвідуваність",
        value: String(avgAttendancePercent),
        unit: "%",
        hint: attendanceHint,
        icon: BarChart3,
        iconTone: "bg-indigo-500/10 text-indigo-600",
        trend: attendanceTrendValue
          ? {
              value: attendanceTrendValue,
              direction: attendanceTrendDirection,
            }
          : undefined,
      },
    ];
  }, [
    loading,
    error,
    attendanceLoading,
    totalTrainings,
    upcomingCount,
    sparringsCount,
    avgAttendancePercent,
    attendanceHint,
    attendanceTrendValue,
    attendanceTrendDirection,
  ]);

  const playersById = useMemo(() => {
    const map = new Map<string, { id: string; first_name: string; last_name: string; photo_url?: string | null }>();
    players.forEach((p) => map.set(p.id, p));
    return map;
  }, [players]);

  const buildPresentPlayers = (trainingId: string) => {
    const att = attendance[trainingId] || [];
    const presentEntries = att.filter((a) => a.status === "present");
    return presentEntries
      .map((a) => playersById.get(a.player_id))
      .filter((p): p is { id: string; first_name: string; last_name: string; photo_url?: string | null } => Boolean(p));
  };

  const groupedPast = useMemo(() => {
    const map = new Map<string, Training[]>();
    pastTrainings.forEach((t) => {
      const key = monthKeyUA(`${t.date}T${t.time || "00:00"}`);
      const arr = map.get(key) ?? [];
      arr.push(t);
      map.set(key, arr);
    });
    return Array.from(map.entries());
  }, [pastTrainings]);

  const headerActions = useMemo(
    () => (
      <>
        <Button asChild variant="secondary">
          <Link to="/admin/trainings/analytics">Аналітика</Link>
        </Button>
        <Button asChild variant="primary">
          <Link to="/admin/trainings/create">Нове тренування</Link>
        </Button>
      </>
    ),
    []
  );

  usePageHeaderActions(headerActions, []);

  return showSkeleton ? (
    <div className="flex flex-col gap-6">
      <div className="space-y-2">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, idx) => (
          <Skeleton key={`train-kpi-${idx}`} className="h-28 rounded-[var(--radius-inner)]" />
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, idx) => (
          <Skeleton key={`train-card-${idx}`} className="h-[220px] rounded-[var(--radius-section)]" />
        ))}
      </div>
      <Skeleton className="h-12 rounded-[var(--radius-inner)]" />
    </div>
  ) : (
    <div className="flex flex-col gap-6">
      <OperationalSummary
        title="Огляд тренувань"
        subtitle="Плануй, відстежуй присутність та аналізуй прогрес"
        titleVariant="hidden"
        sectionLabel="Огляд тренувань"
        sectionIcon={Dumbbell}
        nextUpLoading={loading}
        nextUp={
          !loading && nextTraining && nextTrainingMeta
            ? {
                primary: nextTrainingMeta.primary,
                secondary: nextTrainingDetail || undefined,
                to: `/admin/trainings/${nextTraining.id}`,
                tournamentName: "Найближче тренування",
                tourLabel: typeLabels[nextTraining.type],
              }
            : undefined
        }
        nextUpCtaLabel="Перейти до тренування"
        emptyState={{
          badgeLabel: "НАЙБЛИЖЧЕ ТРЕНУВАННЯ",
          title: "Немає майбутніх тренувань",
          description: "Додай нове тренування, щоб команда бачила час і локацію.",
          actionLabel: "Нове тренування",
        }}
        kpis={trainingKpis}
      />
      {error ? (
        <div className="rounded-[var(--radius-inner)] border border-border bg-muted/20 p-4 text-sm text-rose-500">
          {error}
        </div>
      ) : null}

      <section className="space-y-4">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "upcoming" | "past" | "all")}>
          <TabsList className="bg-muted/70 border border-border shadow-inner">
            <TabsTrigger value="all">
              Всі
              <span className="ml-2 rounded-full bg-muted px-1.5 text-[10px] font-semibold text-muted-foreground">
                {upcomingTrainings.length + pastTrainings.length}
              </span>
            </TabsTrigger>
            <TabsTrigger value="upcoming">
              Заплановані
              <span className="ml-2 rounded-full bg-muted px-1.5 text-[10px] font-semibold text-muted-foreground">
                {upcomingTrainings.length}
              </span>
            </TabsTrigger>
            <TabsTrigger value="past">
              Завершені
              <span className="ml-2 rounded-full bg-muted px-1.5 text-[10px] font-semibold text-muted-foreground">
                {pastTrainings.length}
              </span>
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {loading ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 2 }).map((_, idx) => (
              <Skeleton key={`upcoming-skel-${idx}`} className="h-[220px] rounded-[var(--radius-inner)]" />
            ))}
          </div>
        ) : (activeTab === "upcoming" || activeTab === "all") && upcomingTrainings.length === 0 ? (
          <div className="rounded-[var(--radius-inner)] border border-border bg-muted/20 p-6 text-sm text-muted-foreground">
            Немає запланованих тренувань
          </div>
        ) : activeTab === "upcoming" || activeTab === "all" ? (
          <div className="space-y-6">
            <section className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-foreground">Заплановані тренування</h3>
                <span className="text-xs text-muted-foreground">
                  {upcomingTrainings.length} тренувань
                </span>
              </div>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {upcomingTrainings.map((training) => {
                  const att = attendance[training.id] || [];
                  const presentEntries = att.filter((a) => a.status === "present");
                  const presentPlayers = buildPresentPlayers(training.id);
                  const present = presentEntries.length;
                  const total = playersCount || new Set(att.map((a) => a.player_id)).size || 0;
                  return (
                    <TrainingCard
                      key={training.id}
                      training={training}
                      present={present}
                      total={total}
                      presentPlayers={presentPlayers}
                      onClick={() => navigate(`/admin/trainings/${training.id}`)}
                      isUpcoming
                      showAttendance={false}
                    />
                  );
                })}
              </div>
            </section>
          </div>
        ) : null}
      </section>

      <section className="space-y-4">
        {activeTab === "past" && loading ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }).map((_, idx) => (
              <Skeleton key={`past-skel-${idx}`} className="h-[220px] rounded-[var(--radius-inner)]" />
            ))}
          </div>
        ) : (activeTab === "past" || activeTab === "all") && pastTrainings.length === 0 ? (
          <div className="rounded-[var(--radius-inner)] border border-border bg-muted/20 p-6 text-sm text-muted-foreground">
            Немає завершених тренувань
          </div>
        ) : activeTab === "past" || activeTab === "all" ? (
          <div className="space-y-6">
            {groupedPast.map(([month, list]) => (
              <section key={month} className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-foreground">{month}</h3>
                  <span className="text-xs text-muted-foreground">
                    {list.length} тренувань
                  </span>
                </div>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {list.map((training) => {
                    const att = attendance[training.id] || [];
                    const presentEntries = att.filter((a) => a.status === "present");
                    const presentPlayers = buildPresentPlayers(training.id);
                    const present = presentEntries.length;
                    const total = playersCount || new Set(att.map((a) => a.player_id)).size || 0;
                    return (
                      <TrainingCard
                        key={training.id}
                        training={training}
                        present={present}
                        total={total}
                        presentPlayers={presentPlayers}
                        onClick={() => navigate(`/admin/trainings/${training.id}`)}
                      />
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}
