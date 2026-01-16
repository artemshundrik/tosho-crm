// src/pages/MatchEventsAdminPage.tsx
import * as React from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

import { cn } from "@/lib/utils";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { MatchStatusBadge } from "@/components/app/MatchStatusBadge";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import {
  AlertTriangle,
  CheckCircle2,
  Pencil,
  Trash2,
  Plus,
  X,
  Users,
  Flag,
} from "lucide-react";

type MatchStatus = "scheduled" | "played" | "canceled";

type Match = {
  id: string;
  team_id: string;
  opponent_name: string;
  match_date: string;
  status: MatchStatus;
  score_team: number | null;
  score_opponent: number | null;
  tournament_id: string | null;
};

type Player = {
  id: string;
  shirt_number: number | null;
  first_name: string;
  last_name: string;
};

type EventType =
  | "goal"
  | "own_goal"
  | "penalty_scored"
  | "penalty_missed"
  | "yellow_card"
  | "red_card"
  | "goalkeeper_save";

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

type FormState = {
  eventType: EventType;
  playerId: string;
  assistPlayerId: string;
  minute: string;
};

const statusLabels: Record<MatchStatus, string> = {
  scheduled: "Запланований",
  played: "Зіграний",
  canceled: "Скасований",
};

const eventTypeLabels: Record<EventType, string> = {
  goal: "Гол",
  own_goal: "Автогол",
  penalty_scored: "Пенальті реалізовано",
  penalty_missed: "Пенальті не реалізовано",
  yellow_card: "Жовта картка",
  red_card: "Червона картка",
  goalkeeper_save: "Сейв воротаря",
};

const eventTypes: EventType[] = [
  "goal",
  "own_goal",
  "penalty_scored",
  "penalty_missed",
  "yellow_card",
  "red_card",
  "goalkeeper_save",
];

