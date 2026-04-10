import { useMemo, useState } from "react";
import { CalendarDays, Cake, Search, UserCheck, UserMinus, Users, Wifi } from "lucide-react";

import { useAuth } from "@/auth/AuthProvider";
import { AvatarBase } from "@/components/app/avatar-kit";
import { AppPageLoader } from "@/components/app/AppPageLoader";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useWorkspacePresence } from "@/components/app/workspace-presence-context";
import { usePageData } from "@/hooks/usePageData";
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

function formatRoleLabel(value?: string | null) {
  if (!value) return "Без ролі";
  return ROLE_LABELS[value] ?? value.replaceAll("_", " ");
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0, 0);
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
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

export function TeamPage() {
  const { teamId, userId, loading } = useAuth();
  const workspacePresence = useWorkspacePresence();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [availabilityFilter, setAvailabilityFilter] = useState<string>("all");

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

  const upcomingEvents = useMemo(() => {
    const next: TeamEvent[] = [];
    enrichedMembers.forEach((member) => {
      const birthday = getBirthdayInsight(member.birthDate);
      if (birthday && birthday.daysUntil <= 30) {
        next.push({
          id: `birthday:${member.userId}:${birthday.dateLabel}`,
          type: "birthday",
          userId: member.userId,
          title: member.label,
          caption: birthday.caption,
          daysUntil: birthday.daysUntil,
        });
      }

      const anniversary = getWorkAnniversaryInsight(member.startDate);
      if (anniversary && anniversary.daysUntil <= 30) {
        next.push({
          id: `anniversary:${member.userId}:${anniversary.dateLabel}`,
          type: "anniversary",
          userId: member.userId,
          title: member.label,
          caption: `${anniversary.years} ${anniversary.years === 1 ? "рік" : anniversary.years <= 4 ? "роки" : "років"} в компанії`,
          daysUntil: anniversary.daysUntil,
        });
      }

      if (member.availabilityStatus !== "available" && member.availabilityEndDate) {
        const returnDate = startOfDay(new Date(`${member.availabilityEndDate}T12:00:00`));
        const diffMs = returnDate.getTime() - startOfDay(new Date()).getTime();
        const daysUntil = Math.round(diffMs / (1000 * 60 * 60 * 24));
        if (daysUntil >= 0 && daysUntil <= 30) {
          next.push({
            id: `return:${member.userId}:${member.availabilityEndDate}`,
            type: "return",
            userId: member.userId,
            title: member.label,
            caption: `${getTeamAvailabilityLabel(member.availabilityStatus)} до ${formatEmploymentDate(member.availabilityEndDate)}`,
            daysUntil,
          });
        }
      }
    });

    return next.sort((a, b) => a.daysUntil - b.daysUntil).slice(0, 8);
  }, [enrichedMembers]);

  const weekDays = useMemo(() => {
    const today = startOfDay(new Date());
    return Array.from({ length: 7 }).map((_, index) => {
      const day = new Date(today);
      day.setDate(today.getDate() + index);
      const key = dateKey(day);
      return {
        key,
        label: day.toLocaleDateString("uk-UA", { weekday: "short" }),
        dateLabel: day.toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit" }),
        events: upcomingEvents.filter((event) => {
          if (event.daysUntil !== index) return false;
          return true;
        }),
      };
    });
  }, [upcomingEvents]);

  if (loading || showSkeleton) {
    return <AppPageLoader title="Завантаження" subtitle="Готуємо сторінку команди." />;
  }

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-6 pb-20 md:pb-0">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Card className="border-border/60 bg-card/80">
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm text-muted-foreground">Усього в команді</div>
                <div className="mt-1 text-2xl font-semibold tracking-tight">{enrichedMembers.length}</div>
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-border/60 bg-muted/30">
                <Users className="h-4 w-4 text-muted-foreground" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/60 bg-card/80">
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm text-muted-foreground">Онлайн зараз</div>
                <div className="mt-1 text-2xl font-semibold tracking-tight">{onlineMembers.length}</div>
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-500/20 bg-emerald-500/[0.06]">
                <Wifi className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/60 bg-card/80">
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm text-muted-foreground">Доступні до роботи</div>
                <div className="mt-1 text-2xl font-semibold tracking-tight">
                  {enrichedMembers.filter((member) => member.availabilityStatus === "available").length}
                </div>
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-primary/20 bg-primary/[0.06]">
                <UserCheck className="h-4 w-4 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/60 bg-card/80">
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm text-muted-foreground">Поза роботою</div>
                <div className="mt-1 text-2xl font-semibold tracking-tight">{awayMembers.length}</div>
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-warning-soft-border bg-warning-soft/60">
                <UserMinus className="h-4 w-4 text-warning-foreground" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.25fr_0.95fr]">
        <Card className="border-border/60 bg-card/80">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Статуси команди</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {(["available", "vacation", "sick_leave", "offline"] as TeamAvailabilityStatus[]).map((status) => (
                <Badge key={status} variant="outline" className={getTeamAvailabilityBadgeClass(status)}>
                  {getTeamAvailabilityLabel(status)}: {enrichedMembers.filter((member) => member.availabilityStatus === status).length}
                </Badge>
              ))}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <div className="mb-2 text-sm font-semibold text-foreground">Зараз онлайн</div>
                {onlineMembers.length === 0 ? (
                  <div className="rounded-lg border border-border/60 bg-muted/10 px-3 py-3 text-sm text-muted-foreground">
                    Наразі нікого онлайн.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {onlineMembers.slice(0, 6).map((member) => (
                      <div key={`online:${member.userId}`} className="flex items-center gap-3 rounded-lg border border-border/60 bg-muted/10 px-3 py-2">
                        <AvatarBase
                          src={member.avatarDisplayUrl}
                          name={member.label}
                          fallback={getInitialsFromName(member.label, member.email)}
                          assetVariant="md"
                          size={36}
                          availability={member.availabilityStatus}
                          presence="online"
                        />
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-foreground">{member.label}</div>
                          <div className="truncate text-xs text-muted-foreground">
                            {formatRoleLabel(member.jobRole)} · {getAvailabilityCaption(
                              member.availabilityStatus,
                              member.availabilityStartDate,
                              member.availabilityEndDate
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <div className="mb-2 text-sm font-semibold text-foreground">Хто відсутній</div>
                {awayMembers.length === 0 ? (
                  <div className="rounded-lg border border-border/60 bg-muted/10 px-3 py-3 text-sm text-muted-foreground">
                    Усі доступні.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {awayMembers.slice(0, 6).map((member) => (
                      <div key={`away:${member.userId}`} className="flex items-center gap-3 rounded-lg border border-border/60 bg-muted/10 px-3 py-2">
                        <AvatarBase
                          src={member.avatarDisplayUrl}
                          name={member.label}
                          fallback={getInitialsFromName(member.label, member.email)}
                          assetVariant="md"
                          size={36}
                          availability={member.availabilityStatus}
                          presence={member.online ? "online" : "offline"}
                        />
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-foreground">{member.label}</div>
                          <div className="truncate text-xs text-muted-foreground">
                            {formatRoleLabel(member.jobRole)} · {getAvailabilityCaption(
                              member.availabilityStatus,
                              member.availabilityStartDate,
                              member.availabilityEndDate
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/80">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Найближчі події</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {upcomingEvents.length === 0 ? (
              <div className="rounded-lg border border-border/60 bg-muted/10 px-3 py-3 text-sm text-muted-foreground">
                Додайте дати народження та старту роботи в профілі учасників.
              </div>
            ) : (
              upcomingEvents.map((event) => {
                const member = enrichedMembers.find((item) => item.userId === event.userId);
                if (!member) return null;
                return (
                  <div key={event.id} className="flex items-start gap-3 rounded-lg border border-border/60 bg-muted/10 px-3 py-3">
                    <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-background">
                      {event.type === "birthday" ? (
                        <Cake className="h-4 w-4 text-warning-foreground" />
                      ) : event.type === "return" ? (
                        <UserCheck className="h-4 w-4 text-primary" />
                      ) : (
                        <CalendarDays className="h-4 w-4 text-primary" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-foreground">{event.title}</div>
                      <div className="mt-0.5 text-xs text-muted-foreground">{event.caption}</div>
                    </div>
                    <Badge variant="outline" className="shrink-0">
                      {event.daysUntil === 0 ? "Сьогодні" : `Через ${event.daysUntil} дн`}
                    </Badge>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/60 bg-card/80">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Календар команди на 7 днів</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
            {weekDays.map((day) => (
              <div key={day.key} className="rounded-xl border border-border/60 bg-muted/10 p-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{day.label}</div>
                <div className="mt-1 text-sm font-medium text-foreground">{day.dateLabel}</div>
                <div className="mt-3 space-y-2">
                  {day.events.length === 0 ? (
                    <div className="text-xs text-muted-foreground">Без подій</div>
                  ) : (
                    day.events.map((event) => (
                      <div key={event.id} className="rounded-lg border border-border/60 bg-background px-2.5 py-2 text-xs">
                        <div className="font-medium text-foreground">{event.title}</div>
                        <div className="mt-0.5 text-muted-foreground">{event.caption}</div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

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
            <div className="rounded-lg border border-border/60 bg-muted/10 px-4 py-6 text-sm text-muted-foreground">
              Немає людей за цими фільтрами.
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {filteredMembers.map((member) => (
                <div key={member.userId} className="rounded-xl border border-border/60 bg-muted/10 p-4">
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
                    <div>
                      День народження: {member.birthDate ? formatEmploymentDate(member.birthDate) : "Не вказано"}
                    </div>
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
