import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Award,
  Cake,
  CalendarDays,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  Loader2,
  Pencil,
  Plus,
  Settings2,
  Trash2,
  Undo2,
  UserCheck,
  Users,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/auth/AuthProvider";
import { formatJobRole } from "@/lib/jobRoles";
import { AvatarBase } from "@/components/app/avatar-kit";
import { AppPageLoader } from "@/components/app/AppPageLoader";
import { UnifiedPageToolbar } from "@/components/app/headers/UnifiedPageToolbar";
import { CountBadge, ToolbarMeta, ToolbarSearch } from "@/components/app/headers/toolbarPrimitives";
import { usePageHeaderActions } from "@/components/app/page-header-actions";
import {
  SEGMENTED_GROUP,
  SEGMENTED_TRIGGER,
  TOOLBAR_ACTION_BUTTON,
  TOOLBAR_CONTROL,
} from "@/components/ui/controlStyles";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyStateCard } from "@/components/ui/empty-state-card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useWorkspacePresence } from "@/components/app/workspace-presence-context";
import { usePageData } from "@/hooks/usePageData";
import { cn } from "@/lib/utils";
import {
  formatEmploymentDuration,
  formatEmploymentDate,
  getBirthdayInsight,
  getEmploymentDurationDays,
  getWorkAnniversaryInsight,
  isInactiveEmployment,
  type BirthdayInsight,
  type WorkAnniversaryInsight,
} from "@/lib/employment";
import {
  cancelOwnAbsenceRequest,
  createOwnAbsenceRequest,
  createTeamAbsence,
  decideAbsenceRequest,
  deleteTeamAbsence,
  listTeamAbsencesInRange,
  loadAbsenceDecisionComments,
  updateTeamAbsence,
  TEAM_ABSENCE_KIND_LABELS,
  TEAM_ABSENCE_KIND_TONE,
  TEAM_ABSENCE_STATUS_LABELS,
  TEAM_ABSENCE_STATUS_TONE,
  type TeamAbsence,
  type TeamAbsenceKind,
} from "@/lib/teamAbsences";
import { countBusinessDaysInYear, eachDateKey } from "@/lib/teamAbsenceCalendar";
import {
  fallbackBalance,
  loadAbsenceBalances,
  loadWorkdayExceptions,
  type AbsenceBalance,
} from "@/lib/teamAbsenceQuotas";
import { toneBadgeClass, toneTextClass, type Tone } from "@/lib/statusTones";
import { getInitialsFromName } from "@/lib/userName";
import {
  invalidateWorkspaceMemberDirectory,
  listWorkspaceMembersForDisplay,
  type WorkspaceMemberDisplayRow,
} from "@/lib/workspaceMemberDirectory";
import { resolveWorkspaceId } from "@/lib/workspace";
import {
  notifyAbsenceRecorded,
  notifyAbsenceRequestCancelled,
  notifyAbsenceRequestSubmitted,
} from "@/lib/workflowNotifications";
import { AbsenceBalanceMeters } from "@/components/team/AbsenceBalanceMeters";
import { AbsenceDeclineDialog } from "@/components/team/AbsenceDeclineDialog";
import {
  AbsenceDialog,
  type AbsenceDialogValue,
  type AbsenceOverlap,
} from "@/components/team/AbsenceDialog";
import { AbsencePlanner, type PlannerMark, type PlannerPerson } from "@/components/team/AbsencePlanner";
import { AbsenceYearReportDialog } from "@/components/team/AbsenceYearReportDialog";
import { QuotaEditorDialog } from "@/components/team/QuotaEditorDialog";
import { TeamMemberCard, type TeamMemberCardPerson } from "@/components/team/TeamMemberCard";

/**
 * Сторінка «Команда».
 *
 * Три вкладки: Люди · Календар · Запити. Один дизайн для всіх, але глибина
 * різна за роллю — свій баланс бачить кожен, чужі залишки й редактор квот
 * лише owner/SEO (рішення CEO 2026-08-01, docs/TEAM_ABSENCES_DESIGN.md).
 *
 * ДЖЕРЕЛО ПРАВДИ ПРО ВІДСУТНІСТЬ — журнал `tosho.team_absences`. Раніше
 * сторінка одночасно читала журнал і поле `availability_status` у профілі,
 * і ці два джерела розходились: KPI зверху рахував одне, список нижче
 * показував інше. Тепер «хто відсутній» виводиться лише з журналу.
 *
 * Дані тягнемо РІК одним запитом і ріжемо на клієнті: команда невелика,
 * а місячна навігація стає миттєвою й без мережі.
 */

type TeamTab = "people" | "calendar" | "requests";
type PeopleFilter = "all" | "present" | "away";
type SortMode = "presence" | "name" | "tenure" | "birthday";

type EnrichedMember = WorkspaceMemberDisplayRow & {
  online: boolean;
  lastSeenAt: string | null;
  inactive: boolean;
  birthdayInsight: BirthdayInsight | null;
  anniversaryInsight: WorkAnniversaryInsight | null;
  tenureDays: number | null;
};

const EVENT_TONE = {
  birthday: "warning",
  anniversary: "accent",
  return: "success",
} satisfies Record<string, Tone>;

const EVENT_ICONS: Record<keyof typeof EVENT_TONE, LucideIcon> = {
  birthday: Cake,
  anniversary: Award,
  return: Undo2,
};

/* ------------------------------------------------------------------ */
/* Дати                                                                */
/* ------------------------------------------------------------------ */

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDaysKey(dateKey: string, delta: number) {
  const date = new Date(`${dateKey}T12:00:00`);
  date.setDate(date.getDate() + delta);
  return toDateKey(date);
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1, 12, 0, 0, 0);
}

function addMonths(date: Date, delta: number) {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1, 12, 0, 0, 0);
}

function monthDayKeys(monthStart: Date) {
  const year = monthStart.getFullYear();
  const month = monthStart.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const from = toDateKey(new Date(year, month, 1, 12));
  const to = toDateKey(new Date(year, month, daysInMonth, 12));
  return eachDateKey(from, to);
}

function formatMonthLabel(date: Date) {
  const label = date.toLocaleDateString("uk-UA", { month: "long", year: "numeric" });
  return `${label.charAt(0).toUpperCase()}${label.slice(1)}`;
}

function formatShort(dateKey: string) {
  return `${dateKey.slice(8, 10)}.${dateKey.slice(5, 7)}`;
}