function formatDateTimeUA(iso: string) {
  const d = new Date(iso);
  const date = new Intl.DateTimeFormat("uk-UA", { day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
  const time = new Intl.DateTimeFormat("uk-UA", { hour: "2-digit", minute: "2-digit" }).format(d);
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


function toIntOrNull(v: string) {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t);
  if (Number.isNaN(n) || n < 0) return NaN;
  return Math.floor(n);
}

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
  // 3 “головні” — робимо emoji, як ти просив: ⚽ 🟨 🟥
  if (type === "goal" || type === "penalty_scored") {
    return (
      <span
        className="inline-flex h-4 w-4 items-center justify-center text-[14px] leading-none"
        aria-label="Гол"
        title="Гол"
      >
        ⚽
      </span>
    );
  }

  if (type === "yellow_card") {
    return (
      <span
        className="inline-flex h-4 w-4 items-center justify-center text-[14px] leading-none"
        aria-label="Жовта картка"
        title="Жовта картка"
      >
        🟨
      </span>
    );
  }

  if (type === "red_card") {
    return (
      <span
        className="inline-flex h-4 w-4 items-center justify-center text-[14px] leading-none"
        aria-label="Червона картка"
        title="Червона картка"
      >
        🟥
      </span>
    );
  }

  // решту залишаємо “спокійно”, щоб не було цирку з емодзі всюди
  if (type === "own_goal" || type === "penalty_missed") {
    return (
      <span
        className="inline-flex h-4 w-4 items-center justify-center text-[14px] leading-none"
        aria-label="Автогол/Нереалізовано"
        title="Автогол/Нереалізовано"
      >
        ⚽
      </span>
    );
  }

  if (type === "goalkeeper_save") {
    return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
  }

  return <Flag className="h-4 w-4 text-muted-foreground" />;
}



export function MatchEventsAdminPage() {
  const { matchId } = useParams<{ matchId: string }>();

  const [match, setMatch] = React.useState<Match | null>(null);
  const [players, setPlayers] = React.useState<Player[]>([]);
  const [events, setEvents] = React.useState<MatchEvent[]>([]);
  const [presentIds, setPresentIds] = React.useState<Set<string>>(new Set());

  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [metaSaving, setMetaSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);

  const [mode, setMode] = React.useState<"create" | "edit">("create");
  const [editingId, setEditingId] = React.useState<string | null>(null);

  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<MatchEvent | null>(null);

  const [view, setView] = React.useState<"table" | "timeline">("table");

  const [scoreOpponentDraft, setScoreOpponentDraft] = React.useState<string>("");
  const [statusDraft, setStatusDraft] = React.useState<MatchStatus>("scheduled");

  const [form, setForm] = React.useState<FormState>({
    eventType: "goal",
    playerId: "",
    assistPlayerId: "",
    minute: "",
  });

  const formRef = React.useRef<HTMLDivElement | null>(null);
  const minuteInputRef = React.useRef<HTMLInputElement | null>(null);

  const playerLabelById = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const p of players) {
      const num = p.shirt_number !== null && p.shirt_number !== undefined ? `№${p.shirt_number} ` : "";
      map.set(p.id, `${num}${p.last_name} ${p.first_name}`.trim());
    }
    return map;
  }, [players]);

  const presentPlayers = React.useMemo(() => players.filter((p) => presentIds.has(p.id)), [players, presentIds]);

  const canHaveAssist = form.eventType === "goal" || form.eventType === "penalty_scored";
  const assistCandidates = React.useMemo(
    () => presentPlayers.filter((p) => p.id !== form.playerId),
    [presentPlayers, form.playerId]
  );

  const sortedEvents = React.useMemo(() => [...events].sort(sortEventsStable), [events]);

  const derivedOurGoals = React.useMemo(
    () => sortedEvents.filter((e) => e.event_type === "goal" || e.event_type === "penalty_scored").length,
    [sortedEvents]
  );

  const scoreText = React.useMemo(() => {
    const our = match?.score_team;
    const opp = match?.score_opponent;
    if (typeof our === "number" && typeof opp === "number") return `${our} : ${opp}`;
    if (typeof our === "number" && (opp === null || opp === undefined)) return `${our} : —`;
    if ((our === null || our === undefined) && typeof opp === "number") return `— : ${opp}`;
    return "— : —";
  }, [match?.score_team, match?.score_opponent]);

  function resetFormKeepType() {
    setForm((prev) => ({ eventType: prev.eventType, playerId: "", assistPlayerId: "", minute: "" }));
    setMode("create");
    setEditingId(null);
  }

  function enterEdit(ev: MatchEvent) {
    setMode("edit");
    setEditingId(ev.id);
    setForm({
      eventType: ev.event_type,
      playerId: ev.player_id ?? "",
      assistPlayerId: ev.assist_player_id ?? "",
      minute: ev.minute !== null ? String(ev.minute) : "",
    });

    requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    setSuccess(null);
    setError(null);
  }

  function exitEdit() {
    resetFormKeepType();
    setSuccess(null);
    setError(null);
  }

  async function loadAll() {
    if (!matchId) {
      setError("Не вказаний matchId");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    const { data: matchData, error: matchError } = await supabase
      .from("matches")
      .select("id, team_id, opponent_name, match_date, status, score_team, score_opponent, tournament_id")
      .eq("id", matchId)
      .single();

    if (matchError || !matchData) {
      console.error("Match load error", matchError);
      setError("Не вдалося завантажити матч");
      setLoading(false);
      return;
    }

    const m = matchData as Match;
    setMatch(m);
    setScoreOpponentDraft(m.score_opponent !== null && m.score_opponent !== undefined ? String(m.score_opponent) : "");
    setStatusDraft(m.status);

    const [playersRes, eventsRes, attendanceRes] = await Promise.all([
      supabase
        .from("players")
        .select("id, shirt_number, first_name, last_name")
        .eq("team_id", m.team_id)
        .order("shirt_number", { ascending: true }),
      supabase.from("match_events").select("*").eq("match_id", matchId),
      supabase.from("match_attendance").select("player_id").eq("match_id", matchId),
    ]);

    if (playersRes.error) {
      console.error("Players load error", playersRes.error);
      setError("Не вдалося завантажити гравців");
      setPlayers([]);
    } else {
      setPlayers((playersRes.data || []) as Player[]);
    }

    if (eventsRes.error) {
      console.error("Events load error", eventsRes.error);
      setError("Не вдалося завантажити події");
      setEvents([]);
    } else {
      setEvents((eventsRes.data || []) as MatchEvent[]);
    }

    if (attendanceRes.error) {
      console.error("Attendance load error", attendanceRes.error);
      setError("Не вдалося завантажити присутність");
      setPresentIds(new Set());
    } else {
      const ids = new Set<string>();
      (attendanceRes.data || []).forEach((row) => {
        if (row.player_id) ids.add(row.player_id);
      });
      setPresentIds(ids);
    }

    setLoading(false);
  }

  React.useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId]);

  async function refreshEventsOnly() {
    if (!matchId) return;
    const { data, error } = await supabase.from("match_events").select("*").eq("match_id", matchId);
    if (error) {
      setError("Не вдалося оновити список подій");
      return;
    }
    setEvents((data || []) as MatchEvent[]);
  }

  async function recalcScoreTeam() {
    if (!matchId) return;

    const { data, error } = await supabase
      .from("match_events")
      .select("id, event_type")
      .eq("match_id", matchId)
      .in("event_type", ["goal", "penalty_scored"]);

    if (error) {
      console.error("Recalc error", error);
      return;
    }

    const newScoreTeam = data ? data.length : 0;

    const { error: updateError } = await supabase.from("matches").update({ score_team: newScoreTeam }).eq("id", matchId);
    if (updateError) {
      console.error("Update match score_team error", updateError);
      return;
    }

    setMatch((prev) => (prev ? { ...prev, score_team: newScoreTeam } : prev));
  }

  async function saveMatchMeta() {
    if (!matchId || !match) return;

    setError(null);
    setSuccess(null);

    const oppScore = scoreOpponentDraft.trim() === "" ? null : Number(scoreOpponentDraft.trim());
    if (oppScore !== null && (Number.isNaN(oppScore) || oppScore < 0)) {
      setError("Рахунок суперника має бути невідʼємним числом або порожнім");
      return;
    }

    setMetaSaving(true);

    const { error } = await supabase
      .from("matches")
      .update({ score_opponent: oppScore === null ? null : Math.floor(oppScore), status: statusDraft })
      .eq("id", matchId);

    setMetaSaving(false);

    if (error) {
      console.error("Save meta error", error);
      setError(error.message || "Не вдалося зберегти дані матчу");
      return;
    }

    setMatch((prev) =>
      prev
        ? { ...prev, score_opponent: oppScore === null ? null : Math.floor(oppScore), status: statusDraft }
        : prev
    );

    setSuccess("Дані матчу збережено");
  }

  async function submitEvent() {
    setError(null);
    setSuccess(null);

    if (!match) {
      setError("Матч ще не завантажено");
      return;
    }

    if (!form.eventType) {
      setError("Потрібно обрати тип події");
      return;
    }

    if (!form.playerId) {
      setError("Потрібно вказати автора події");
      return;
    }

    const minute = toIntOrNull(form.minute);

if (minute !== null && Number.isNaN(minute)) {
  setError("Хвилина має бути невід’ємним числом або порожньою");
  return;
}


    const assistId =
      (form.eventType === "goal" || form.eventType === "penalty_scored") && form.assistPlayerId
        ? form.assistPlayerId
        : null;

    setSaving(true);

    if (mode === "create") {
      const { error } = await supabase.from("match_events").insert({
        match_id: match.id,
        team_id: match.team_id,
        event_type: form.eventType,
        player_id: form.playerId,
        assist_player_id: assistId,
        minute,
      });

      setSaving(false);

      if (error) {
        console.error("Insert error", error);
        setError(error.message || "Не вдалося створити подію");
        return;
      }

      resetFormKeepType();

      await refreshEventsOnly();
      await recalcScoreTeam();

      setSuccess("Подію додано");

      requestAnimationFrame(() => {
        minuteInputRef.current?.focus();
      });
      return;
    }

    if (mode === "edit" && editingId) {
      const { error } = await supabase
        .from("match_events")
        .update({ event_type: form.eventType, player_id: form.playerId, assist_player_id: assistId, minute })
        .eq("id", editingId);

      setSaving(false);

      if (error) {
        console.error("Update error", error);
        setError(error.message || "Не вдалося оновити подію");
        return;
      }

      await refreshEventsOnly();
      await recalcScoreTeam();

      setSuccess("Подію оновлено");
      exitEdit();
      return;
    }

    setSaving(false);
    setError("Невідомий режим");
  }

  function openDelete(ev: MatchEvent) {
    setDeleteTarget(ev);
    setDeleteOpen(true);
  }

  async function confirmDelete() {
    if (!deleteTarget) {
      setDeleteOpen(false);
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    const { error } = await supabase.from("match_events").delete().eq("id", deleteTarget.id);

    setSaving(false);
    setDeleteOpen(false);

    if (error) {
      console.error("Delete error", error);
      setError(error.message || "Не вдалося видалити подію");
      return;
    }

    if (mode === "edit" && editingId === deleteTarget.id) {
      exitEdit();
    }

    await refreshEventsOnly();
    await recalcScoreTeam();

    setSuccess("Подію видалено");
    setDeleteTarget(null);
  }

  function scrollToFormAndFocus() {
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    requestAnimationFrame(() => minuteInputRef.current?.focus());
  }

  const hasAttendance = presentPlayers.length > 0;

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

  const CARD_BASE = cn(
  "rounded-3xl", 
  "border border-border",
  "bg-card"
);


  
  return (
    <div className="flex flex-col gap-6">
      {error ? (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Помилка</AlertTitle>
          <AlertDescription className="text-sm">{error}</AlertDescription>
        </Alert>
      ) : null}

      {success ? (
        <Alert>
          <CheckCircle2 className="h-4 w-4" />
          <AlertTitle>Готово</AlertTitle>
          <AlertDescription className="text-sm">{success}</AlertDescription>
        </Alert>
      ) : null}

      {/* НИКАКОГО Refresh и Back тут нет. Навигация через breadcrumbs в AppLayout. */}

      {loading ? (
        <>
          <Card className={cn(CARD_BASE, "p-6")}>
            <div className="grid gap-5 md:grid-cols-4">
              <div className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-5 w-48" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-5 w-40" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-5 w-28" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-5 w-24" />
              </div>
            </div>
          </Card>

          <Card className={cn(CARD_BASE, "p-6")}>
            <Skeleton className="h-5 w-44" />
            <div className="mt-2">
              <Skeleton className="h-4 w-96" />
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
            <Skeleton className="mt-4 h-9 w-28" />
          </Card>

          <Card className={cn(CARD_BASE, "p-6")}>
            <Skeleton className="h-5 w-44" />
            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          </Card>
        </>
      ) : !match ? (
        <Card className="p-10">
          <div className="text-base font-semibold text-foreground">Матч не знайдено</div>
          <div className="mt-2 text-sm text-muted-foreground">Перевір URL або доступ до запису в Supabase.</div>
          <div className="mt-4">
            <Button asChild variant="secondary">
              <Link to="/matches-shadcn">Повернутись до матчів</Link>
            </Button>
          </div>
        </Card>
      ) : (
        <>
          {/* Summary */}
          {/* Summary */}
<Card className={cn(CARD_BASE, "p-6")}>
  <div className="grid gap-5 md:grid-cols-4">
    <div className="space-y-1">
      <div className="text-xs font-medium text-muted-foreground">Суперник</div>
      <div className="text-base font-semibold text-foreground">{match.opponent_name}</div>
    </div>

    <div className="space-y-1">
      <div className="text-xs font-medium text-muted-foreground">Дата</div>
      <div className="text-sm font-medium text-foreground">{formatDateTimeUA(match.match_date)}</div>
    </div>

    <div className="space-y-1">
      <div className="text-xs font-medium text-muted-foreground">Статус</div>

      {/* ✅ Оце і є “статус бейдж як на матч-картах” */}
      <div className="flex items-center gap-2">
        <MatchStatusBadge
          status={match.status}
          scoreTeam={match.score_team}
          scoreOpponent={match.score_opponent}
        />
      </div>
    </div>

    <div className="space-y-1">
      <div className="text-xs font-medium text-muted-foreground">Рахунок</div>
      <div className="text-sm font-semibold text-foreground tabular-nums">{scoreText}</div>
      <div className="text-xs text-muted-foreground">Наші голи — з подій • Суперник — вручну</div>
    </div>
  </div>
</Card>


          {/* Management */}
          <Card className={cn(CARD_BASE, "p-6")}>
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-base font-semibold text-foreground">Керування матчем</div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    Статус + рахунок суперника зберігаються в таблиці <span className="font-medium">matches</span>. Наші голи рахуємо з подій автоматично.
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {mode === "edit" ? <Badge variant="secondary">Редагування</Badge> : null}
                  <Button type="button" onClick={saveMatchMeta} disabled={metaSaving || saving}>
                    <CheckCircle2 className="h-4 w-4" />
                    Зберегти
                  </Button>
                </div>
              </div>

              <Separator />

              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label>Статус</Label>
                  <Select value={statusDraft} onValueChange={(v) => setStatusDraft(v as MatchStatus)}>
                    <SelectTrigger className={CONTROL_BASE}>
                      <SelectValue placeholder="Обрати" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="scheduled">Запланований</SelectItem>
                      <SelectItem value="played">Зіграний</SelectItem>
                      <SelectItem value="canceled">Скасований</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Наші голи (з подій)</Label>
                  <Input className={CONTROL_BASE} value={String(derivedOurGoals)} readOnly />
                </div>

                <div className="space-y-2">
                  <Label>Голи суперника (вручну)</Label>
                  <Input
  className={CONTROL_BASE}
  inputMode="numeric"
  type="number"
  min={0}
  placeholder="—"
  value={scoreOpponentDraft}
  onChange={(e) => setScoreOpponentDraft(e.target.value)}
/>

                </div>
              </div>
            </div>
          </Card>

          {!hasAttendance ? (
            <Alert>
              <Users className="h-4 w-4" />
              <AlertTitle>Немає відмічених присутніх</AlertTitle>
              <AlertDescription className="text-sm">
                Автор події береться тільки з тих, хто “був на матчі”. Спочатку відміть склад — тоді можна швидко вносити голи й картки.
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button asChild>
                    <Link to={`/matches/${match.id}`}>Відмітити присутніх</Link>
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          ) : null}

          {/* Form */}
          <Card ref={formRef} className={cn(CARD_BASE, "p-6")}>
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-base font-semibold text-foreground">
                    {mode === "create" ? "Додати подію" : "Редагувати подію"}
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    Асист доступний лише для <span className="font-medium">“Гол”</span> і <span className="font-medium">“Пенальті реалізовано”</span>.
                  </div>
                </div>

                {mode === "edit" ? (
                  <Button type="button" variant="secondary" onClick={exitEdit} disabled={saving}>
                    <X className="h-4 w-4" />
                    Скасувати
                  </Button>
                ) : null}
              </div>

              <Separator />

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="space-y-2">
                  <Label>Тип події</Label>
                  <Select
                    value={form.eventType}
                    onValueChange={(v) => {
                      const nextType = v as EventType;
                      setForm((prev) => ({
                        ...prev,
                        eventType: nextType,
                        assistPlayerId: nextType === "goal" || nextType === "penalty_scored" ? prev.assistPlayerId : "",
                      }));
                    }}
                  >
                    <SelectTrigger className={CONTROL_BASE}>
                      <SelectValue placeholder="Обрати" />
                    </SelectTrigger>
                    <SelectContent>
                      {eventTypes.map((t) => (
                        <SelectItem key={t} value={t}>
                          {eventTypeLabels[t]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Автор події</Label>
                  <Select
                    value={form.playerId || undefined}
                    onValueChange={(v) => {
                      setForm((prev) => ({
                        ...prev,
                        playerId: v,
                        assistPlayerId: prev.assistPlayerId === v ? "" : prev.assistPlayerId,
                      }));
                    }}
                    disabled={!hasAttendance}
                  >
                    <SelectTrigger className={CONTROL_BASE}>
                      <SelectValue placeholder={hasAttendance ? "Обрати гравця" : "Немає присутніх"} />
                    </SelectTrigger>
                    <SelectContent>
                      {presentPlayers.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {playerLabelById.get(p.id) || ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Асист (необовʼязково)</Label>
                  <Select
                    value={canHaveAssist ? (form.assistPlayerId || "none") : "none"}
                    onValueChange={(v) => setForm((prev) => ({ ...prev, assistPlayerId: v === "none" ? "" : v }))}
                    disabled={!canHaveAssist || !hasAttendance}
                  >
                    <SelectTrigger className={CONTROL_BASE}>
                      <SelectValue placeholder="Без асисту" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Без асисту</SelectItem>
                      {assistCandidates.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {playerLabelById.get(p.id) || ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Хвилина (опц.)</Label>
                  <Input
  ref={minuteInputRef}
  className={CONTROL_BASE}
  inputMode="numeric"
  type="number"
  min={0}
  placeholder="—"
  value={form.minute}
  onChange={(e) => setForm((prev) => ({ ...prev, minute: e.target.value }))}
  onKeyDown={(e) => {
    if (e.key === "Enter") submitEvent();
  }}
/>

                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" onClick={submitEvent} disabled={saving || !hasAttendance}>
                  {mode === "create" ? (
                    <>
                      <Plus className="h-4 w-4" />
                      Додати
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4" />
                      Оновити
                    </>
                  )}
                </Button>

                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setSuccess(null);
                    setError(null);
                    resetFormKeepType();
                  }}
                  disabled={saving}
                >
                  Очистити
                </Button>

                <div className="text-xs text-muted-foreground">
                  Порада: внеси серію подій — тип не скидається після додавання.
                </div>
              </div>
            </div>
          </Card>

          {/* List */}
          <Card className={cn(CARD_BASE, "p-6")}>
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-base font-semibold text-foreground">Список подій</div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    Сортування: хвилина ↑, далі час створення. Події без хвилини — внизу.
                  </div>
                </div>

                <div className="text-sm text-muted-foreground">
                  Всього: <span className="font-medium text-foreground">{events.length}</span>
                </div>
              </div>

              <Tabs value={view} onValueChange={(v) => setView(v as any)} className="w-full">
               <TabsList
  className={cn(
    "inline-flex h-10 items-center rounded-[var(--radius-lg)] p-1",
    "bg-muted border border-border"
  )}
>
  <TabsTrigger
    value="table"
    className={cn(
      "h-8 rounded-[var(--radius-md)] px-4 text-sm font-medium transition-colors",
      "text-muted-foreground hover:text-foreground",
      "data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm"
    )}
  >
    Таблиця
  </TabsTrigger>

  <TabsTrigger
    value="timeline"
    className={cn(
      "h-8 rounded-[var(--radius-md)] px-4 text-sm font-medium transition-colors",
      "text-muted-foreground hover:text-foreground",
      "data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm"
    )}
  >
    Таймлайн
  </TabsTrigger>
</TabsList>


                <TabsContent value="table" className="mt-4">
                  {sortedEvents.length === 0 ? (
                    <div className="rounded-[var(--radius-inner)] border border-border bg-background p-6 text-center">
                      <div className="text-base font-semibold text-foreground">Поки немає подій</div>
                      <div className="mt-2 text-sm text-muted-foreground">Додай першу подію — і тут з’явиться список.</div>
                      <div className="mt-4">
                        <Button onClick={scrollToFormAndFocus}>
                          <Plus className="h-4 w-4" />
                          Додати першу подію
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div
  className={cn(
    "overflow-hidden border border-border rounded-[var(--radius-inner)]"
  )}
>
  <Table className="w-full">
    <TableHeader>
      <TableRow className="bg-muted/40">
        <TableHead className="w-[70px] px-4 py-3 text-xs font-semibold text-muted-foreground">
          Хв.
        </TableHead>
        <TableHead className="w-[220px] px-4 py-3 text-xs font-semibold text-muted-foreground">
          Тип
        </TableHead>
        <TableHead className="px-4 py-3 text-xs font-semibold text-muted-foreground">
          Автор
        </TableHead>
        <TableHead className="px-4 py-3 text-xs font-semibold text-muted-foreground">
          Асист
        </TableHead>
        <TableHead className="w-[190px] px-4 py-3 text-xs font-semibold text-muted-foreground">
          Створено
        </TableHead>
        <TableHead className="w-[120px] px-4 py-3 text-right text-xs font-semibold text-muted-foreground">
          Дії
        </TableHead>
      </TableRow>
    </TableHeader>

    <TableBody>
      {sortedEvents.map((ev) => {
        const author = ev.player_id ? playerLabelById.get(ev.player_id) || "—" : "—";
        const assist = ev.assist_player_id ? playerLabelById.get(ev.assist_player_id) || "—" : "—";

        return (
          <TableRow key={ev.id} className="hover:bg-muted/40 transition-colors">
            {/* Хвилина — сильний акцент */}
            <TableCell className="px-4 py-4 align-middle font-medium tabular-nums text-foreground">
              {typeof ev.minute === "number" ? ev.minute : "—"}
            </TableCell>

            {/* Тип події — іконка + назва (назва medium) */}
            <TableCell className="px-4 py-4 align-middle">
  <div className={cn(
    "inline-flex items-center gap-2 rounded-full border px-3 py-1.5",
    "text-foreground",
    eventPillClasses(ev.event_type)
  )}>
    <span className="inline-flex h-5 w-5 items-center justify-center">
      {eventIcon(ev.event_type)}
    </span>
    <span className="font-semibold">{eventTypeLabels[ev.event_type]}</span>
  </div>
</TableCell>


            {/* Автор — основний */}
            <TableCell className="px-4 py-4 align-middle font-medium text-foreground">
              {author}
            </TableCell>

            {/* Асист — вторинний (↳ …) */}
            <TableCell className="px-4 py-4 align-middle text-sm text-muted-foreground">
              {assist !== "—" ? `${assist}` : "—"}
            </TableCell>

            {/* Створено — менш помітно */}
            <TableCell className="px-4 py-4 align-middle text-sm text-muted-foreground">
              {safeDateTimeUA(ev.created_at)}
            </TableCell>

            {/* Дії — завжди видимі, але не кричать */}
            <TableCell className="px-4 py-4 align-middle text-right">
              <div className="inline-flex items-center justify-end gap-1">
                <Button
                  type="button"
                  variant="control"
                  size="icon"
                  onClick={() => enterEdit(ev)}
                  disabled={saving}
                  aria-label="Редагувати"
                  title="Редагувати"
                >
                  <Pencil className="h-4 w-4" />
                </Button>

                <Button
                  type="button"
                  variant="controlDestructive"
                  size="icon"
                  onClick={() => openDelete(ev)}
                  disabled={saving}
                  aria-label="Видалити"
                  title="Видалити"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        );
      })}
    </TableBody>
  </Table>
</div>


                  )}
                </TabsContent>

                <TabsContent value="timeline" className="mt-4">
                  {sortedEvents.length === 0 ? (
                    <div className="rounded-[var(--radius-inner)] border border-border bg-background p-6 text-center">
                      <div className="text-base font-semibold text-foreground">Поки немає подій</div>
                      <div className="mt-2 text-sm text-muted-foreground">Додай першу подію — і тут з’явиться таймлайн.</div>
                      <div className="mt-4">
                        <Button onClick={scrollToFormAndFocus}>
                          <Plus className="h-4 w-4" />
                          Додати першу подію
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-[var(--radius-inner)] border border-border bg-background p-4">
                      <div className="space-y-2">
                        {sortedEvents.map((ev) => {
                          const author = ev.player_id ? playerLabelById.get(ev.player_id) || "—" : "—";
                          const assist = ev.assist_player_id ? playerLabelById.get(ev.assist_player_id) || "—" : null;

                          return (
                            <div
                              key={ev.id}
                              className="group flex items-start justify-between gap-3 rounded-[var(--radius-inner)] border border-border bg-card p-4 hover:bg-muted/20"
                            >
                              <div className="flex min-w-0 items-start gap-3">
                                <div className="grid h-9 w-9 place-items-center rounded-[var(--radius-md)] border bg-background">
                                  {ev.minute !== null ? (
                                    <span className="text-sm font-semibold tabular-nums">{ev.minute}</span>
                                  ) : (
                                    <span className="text-xs text-muted-foreground">—</span>
                                  )}
                                </div>

                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    {eventIcon(ev.event_type)}
                                    <div className="font-semibold text-foreground">{eventTypeLabels[ev.event_type]}</div>
                                  </div>
                                  <div className="mt-1 text-sm text-muted-foreground">
                                    <span className="text-foreground/90">{author}</span>
                                    {assist ? (
                                      <>
                                        <span className="mx-2 text-muted-foreground">•</span>
                                        <span>Асист: {assist}</span>
                                      </>
                                    ) : null}
                                  </div>
                                  <div className="mt-1 text-xs text-muted-foreground">{safeDateTimeUA(ev.created_at)}</div>
                                </div>
                              </div>

                              <div className="flex shrink-0 items-center gap-1">
                                <Button
                                  type="button"
                                  variant="control"
                                  size="icon"
                                  onClick={() => enterEdit(ev)}
                                  disabled={saving}
                                  aria-label="Редагувати"
                                  title="Редагувати"
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>

                                <Button
                                  type="button"
                                  variant="controlDestructive"
                                  size="icon"
                                  onClick={() => openDelete(ev)}
                                  disabled={saving}
                                  aria-label="Видалити"
                                  title="Видалити"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </div>
          </Card>

          <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Видалити подію?</AlertDialogTitle>
                <AlertDialogDescription>
                  Це дію неможливо скасувати. Якщо подія впливає на наші голи — рахунок буде перераховано.
                </AlertDialogDescription>
              </AlertDialogHeader>

              <AlertDialogFooter>
                <AlertDialogCancel disabled={saving}>Скасувати</AlertDialogCancel>
                <AlertDialogAction
                  className={cn("bg-destructive text-destructive-foreground hover:bg-destructive/90")}
                  onClick={confirmDelete}
                  disabled={saving}
                >
                  Видалити
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </div>
  );
}
