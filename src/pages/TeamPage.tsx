import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  CalendarOff,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  UserMinus,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/auth/AuthProvider";
import { AvatarBase } from "@/components/app/avatar-kit";
import { AppPageLoader } from "@/components/app/AppPageLoader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useWorkspacePresence } from "@/components/app/workspace-presence-context";
import { usePageData } from "@/hooks/usePageData";
import { cn } from "@/lib/utils";
import {
  formatEmploymentDuration,
  formatEmploymentDate,
  getBirthdayInsight,
  getWorkAnniversaryInsight,
} from "@/lib/employment";
import {
  getTeamAvailabilityBadgeClass,
  getTeamAvailabilityLabel,
  normalizeTeamAvailabilityStatus,
} from "@/lib/teamAvailability";
import {
  createTeamAbsence,
  deleteTeamAbsence,
  listTeamAbsencesForMonth,
  updateTeamAbsence,
  TEAM_ABSENCE_KIND_BADGE_CLASSES,
  TEAM_ABSENCE_KIND_LABELS,
  TEAM_ABSENCE_KIND_OPTIONS,
  type TeamAbsence,
  type TeamAbsenceKind,
} from "@/lib/teamAbsences";
import { getInitialsFromName } from "@/lib/userName";
import { listWorkspaceMembersForDisplay } from "@/lib/workspaceMemberDirectory";
import { resolveWorkspaceId } from "@/lib/workspace";

type TeamEvent = {
  id: string;
  type: "birthday" | "anniversary" | "return";
  userId: string;
  title: string;
  caption: string;
  daysUntil: number;
  dateKey: string;
};

type CalendarItem = {
  id: string;
  label: string;
  toneClass: string;
};

const ROLE_LABELS: Record<string, string> = {
  manager: "Менеджер",
  printer: "Друкар",
  head_of_logistics: "Начальник відділу логістики",
  head_of_production: "Начальник з виробництва",
  designer: "Дизайнер",
  logistics: "Логіст",
  packer: "Пакувальник",
  pm: "PM",
  sales_manager: "Менеджер з продажу",
  top_manager: "Топ-менеджер",
  junior_sales_manager: "Молодший менеджер з продажу",
  office_manager: "Офіс-менеджер",
  accountant: "Бухгалтер",
  chief_accountant: "Головний бухгалтер",
  marketer: "Маркетолог",
  smm: "СММ",
  seo: "SEO",
};

const WEEKDAY_LABELS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"];

const BIRTHDAY_TONE = "tone-warning";
const ANNIVERSARY_TONE = "tone-info";
const RETURN_TONE = "border-primary/25 bg-primary/[0.08] text-primary";

const CALENDAR_LEGEND: Array<{ label: string; toneClass: string }> = [
  { label: TEAM_ABSENCE_KIND_LABELS.sick_leave, toneClass: TEAM_ABSENCE_KIND_BADGE_CLASSES.sick_leave },
  { label: TEAM_ABSENCE_KIND_LABELS.vacation, toneClass: TEAM_ABSENCE_KIND_BADGE_CLASSES.vacation },
  { label: TEAM_ABSENCE_KIND_LABELS.day_off, toneClass: TEAM_ABSENCE_KIND_BADGE_CLASSES.day_off },
  { label: "День народження", toneClass: BIRTHDAY_TONE },
  { label: "Річниця", toneClass: ANNIVERSARY_TONE },
  { label: "Повернення", toneClass: RETURN_TONE },
];

function formatRoleLabel(value?: string | null) {
  if (!value) return "Без ролі";
  return ROLE_LABELS[value] ?? value.replaceAll("_", " ");
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0, 0);
}

function getDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function getStartOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1, 12, 0, 0, 0);
}

function addMonths(date: Date, delta: number) {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1, 12, 0, 0, 0);
}

function getStartOfCalendarGrid(date: Date) {
  const monthStart = getStartOfMonth(date);
  const sundayIndex = monthStart.getDay();
  const mondayIndex = sundayIndex === 0 ? 6 : sundayIndex - 1;
  return new Date(monthStart.getFullYear(), monthStart.getMonth(), monthStart.getDate() - mondayIndex, 12, 0, 0, 0);
}

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateKey(dateKey: string) {
  return new Date(`${dateKey}T12:00:00`);
}

function formatDayMonth(date: Date) {
  return date.toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit" });
}

