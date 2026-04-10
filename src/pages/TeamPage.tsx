import { useMemo, useState } from "react";
import {
  BriefcaseBusiness,
  CalendarDays,
  Cake,
  ChevronLeft,
  ChevronRight,
  Search,
  ShieldAlert,
  UserCheck,
  UserMinus,
  Users,
  Wifi,
} from "lucide-react";

import { useAuth } from "@/auth/AuthProvider";
import { AvatarBase } from "@/components/app/avatar-kit";
import { AppPageLoader } from "@/components/app/AppPageLoader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  type TeamAvailabilityStatus,
} from "@/lib/teamAvailability";
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

function getAvailabilityCaption(
  availabilityStatus: TeamAvailabilityStatus,
  startDate?: string | null,
  endDate?: string | null
) {
  const range = formatAvailabilityRange(startDate, endDate);
  if (!range) return getTeamAvailabilityLabel(availabilityStatus);
  return `${getTeamAvailabilityLabel(availabilityStatus)} · ${range}`;
}

function getEventToneClass(type: TeamEvent["type"]) {
  if (type === "birthday") return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  if (type === "return") return "border-primary/25 bg-primary/[0.08] text-primary";
  return "border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300";
}

export function TeamPage() {
  const { teamId, userId, loading } = useAuth();
  const workspacePresence = useWorkspacePresence();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [availabilityFilter, setAvailabilityFilter] = useState<string>("all");
  const [monthOffset, setMonthOffset] = useState(0);

  const { data, showSkeleton } = usePageData({
    cacheKey: `team-page:${teamId ?? "none"}:${userId ?? "none"}`,
    loadFn: async () => {
      if (!userId) return [];
      const workspaceId = await resolveWorkspaceId(userId);
      if (!workspaceId) return [];
      return listWorkspaceMembersForDisplay(workspaceId);
    },
    cacheTTL: 10 * 60 * 1000,
    showSkeletonOnStale: false,
    backgroundRefetch: true,
  });

  const members = data ?? [];
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
  const monthLabel = useMemo(
    () => selectedMonth.toLocaleDateString("uk-UA", { month: "long", year: "numeric" }),
    [selectedMonth]
  );

  const monthDays = useMemo(() => {
    const gridStart = getStartOfCalendarGrid(selectedMonth);
    return Array.from({ length: 42 }).map((_, index) => {
      const date = new Date(gridStart);
      date.setDate(gridStart.getDate() + index);
      const key = getDateKey(date);
      return {
        key,
        date,
        inMonth: date.getMonth() === selectedMonth.getMonth(),
        isToday: key === getDateKey(startOfDay(new Date())),
        events: teamEvents.filter((event) => event.dateKey === key),
      };
    });
  }, [selectedMonth, teamEvents]);

  const monthHighlights = useMemo(() => {
    const selectedMonthIndex = selectedMonth.getMonth();
    const selectedYear = selectedMonth.getFullYear();
    return teamEvents.filter((event) => {
      const eventDate = new Date(`${event.dateKey}T12:00:00`);
      return eventDate.getMonth() === selectedMonthIndex && eventDate.getFullYear() === selectedYear;
    });
  }, [selectedMonth, teamEvents]);

  if (loading || showSkeleton) {
    return <AppPageLoader title="Завантаження" subtitle="Готуємо сторінку команди." />;
  }

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-6 pb-20 md:pb-0">
      <Card className="overflow-hidden border-border/60 bg-card/80">
        <CardContent className="p-0">
          <div className="grid gap-0 xl:grid-cols-[minmax(0,1.3fr)_360px]">
            <div className="border-b border-border/60 p-6 xl:border-b-0 xl:border-r xl:border-r-border/60">
              <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="max-w-2xl">
                    <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/[0.06] px-3 py-1 text-xs font-medium text-primary">
                      <Users className="h-3.5 w-3.5" />
                      Командний дашборд
                    </div>
                    <div className="mt-3 text-2xl font-semibold tracking-tight text-foreground">
                      Хто в роботі, хто відсутній і що наближається по команді
                    </div>
                    <div className="mt-2 text-sm leading-6 text-muted-foreground">
                      Тут тільки те, що треба бачити всім: присутність, відсутності, найближчі події й календар на місяць.
                    </div>
                  </div>
                  <div className="grid min-w-[220px] gap-2 sm:grid-cols-3 lg:grid-cols-1">
                    <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] px-4 py-3">
                      <div className="text-xs uppercase tracking-wide text-emerald-700/80 dark:text-emerald-300/80">Онлайн</div>
                      <div className="mt-1 text-2xl font-semibold text-foreground">{onlineMembers.length}</div>
                    </div>
                    <div className="rounded-2xl border border-warning-soft-border bg-warning-soft/60 px-4 py-3">
                      <div className="text-xs uppercase tracking-wide text-warning-foreground/80">Відсутні</div>
                      <div className="mt-1 text-2xl font-semibold text-foreground">{awayMembers.length}</div>
                    </div>
                    <div className="rounded-2xl border border-border/70 bg-muted/[0.05] px-4 py-3">
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">Події 30 днів</div>
                      <div className="mt-1 text-2xl font-semibold text-foreground">{upcomingEvents.length}</div>
                    </div>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-2xl border border-border/70 bg-muted/[0.04] px-4 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm text-muted-foreground">Усього в команді</div>
                        <div className="mt-1 text-2xl font-semibold tracking-tight">{enrichedMembers.length}</div>
                      </div>
                      <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-border/60 bg-background">
                        <Users className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-border/70 bg-muted/[0.04] px-4 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm text-muted-foreground">Доступні до роботи</div>
                        <div className="mt-1 text-2xl font-semibold tracking-tight">
                          {enrichedMembers.filter((member) => member.availabilityStatus === "available").length}
                        </div>
                      </div>
                      <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-primary/20 bg-primary/[0.06]">
                        <UserCheck className="h-4 w-4 text-primary" />
                      </div>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-border/70 bg-muted/[0.04] px-4 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm text-muted-foreground">Повернення скоро</div>
                        <div className="mt-1 text-2xl font-semibold tracking-tight">
                          {teamEvents.filter((event) => event.type === "return").length}
                        </div>
                      </div>
                      <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-border/60 bg-background">
                        <BriefcaseBusiness className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-muted/[0.03] p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-foreground">Найближчі події</div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    Дні народження, річниці та повернення в роботу
                  </div>
                </div>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-background text-foreground/70">
                  <CalendarDays className="h-4 w-4" />
                </div>
              </div>

              <div className="mt-5 space-y-2">
                {upcomingEvents.length === 0 ? (
                  <div className="rounded-2xl border border-border/70 bg-background/70 px-4 py-4 text-sm text-muted-foreground">
                    Додайте дати народження, старту роботи та періоди відсутності.
                  </div>
                ) : (
                  upcomingEvents.map((event) => (
                    <div key={event.id} className="rounded-2xl border border-border/70 bg-background/80 px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-foreground">{event.title}</div>
                          <div className="mt-1 text-xs text-muted-foreground">{event.caption}</div>
                        </div>
                        <Badge variant="outline" className={cn("shrink-0", getEventToneClass(event.type))}>
                          {event.daysUntil === 0 ? "Сьогодні" : `Через ${event.daysUntil} дн`}
                        </Badge>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_360px]">
        <Card className="border-border/60 bg-card/80">
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <CardTitle className="text-base">Календар команди на місяць</CardTitle>
                <div className="mt-1 text-sm text-muted-foreground">
                  Один екран, щоб побачити відсутності, повернення і важливі дати команди.
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="icon" className="h-9 w-9" onClick={() => setMonthOffset((value) => value - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <div className="min-w-[170px] text-center text-sm font-semibold capitalize text-foreground">{monthLabel}</div>
                <Button type="button" variant="outline" size="icon" className="h-9 w-9" onClick={() => setMonthOffset((value) => value + 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 gap-2">
              {WEEKDAY_LABELS.map((label) => (
                <div key={label} className="px-2 py-1 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {label}
                </div>
              ))}
              {monthDays.map((day) => (
                <div
                  key={day.key}
                  className={cn(
                    "min-h-[118px] rounded-2xl border p-3 transition-colors",
                    day.inMonth ? "border-border/60 bg-muted/[0.03]" : "border-border/40 bg-muted/[0.02] opacity-60",
                    day.isToday ? "ring-1 ring-primary/25" : ""
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div
                      className={cn(
                        "flex h-7 w-7 items-center justify-center rounded-full text-sm font-medium",
                        day.isToday ? "bg-primary text-primary-foreground" : "text-foreground"
                      )}
                    >
                      {day.date.getDate()}
                    </div>
                    {day.events.length > 0 ? (
                      <div className="rounded-full bg-foreground/[0.06] px-2 py-0.5 text-[11px] font-medium text-foreground/70">
                        {day.events.length}
                      </div>
                    ) : null}
                  </div>
                  <div className="mt-3 space-y-1.5">
                    {day.events.length === 0 ? (
                      <div className="text-[11px] text-muted-foreground">Без подій</div>
                    ) : (
                      day.events.slice(0, 3).map((event) => (
                        <div key={event.id} className={cn("rounded-xl border px-2.5 py-2 text-[11px] leading-4", getEventToneClass(event.type))}>
                          <div className="truncate font-semibold">{event.title}</div>
                          <div className="mt-0.5 line-clamp-2 opacity-90">{event.caption}</div>
                        </div>
                      ))
                    )}
                    {day.events.length > 3 ? (
                      <div className="text-[11px] font-medium text-muted-foreground">Ще {day.events.length - 3} події</div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="border-border/60 bg-card/80">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Кого видно зараз</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {onlineMembers.length === 0 ? (
                <div className="rounded-2xl border border-border/60 bg-muted/[0.04] px-4 py-4 text-sm text-muted-foreground">
                  Наразі нікого онлайн.
                </div>
              ) : (
                onlineMembers.slice(0, 6).map((member) => (
                  <div key={`online:${member.userId}`} className="flex items-center gap-3 rounded-2xl border border-border/60 bg-muted/[0.04] px-3 py-3">
                    <AvatarBase
                      src={member.avatarDisplayUrl}
                      name={member.label}
                      fallback={getInitialsFromName(member.label, member.email)}
                      assetVariant="md"
                      size={38}
                      availability={member.availabilityStatus}
                      presence="online"
                    />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-foreground">{member.label}</div>
                      <div className="truncate text-xs text-muted-foreground">{formatRoleLabel(member.jobRole)}</div>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card/80">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Хто відсутній</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {awayMembers.length === 0 ? (
                <div className="rounded-2xl border border-border/60 bg-muted/[0.04] px-4 py-4 text-sm text-muted-foreground">
                  Зараз усі доступні до роботи.
                </div>
              ) : (
                awayMembers.slice(0, 6).map((member) => (
                  <div key={`away:${member.userId}`} className="rounded-2xl border border-border/60 bg-muted/[0.04] px-3 py-3">
                    <div className="flex items-center gap-3">
                      <AvatarBase
                        src={member.avatarDisplayUrl}
                        name={member.label}
                        fallback={getInitialsFromName(member.label, member.email)}
                        assetVariant="md"
                        size={38}
                        availability={member.availabilityStatus}
                        presence={member.online ? "online" : "offline"}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-foreground">{member.label}</div>
                        <div className="truncate text-xs text-muted-foreground">{formatRoleLabel(member.jobRole)}</div>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Badge variant="outline" className={getTeamAvailabilityBadgeClass(member.availabilityStatus)}>
                        {getTeamAvailabilityLabel(member.availabilityStatus)}
                      </Badge>
                      {formatAvailabilityRange(member.availabilityStartDate, member.availabilityEndDate) ? (
                        <Badge variant="outline">{formatAvailabilityRange(member.availabilityStartDate, member.availabilityEndDate)}</Badge>
                      ) : null}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card/80">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Події цього місяця</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {monthHighlights.length === 0 ? (
                <div className="rounded-2xl border border-border/60 bg-muted/[0.04] px-4 py-4 text-sm text-muted-foreground">
                  На цей місяць подій не знайдено.
                </div>
              ) : (
                monthHighlights.slice(0, 6).map((event) => (
                  <div key={`month:${event.id}`} className="rounded-2xl border border-border/60 bg-muted/[0.04] px-3 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-foreground">{event.title}</div>
                        <div className="mt-1 text-xs text-muted-foreground">{event.caption}</div>
                      </div>
                      <Badge variant="outline" className={cn("shrink-0", getEventToneClass(event.type))}>
                        {formatEmploymentDate(event.dateKey)}
                      </Badge>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className="border-border/60 bg-card/80">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <CardTitle className="text-base">Люди в команді</CardTitle>
            <div className="flex flex-col gap-3 md:flex-row">
              <div className="relative min-w-[240px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={search} onChange={(event) => setSearch(event.target.value)} className="pl-10" placeholder="Пошук по команді..." />
              </div>
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger className="min-w-[180px]">
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
                <SelectTrigger className="min-w-[180px]">
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
            <div className="rounded-2xl border border-border/60 bg-muted/[0.04] px-4 py-6 text-sm text-muted-foreground">
              Немає людей за цими фільтрами.
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {filteredMembers.map((member) => (
                <div key={member.userId} className="rounded-2xl border border-border/60 bg-muted/[0.04] p-4">
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
    </div>
  );
}

export default TeamPage;
