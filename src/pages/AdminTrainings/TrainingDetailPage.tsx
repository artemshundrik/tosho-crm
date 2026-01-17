import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import {
  deleteTraining,
  deleteAttendance,
  getAttendance,
  getTrainingById,
  bulkSetAttendance,
  setAttendance as setAttendanceApi,
  updateTraining,
} from "../../api/trainings";
import type { Attendance, AttendanceStatus, Training } from "../../types/trainings";
import { supabase } from "../../lib/supabaseClient";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DetailSkeleton } from "@/components/app/page-skeleton-templates";
import { IconInput } from "@/components/ui/icon-input";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { usePageCache } from "@/hooks/usePageCache";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PlayerAvatar as PlayerAvatarBase } from "@/components/app/avatar-kit";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  TableActionCell,
  TableHeaderCell,
  TableNumberCell,
} from "@/components/app/table-kit";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { logActivity } from "@/lib/activityLogger";

import {
  ArrowLeft,
  CalendarDays,
  Clock,
  Copy,
  Dumbbell,
  MapPin,
  Pencil,
  ShieldPlus,
  Swords,
  Trash2,
  Brain,
  HeartPulse,
  Activity,
  PlaneTakeoff,
  Stethoscope,
  CheckCircle2,
  UserX,
} from "lucide-react";

const TEAM_ID = "389719a7-5022-41da-bc49-11e7a3afbd98";
const tempAttendanceKey = (trainingId: string) => `training_attendance_temp_${trainingId}`;

type Player = {
  id: string;
  first_name: string;
  last_name: string;
  shirt_number: number | null;
  position?: string | null;
  photo_url?: string | null;
  status: "active" | "injured" | "sick" | "away" | "inactive"; // Додай цей рядок
};

type TrainingFormState = {
  date: string;
  time: string;
  type: Training["type"];
  location: string;
  sparring_opponent: string;
  sparring_logo_url: string;
  comment: string;
};

type TrainingDetailCache = {
  training: Training | null;
  players: Player[];
  attendance: Record<string, AttendanceStatus>;
  attendanceDbIds: string[];
  form: TrainingFormState;
};

const typeLabels: Record<Training["type"], string> = {
  regular: "Звичайне тренування",
  tactics: "Тактичне",
  fitness: "Фізпідготовка",
  sparring: "Спаринг",
};

const typeIcons: Record<Training["type"], React.ElementType> = {
  regular: Dumbbell,
  tactics: Brain,
  fitness: HeartPulse,
  sparring: Swords,
};

const typeOptions = [
  { value: "regular", label: "Звичайне", icon: Dumbbell },
  { value: "tactics", label: "Тактичне", icon: Brain },
  { value: "fitness", label: "Фізпідготовка", icon: HeartPulse },
  { value: "sparring", label: "Спаринг", icon: Swords },
];

const statusOrder: AttendanceStatus[] = ["present", "absent", "injured", "sick"];

// Мапа для автоматичного призначення статусу відвідуваності на основі профілю
const globalToAttendanceMap: Record<string, AttendanceStatus> = {
  injured: "injured",
  sick: "sick",
  away: "absent",
};

const statusStyles: Record<
  AttendanceStatus,
  { label: string; short: string; tone: string; icon: any; bar: string }
> = {
  present: {
    label: "Присутні",
    short: "Присутній",
    tone: "bg-success-soft text-success-foreground border-success-soft-border",
    icon: CheckCircle2,
    bar: "bg-success-foreground/70"
  },
  absent: {
    label: "Відсутні",
    short: "Відсутній",
    tone: "bg-neutral-soft text-neutral-foreground border-neutral-soft-border",
    icon: UserX,
    bar: "bg-neutral-foreground/50"
  },
  injured: {
    label: "Травма",
    short: "Травма",
    tone: "bg-danger-soft text-danger-foreground border-danger-soft-border",
    icon: Stethoscope,
    bar: "bg-danger-foreground/70"
  },
  sick: {
    label: "Хворі",
    short: "Хворий",
    tone: "bg-info-soft text-info-foreground border-info-soft-border",
    icon: Activity,
    bar: "bg-info-foreground/70"
  },
};