function formatWeekdayShort(date: Date) {
  const weekday = date.toLocaleDateString("uk-UA", { weekday: "short" });
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)}`;
}

function pluralizeDays(count: number) {
  const mod100 = count % 100;
  const mod10 = count % 10;
  if (mod100 >= 11 && mod100 <= 14) return "днів";
  if (mod10 === 1) return "день";
  if (mod10 >= 2 && mod10 <= 4) return "дні";
  return "днів";
}

function getAbsenceDurationDays(startDate: string, endDate: string) {
  const start = parseDateKey(startDate).getTime();
  const end = parseDateKey(endDate).getTime();
  return Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1;
}

function formatAbsenceRange(startDate: string, endDate: string) {
  const start = parseDateKey(startDate);
  if (startDate === endDate) {
    return `${formatWeekdayShort(start)}, ${formatDayMonth(start)}`;
  }
  return `${formatDayMonth(start)} – ${formatDayMonth(parseDateKey(endDate))}`;
}

function formatPresenceText(lastSeenAt?: string | null, online?: boolean) {
  if (online) return "Зараз онлайн";
  if (!lastSeenAt) return "Давно не заходив";
  const date = new Date(lastSeenAt);
  if (Number.isNaN(date.getTime())) return "Не в мережі";
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffMinutes = Math.max(1, Math.round(diffMs / (1000 * 60)));
  if (diffMinutes < 60) return `${diffMinutes} хв тому`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} год тому`;
  const diffDays = Math.round(diffHours / 24);
  return `${diffDays} дн тому`;
}

function formatAvailabilityRange(startDate?: string | null, endDate?: string | null) {
  const start = startDate?.trim() || "";
  const end = endDate?.trim() || "";
  if (start && end) {
    return start === end
      ? formatEmploymentDate(start)
      : `${formatEmploymentDate(start)} - ${formatEmploymentDate(end)}`;
  }
  if (end) return `до ${formatEmploymentDate(end)}`;
  if (start) return `з ${formatEmploymentDate(start)}`;
  return "";
}

function getEventToneClass(type: TeamEvent["type"]) {
  if (type === "birthday") return BIRTHDAY_TONE;
  if (type === "return") return RETURN_TONE;
  return ANNIVERSARY_TONE;
}