function formatRange(absence: TeamAbsence) {
  return absence.startDate === absence.endDate
    ? formatShort(absence.startDate)
    : `${formatShort(absence.startDate)} – ${formatShort(absence.endDate)}`;
}

function pluralDays(count: number) {
  const mod100 = count % 100;
  const mod10 = count % 10;
  if (mod100 >= 11 && mod100 <= 14) return "днів";
  if (mod10 === 1) return "день";
  if (mod10 >= 2 && mod10 <= 4) return "дні";
  return "днів";
}

function formatRoleLabel(value?: string | null) {
  return formatJobRole(value) || "Без ролі";
}

function formatPresenceText(lastSeenAt?: string | null, online?: boolean) {
  if (online) return "Зараз онлайн";
  if (!lastSeenAt) return "Давно не заходив";
  const date = new Date(lastSeenAt);
  if (Number.isNaN(date.getTime())) return "Не в мережі";
  const diffMinutes = Math.max(1, Math.round((Date.now() - date.getTime()) / 60000));
  if (diffMinutes < 60) return `${diffMinutes} хв тому`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} год тому`;
  return `${Math.round(diffHours / 24)} дн тому`;
}

/* ------------------------------------------------------------------ */
/* Сторінка                                                            */
/* ------------------------------------------------------------------ */

export function TeamPage() {
  const { userId, loading, permissions } = useAuth();
  const workspacePresence = useWorkspacePresence();

  /** Вносити відсутності за інших і бачити чужі залишки може owner/SEO. */
  const canManageAbsences = permissions.isSuperAdmin || permissions.isSeo;

  const [tab, setTab] = useState<TeamTab>("people");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [peopleFilter, setPeopleFilter] = useState<PeopleFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("presence");
  const [monthOffset, setMonthOffset] = useState(0);

  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [absences, setAbsences] = useState<TeamAbsence[] | null>(null);
  const [absencesLoading, setAbsencesLoading] = useState(false);
  const [balances, setBalances] = useState<Map<string, AbsenceBalance>>(new Map());
  const [exceptions, setExceptions] = useState<Map<string, boolean>>(new Map());

  const [absenceDialogOpen, setAbsenceDialogOpen] = useState(false);
  const [absenceDialogInitial, setAbsenceDialogInitial] = useState<AbsenceDialogValue | null>(null);
  const [absenceEditingId, setAbsenceEditingId] = useState<string | null>(null);
  const [absenceSaving, setAbsenceSaving] = useState(false);
  const [absenceDeletingId, setAbsenceDeletingId] = useState<string | null>(null);
  const [quotaDialogOpen, setQuotaDialogOpen] = useState(false);
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [decisionComments, setDecisionComments] = useState<Map<string, string>>(new Map());
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const [declineTarget, setDeclineTarget] = useState<TeamAbsence | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  /** Режим діалогу: заявка за себе чи адмінське внесення факту. */
  const [absenceDialogMode, setAbsenceDialogMode] = useState<"manage" | "request">("manage");

  const todayKey = useMemo(() => toDateKey(new Date()), []);
  const selectedMonth = useMemo(() => addMonths(startOfMonth(new Date()), monthOffset), [monthOffset]);
  const year = selectedMonth.getFullYear();

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

  /**
   * Рік відсутностей + виняткові дні + баланси — одним заходом на зміну року.
   * Місячна навігація після цього не ходить у мережу взагалі.
   */
  const reloadAbsenceData = useCallback(async () => {
    if (!workspaceId) return;
    setAbsencesLoading(true);
    try {
      const from = `${year}-01-01`;
      const to = `${year + 1}-01-01`;
      const [rows, exceptionMap] = await Promise.all([
        listTeamAbsencesInRange({
          workspaceId,
          from,
          to,
          statuses: ["approved", "pending", "declined", "cancelled"],
        }),
        loadWorkdayExceptions({ workspaceId, from, to }),
      ]);
      setAbsences(rows);
      setExceptions(exceptionMap);
      const [balanceMap, comments] = await Promise.all([
        loadAbsenceBalances({ year, pendingAbsences: rows, exceptions: exceptionMap }),
        // Причини рішень лежать за окремим RPC: колонку знято з табличного
        // select, бо журнал читає вся команда.
        loadAbsenceDecisionComments(year).catch(() => new Map<string, string>()),
      ]);
      setBalances(balanceMap);
      setDecisionComments(comments);
      // Бейджі доступності на інших сторінках виводяться з цього ж журналу, а
      // директорія кешується в модулі — без скидання вони лишились би старими
      // до кінця життя вкладки.
      invalidateWorkspaceMemberDirectory(workspaceId);
    } catch (error) {
      console.error("[team] absences load failed", error);
      toast.error("Не вдалося завантажити відсутності");
      setAbsences([]);
    } finally {
      setAbsencesLoading(false);
    }
  }, [workspaceId, year]);

  useEffect(() => {
    void reloadAbsenceData();
  }, [reloadAbsenceData]);

  /* --------------------------- Похідні дані --------------------------- */

  const presenceByUserId = useMemo(
    () => new Map(workspacePresence.entries.map((entry) => [entry.userId, entry])),
    [workspacePresence.entries]
  );

  const enrichedMembers = useMemo<EnrichedMember[]>(
    () =>
      members.map((member) => {
        const presence = presenceByUserId.get(member.userId);
        const inactive = isInactiveEmployment(member.employmentStatus);
        return {
          ...member,
          online: Boolean(presence?.online) && !inactive,
          lastSeenAt: presence?.lastSeenAt ?? null,
          inactive,
          birthdayInsight: getBirthdayInsight(member.birthDate),
          anniversaryInsight: getWorkAnniversaryInsight(member.startDate),
          tenureDays: getEmploymentDurationDays(member.startDate),
        };
      }),
    [members, presenceByUserId]
  );

  const memberById = useMemo(
    () => new Map(enrichedMembers.map((member) => [member.userId, member])),
    [enrichedMembers]
  );

  const activeMembers = useMemo(() => enrichedMembers.filter((member) => !member.inactive), [enrichedMembers]);

  const liveAbsences = useMemo(
    () => (absences ?? []).filter((absence) => absence.status === "approved" || absence.status === "pending"),
    [absences]
  );

  /** Хто відсутній сьогодні — з журналу, а не з поля профілю. */
  const absenceTodayByUser = useMemo(() => {
    const map = new Map<string, TeamAbsence>();
    (absences ?? []).forEach((absence) => {
      if (absence.status !== "approved") return;
      if (absence.startDate > todayKey || absence.endDate < todayKey) return;
      map.set(absence.userId, absence);
    });
    return map;
  }, [absences, todayKey]);

  /** Найближчий запит на погодженні по людині. */
  const pendingByUser = useMemo(() => {
    const map = new Map<string, TeamAbsence>();
    (absences ?? []).forEach((absence) => {
      if (absence.status !== "pending") return;
      const current = map.get(absence.userId);
      if (!current || absence.startDate < current.startDate) map.set(absence.userId, absence);
    });
    return map;
  }, [absences]);

  const pendingRequests = useMemo(
    () =>
      (absences ?? [])
        .filter((absence) => absence.status === "pending")
        .sort((a, b) => a.startDate.localeCompare(b.startDate)),
    [absences]
  );

  const myAbsences = useMemo(
    () =>
      (absences ?? [])
        .filter((absence) => absence.userId === userId)
        .sort((a, b) => b.startDate.localeCompare(a.startDate)),
    [absences, userId]
  );

  const myBalance = useMemo(
    () => (userId ? (balances.get(userId) ?? fallbackBalance(userId)) : null),
    [balances, userId]
  );

  const awayToday = useMemo(
    () =>
      activeMembers
        .filter((member) => absenceTodayByUser.has(member.userId))
        .map((member) => ({ member, absence: absenceTodayByUser.get(member.userId)! })),
    [activeMembers, absenceTodayByUser]
  );

  const roleOptions = useMemo(
    () =>
      Array.from(new Set(enrichedMembers.map((member) => member.jobRole).filter(Boolean) as string[]))
        .sort((a, b) => formatRoleLabel(a).localeCompare(formatRoleLabel(b), "uk"))
        .map((role) => ({ value: role, label: formatRoleLabel(role) })),
    [enrichedMembers]
  );

  const filteredMembers = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    const presenceRank = (member: EnrichedMember) =>
      absenceTodayByUser.has(member.userId) ? 2 : member.online ? 0 : 1;

    const list = enrichedMembers.filter((member) => {
      if (roleFilter !== "all" && (member.jobRole ?? "") !== roleFilter) return false;
      if (peopleFilter === "away" && !absenceTodayByUser.has(member.userId)) return false;
      if (peopleFilter === "present" && (member.inactive || absenceTodayByUser.has(member.userId))) return false;
      if (!normalizedSearch) return true;
      const haystack = [member.label, member.email ?? "", formatRoleLabel(member.jobRole)].join(" ").toLowerCase();
      return haystack.includes(normalizedSearch);
    });

    return list.sort((a, b) => {
      if (a.inactive !== b.inactive) return a.inactive ? 1 : -1;
      if (sortMode === "name") return a.label.localeCompare(b.label, "uk");
      if (sortMode === "tenure") {
        const at = a.tenureDays ?? -1;
        const bt = b.tenureDays ?? -1;
        if (bt !== at) return bt - at;
        return a.label.localeCompare(b.label, "uk");
      }
      if (sortMode === "birthday") {
        const ad = a.birthdayInsight?.daysUntil ?? Number.POSITIVE_INFINITY;
        const bd = b.birthdayInsight?.daysUntil ?? Number.POSITIVE_INFINITY;
        if (ad !== bd) return ad - bd;
        return a.label.localeCompare(b.label, "uk");
      }
      const ar = presenceRank(a);
      const br = presenceRank(b);
      if (ar !== br) return ar - br;
      return a.label.localeCompare(b.label, "uk");
    });
  }, [absenceTodayByUser, enrichedMembers, peopleFilter, roleFilter, search, sortMode]);

  /* ------------------------------ Планер ------------------------------ */

  const monthDays = useMemo(() => monthDayKeys(selectedMonth), [selectedMonth]);
  const stripDays = useMemo(() => eachDateKey(todayKey, addDaysKey(todayKey, 13)), [todayKey]);

  const toPlannerPerson = useCallback(
    (member: EnrichedMember): PlannerPerson => ({
      userId: member.userId,
      name: member.label,
      roleLabel: formatRoleLabel(member.jobRole),
      avatarUrl: member.avatarDisplayUrl,
      initials: getInitialsFromName(member.label, member.email),
      online: member.online,
      inactive: member.inactive,
    }),
    []
  );

  const plannerPeople = useMemo(() => activeMembers.map(toPlannerPerson), [activeMembers, toPlannerPerson]);

  const quotaPeopleMemo = useMemo(
    () =>
      activeMembers.map((member) => ({
        userId: member.userId,
        name: member.label,
        roleLabel: formatRoleLabel(member.jobRole),
        avatarUrl: member.avatarDisplayUrl,
        initials: getInitialsFromName(member.label, member.email),
      })),
    [activeMembers]
  );

  /** У стрічку на два тижні беремо лише тих, кого в цьому вікні не буде. */
  const stripPeople = useMemo(() => {
    const from = stripDays[0];
    const to = stripDays[stripDays.length - 1];
    const userIds = new Set(
      liveAbsences
        .filter((absence) => absence.startDate <= to && absence.endDate >= from)
        .map((absence) => absence.userId)
    );
    return plannerPeople.filter((person) => userIds.has(person.userId));
  }, [liveAbsences, plannerPeople, stripDays]);

  const plannerMarks = useMemo<PlannerMark[]>(() => {
    const marks: PlannerMark[] = [];
    activeMembers.forEach((member) => {
      const birthday = member.birthdayInsight;
      if (birthday) {
        const key = addDaysKey(todayKey, birthday.daysUntil);
        marks.push({
          id: `birthday:${member.userId}:${key}`,
          userId: member.userId,
          dateKey: key,
          kind: "birthday",
          title: `${member.label} — день народження`,
        });
      }
      const anniversary = member.anniversaryInsight;
      if (anniversary) {
        const key = addDaysKey(todayKey, anniversary.daysUntil);
        marks.push({
          id: `anniversary:${member.userId}:${key}`,
          userId: member.userId,
          dateKey: key,
          kind: "anniversary",
          title: `${member.label} — ${anniversary.label}`,
        });
      }
    });
    return marks;
  }, [activeMembers, todayKey]);

  const upcomingEvents = useMemo(() => {
    const events: Array<{
      id: string;
      type: keyof typeof EVENT_TONE;
      title: string;
      caption: string;
      daysUntil: number;
    }> = [];

    activeMembers.forEach((member) => {
      const birthday = member.birthdayInsight;
      if (birthday && birthday.daysUntil <= 45) {
        events.push({
          id: `b:${member.userId}`,
          type: "birthday",
          title: member.label,
          caption: `день народження · ${birthday.dateLabel}`,
          daysUntil: birthday.daysUntil,
        });
      }
      const anniversary = member.anniversaryInsight;
      if (anniversary && anniversary.daysUntil <= 45) {
        events.push({
          id: `a:${member.userId}`,
          type: "anniversary",
          title: member.label,
          caption: `${anniversary.label} · ${anniversary.dateLabel}`,
          daysUntil: anniversary.daysUntil,
        });
      }
      const absence = absenceTodayByUser.get(member.userId);
      if (absence) {
        const back = addDaysKey(absence.endDate, 1);
        const daysUntil = eachDateKey(todayKey, back).length - 1;
        if (daysUntil >= 0 && daysUntil <= 45) {
          events.push({
            id: `r:${member.userId}`,
            type: "return",
            title: member.label,
            caption: `повертається · ${formatShort(back)}`,
            daysUntil,
          });
        }
      }
    });

    return events.sort((a, b) => a.daysUntil - b.daysUntil).slice(0, 8);
  }, [activeMembers, absenceTodayByUser, todayKey]);

  /* ------------------------------ Дії -------------------------------- */

  const openAbsenceDialog = useCallback(
    (preset?: { userId?: string; dateKey?: string; absence?: TeamAbsence; mode?: "manage" | "request" }) => {
      const absence = preset?.absence;
      setAbsenceEditingId(absence?.id ?? null);
      setAbsenceDialogMode(preset?.mode ?? (canManageAbsences ? "manage" : "request"));
      setAbsenceDialogInitial({
        userId: absence?.userId ?? preset?.userId ?? userId ?? "",
        startDate: absence?.startDate ?? preset?.dateKey ?? todayKey,
        endDate: absence?.endDate ?? preset?.dateKey ?? todayKey,
        kind: absence?.kind ?? "vacation",
        comment: absence?.comment ?? "",
      });
      setAbsenceDialogOpen(true);
    },
    [canManageAbsences, todayKey, userId]
  );

  const handleAbsenceSubmit = useCallback(
    async (value: AbsenceDialogValue) => {
      if (!workspaceId) return;
      setAbsenceSaving(true);
      try {
        if (absenceDialogMode === "request" && !absenceEditingId) {
          const kind = value.kind === "other" ? "vacation" : value.kind;
          const created = await createOwnAbsenceRequest({
            workspaceId,
            userId: value.userId,
            startDate: value.startDate,
            endDate: value.endDate,
            kind,
            comment: value.comment.trim() || null,
          });

          const businessDays = countBusinessDaysInYear(created, year, exceptions);
          const rangeLabel = formatRange(created);
          const myName = memberById.get(value.userId)?.label ?? "Співробітник";

          // Сповіщення не має валити саму заявку: вона вже в базі.
          try {
            if (kind === "sick_leave") {
              await notifyAbsenceRecorded({
                workspaceId,
                userId: value.userId,
                userName: myName,
                kindLabel: TEAM_ABSENCE_KIND_LABELS[kind],
                rangeLabel,
              });
            } else {
              await notifyAbsenceRequestSubmitted({
                workspaceId,
                requesterUserId: value.userId,
                requesterName: myName,
                kindLabel: TEAM_ABSENCE_KIND_LABELS[kind],
                rangeLabel,
                businessDays,
                comment: value.comment.trim() || null,
              });
            }
          } catch (notifyError) {
            console.warn("[team] absence notify failed", notifyError);
          }

          toast.success(kind === "sick_leave" ? "Лікарняний зафіксовано" : "Заявку надіслано");
          setAbsenceDialogOpen(false);
          await reloadAbsenceData();
          return;
        }

        if (absenceEditingId) {
          await updateTeamAbsence({
            workspaceId,
            id: absenceEditingId,
            userId: value.userId,
            startDate: value.startDate,
            endDate: value.endDate,
            kind: value.kind,
            comment: value.comment.trim() || null,
          });
          toast.success("Відсутність оновлено");
        } else {
          await createTeamAbsence({
            workspaceId,
            userId: value.userId,
            startDate: value.startDate,
            endDate: value.endDate,
            kind: value.kind,
            comment: value.comment.trim() || null,
            createdBy: userId ?? null,
          });
          toast.success("Відсутність додано");
        }
        setAbsenceDialogOpen(false);
        setAbsenceEditingId(null);
        await reloadAbsenceData();
      } catch (error) {
        console.error("[team] absence save failed", error);
        toast.error("Не вдалося зберегти відсутність");
      } finally {
        setAbsenceSaving(false);
      }
    },
    [
      absenceDialogMode,
      absenceEditingId,
      exceptions,
      memberById,
      reloadAbsenceData,
      userId,
      workspaceId,
      year,
    ]
  );

  const handleAbsenceDelete = useCallback(
    async (absence: TeamAbsence) => {
      if (!workspaceId) return;
      setAbsenceDeletingId(absence.id);
      try {
        await deleteTeamAbsence(workspaceId, absence.id);
        toast.success("Відсутність видалено");
        await reloadAbsenceData();
      } catch (error) {
        console.error("[team] absence delete failed", error);
        toast.error("Не вдалося видалити відсутність");
      } finally {
        setAbsenceDeletingId(null);
      }
    },
    [reloadAbsenceData, workspaceId]
  );

  const handleCancelRequest = useCallback(
    async (absence: TeamAbsence) => {
      if (!workspaceId) return;
      setCancellingId(absence.id);
      try {
        await cancelOwnAbsenceRequest({ workspaceId, id: absence.id });
        try {
          await notifyAbsenceRequestCancelled({
            workspaceId,
            requesterUserId: absence.userId,
            requesterName: memberById.get(absence.userId)?.label ?? "Співробітник",
            kindLabel: TEAM_ABSENCE_KIND_LABELS[absence.kind],
            rangeLabel: formatRange(absence),
          });
        } catch (notifyError) {
          console.warn("[team] cancel notify failed", notifyError);
        }
        toast.success("Заявку скасовано");
        await reloadAbsenceData();
      } catch (error) {
        console.error("[team] cancel failed", error);
        toast.error(error instanceof Error ? error.message : "Не вдалося скасувати заявку");
      } finally {
        setCancellingId(null);
      }
    },
    [memberById, reloadAbsenceData, workspaceId]
  );

  /**
   * Рішення йде через серверну функцію: там і аудит, і сповіщення заявнику,
   * і перевірка «свою заявку вирішує інший».
   */
  const handleDecide = useCallback(
    async (absence: TeamAbsence, decision: "approved" | "declined", comment?: string) => {
      setDecidingId(absence.id);
      try {
        await decideAbsenceRequest({ absenceId: absence.id, decision, comment: comment ?? null });
        toast.success(decision === "approved" ? "Заявку погоджено" : "Заявку відхилено");
        setDeclineTarget(null);
        await reloadAbsenceData();
      } catch (error) {
        console.error("[team] decision failed", error);
        toast.error(error instanceof Error ? error.message : "Не вдалося зберегти рішення");
      } finally {
        setDecidingId(null);
      }
    },
    [reloadAbsenceData]
  );

  /** Хто ще відсутній у ті самі дні — з уже завантаженого року, без мережі. */
  const findOverlaps = useCallback(
    ({ userId: forUserId, startDate, endDate }: { userId: string; startDate: string; endDate: string }): AbsenceOverlap[] =>
      liveAbsences
        .filter(
          (absence) =>
            absence.userId !== forUserId &&
            absence.startDate <= endDate &&
            absence.endDate >= startDate
        )
        .reduce<AbsenceOverlap[]>((acc, absence) => {
          // Одна людина = один рядок, навіть якщо в неї два записи в цьому
          // вікні: інакше заголовок рахував записи й казав «відсутні ще 2»
          // про одного колегу.
          if (acc.some((item) => item.userId === absence.userId)) return acc;
          acc.push({
            userId: absence.userId,
            name: memberById.get(absence.userId)?.label ?? "Колега",
            rangeLabel: `${TEAM_ABSENCE_KIND_LABELS[absence.kind].toLowerCase()} ${formatRange(absence)}`,
            pending: absence.status === "pending",
          });
          return acc;
        }, [])
        .sort((a, b) => a.name.localeCompare(b.name, "uk")),
    [liveAbsences, memberById]
  );

  /**
   * Клік по вільному дню в планері.
   *
   * Owner/SEO вносить факт будь-кому; решта може клікнути лише свій рядок —
   * і це відкриває ЗАЯВКУ, а не адмінське внесення. Сам планер уже гейтить,
   * чиї клітинки клікабельні (canPickForOthers), тут лишається обрати режим.
   */
  const handlePlannerPick = useCallback(
    (pickedUserId: string, dateKey: string) => {
      if (!canManageAbsences && pickedUserId !== userId) return;
      openAbsenceDialog({
        userId: pickedUserId,
        dateKey,
        mode: canManageAbsences ? "manage" : "request",
      });
    },
    [canManageAbsences, openAbsenceDialog, userId]
  );

  const hasActiveFilters = search.trim() !== "" || roleFilter !== "all" || peopleFilter !== "all";

  const resetFilters = useCallback(() => {
    setSearch("");
    setRoleFilter("all");
    setPeopleFilter("all");
  }, []);

  /* ---------------------------- Тулбар -------------------------------- */

  const headerActions = useMemo(
    () => (
      <UnifiedPageToolbar
        topLeft={
          <div className={cn(SEGMENTED_GROUP, "w-full lg:w-auto")}>
            <Button
              variant="segmented"
              size="xs"
              aria-pressed={tab === "people"}
              onClick={() => setTab("people")}
              className={SEGMENTED_TRIGGER}
            >
              Люди <CountBadge value={activeMembers.length} className="ml-1" />
            </Button>
            <Button
              variant="segmented"
              size="xs"
              aria-pressed={tab === "calendar"}
              onClick={() => setTab("calendar")}
              className={SEGMENTED_TRIGGER}
            >
              Календар
            </Button>
            <Button
              variant="segmented"
              size="xs"
              aria-pressed={tab === "requests"}
              onClick={() => setTab("requests")}
              className={SEGMENTED_TRIGGER}
            >
              Запити
              <CountBadge
                value={canManageAbsences ? pendingRequests.length : myAbsences.length}
                className={cn("ml-1", canManageAbsences && pendingRequests.length > 0 && toneBadgeClass.warning)}
              />
            </Button>
          </div>
        }
        topRight={
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            {canManageAbsences ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => setReportDialogOpen(true)}
                  className={cn(TOOLBAR_ACTION_BUTTON, "gap-2")}
                >
                  <FileSpreadsheet className="h-4 w-4" aria-hidden />
                  Звіт
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setQuotaDialogOpen(true)}
                  className={cn(TOOLBAR_ACTION_BUTTON, "gap-2")}
                >
                  <Settings2 className="h-4 w-4" aria-hidden />
                  Квоти
                </Button>
              </>
            ) : null}
            {canManageAbsences ? (
              <Button
                variant="outline"
                onClick={() => openAbsenceDialog({ mode: "manage" })}
                className={cn(TOOLBAR_ACTION_BUTTON, "gap-2")}
              >
                <Plus className="h-4 w-4" aria-hidden />
                Внести за когось
              </Button>
            ) : null}
            <Button
              onClick={() => openAbsenceDialog({ mode: "request", userId: userId ?? undefined })}
              className={cn(TOOLBAR_ACTION_BUTTON, "gap-2")}
            >
              <Plus className="h-4 w-4" aria-hidden />
              Запросити відсутність
            </Button>
          </div>
        }
        search={
          tab === "people" ? (
            <ToolbarSearch value={search} onChange={setSearch} placeholder="Пошук людини…" />
          ) : undefined
        }
        filters={
          tab === "people" ? (
            <>
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger className={cn(TOOLBAR_CONTROL, "w-full sm:w-[190px]")}>
                  <SelectValue placeholder="Роль" />
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
              <Select value={peopleFilter} onValueChange={(next) => setPeopleFilter(next as PeopleFilter)}>
                <SelectTrigger className={cn(TOOLBAR_CONTROL, "w-full sm:w-[170px]")}>
                  <SelectValue placeholder="Статус" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Усі статуси</SelectItem>
                  <SelectItem value="present">На місці</SelectItem>
                  <SelectItem value="away">Відсутні</SelectItem>
                </SelectContent>
              </Select>
              <Select value={sortMode} onValueChange={(next) => setSortMode(next as SortMode)}>
                <SelectTrigger className={cn(TOOLBAR_CONTROL, "w-full sm:w-[190px]")}>
                  <SelectValue placeholder="Сортування" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="presence">За присутністю</SelectItem>
                  <SelectItem value="name">За іменем</SelectItem>
                  <SelectItem value="tenure">За стажем</SelectItem>
                  <SelectItem value="birthday">За днем народження</SelectItem>
                </SelectContent>
              </Select>
            </>
          ) : undefined
        }
        meta={
          tab === "people" ? (
            <ToolbarMeta
              count={filteredMembers.length}
              countLabel="у команді"
              onReset={resetFilters}
              showReset={hasActiveFilters}
              loading={absencesLoading}
            />
          ) : undefined
        }
      />
    ),
    [
      absencesLoading,
      activeMembers.length,
      canManageAbsences,
      filteredMembers.length,
      hasActiveFilters,
      myAbsences.length,
      openAbsenceDialog,
      pendingRequests.length,
      peopleFilter,
      resetFilters,
      roleFilter,
      roleOptions,
      search,
      sortMode,
      tab,
      userId,
    ]
  );

  usePageHeaderActions(headerActions, [headerActions]);

  if (loading || showSkeleton) return <AppPageLoader title="Завантаження" subtitle="Готуємо команду." />;

  // Хто вирішує заявки — показуємо людині в діалозі, щоб «піде на погодження»
  // не було безадресним.
  const approverLabel = (() => {
    const seo = activeMembers.filter((member) => (member.jobRole ?? "").toLowerCase() === "seo");
    const names = (seo.length > 0 ? seo : activeMembers.filter((m) => m.userId !== userId))
      .slice(0, 2)
      .map((member) => member.label.split(" ")[0]);
    return names.length > 0 ? names.join(" або ") : "";
  })();

  const quotaPeople = quotaPeopleMemo;

  return (
    <div className="space-y-4 pb-8">
      {tab === "people" ? (
        <>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_minmax(0,1fr)]">
            {myBalance ? (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <UserCheck className="h-4 w-4 text-primary" aria-hidden />
                    Мій баланс — {year}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <AbsenceBalanceMeters balance={myBalance} />
                  <p className="mt-3 border-t border-border/40 pt-2.5 text-2xs text-muted-foreground">
                    Квота списується робочими днями — вихідні всередині відпустки не рахуються.
                  </p>
                </CardContent>
              </Card>
            ) : null}

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <CalendarRange className="h-4 w-4 text-primary" aria-hidden />
                  Зараз відсутні
                  <span className="ml-auto text-xs font-normal tabular-nums text-muted-foreground">
                    {awayToday.length}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2.5">
                {awayToday.length === 0 ? (
                  <p className="py-2 text-xs text-muted-foreground">Вся команда на місці.</p>
                ) : (
                  awayToday.map(({ member, absence }) => (
                    <div key={member.userId} className="flex items-center gap-2.5">
                      <AvatarBase
                        src={member.avatarDisplayUrl}
                        name={member.label}
                        fallback={getInitialsFromName(member.label, member.email)}
                        assetVariant="xs"
                        size={28}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-semibold">{member.label}</div>
                        <div className="text-2xs text-muted-foreground">до {formatShort(absence.endDate)}</div>
                      </div>
                      <span
                        className={cn(
                          "shrink-0 rounded-full border px-2 py-0.5 text-3xs font-semibold",
                          toneBadgeClass[TEAM_ABSENCE_KIND_TONE[absence.kind]]
                        )}
                      >
                        {TEAM_ABSENCE_KIND_LABELS[absence.kind]}
                      </span>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <CalendarDays className="h-4 w-4 text-primary" aria-hidden />
                  Найближчі події
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {upcomingEvents.length === 0 ? (
                  <p className="py-2 text-xs text-muted-foreground">Найближчим часом подій немає.</p>
                ) : (
                  upcomingEvents.map((event) => {
                    const Icon = EVENT_ICONS[event.type];
                    return (
                      <div key={event.id} className="flex items-center gap-2 text-xs">
                        <Icon className={cn("h-3.5 w-3.5 shrink-0", toneTextClass[EVENT_TONE[event.type]])} aria-hidden />
                        <span className="truncate font-medium">{event.title}</span>
                        <span className="truncate text-muted-foreground">{event.caption}</span>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="flex-row items-center gap-2 pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <CalendarDays className="h-4 w-4 text-primary" aria-hidden />
                Найближчі два тижні
              </CardTitle>
              <button
                type="button"
                onClick={() => setTab("calendar")}
                className="ml-auto text-xs font-semibold text-primary hover:underline"
              >
                весь місяць →
              </button>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              <AbsencePlanner
                days={stripDays}
                people={stripPeople}
                absences={liveAbsences}
                exceptions={exceptions}
                todayKey={todayKey}
                currentUserId={userId}
                canPickForOthers={canManageAbsences}
                onPickDay={handlePlannerPick}
                onOpenAbsence={canManageAbsences ? (absence) => openAbsenceDialog({ absence }) : undefined}
                emptyLabel="Найближчі два тижні вся команда на місці."
              />
            </CardContent>
          </Card>

          {filteredMembers.length === 0 ? (
            <EmptyStateCard
              badgeLabel="Команда"
              title="Нікого не знайшли"
              description="Спробуйте змінити пошук або фільтри."
              actionLabel={hasActiveFilters ? "Скинути фільтри" : undefined}
              onAction={hasActiveFilters ? resetFilters : undefined}
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
              {filteredMembers.map((member) => {
                const cardPerson: TeamMemberCardPerson = {
                  userId: member.userId,
                  name: member.label,
                  roleLabel: formatRoleLabel(member.jobRole),
                  avatarUrl: member.avatarDisplayUrl,
                  initials: getInitialsFromName(member.label, member.email),
                  email: member.email,
                  phone: member.phone,
                  online: member.online,
                  inactive: member.inactive,
                  probation: member.employmentStatus === "probation",
                  tenureLabel: formatEmploymentDuration(member.startDate),
                  startDateLabel: member.startDate ? formatEmploymentDate(member.startDate) : "",
                  birthdayLabel: member.birthdayInsight?.dateLabel ?? null,
                  birthdayDaysUntil: member.birthdayInsight?.daysUntil ?? null,
                  presenceLabel: member.inactive
                    ? "Співпрацю завершено"
                    : formatPresenceText(member.lastSeenAt, member.online),
                };
                // Приватність: свій баланс бачить кожен, чужі — лише owner/SEO.
                const showBalance = canManageAbsences || member.userId === userId;
                return (
                  <TeamMemberCard
                    key={member.userId}
                    person={cardPerson}
                    absenceToday={absenceTodayByUser.get(member.userId) ?? null}
                    pendingRequest={pendingByUser.get(member.userId) ?? null}
                    balance={showBalance ? (balances.get(member.userId) ?? null) : null}
                  />
                );
              })}
            </div>
          )}
        </>
      ) : null}

      {tab === "calendar" ? (
        <Card>
          <CardHeader className="flex-row flex-wrap items-center gap-2 pb-3">
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setMonthOffset((prev) => prev - 1)}
                aria-label="Попередній місяць"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden />
              </Button>
              <span className="min-w-[150px] text-center text-sm font-semibold">
                {formatMonthLabel(selectedMonth)}
              </span>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setMonthOffset((prev) => prev + 1)}
                aria-label="Наступний місяць"
              >
                <ChevronRight className="h-4 w-4" aria-hidden />
              </Button>
              {monthOffset !== 0 ? (
                <Button variant="ghost" size="sm" onClick={() => setMonthOffset(0)}>
                  Сьогодні
                </Button>
              ) : null}
            </div>
            {absencesLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" aria-hidden />
            ) : null}
            <div className="ml-auto flex flex-wrap items-center gap-3 text-2xs text-muted-foreground">
              {(["vacation", "sick_leave", "day_off"] as TeamAbsenceKind[]).map((kind) => (
                <span key={kind} className="inline-flex items-center gap-1.5">
                  <span
                    className={cn(
                      "inline-block h-2.5 w-4 rounded-sm border",
                      toneBadgeClass[TEAM_ABSENCE_KIND_TONE[kind]]
                    )}
                    aria-hidden
                  />
                  {TEAM_ABSENCE_KIND_LABELS[kind]}
                </span>
              ))}
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="inline-block h-2.5 w-4 rounded-sm border border-dashed border-border bg-muted"
                  aria-hidden
                />
                На погодженні
              </span>
            </div>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <AbsencePlanner
              days={monthDays}
              people={plannerPeople}
              absences={liveAbsences}
              marks={plannerMarks}
              exceptions={exceptions}
              todayKey={todayKey}
              currentUserId={userId}
              canPickForOthers={canManageAbsences}
              onPickDay={handlePlannerPick}
              onOpenAbsence={canManageAbsences ? (absence) => openAbsenceDialog({ absence }) : undefined}
            />
            <p className="border-t border-border/40 px-5 py-3 text-2xs text-muted-foreground">
              Сірі стовпчики — вихідні та свята: квоту вони не списують.
              {canManageAbsences
                ? " Клік по вільному дню створює відсутність, клік по бару — відкриває запис."
                : " Клік по вільному дню у своєму рядку створює заявку."}
            </p>
          </CardContent>
        </Card>
      ) : null}

      {/* Смуга погодження просто під планером: рішення приймається в контексті
          того, хто ще відсутній у ці ж дні. */}
      {tab === "calendar" && canManageAbsences && pendingRequests.length > 0 ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <CalendarRange className="h-4 w-4 text-primary" aria-hidden />
              Очікують погодження
              <span className="ml-auto text-xs font-normal tabular-nums text-muted-foreground">
                {pendingRequests.length}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-border/40">
              {pendingRequests.map((absence) => (
                <AbsenceRow
                  key={absence.id}
                  absence={absence}
                  name={memberById.get(absence.userId)?.label ?? "—"}
                  exceptions={exceptions}
                  year={year}
                  canManage={false}
                  deleting={false}
                  onEdit={() => openAbsenceDialog({ absence })}
                  onDelete={() => handleAbsenceDelete(absence)}
                  balance={balances.get(absence.userId) ?? null}
                  canDecide={absence.userId !== userId}
                  deciding={decidingId === absence.id}
                  onApprove={() => void handleDecide(absence, "approved")}
                  onDecline={() => setDeclineTarget(absence)}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {tab === "requests" ? (
        <div className="space-y-4">
          {canManageAbsences ? (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <CalendarRange className="h-4 w-4 text-primary" aria-hidden />
                  На погодженні
                  <span className="ml-auto text-xs font-normal tabular-nums text-muted-foreground">
                    {pendingRequests.length}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {pendingRequests.length === 0 ? (
                  <p className="py-2 text-xs text-muted-foreground">
                    Заявок на погодженні немає.
                  </p>
                ) : (
                  <div className="divide-y divide-border/40">
                    {pendingRequests.map((absence) => {
                      const member = memberById.get(absence.userId);
                      return (
                        <AbsenceRow
                          key={absence.id}
                          absence={absence}
                          name={member?.label ?? "—"}
                          exceptions={exceptions}
                          year={year}
                          canManage={canManageAbsences}
                          deleting={absenceDeletingId === absence.id}
                          onEdit={() => openAbsenceDialog({ absence })}
                          onDelete={() => handleAbsenceDelete(absence)}
                          decisionComment={decisionComments.get(absence.id) ?? null}
                          balance={balances.get(absence.userId) ?? null}
                          canDecide={canManageAbsences && absence.userId !== userId}
                          deciding={decidingId === absence.id}
                          onApprove={() => void handleDecide(absence, "approved")}
                          onDecline={() => setDeclineTarget(absence)}
                        />
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <CalendarDays className="h-4 w-4 text-primary" aria-hidden />
                Мої відсутності — {year}
                <span className="ml-auto text-xs font-normal tabular-nums text-muted-foreground">
                  {myAbsences.length}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {myAbsences.length === 0 ? (
                <p className="py-2 text-xs text-muted-foreground">За цей рік відсутностей не записано.</p>
              ) : (
                <div className="divide-y divide-border/40">
                  {myAbsences.map((absence) => (
                    <AbsenceRow
                      key={absence.id}
                      absence={absence}
                      name="Я"
                      exceptions={exceptions}
                      year={year}
                      canManage={canManageAbsences}
                      deleting={absenceDeletingId === absence.id}
                      onEdit={() => openAbsenceDialog({ absence })}
                      onDelete={() => handleAbsenceDelete(absence)}
                      hideName
                      decisionComment={decisionComments.get(absence.id) ?? null}
                      canCancel={absence.status === "pending"}
                      cancelling={cancellingId === absence.id}
                      onCancel={() => void handleCancelRequest(absence)}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {canManageAbsences ? (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Users className="h-4 w-4 text-primary" aria-hidden />
                  Усі записи — {year}
                  <span className="ml-auto text-xs font-normal tabular-nums text-muted-foreground">
                    {(absences ?? []).length}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {(absences ?? []).length === 0 ? (
                  <p className="py-2 text-xs text-muted-foreground">За цей рік відсутностей не записано.</p>
                ) : (
                  <div className="divide-y divide-border/40">
                    {(absences ?? []).map((absence) => (
                      <AbsenceRow
                        key={absence.id}
                        absence={absence}
                        name={memberById.get(absence.userId)?.label ?? "—"}
                        exceptions={exceptions}
                        year={year}
                        canManage={canManageAbsences}
                        deleting={absenceDeletingId === absence.id}
                        onEdit={() => openAbsenceDialog({ absence })}
                        onDelete={() => handleAbsenceDelete(absence)}
                        decisionComment={decisionComments.get(absence.id) ?? null}
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ) : null}
        </div>
      ) : null}

      {absenceDialogInitial ? (
        <AbsenceDialog
          open={absenceDialogOpen}
          onOpenChange={(open) => {
            setAbsenceDialogOpen(open);
            if (!open) setAbsenceEditingId(null);
          }}
          initial={absenceDialogInitial}
          people={activeMembers.map((member) => ({ userId: member.userId, name: member.label }))}
          canPickPerson={canManageAbsences && absenceDialogMode === "manage"}
          balanceOf={(id) => balances.get(id) ?? null}
          exceptions={exceptions}
          saving={absenceSaving}
          editing={Boolean(absenceEditingId)}
          mode={absenceDialogMode}
          approverLabel={approverLabel}
          todayKey={todayKey}
          findOverlaps={findOverlaps}
          onSubmit={handleAbsenceSubmit}
        />
      ) : null}

      <AbsenceDeclineDialog
        open={Boolean(declineTarget)}
        onOpenChange={(open) => {
          if (!open) setDeclineTarget(null);
        }}
        personName={declineTarget ? (memberById.get(declineTarget.userId)?.label ?? "—") : ""}
        rangeLabel={declineTarget ? formatRange(declineTarget) : ""}
        saving={Boolean(declineTarget && decidingId === declineTarget.id)}
        onConfirm={(comment) => {
          if (declineTarget) void handleDecide(declineTarget, "declined", comment || undefined);
        }}
      />

      {reportDialogOpen ? (
        <AbsenceYearReportDialog
          open={reportDialogOpen}
          onOpenChange={setReportDialogOpen}
          year={year}
          people={quotaPeople}
          absences={absences ?? []}
          balances={balances}
          exceptions={exceptions}
        />
      ) : null}

      <QuotaEditorDialog
        open={quotaDialogOpen}
        onOpenChange={setQuotaDialogOpen}
        workspaceId={workspaceId}
        year={year}
        people={quotaPeople}
        currentUserId={userId ?? null}
        onSaved={() => void reloadAbsenceData()}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Рядок відсутності                                                   */
/* ------------------------------------------------------------------ */

function AbsenceRow({
  absence,
  name,
  exceptions,
  year,
  canManage,
  deleting,
  onEdit,
  onDelete,
  hideName,
  decisionComment,
  balance,
  canDecide,
  deciding,
  onApprove,
  onDecline,
  canCancel,
  cancelling,
  onCancel,
}: {
  absence: TeamAbsence;
  name: string;
  exceptions: Map<string, boolean>;
  year: number;
  canManage: boolean;
  deleting: boolean;
  onEdit: () => void;
  onDelete: () => void;
  hideName?: boolean;
  /** Причина рішення — приходить окремим RPC, видна лише заявнику й owner/SEO. */
  decisionComment?: string | null;
  /** Баланс заявника — щоб рішення приймалось із цифрами перед очима. */
  balance?: AbsenceBalance | null;
  canDecide?: boolean;
  deciding?: boolean;
  onApprove?: () => void;
  onDecline?: () => void;
  canCancel?: boolean;
  cancelling?: boolean;
  onCancel?: () => void;
}) {
  const businessDays = countBusinessDaysInYear(absence, year, exceptions);
  const restOnly = businessDays === 0;
  const bucket = balance && absence.kind !== "other" ? balance[absence.kind] : null;

  return (
    <div className="group flex items-center gap-3 py-2.5">
      <span
        className={cn(
          "shrink-0 rounded-full border px-2 py-0.5 text-3xs font-semibold",
          toneBadgeClass[TEAM_ABSENCE_KIND_TONE[absence.kind]]
        )}
      >
        {TEAM_ABSENCE_KIND_LABELS[absence.kind]}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 text-xs">
          {hideName ? null : <span className="font-semibold">{name}</span>}
          <span className="font-medium tabular-nums">{formatRange(absence)}</span>
          <span className="text-muted-foreground">
            {restOnly ? "вихідні — квота не списується" : `${businessDays} ${pluralDays(businessDays)} робочих`}
          </span>
        </div>
        {bucket && absence.status === "pending" ? (
          <div className="mt-0.5 text-2xs text-muted-foreground">
            після погодження залишиться{" "}
            <b className="font-medium tabular-nums text-foreground">
              {Math.max(0, bucket.remaining - businessDays)}
            </b>{" "}
            із {bucket.quota}
          </div>
        ) : null}
        {absence.comment ? (
          <div className="mt-0.5 truncate text-2xs text-muted-foreground">«{absence.comment}»</div>
        ) : null}
        {decisionComment ? (
          <div className={cn("mt-0.5 truncate text-2xs", toneTextClass.danger)}>
            Причина: {decisionComment}
          </div>
        ) : null}
      </div>
      {absence.status !== "approved" ? (
        <span
          className={cn(
            "shrink-0 rounded-full border px-2 py-0.5 text-3xs font-semibold",
            toneBadgeClass[TEAM_ABSENCE_STATUS_TONE[absence.status]]
          )}
        >
          {TEAM_ABSENCE_STATUS_LABELS[absence.status]}
        </span>
      ) : null}
      {canDecide && absence.status === "pending" ? (
        <div className="flex shrink-0 items-center gap-2">
          <Button
            size="sm"
            variant="successTonal"
            onClick={onApprove}
            disabled={deciding}
            className="h-8"
          >
            {deciding ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
            Погодити
          </Button>
          <Button size="sm" variant="destructive" onClick={onDecline} disabled={deciding} className="h-8">
            Відхилити
          </Button>
        </div>
      ) : null}
      {canCancel ? (
        <Button
          size="sm"
          variant="outline"
          onClick={onCancel}
          disabled={cancelling}
          className="h-8 shrink-0"
        >
          {cancelling ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
          Скасувати
        </Button>
      ) : null}
      {canManage ? (
        <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit} aria-label="Редагувати">
            <Pencil className="h-3.5 w-3.5" aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-destructive"
            onClick={onDelete}
            disabled={deleting}
            aria-label="Видалити"
          >
            {deleting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
            )}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export default TeamPage;