export function TrainingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const cacheKey = id ? `training-detail:${id}` : "training-detail:unknown";
  const { cached, setCache } = usePageCache<TrainingDetailCache>(cacheKey);
  
  // Перевіряємо наявність кешу - важливо перевіряти кожен раз
  const hasCache = Boolean(cached);

  const [training, setTraining] = useState<Training | null>(cached?.training ?? null);
  const [players, setPlayers] = useState<Player[]>(cached?.players ?? []);
  const [attendance, setAttendance] = useState<Record<string, AttendanceStatus>>(
    cached?.attendance ?? {}
  );
  const [attendanceDbIds, setAttendanceDbIds] = useState<Set<string>>(
    new Set(cached?.attendanceDbIds ?? [])
  );
  const [loading, setLoading] = useState(!hasCache);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Оновлюємо loading коли з'являється кеш (важливо для повторних відвідувань)
  useEffect(() => {
    if (hasCache && loading) {
      setLoading(false);
    }
  }, [hasCache, loading]);
  
  // Показуємо skeleton тільки якщо немає кешу
  const shouldShowSkeleton = loading && !hasCache;
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<TrainingFormState>(
    cached?.form ?? {
      date: "",
      time: "",
      type: "regular",
      location: "",
      sparring_opponent: "",
      sparring_logo_url: "",
      comment: "",
    }
  );

  const trainingDateTime = useMemo(() => {
    if (!training) return null;
    return new Date(`${training.date}T${training.time || "00:00"}`);
  }, [training]);

  const trainingStarted = trainingDateTime ? trainingDateTime.getTime() <= Date.now() : false;
  const trainingFuture = trainingDateTime ? trainingDateTime.getTime() > Date.now() : false;

  useEffect(() => {
    async function load() {
      if (!id) return;
      // Завантажуємо тільки якщо немає кешу
      if (!hasCache) {
        setLoading(true);
      }
      setError(null);
      try {
      const [tr, playersRes, att] = await Promise.all([
  getTrainingById(id),
  supabase
    .from("players")
    .select("id, first_name, last_name, shirt_number, position, photo_url, status") // Додали status
    .eq("team_id", TEAM_ID)
    .neq("status", "inactive"), // Автоматично прибираємо тих, хто пішов
  getAttendance(id),
]);

setTraining(tr);

const playerList = (playersRes.data || []) as Player[];
setPlayers(playerList);

const attMap: Record<string, AttendanceStatus> = {};
const dbIds = new Set<string>();
(att as Attendance[]).forEach((row) => {
  attMap[row.player_id] = row.status;
  dbIds.add(row.player_id);
});

        // --- Автостатус з профілю (тільки якщо в БД ще немає) ---
        const autoUpdates: { playerId: string; status: AttendanceStatus }[] = [];
        const trainingStartedForLoad = tr
          ? new Date(`${tr.date}T${tr.time || "00:00"}`).getTime() <= Date.now()
          : false;

        playerList.forEach((p) => {
          if (!attMap[p.id] && globalToAttendanceMap[p.status]) {
            const status = globalToAttendanceMap[p.status];
            attMap[p.id] = status;
            autoUpdates.push({ playerId: p.id, status });
          }
        });

        setAttendance(attMap);
        setAttendanceDbIds(dbIds);

        if (trainingStartedForLoad && autoUpdates.length > 0) {
          try {
            await bulkSetAttendance(tr.id, autoUpdates);
            setAttendanceDbIds((prev) => {
              const next = new Set(prev);
              autoUpdates.forEach((u) => next.add(u.playerId));
              return next;
            });
          } catch (e) {
            console.error("Failed to persist auto attendance", e);
          }
        }

        const nextForm: TrainingFormState = {
          date: tr?.date || "",
          time: tr?.time || "",
          type: tr?.type || "regular",
          location: tr?.location || "",
          sparring_opponent: tr?.sparring_opponent || "",
          sparring_logo_url: tr?.sparring_logo_url || "",
          comment: tr?.comment || "",
        };
        setForm(nextForm);

        setCache({
          training: tr,
          players: playerList,
          attendance: attMap,
          attendanceDbIds: Array.from(dbIds),
          form: nextForm,
        });
      } catch (e: any) {
        console.error(e);
        setError(e.message || "Не вдалося завантажити тренування");
      } finally {
        setLoading(false);
      }
    }

    // Завантажуємо тільки якщо немає кешу
    if (!hasCache) {
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasCache, id]);

  useEffect(() => {
    if (!training || !trainingFuture) return;
    try {
      const raw = localStorage.getItem(tempAttendanceKey(training.id));
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, AttendanceStatus> | null;
      if (parsed && typeof parsed === "object") {
        setAttendance((prev) => ({ ...prev, ...parsed }));
      }
    } catch (e) {
      console.warn("Failed to restore temp attendance", e);
    }
  }, [training, trainingFuture]);

  useEffect(() => {
    if (!training || !trainingFuture) return;
    try {
      localStorage.setItem(tempAttendanceKey(training.id), JSON.stringify(attendance));
    } catch (e) {
      console.warn("Failed to persist temp attendance", e);
    }
  }, [attendance, training, trainingFuture]);

  useEffect(() => {
    if (!training || !trainingStarted) return;
    const raw = localStorage.getItem(tempAttendanceKey(training.id));
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw) as Record<string, AttendanceStatus> | null;
      if (!parsed || typeof parsed !== "object") {
        localStorage.removeItem(tempAttendanceKey(training.id));
        return;
      }

      const updates = Object.entries(parsed)
        .filter(([playerId]) => !attendanceDbIds.has(playerId))
        .map(([playerId, status]) => ({ playerId, status }));

      if (!updates.length) {
        localStorage.removeItem(tempAttendanceKey(training.id));
        return;
      }

      bulkSetAttendance(training.id, updates).then(() => {
        setAttendanceDbIds((prev) => {
          const next = new Set(prev);
          updates.forEach((u) => next.add(u.playerId));
          return next;
        });
        localStorage.removeItem(tempAttendanceKey(training.id));
      }).catch((e) => {
        console.error("Failed to sync temp attendance", e);
      });
    } catch (e) {
      console.warn("Failed to sync temp attendance", e);
    }
  }, [attendanceDbIds, training, trainingStarted]);

  const summary = useMemo(() => {
    const counts: Record<AttendanceStatus, number> = {
      present: 0,
      absent: 0,
      injured: 0,
      sick: 0,
    };

    const latestByPlayer = new Map<string, AttendanceStatus>();
    Object.entries(attendance).forEach(([pid, status]) => {
      latestByPlayer.set(pid, status);
    });

    players.forEach((p) => {
      const st = latestByPlayer.get(p.id);
      if (st && counts[st] !== undefined) counts[st] += 1;
    });

    const present = counts.present;
    const absent = counts.absent;
    const attendancePct = present + absent === 0 ? 0 : Math.round((present / (present + absent)) * 100);

    return { counts, attendancePct };
  }, [attendance, players]);

  const sortedPlayers = useMemo(() => {
    return [...players].sort((a, b) => {
      const gkPriority = (p: Player) => (p.position === "GK" ? 0 : 1);
      const diff = gkPriority(a) - gkPriority(b);
      if (diff !== 0) return diff;
      const na = a.shirt_number ?? Number.MAX_SAFE_INTEGER;
      const nb = b.shirt_number ?? Number.MAX_SAFE_INTEGER;
      return na - nb;
    });
  }, [players]);

  async function handleDelete() {
    if (!id) return;
    const confirmed = window.confirm("Видалити тренування?");
    if (!confirmed) return;
    try {
      setSaving(true);
      await deleteTraining(id);
      logActivity({
        teamId: TEAM_ID,
        action: "delete_training",
        entityType: "trainings",
        entityId: id,
        title: `Видалено тренування ${training?.date || ""}`.trim(),
        href: "/admin/trainings",
      });
      navigate("/admin/trainings");
    } catch (e: any) {
      console.error(e);
      setError(e.message || "Не вдалося видалити");
    } finally {
      setSaving(false);
    }
  }

  async function handleStatusChange(playerId: string, status: AttendanceStatus) {
    if (!id) return;

    setAttendance((prev) => {
      const current = prev[playerId] as AttendanceStatus | undefined;
      const next = current === status ? undefined : status;
      const updated = { ...prev };
      if (next) {
        updated[playerId] = next;
      } else {
        delete updated[playerId];
      }
      return updated;
    });

    if (!trainingStarted) return;

    const current = attendance[playerId] as AttendanceStatus | undefined;
    const next = current === status ? undefined : status;

    try {
      if (next) {
        await setAttendanceApi(id, playerId, next);
      } else {
        await deleteAttendance(id, playerId);
      }
    } catch (e) {
      console.error(e);
      setError("Не вдалося оновити присутність");
    }
  }

  async function handleUpdate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!id) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await updateTraining(id, {
        date: form.date,
        time: form.time,
        type: form.type,
        location: form.location.trim() || null,
        sparring_opponent: form.type === "sparring" ? form.sparring_opponent.trim() || null : null,
        sparring_logo_url: form.type === "sparring" ? form.sparring_logo_url.trim() || null : null,
        comment: form.comment.trim() || undefined,
      });

      const refreshed = await getTrainingById(id);
      setTraining(refreshed);
      logActivity({
        teamId: TEAM_ID,
        action: "update_training",
        entityType: "trainings",
        entityId: id,
        title: `Оновлено тренування ${updated.date} ${updated.time || ""}`.trim(),
        href: `/admin/trainings/${id}`,
        metadata: {
          event_date: updated.date,
          event_time: updated.time || null,
        },
      });
      setEditing(false);
    } catch (e: any) {
      console.error(e);
      setError(e.message || "Не вдалося оновити тренування");
    } finally {
      setSaving(false);
    }
  }

  const totalPlayers = players.length;

  const formatPositionUk = (pos?: string | null) => {
    if (!pos) return null;
    const key = pos.toLowerCase();
    const map: Record<string, string> = {
      gk: "Воротар",
      goalkeeper: "Воротар",
      df: "Захисник",
      cb: "Центр. захисник",
      lb: "Лівий захисник",
      rb: "Правий захисник",
      mf: "Півзахисник",
      cm: "Центр. півзахисник",
      dm: "Опорний півзахисник",
      am: "Атак. півзахисник",
      fw: "Нападник",
      st: "Нападник",
      cf: "Центр. форвард",
      lf: "Лівий форвард",
      rf: "Правий форвард",
      wing: "Фланговий",
      universal: "Універсал",
      univ: "Універсал",
    };
    return map[key] || pos;
  };

  if (shouldShowSkeleton) {
    return <DetailSkeleton />;
  }

  if (!training) {
    return <div className="text-sm text-muted-foreground">Тренування не знайдено.</div>;
  }

  const datetime = trainingDateTime || new Date(`${training.date}T${training.time}`);
  const dateLabel = new Intl.DateTimeFormat("uk-UA", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(datetime);
  const timeLabel = training.time?.slice(0, 5);
  const TypeIcon = typeIcons[training.type];

  return (
    <div className="flex flex-col gap-6">
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Помилка</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Button variant="ghost" className="gap-2" onClick={() => navigate("/admin/trainings")}>
          <ArrowLeft className="h-4 w-4" />
          Назад до списку
        </Button>
        <div className="flex flex-wrap gap-2">
          {!editing ? (
            <Button variant="secondary" className="gap-2" onClick={() => setEditing(true)}>
              <Pencil className="h-4 w-4" />
              Редагувати
            </Button>
          ) : null}
          <Button
            variant="outline"
            className="gap-2"
            onClick={() =>
              navigate("/admin/trainings/create", {
                state: {
                  prefillFromTraining: {
                    time: training.time,
                    type: training.type,
                    location: training.location,
                    sparring_opponent: training.sparring_opponent,
                    sparring_logo_url: training.sparring_logo_url,
                    comment: training.comment,
                    date: training.date,
                  },
                },
              })
            }
          >
            <Copy className="h-4 w-4" />
            Дублювати
          </Button>
          <Button variant="destructive" className="gap-2" onClick={handleDelete} disabled={saving}>
            <Trash2 className="h-4 w-4" />
            Видалити
          </Button>
        </div>
      </div>

      <Card className="rounded-[var(--radius-section)] border border-border bg-card shadow-none">
        <CardContent className="p-6">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="gap-2 rounded-[var(--radius)]">
                  <TypeIcon className="h-4 w-4" />
                  {typeLabels[training.type]}
                </Badge>
                {training.type === "sparring" && training.sparring_opponent ? (
                  <Badge variant="outline" className="rounded-[var(--radius)]">
                    Суперник: {training.sparring_opponent}
                  </Badge>
                ) : null}
              </div>
              <div className="flex items-center gap-3">
                <TypeIcon className="h-5 w-5 text-muted-foreground" />
                <div className="text-2xl font-bold text-foreground">{dateLabel}</div>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/40 px-3 py-1">
                  <Clock className="h-4 w-4" />
                  {timeLabel || "—"}
                </span>
                {training.location ? (
                  <span className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/40 px-3 py-1">
                    <MapPin className="h-4 w-4" />
                    {training.location}
                  </span>
                ) : null}
              </div>
              {training.comment ? (
                <p className="text-sm text-muted-foreground max-w-2xl">{training.comment}</p>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>

      {editing ? (
        <Card className="rounded-[var(--radius-section)] border border-border bg-card shadow-none">
          <CardHeader>
            <CardTitle className="text-base">Редагування тренування</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleUpdate} className="space-y-6">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="training-date">Дата</Label>
                  <IconInput
                    id="training-date"
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm((prev) => ({ ...prev, date: e.currentTarget.value }))}
                    required
                    icon={CalendarDays}
                    iconLabel="Вибрати дату"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="training-time">Час</Label>
                  <IconInput
                    id="training-time"
                    type="time"
                    value={form.time}
                    onChange={(e) => setForm((prev) => ({ ...prev, time: e.currentTarget.value || "" }))}
                    required
                    icon={Clock}
                    iconLabel="Вибрати час"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Тип</Label>
                  <Select
                    value={form.type}
                    onValueChange={(val) =>
                      setForm((prev) => ({
                        ...prev,
                        type: (val as Training["type"]) || "regular",
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Оберіть тип" />
                    </SelectTrigger>
                    <SelectContent>
                      {typeOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          <span className="flex items-center gap-2">
                            <opt.icon className="h-4 w-4 text-muted-foreground" />
                            <span>{opt.label}</span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {form.type === "sparring" ? (
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="sparring-opponent">Суперник (спаринг)</Label>
                    <Input
                      id="sparring-opponent"
                      placeholder="Назва команди"
                      value={form.sparring_opponent}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          sparring_opponent: e.currentTarget.value,
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="sparring-logo">URL лого суперника</Label>
                    <Input
                      id="sparring-logo"
                      placeholder="https://…"
                      value={form.sparring_logo_url}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          sparring_logo_url: e.currentTarget.value || "",
                        }))
                      }
                    />
                  </div>
                </div>
              ) : null}

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="training-location">Локація</Label>
                  <Input
                    id="training-location"
                    value={form.location}
                    onChange={(e) => setForm((prev) => ({ ...prev, location: e.currentTarget.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="training-comment">Коментар</Label>
                  <Textarea
                    id="training-comment"
                    value={form.comment}
                    onChange={(e) => setForm((prev) => ({ ...prev, comment: e.currentTarget.value }))}
                    rows={3}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" type="button" onClick={() => setEditing(false)} disabled={saving}>
                  Скасувати
                </Button>
                <Button type="submit" disabled={saving}>
                  Зберегти
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {statusOrder.map((key) => {
          const cfg = statusStyles[key];
          const value = summary.counts[key];
          const pct = totalPlayers ? Math.round((value / totalPlayers) * 100) : 0;
          return (
            <Card key={key} className="rounded-[var(--radius-inner)] border border-border bg-card shadow-none">
              <CardContent className="p-4 space-y-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{cfg.label}</div>
                <div className="flex items-end justify-between">
                  <div className={cn("text-2xl font-bold", cfg.tone)}>
                    {value}
                    {totalPlayers > 0 ? (
                      <span className="ml-1 text-sm font-medium text-muted-foreground">/{totalPlayers}</span>
                    ) : null}
                  </div>
                  <ShieldPlus className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="h-2 w-full rounded-full bg-muted">
                  <div className={cn("h-full rounded-full", cfg.bar)} style={{ width: `${pct}%` }} />
                </div>
              </CardContent>
            </Card>
          );
        })}
        <Card className="rounded-[var(--radius-inner)] border border-border bg-card shadow-none">
          <CardContent className="p-4 space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Відвідуваність</div>
            <div className="flex items-end justify-between">
              <div className="text-2xl font-bold text-primary">{summary.attendancePct}%</div>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="h-2 w-full rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary" style={{ width: `${summary.attendancePct}%` }} />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-[var(--radius-section)] border border-border bg-card shadow-none">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Список команди</CardTitle>
          <Badge variant="secondary">{totalPlayers}</Badge>
        </CardHeader>
        <CardContent>
          <Table variant="list" size="md">
            <TableHeader>
              <TableRow>
                <TableHeaderCell widthClass="w-[60px]">#</TableHeaderCell>
                <TableHeaderCell>Гравець</TableHeaderCell>
                <TableHeaderCell align="right" className="pr-6">Статус</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedPlayers.map((p, idx) => {
                const playerStatus = attendance[p.id] as AttendanceStatus | undefined;
                const initials = `${p.first_name?.[0] || ""}${p.last_name?.[0] || ""}` || "•";
                const positionLabel = formatPositionUk(p.position);
                return (
                  <TableRow key={p.id} className="hover:bg-muted/30">
                    <TableNumberCell align="left">#{p.shirt_number ?? idx + 1}</TableNumberCell>
                    <TableCell>
                      <Link to={`/player/${p.id}`} className="flex items-center gap-3">
                        <div className="relative">
                          <PlayerAvatarBase
                            src={p.photo_url}
                            name={`${p.first_name} ${p.last_name}`}
                            fallback={initials}
                            size={36}
                            className={cn(p.status !== "active" && "grayscale opacity-60")}
                          />
                          {p.status !== "active" && (
                            <div className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-background bg-destructive animate-pulse" />
                          )}
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="font-bold text-[14px] leading-tight truncate">
                            {p.last_name} {p.first_name}
                          </span>
                          {positionLabel ? (
                            <span className="text-[10px] text-muted-foreground uppercase font-black tracking-widest mt-0.5">
                              {positionLabel}
                            </span>
                          ) : null}
                        </div>
                      </Link>
                    </TableCell>
                    <TableActionCell className="pr-6">
                      <div className="flex flex-wrap justify-end gap-1.5">
                        {statusOrder.map((st) => {
                          const cfg = statusStyles[st];
                          const isActive = playerStatus === st;
                          return (
                            <Button
                              key={st}
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => handleStatusChange(p.id, st)}
                              className={cn(
                                "h-9 rounded-[var(--radius-lg)] border px-3 text-[10px] font-black uppercase tracking-tighter transition-all active:scale-95 flex items-center gap-1.5",
                                isActive
                                  ? cfg.tone + " border-transparent ring-2 ring-offset-1 ring-offset-background ring-border/20"
                                  : "border-border bg-background text-muted-foreground/40 hover:text-foreground hover:bg-muted/40"
                              )}
                            >
                              <cfg.icon className={cn("h-3.5 w-3.5", isActive ? "text-current" : "text-muted-foreground/60")} />
                              {cfg.short}
                            </Button>
                          );
                        })}
                      </div>
                    </TableActionCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