export function TeamPage() {
  const { userId, loading, permissions } = useAuth();
  const workspacePresence = useWorkspacePresence();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [availabilityFilter, setAvailabilityFilter] = useState<string>("all");
  const [monthOffset, setMonthOffset] = useState(0);
  const [calendarOpen, setCalendarOpen] = useState(false);

  // Absences log (журнал відсутностей): everyone reads, owner/SEO writes.
  const canManageAbsences = permissions.isSuperAdmin || permissions.isSeo;
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [absences, setAbsences] = useState<TeamAbsence[] | null>(null);
  const [absencesLoading, setAbsencesLoading] = useState(false);
  const [absenceDialogOpen, setAbsenceDialogOpen] = useState(false);
  const [absenceEditingId, setAbsenceEditingId] = useState<string | null>(null);
  const [absenceDraftUserId, setAbsenceDraftUserId] = useState("");
  const [absenceDraftStart, setAbsenceDraftStart] = useState("");
  const [absenceDraftEnd, setAbsenceDraftEnd] = useState("");
  const [absenceMultiDay, setAbsenceMultiDay] = useState(false);
  const [absenceDraftKind, setAbsenceDraftKind] = useState<TeamAbsenceKind>("sick_leave");
  const [absenceDraftComment, setAbsenceDraftComment] = useState("");
  const [absenceSaving, setAbsenceSaving] = useState(false);
  const [absenceDeletingId, setAbsenceDeletingId] = useState<string | null>(null);

  const { data, showSkeleton } = usePageData({
    cacheKey: `team-page:${userId ?? "none"}`,
    loadFn: async () => {
      if (!userId) return [];
      const resolvedWorkspaceId = await resolveWorkspaceId(userId);
      if (!resolvedWorkspaceId) return [];
      return listWorkspaceMembersForDisplay(resolvedWorkspaceId);
    },
    cacheTTL: 10 * 60 * 1000,
    showSkeletonOnStale: false,
    backgroundRefetch: true,
  });

  const members = useMemo(() => data ?? [], [data]);
  const presenceByUserId = useMemo(
    () => new Map(workspacePresence.entries.map((entry) => [entry.userId, entry])),
    [workspacePresence.entries]
  );

  const enrichedMembers = useMemo(() => {
    return members.map((member) => {
      const presence = presenceByUserId.get(member.userId);
      return {
        ...member,
        availabilityStatus: normalizeTeamAvailabilityStatus(member.availabilityStatus),
        online: Boolean(presence?.online),
        idle: Boolean(presence?.idle),
        lastSeenAt: presence?.lastSeenAt ?? null,
      };
    });
  }, [members, presenceByUserId]);

  const memberById = useMemo(
    () => new Map(enrichedMembers.map((member) => [member.userId, member])),
    [enrichedMembers]
  );

  const roleOptions = useMemo(() => {
    return Array.from(new Set(enrichedMembers.map((member) => member.jobRole).filter(Boolean) as string[]))
      .sort((a, b) => formatRoleLabel(a).localeCompare(formatRoleLabel(b), "uk"))
      .map((role) => ({ value: role, label: formatRoleLabel(role) }));
  }, [enrichedMembers]);

  const filteredMembers = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return enrichedMembers.filter((member) => {
      if (roleFilter !== "all" && (member.jobRole ?? "") !== roleFilter) return false;
      if (availabilityFilter !== "all" && member.availabilityStatus !== availabilityFilter) return false;
      if (!normalizedSearch) return true;
      const haystack = [member.label, member.email ?? "", formatRoleLabel(member.jobRole)].join(" ").toLowerCase();
      return haystack.includes(normalizedSearch);
    });
  }, [availabilityFilter, enrichedMembers, roleFilter, search]);

  const onlineMembers = useMemo(() => enrichedMembers.filter((member) => member.online), [enrichedMembers]);
  const awayMembers = useMemo(
    () => enrichedMembers.filter((member) => member.availabilityStatus !== "available"),
    [enrichedMembers]
  );

  const teamEvents = useMemo(() => {
    const next: TeamEvent[] = [];
    const today = startOfDay(new Date());

    enrichedMembers.forEach((member) => {
      const birthday = getBirthdayInsight(member.birthDate);
      if (birthday && birthday.daysUntil <= 45) {
        const eventDate = new Date(today);
        eventDate.setDate(today.getDate() + birthday.daysUntil);
        next.push({
          id: `birthday:${member.userId}:${birthday.dateLabel}`,
          type: "birthday",
          userId: member.userId,
          title: member.label,
          caption: birthday.caption,
          daysUntil: birthday.daysUntil,
          dateKey: getDateKey(eventDate),
        });
      }

      const anniversary = getWorkAnniversaryInsight(member.startDate);
      if (anniversary && anniversary.daysUntil <= 45) {
        const eventDate = new Date(today);
        eventDate.setDate(today.getDate() + anniversary.daysUntil);
        next.push({
          id: `anniversary:${member.userId}:${anniversary.dateLabel}`,
          type: "anniversary",
          userId: member.userId,
          title: member.label,
          caption: `${anniversary.years} ${anniversary.years === 1 ? "рік" : anniversary.years <= 4 ? "роки" : "років"} в компанії`,
          daysUntil: anniversary.daysUntil,
          dateKey: getDateKey(eventDate),
        });
      }

      if (member.availabilityStatus !== "available" && member.availabilityEndDate) {
        const returnDate = startOfDay(new Date(`${member.availabilityEndDate}T12:00:00`));
        const diffMs = returnDate.getTime() - today.getTime();
        const daysUntil = Math.round(diffMs / (1000 * 60 * 60 * 24));
        if (daysUntil >= 0 && daysUntil <= 45) {
          next.push({
            id: `return:${member.userId}:${member.availabilityEndDate}`,
            type: "return",
            userId: member.userId,
            title: member.label,
            caption: `${getTeamAvailabilityLabel(member.availabilityStatus)} до ${formatEmploymentDate(member.availabilityEndDate)}`,
            daysUntil,
            dateKey: getDateKey(returnDate),
          });
        }
      }
    });

    return next.sort((a, b) => a.daysUntil - b.daysUntil);
  }, [enrichedMembers]);

  const upcomingEvents = useMemo(() => teamEvents.slice(0, 8), [teamEvents]);

  const selectedMonth = useMemo(() => addMonths(getStartOfMonth(new Date()), monthOffset), [monthOffset]);

  useEffect(() => {
    let active = true;
    if (!userId) {
      setWorkspaceId(null);
      return;
    }
    void resolveWorkspaceId(userId).then((resolved) => {
      if (active) setWorkspaceId(resolved);
    });
    return () => {
      active = false;
    };
  }, [userId]);

  const reloadAbsences = useCallback(async () => {
    if (!workspaceId) {
      setAbsences(null);
      return;
    }
    setAbsencesLoading(true);
    try {
      const rows = await listTeamAbsencesForMonth(
        workspaceId,
        selectedMonth.getFullYear(),
        selectedMonth.getMonth() + 1
      );
      setAbsences(rows);
    } catch (absencesError) {
      console.warn("Failed to load team absences", absencesError);
      setAbsences([]);
    } finally {
      setAbsencesLoading(false);
    }
  }, [workspaceId, selectedMonth]);

  useEffect(() => {
    void reloadAbsences();
  }, [reloadAbsences]);

  const openCreateAbsenceDialog = useCallback(() => {
    const today = new Date();
    const inSelectedMonth =
      today.getFullYear() === selectedMonth.getFullYear() && today.getMonth() === selectedMonth.getMonth();
    const defaultDate = toDateInputValue(inSelectedMonth ? today : selectedMonth);
    setAbsenceEditingId(null);
    setAbsenceDraftUserId("");
    setAbsenceDraftStart(defaultDate);
    setAbsenceDraftEnd(defaultDate);
    setAbsenceMultiDay(false);
    setAbsenceDraftKind("sick_leave");
    setAbsenceDraftComment("");
    setAbsenceDialogOpen(true);
  }, [selectedMonth]);

  const openEditAbsenceDialog = useCallback((entry: TeamAbsence) => {
    setAbsenceEditingId(entry.id);
    setAbsenceDraftUserId(entry.userId);
    setAbsenceDraftStart(entry.startDate);
    setAbsenceDraftEnd(entry.endDate);
    setAbsenceMultiDay(entry.startDate !== entry.endDate);
    setAbsenceDraftKind(entry.kind);
    setAbsenceDraftComment(entry.comment ?? "");
    setAbsenceDialogOpen(true);
  }, []);

  const handleMultiDayChange = useCallback(
    (checked: boolean | "indeterminate") => {
      const next = checked === true;
      setAbsenceMultiDay(next);
      if (next && (!absenceDraftEnd || absenceDraftEnd < absenceDraftStart)) {
        setAbsenceDraftEnd(absenceDraftStart);
      }
    },
    [absenceDraftEnd, absenceDraftStart]
  );

  const submitAbsence = useCallback(async () => {
    if (!workspaceId || absenceSaving) return;
    if (!absenceDraftUserId) {
      toast.error("Оберіть співробітника");
      return;
    }
    if (!absenceDraftStart) {
      toast.error("Вкажіть дату початку");
      return;
    }
    const startDate = absenceDraftStart;
    const endDate = absenceMultiDay && absenceDraftEnd ? absenceDraftEnd : startDate;
    if (endDate < startDate) {
      toast.error("Дата завершення не може бути раніше початку");
      return;
    }
    const comment = absenceDraftComment.trim() || null;
    setAbsenceSaving(true);
    try {
      if (absenceEditingId) {
        await updateTeamAbsence({
          workspaceId,
          id: absenceEditingId,
          userId: absenceDraftUserId,
          startDate,
          endDate,
          kind: absenceDraftKind,
          comment,
        });
      } else {
        await createTeamAbsence({
          workspaceId,
          userId: absenceDraftUserId,
          startDate,
          endDate,
          kind: absenceDraftKind,
          comment,
          createdBy: userId ?? null,
        });
      }
      setAbsenceDialogOpen(false);
      setAbsenceEditingId(null);
      await reloadAbsences();
      toast.success(absenceEditingId ? "Зміни збережено" : "Відсутність записано");
    } catch (saveError) {
      console.warn("Failed to save team absence", saveError);
      toast.error("Не вдалося зберегти відсутність");
    } finally {
      setAbsenceSaving(false);
    }
  }, [
    workspaceId,
    absenceSaving,
    absenceDraftUserId,
    absenceDraftStart,
    absenceDraftEnd,
    absenceMultiDay,
    absenceEditingId,
    absenceDraftKind,
    absenceDraftComment,
    userId,
    reloadAbsences,
  ]);

  const removeAbsence = useCallback(
    async (id: string) => {
      if (!workspaceId || absenceDeletingId) return;
      setAbsenceDeletingId(id);
      try {
        await deleteTeamAbsence(workspaceId, id);
        setAbsences((prev) => (prev ? prev.filter((entry) => entry.id !== id) : prev));
        toast.success("Запис видалено");
      } catch (deleteError) {
        console.warn("Failed to delete team absence", deleteError);
        toast.error("Не вдалося видалити запис");
      } finally {
        setAbsenceDeletingId(null);
      }
    },
    [workspaceId, absenceDeletingId]
  );

  const monthLabel = useMemo(
    () => selectedMonth.toLocaleDateString("uk-UA", { month: "long", year: "numeric" }),
    [selectedMonth]
  );

  const monthDays = useMemo(() => {
    const gridStart = getStartOfCalendarGrid(selectedMonth);
    const todayKey = getDateKey(startOfDay(new Date()));
    const monthAbsences = absences ?? [];
    return Array.from({ length: 42 }).map((_, index) => {
      const date = new Date(gridStart);
      date.setDate(gridStart.getDate() + index);
      const key = getDateKey(date);
      const items: CalendarItem[] = [
        ...teamEvents
          .filter((event) => event.dateKey === key)
          .map((event) => ({ id: event.id, label: event.title, toneClass: getEventToneClass(event.type) })),
        ...monthAbsences
          .filter((entry) => entry.startDate <= key && key <= entry.endDate)
          .map((entry) => ({
            id: `absence:${entry.id}`,
            label: memberById.get(entry.userId)?.label ?? "Колишній співробітник",
            toneClass: TEAM_ABSENCE_KIND_BADGE_CLASSES[entry.kind],
          })),
      ];
      return {
        key,
        date,
        inMonth: date.getMonth() === selectedMonth.getMonth(),
        isToday: key === todayKey,
        items,
      };
    });
  }, [selectedMonth, teamEvents, absences, memberById]);

  const agendaDays = useMemo(
    () => monthDays.filter((day) => day.inMonth && day.items.length > 0),
    [monthDays]
  );

  const draftEndEffective = absenceMultiDay && absenceDraftEnd ? absenceDraftEnd : absenceDraftStart;
  const draftRangeValid = Boolean(absenceDraftStart) && draftEndEffective >= absenceDraftStart;
  const draftDurationDays = draftRangeValid ? getAbsenceDurationDays(absenceDraftStart, draftEndEffective) : 0;

  if (loading || showSkeleton) {
    return <AppPageLoader title="Завантаження" subtitle="Готуємо сторінку команди." />;
  }

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-6 pb-20 md:pb-0">
      <Card className="border-border/60 bg-card/80">
        <CardContent className="p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/[0.06] px-3 py-1 text-xs font-medium text-primary">
                <Users className="h-3.5 w-3.5" />
                Команда
              </div>
              <h1 className="mt-3 text-2xl font-semibold tracking-tight text-foreground">
                Хто в роботі, хто відсутній і що попереду
              </h1>
              <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
                Присутність, журнал відсутностей та найближчі події — на одному екрані.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" className="gap-2" onClick={() => setCalendarOpen(true)}>
                <CalendarDays className="h-4 w-4" />
                Календар
              </Button>
              {canManageAbsences ? (
                <Button type="button" className="gap-2" onClick={openCreateAbsenceDialog}>
                  <Plus className="h-4 w-4" />
                  Відсутність
                </Button>
              ) : null}
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-2xl border border-border/70 bg-background/70 px-4 py-3">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Всього</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{enrichedMembers.length}</div>
            </div>
            <div className="tone-success-subtle rounded-2xl border px-4 py-3">
              <div className="tone-text-success text-xs uppercase tracking-wide">Онлайн</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{onlineMembers.length}</div>
            </div>
            <div className="tone-warning-subtle rounded-2xl border px-4 py-3">
              <div className="tone-text-warning text-xs uppercase tracking-wide">Відсутні</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{awayMembers.length}</div>
            </div>
            <div className="rounded-2xl border border-border/70 bg-background/70 px-4 py-3">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Подій попереду</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{teamEvents.length}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_360px]">
        <Card className="order-2 border-border/60 bg-card/80 xl:order-1">
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="h-4 w-4 text-muted-foreground" />
                Люди в команді
                <span className="text-sm font-normal text-muted-foreground">{filteredMembers.length}</span>
              </CardTitle>
              <div className="flex flex-col gap-3 md:flex-row">
                <div className="relative md:min-w-[220px]">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input value={search} onChange={(event) => setSearch(event.target.value)} className="pl-10" placeholder="Пошук по команді..." />
                </div>
                <Select value={roleFilter} onValueChange={setRoleFilter}>
                  <SelectTrigger className="md:min-w-[160px]">
                    <SelectValue placeholder="Усі ролі" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Усі ролі</SelectItem>
                    {roleOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={availabilityFilter} onValueChange={setAvailabilityFilter}>
                  <SelectTrigger className="md:min-w-[160px]">
                    <SelectValue placeholder="Усі статуси" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Усі статуси</SelectItem>
                    <SelectItem value="available">Доступний</SelectItem>
                    <SelectItem value="vacation">Відпустка</SelectItem>
                    <SelectItem value="sick_leave">Лікарняний</SelectItem>
                    <SelectItem value="offline">Поза офісом</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {filteredMembers.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border/60 bg-background/50 px-4 py-10 text-center text-sm text-muted-foreground">
                Немає людей за цими фільтрами.
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
                {filteredMembers.map((member) => (
                  <div
                    key={member.userId}
                    className="rounded-2xl border border-border/60 bg-background/68 p-4 transition-colors hover:border-border"
                  >
                    <div className="flex items-start gap-3">
                      <AvatarBase
                        src={member.avatarDisplayUrl}
                        name={member.label}
                        fallback={getInitialsFromName(member.label, member.email)}
                        assetVariant="md"
                        size={44}
                        availability={member.availabilityStatus}
                        presence={member.online ? "online" : "offline"}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-foreground">{member.label}</div>
                        <div className="mt-0.5 truncate text-xs text-muted-foreground">{member.email || "Email не вказано"}</div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <Badge variant="outline">{formatRoleLabel(member.jobRole)}</Badge>
                          <Badge variant="outline" className={getTeamAvailabilityBadgeClass(member.availabilityStatus)}>
                            {getTeamAvailabilityLabel(member.availabilityStatus)}
                          </Badge>
                          {member.availabilityStatus !== "available" && formatAvailabilityRange(member.availabilityStartDate, member.availabilityEndDate) ? (
                            <Badge variant="outline">
                              {formatAvailabilityRange(member.availabilityStartDate, member.availabilityEndDate)}
                            </Badge>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 space-y-1.5 text-xs text-muted-foreground">
                      <div>{formatPresenceText(member.lastSeenAt, member.online)}</div>
                      <div>Стаж: {formatEmploymentDuration(member.startDate) || "Не вказано"}</div>
                      <div>Працює з: {member.startDate ? formatEmploymentDate(member.startDate) : "Не вказано"}</div>
                      <div>День народження: {member.birthDate ? formatEmploymentDate(member.birthDate) : "Не вказано"}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="order-1 space-y-4 xl:order-2">
          <Card className="border-border/60 bg-card/80">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <CalendarOff className="h-4 w-4 text-muted-foreground" />
                  Відсутності
                  {absences && absences.length > 0 ? (
                    <span className="text-sm font-normal text-muted-foreground">{absences.length}</span>
                  ) : null}
                </CardTitle>
                {canManageAbsences ? (
                  <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5" onClick={openCreateAbsenceDialog}>
                    <Plus className="h-3.5 w-3.5" />
                    Додати
                  </Button>
                ) : null}
              </div>
              <div className="mt-3 flex items-center justify-between gap-2 rounded-xl border border-border/60 bg-background/60 p-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  aria-label="Попередній місяць"
                  onClick={() => setMonthOffset((value) => value - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <div className="text-sm font-semibold capitalize text-foreground">{monthLabel}</div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  aria-label="Наступний місяць"
                  onClick={() => setMonthOffset((value) => value + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {absencesLoading && !absences ? (
                <div className="flex items-center gap-2 rounded-2xl border border-border/60 bg-background/68 px-4 py-4 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Завантажуємо журнал...
                </div>
              ) : !absences || absences.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border/60 bg-background/50 px-4 py-6 text-center text-sm text-muted-foreground">
                  За цей місяць відсутностей не записано.
                </div>
              ) : (
                absences.map((entry) => {
                  const member = memberById.get(entry.userId);
                  const label = member?.label ?? "Колишній співробітник";
                  const durationDays = getAbsenceDurationDays(entry.startDate, entry.endDate);
                  return (
                    <div key={entry.id} className="rounded-2xl border border-border/60 bg-background/68 px-3 py-3">
                      <div className="flex items-start gap-3">
                        <AvatarBase
                          src={member?.avatarDisplayUrl ?? null}
                          name={label}
                          fallback={getInitialsFromName(label, member?.email)}
                          assetVariant="md"
                          size={34}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium text-foreground">{label}</div>
                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                            <Badge variant="outline" className={cn("text-[11px]", TEAM_ABSENCE_KIND_BADGE_CLASSES[entry.kind])}>
                              {TEAM_ABSENCE_KIND_LABELS[entry.kind]}
                            </Badge>
                            <span className="text-xs text-muted-foreground">{formatAbsenceRange(entry.startDate, entry.endDate)}</span>
                            {durationDays > 1 ? (
                              <span className="text-xs text-muted-foreground">· {durationDays} {pluralizeDays(durationDays)}</span>
                            ) : null}
                          </div>
                          {entry.comment ? (
                            <p className="mt-1.5 break-words text-xs text-muted-foreground">{entry.comment}</p>
                          ) : null}
                        </div>
                        {canManageAbsences ? (
                          <div className="flex shrink-0 items-center gap-0.5">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-foreground"
                              aria-label={`Редагувати запис: ${label}`}
                              onClick={() => openEditAbsenceDialog(entry)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
                              aria-label={`Видалити запис: ${label}, ${formatAbsenceRange(entry.startDate, entry.endDate)}`}
                              disabled={absenceDeletingId === entry.id}
                              onClick={() => void removeAbsence(entry.id)}
                            >
                              {absenceDeletingId === entry.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="h-3.5 w-3.5" />
                              )}
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>

          {awayMembers.length > 0 ? (
            <Card className="border-border/60 bg-card/80">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <UserMinus className="h-4 w-4 text-muted-foreground" />
                  Зараз не в роботі
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {awayMembers.slice(0, 6).map((member) => (
                  <div key={`away:${member.userId}`} className="flex items-center gap-3 rounded-2xl border border-border/60 bg-background/68 px-3 py-3">
                    <AvatarBase
                      src={member.avatarDisplayUrl}
                      name={member.label}
                      fallback={getInitialsFromName(member.label, member.email)}
                      assetVariant="md"
                      size={36}
                      availability={member.availabilityStatus}
                      presence={member.online ? "online" : "offline"}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-foreground">{member.label}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <Badge variant="outline" className={cn("text-[11px]", getTeamAvailabilityBadgeClass(member.availabilityStatus))}>
                          {getTeamAvailabilityLabel(member.availabilityStatus)}
                        </Badge>
                        {formatAvailabilityRange(member.availabilityStartDate, member.availabilityEndDate) ? (
                          <span className="text-xs text-muted-foreground">
                            {formatAvailabilityRange(member.availabilityStartDate, member.availabilityEndDate)}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}

          <Card className="border-border/60 bg-card/80">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarDays className="h-4 w-4 text-muted-foreground" />
                Найближчі події
              </CardTitle>
              <div className="mt-1 text-xs text-muted-foreground">Дні народження, річниці та повернення</div>
            </CardHeader>
            <CardContent className="space-y-2">
              {upcomingEvents.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border/60 bg-background/50 px-4 py-6 text-center text-sm text-muted-foreground">
                  Додайте дати народження, старту роботи та періоди відсутності.
                </div>
              ) : (
                upcomingEvents.map((event) => (
                  <div key={event.id} className="rounded-2xl border border-border/60 bg-background/68 px-3 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-foreground">{event.title}</div>
                        <div className="mt-1 text-xs text-muted-foreground">{event.caption}</div>
                      </div>
                      <Badge variant="outline" className={cn("shrink-0", getEventToneClass(event.type))}>
                        {event.daysUntil === 0 ? "Сьогодні" : `Через ${event.daysUntil} дн`}
                      </Badge>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={calendarOpen} onOpenChange={setCalendarOpen}>
        <DialogContent className="max-w-[980px]">
          <DialogHeader className="pr-8">
            <DialogTitle className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              Календар команди
            </DialogTitle>
            <DialogDescription>Відсутності, дні народження, річниці та повернення за місяць.</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-8 w-8"
                aria-label="Попередній місяць"
                onClick={() => setMonthOffset((value) => value - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="min-w-[150px] text-center text-sm font-semibold capitalize text-foreground">{monthLabel}</div>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-8 w-8"
                aria-label="Наступний місяць"
                onClick={() => setMonthOffset((value) => value + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              {CALENDAR_LEGEND.map((legend) => (
                <span key={legend.label} className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span className={cn("h-2.5 w-2.5 rounded-full border", legend.toneClass)} />
                  {legend.label}
                </span>
              ))}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="hidden md:block">
              <div className="grid grid-cols-7 gap-1.5">
                {WEEKDAY_LABELS.map((label) => (
                  <div key={label} className="px-2 py-1 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {label}
                  </div>
                ))}
                {monthDays.map((day) => (
                  <div
                    key={day.key}
                    className={cn(
                      "min-h-[92px] rounded-xl border p-2 transition-colors",
                      day.inMonth ? "border-border/60 bg-background/60" : "border-border/40 bg-background/40 opacity-55",
                      day.isToday ? "ring-1 ring-primary/30" : ""
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div
                        className={cn(
                          "flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium",
                          day.isToday ? "bg-primary text-primary-foreground" : "text-foreground"
                        )}
                      >
                        {day.date.getDate()}
                      </div>
                      {day.items.length > 3 ? (
                        <span className="text-[10px] font-medium text-muted-foreground">+{day.items.length - 3}</span>
                      ) : null}
                    </div>
                    <div className="mt-1.5 space-y-1">
                      {day.items.slice(0, 3).map((item) => (
                        <div
                          key={item.id}
                          className={cn("truncate rounded-md border px-1.5 py-0.5 text-[10px] font-medium leading-4", item.toneClass)}
                          title={item.label}
                        >
                          {item.label}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2 md:hidden">
              {agendaDays.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border/60 bg-background/50 px-4 py-8 text-center text-sm text-muted-foreground">
                  Цього місяця подій немає.
                </div>
              ) : (
                agendaDays.map((day) => (
                  <div
                    key={day.key}
                    className={cn(
                      "flex items-start gap-3 rounded-2xl border bg-background/60 px-3 py-2.5",
                      day.isToday ? "border-primary/40 ring-1 ring-primary/20" : "border-border/60"
                    )}
                  >
                    <div className="w-11 shrink-0 text-center">
                      <div className="text-[11px] uppercase text-muted-foreground">{formatWeekdayShort(day.date)}</div>
                      <div className="text-lg font-semibold leading-tight text-foreground">{day.date.getDate()}</div>
                    </div>
                    <div className="flex min-w-0 flex-1 flex-wrap gap-1.5 pt-0.5">
                      {day.items.map((item) => (
                        <span
                          key={item.id}
                          className={cn("rounded-md border px-2 py-0.5 text-[11px] font-medium", item.toneClass)}
                        >
                          {item.label}
                        </span>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={absenceDialogOpen}
        onOpenChange={(open) => {
          if (absenceSaving) return;
          setAbsenceDialogOpen(open);
          if (!open) setAbsenceEditingId(null);
        }}
      >
        <DialogContent className="max-w-[460px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarOff className="h-4 w-4 text-muted-foreground" />
              {absenceEditingId ? "Редагувати відсутність" : "Записати відсутність"}
            </DialogTitle>
            <DialogDescription>
              Хто, коли і чому був відсутній. Запис побачить уся команда.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="absence-member">Співробітник</Label>
              <Select value={absenceDraftUserId} onValueChange={setAbsenceDraftUserId}>
                <SelectTrigger id="absence-member" className="h-9">
                  <SelectValue placeholder="Оберіть співробітника" />
                </SelectTrigger>
                <SelectContent>
                  {enrichedMembers.map((member) => (
                    <SelectItem key={member.userId} value={member.userId}>
                      <span className="flex min-w-0 items-center gap-2">
                        <AvatarBase
                          src={member.avatarDisplayUrl}
                          name={member.label}
                          fallback={getInitialsFromName(member.label, member.email)}
                          assetVariant="md"
                          size={20}
                          className="shrink-0 border-border/60"
                        />
                        <span className="truncate">{member.label}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="absence-start">Дати відсутності</Label>
                <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                  <Checkbox checked={absenceMultiDay} onCheckedChange={handleMultiDayChange} className="h-4 w-4" />
                  Кілька днів
                </label>
              </div>
              {absenceMultiDay ? (
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label htmlFor="absence-start" className="text-xs font-normal text-muted-foreground">Початок</Label>
                    <Input
                      id="absence-start"
                      type="date"
                      value={absenceDraftStart}
                      max={absenceDraftEnd || undefined}
                      onChange={(event) => setAbsenceDraftStart(event.target.value)}
                      className="h-9"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="absence-end" className="text-xs font-normal text-muted-foreground">Кінець</Label>
                    <Input
                      id="absence-end"
                      type="date"
                      value={absenceDraftEnd}
                      min={absenceDraftStart || undefined}
                      onChange={(event) => setAbsenceDraftEnd(event.target.value)}
                      className="h-9"
                    />
                  </div>
                </div>
              ) : (
                <Input
                  id="absence-start"
                  type="date"
                  value={absenceDraftStart}
                  onChange={(event) => setAbsenceDraftStart(event.target.value)}
                  className="h-9"
                />
              )}
              {draftRangeValid ? (
                <p className="text-xs text-muted-foreground">
                  {draftDurationDays > 1
                    ? `Період: ${formatAbsenceRange(absenceDraftStart, draftEndEffective)} · ${draftDurationDays} ${pluralizeDays(draftDurationDays)}`
                    : `Один день: ${formatAbsenceRange(absenceDraftStart, draftEndEffective)}`}
                </p>
              ) : absenceMultiDay && absenceDraftStart && absenceDraftEnd ? (
                <p className="text-xs text-danger">Дата завершення не може бути раніше початку.</p>
              ) : null}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="absence-kind">Причина</Label>
              <Select value={absenceDraftKind} onValueChange={(value) => setAbsenceDraftKind(value as TeamAbsenceKind)}>
                <SelectTrigger id="absence-kind" className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TEAM_ABSENCE_KIND_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="absence-comment">Коментар</Label>
              <Textarea
                id="absence-comment"
                value={absenceDraftComment}
                onChange={(event) => setAbsenceDraftComment(event.target.value)}
                placeholder="Напр. отруївся; температура, нежить; взяла вихідний"
                className="min-h-[72px] resize-y"
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAbsenceDialogOpen(false)} disabled={absenceSaving}>
              Скасувати
            </Button>
            <Button type="button" className="gap-2" onClick={() => void submitAbsence()} disabled={absenceSaving || !draftRangeValid}>
              {absenceSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {absenceSaving ? "Зберігаємо..." : absenceEditingId ? "Зберегти зміни" : "Зберегти"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default TeamPage;
