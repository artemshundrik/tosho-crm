import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { DEFAULT_TEAM_TAB, resolveTeamTab, type TeamTab } from "@/lib/teamTabs";
import { PageLoading } from "@/components/app/page-loading";
import {
  Award,
  Cake,
  CalendarDays,
  CalendarRange,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  House,
  LayoutGrid,
  Loader2,
  PartyPopper,
  Pencil,
  Plus,
  Rows3,
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
import { UnifiedPageToolbar } from "@/components/app/headers/UnifiedPageToolbar";
import { CountBadge, ToolbarFilterSelect, ToolbarMeta, ToolbarSearch } from "@/components/app/headers/toolbarPrimitives";
import { usePageHeaderActions } from "@/components/app/page-header-actions";
import {
  SEGMENTED_GROUP,
  SEGMENTED_TRIGGER,
  TOOLBAR_ACTION_BUTTON,

} from "@/components/ui/controlStyles";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyStateCard } from "@/components/ui/empty-state-card";
import { useWorkspacePresence } from "@/components/app/workspace-presence-context";
import { usePageData } from "@/hooks/usePageData";
import { useTeamLastSeen } from "@/hooks/useTeamLastSeen";
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
  isPresenceKind,
  isQuotaAbsenceKind,
  listPendingTeamAbsences,
  listTeamAbsencesInRange,
  loadAbsenceDecisionComments,
  updateTeamAbsence,
  TEAM_ABSENCE_KIND_LABELS,
  TEAM_ABSENCE_STATUS_LABELS,
  TEAM_ABSENCE_STATUS_TONE,
  type TeamAbsence,
  type TeamAbsenceKind,
} from "@/lib/teamAbsences";
import {
  absenceWaitingDays,
  formatAbsenceSubmittedAgo,
  sortAbsencesByNewest,
} from "@/lib/teamAbsenceQueue";
import {
  ABSENCE_QUOTA_UNIT,
  ABSENCE_QUOTA_UNIT_LABEL,
  countQuotaDaysInYear,
  eachDateKey,
} from "@/lib/teamAbsenceCalendar";
import { ACTIVE_DESIGN_STATUSES } from "@/lib/designWorkload";
import { supabase } from "@/lib/supabaseClient";
import {
  fallbackBalance,
  loadAbsenceBalances,
  loadWorkdayExceptions,
  upcomingHolidays,
  type AbsenceBalance,
} from "@/lib/teamAbsenceQuotas";
import { TEAM_EVENT_TONE, toneBadgeClass, toneTextClass } from "@/lib/statusTones";
import { formatLastSeenAgo, formatLastSeenExact } from "@/lib/lastSeen";
import { getInitialsFromName } from "@/lib/userName";
import {
  invalidateWorkspaceMemberDirectory,
  listWorkspaceMembersForDisplay,
  type WorkspaceMemberDisplayRow,
} from "@/lib/workspaceMemberDirectory";
import { resolveWorkspaceId } from "@/lib/workspace";
import { toAvatarAbsence } from "@/lib/absenceIndicator";
import { toPersonHoverCardData } from "@/components/app/PersonHoverCard";
import { notifyAbsenceRequestCancelled } from "@/lib/workflowNotifications";
import { AbsenceBalanceMeters, buildBalanceEntries } from "@/components/team/AbsenceBalanceMeters";
import { AbsenceKindChip } from "@/components/team/AbsenceKindChip";
import { AbsenceDeclineDialog } from "@/components/team/AbsenceDeclineDialog";
import {
  AbsenceDialog,
  type AbsenceDialogValue,
  type AbsenceOverlap,
} from "@/components/team/AbsenceDialog";
import { AbsencePlanner, type PlannerMark, type PlannerPerson } from "@/components/team/AbsencePlanner";
import { AbsenceYearReportDialog } from "@/components/team/AbsenceYearReportDialog";
import { HolidayEditorDialog } from "@/components/team/HolidayEditorDialog";
import { QuotaEditorDialog } from "@/components/team/QuotaEditorDialog";
import { TeamBalancesTable } from "@/components/team/TeamBalancesTable";
import { TeamMemberCard, type TeamMemberCardPerson } from "@/components/team/TeamMemberCard";
import { SegmentedGroup } from "@/components/ui/segmented-group";

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


/** Контекст для approver'а під заявкою: перетини і навантаження заявника. */
type AbsenceDecideContext = {
  overlaps: string[];
  /** null — заявник не дизайнер, задачі не рахуємо. */
  activeTasks: number | null;
  dueInPeriod: number;
};
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

/** Свято має власний тон: жовтий тепер належить лікарняному одному.
 *  Мапа спільна з планером — див. TEAM_EVENT_TONE у statusTones. */
const EVENT_TONE = TEAM_EVENT_TONE;

const EVENT_ICONS: Record<keyof typeof EVENT_TONE, LucideIcon> = {
  birthday: Cake,
  anniversary: Award,
  return: Undo2,
  holiday: PartyPopper,
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

/** Скільки подій видно до кнопки «ще N». Решта — на вкладці «Календар». */
const EVENTS_PREVIEW_COUNT = 5;

/**
 * «завтра» замість «04.08» для найближчого тижня: саме ці події вимагають
 * дії, і рахувати дні в голові там зайве. Далі за тиждень дата зрозуміліша
 * за «за 23 дні».
 */
function formatEventWhen(daysUntil: number, dateLabel: string) {
  if (daysUntil === 0) return "сьогодні";
  if (daysUntil === 1) return "завтра";
  if (daysUntil <= 6) return `за ${daysUntil} ${pluralDays(daysUntil)}`;
  return dateLabel;
}

function pluralEvents(count: number) {
  const mod100 = count % 100;
  const mod10 = count % 10;
  if (mod100 >= 11 && mod100 <= 14) return "подій";
  if (mod10 === 1) return "подія";
  if (mod10 >= 2 && mod10 <= 4) return "події";
  return "подій";
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
  // Після фолбека на повну історію порожнє значення = людина СПРАВДІ жодного
  // разу не заходила (нема рядка в user_presence) — кажемо це, а не туманне
  // «давно», що з'являлось усім поза 30-хвилинним вікном.
  if (!lastSeenAt) return "Візитів ще не було";
  return `${formatLastSeenAgo(lastSeenAt)}`;
}

/* ------------------------------------------------------------------ */
/* Сторінка                                                            */
/* ------------------------------------------------------------------ */

export function TeamPage() {
  const { userId, teamId, loading, permissions } = useAuth();
  const workspacePresence = useWorkspacePresence();

  /**
   * ПОВНА історія «коли був» — окремо від контексту присутності: той тягне лише
   * свіже вікно, тож картки показували «Давно не заходив» усім, хто закрив
   * вкладку годину тому. Запит спільний із Пульсом — див. useTeamLastSeen.
   */
  const lastSeenByUser = useTeamLastSeen(teamId);

  /** Вносити відсутності за інших і бачити чужі залишки може owner/SEO. */
  const canManageAbsences = permissions.isSuperAdmin || permissions.isSeo;
  /**
   * Хто може ВИРІШИТИ конкретну заявку. Правило сервера: заявку SEO або
   * власника вирішує лише власник. Кнопки, які завжди відповідають 403,
   * гірші за їхню відсутність — тому ховаємо їх ще тут.
   */
  const viewerIsOwner = permissions.isSuperAdmin;

  /**
   * Активна вкладка живе в URL (`?tab=`), а не лише в стані.
   *
   * Причина конкретна: сповіщення «Заявка: відпустка — Ілля» вело на /team, і
   * SEO щоразу відкривав «Людей», а далі клацав у «Запити» — тобто посилання
   * не доводило до дії, заради якої його надіслали. Тепер href веде рівно на
   * потрібну вкладку. Для сповіщень, які вже лежать у дзвіночку зі старим
   * href, вкладку виводимо з ключа `reminder=` — переписувати їх у базі
   * не можна: на цьому href тримається дедуп повторів.
   */
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: TeamTab = useMemo(() => resolveTeamTab(searchParams), [searchParams]);
  const setTab = useCallback(
    (next: TeamTab) => {
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev);
          if (next === DEFAULT_TEAM_TAB) params.delete("tab");
          else params.set("tab", next);
          // Ключ сповіщення відпрацював і більше не має тягнути вкладку назад.
          params.delete("reminder");
          return params;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [peopleFilter, setPeopleFilter] = useState<PeopleFilter>("all");
  /** Щільний вид списку. Лише owner/SEO — у решти таблиця була б з одного рядка. */
  const [peopleView, setPeopleView] = useState<"cards" | "balances">("cards");
  const [sortMode, setSortMode] = useState<SortMode>("presence");
  const [monthOffset, setMonthOffset] = useState(0);

  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [absences, setAbsences] = useState<TeamAbsence[] | null>(null);
  /**
   * Черга погоджень окремо від журналу року: непогоджена заявка може бути на
   * будь-який рік, а журнал — завжди про один (REQ-22).
   */
  const [pendingAll, setPendingAll] = useState<TeamAbsence[] | null>(null);
  const [absencesLoading, setAbsencesLoading] = useState(false);
  const [balances, setBalances] = useState<Map<string, AbsenceBalance>>(new Map());
  const [exceptions, setExceptions] = useState<Map<string, boolean>>(new Map());
  /** день → назва свята. Окремо від математики: та про підписи не знає. */
  const [holidayNames, setHolidayNames] = useState<Map<string, string>>(new Map());

  const [absenceDialogOpen, setAbsenceDialogOpen] = useState(false);
  const [absenceDialogInitial, setAbsenceDialogInitial] = useState<AbsenceDialogValue | null>(null);
  const [absenceEditingId, setAbsenceEditingId] = useState<string | null>(null);
  const [absenceSaving, setAbsenceSaving] = useState(false);
  const [absenceDeletingId, setAbsenceDeletingId] = useState<string | null>(null);
  const [quotaDialogOpen, setQuotaDialogOpen] = useState(false);
  const [holidayDialogOpen, setHolidayDialogOpen] = useState(false);
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
  const currentYear = useMemo(() => new Date().getFullYear(), []);

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
      const [rows, calendar, pendingRows] = await Promise.all([
        listTeamAbsencesInRange({
          workspaceId,
          from,
          to,
          statuses: ["approved", "pending", "declined", "cancelled"],
        }),
        loadWorkdayExceptions({ workspaceId, from, to }),
        // Черга погоджень свій рік не має — заявка на січень наступного року
        // мусить бути видна вже в грудні (REQ-22). Помилку тут НЕ ковтаємо:
        // тихо порожня черга погоджень — рівно та біда, від якої ця картка.
        listPendingTeamAbsences({ workspaceId }),
      ]);
      setAbsences(rows);
      setPendingAll(pendingRows);
      setExceptions(calendar.exceptions);
      setHolidayNames(calendar.holidayNames);
      const [balanceMap, comments] = await Promise.all([
        loadAbsenceBalances({ year, pendingAbsences: rows, exceptions: calendar.exceptions }),
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
      setPendingAll([]);
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
          // Контекст знає лише останні 30 хв — далі беремо повну історію.
          lastSeenAt: presence?.lastSeenAt ?? lastSeenByUser.get(member.userId) ?? null,
          inactive,
          birthdayInsight: getBirthdayInsight(member.birthDate),
          anniversaryInsight: getWorkAnniversaryInsight(member.startDate),
          tenureDays: getEmploymentDurationDays(member.startDate),
        };
      }),
    [lastSeenByUser, members, presenceByUserId]
  );

  const memberById = useMemo(
    () => new Map(enrichedMembers.map((member) => [member.userId, member])),
    [enrichedMembers]
  );

  const activeMembers = useMemo(() => enrichedMembers.filter((member) => !member.inactive), [enrichedMembers]);

  /**
   * Історія відсутностей за типами — для розшифровки під метрами.
   *
   * Рахуємо ОДИН раз на всіх, а не в кожній картці: дні кожного запису
   * міряються тією ж функцією, що й квота (відпустка — календарними), тож
   * бульбашка не може розійтися з числом на метрі.
   */
  const balanceEntriesByUser = useMemo(() => {
    const byUser = new Map<string, ReturnType<typeof buildBalanceEntries>>();
    const grouped = new Map<string, TeamAbsence[]>();
    (absences ?? []).forEach((absence) => {
      const list = grouped.get(absence.userId);
      if (list) list.push(absence);
      else grouped.set(absence.userId, [absence]);
    });
    grouped.forEach((list, userId) => {
      byUser.set(
        userId,
        buildBalanceEntries(list, (absence) =>
          isQuotaAbsenceKind(absence.kind)
            ? countQuotaDaysInYear(absence.kind, absence, year, exceptions)
            : 0
        )
      );
    });
    return byUser;
  }, [absences, exceptions, year]);

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

  /**
   * Черга погоджень — з окремого запиту без року, свіжіші вгорі.
   *
   * До REQ-22 список брався з журналу поточного року й сортувався за ПОЧАТКОМ
   * відсутності за зростанням: заявка, подана сьогодні на грудень, падала в
   * самий кінець, а заявка на наступний рік не показувалась узагалі.
   */
  const pendingRequests = useMemo(() => sortAbsencesByNewest(pendingAll ?? []), [pendingAll]);

  /**
   * Журнал року + заявки поза ним, без дублів. Потрібен там, де питання не про
   * рік, а про перетини: заявка на січень має бачити сусідні січневі.
   */
  const absencesWithPending = useMemo(() => {
    const byId = new Map((absences ?? []).map((absence) => [absence.id, absence]));
    for (const request of pendingAll ?? []) {
      if (!byId.has(request.id)) byId.set(request.id, request);
    }
    return Array.from(byId.values());
  }, [absences, pendingAll]);

  /**
   * Контекст рішення: скільки активних дизайн-задач у заявника і чи є серед
   * них дедлайни, що падають у період відсутності. Це те, чого не дасть
   * жоден HR-тул — CRM знає навантаження.
   *
   * Вантажиться ЛІНИВО й лише approver'ам із відкритими заявками: список
   * людей не платить за це нічого.
   */
  const [requesterTasks, setRequesterTasks] = useState<Map<string, { id: string; deadlineKey: string | null }[]>>(
    () => new Map()
  );

  useEffect(() => {
    if (!canManageAbsences || !teamId || pendingRequests.length === 0) return;
    const requesterIds = Array.from(new Set(pendingRequests.map((request) => request.userId)));
    let cancelled = false;
    void (async () => {
      try {
        const { data, error } = await supabase
          .from("activity_log")
          .select("id,metadata")
          .eq("team_id", teamId)
          .eq("action", "design_task")
          .in("metadata->>status", ACTIVE_DESIGN_STATUSES as string[])
          .in("metadata->>assignee_user_id", requesterIds)
          .limit(500);
        if (error || cancelled) return;
        const byUser = new Map<string, { id: string; deadlineKey: string | null }[]>();
        for (const row of (data ?? []) as Array<{ id: string; metadata?: Record<string, unknown> | null }>) {
          const metadata = row.metadata ?? {};
          const assignee = typeof metadata.assignee_user_id === "string" ? metadata.assignee_user_id : null;
          if (!assignee) continue;
          const rawDeadline = metadata.design_deadline ?? metadata.deadline;
          const deadlineKey =
            typeof rawDeadline === "string" && /^\d{4}-\d{2}-\d{2}/.test(rawDeadline)
              ? rawDeadline.slice(0, 10)
              : null;
          const list = byUser.get(assignee) ?? [];
          list.push({ id: row.id, deadlineKey });
          byUser.set(assignee, list);
        }
        if (!cancelled) setRequesterTasks(byUser);
      } catch {
        // Контекст — допоміжна річ: без нього рішення все одно можливе.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canManageAbsences, teamId, pendingRequests]);

  /** Перетини заявки з іншими живими відсутностями + навантаження заявника. */
  const decideContextFor = useCallback(
    (request: TeamAbsence): AbsenceDecideContext | null => {
      if (!canManageAbsences) return null;
      // Перетини шукаємо і серед заявок поза роком: рішення по січневій заявці
      // має бачити інші січневі, навіть якщо вкладка показує грудень.
      const overlaps = absencesWithPending
        .filter(
          (other) =>
            other.id !== request.id &&
            other.userId !== request.userId &&
            // Колега «з дому» працює — блок відповідає на «чи не лишимось
            // без рук», тож wfh тут не перетин.
            !isPresenceKind(other.kind) &&
            (other.status === "approved" || other.status === "pending") &&
            other.startDate <= request.endDate &&
            other.endDate >= request.startDate
        )
        .slice(0, 4)
        .map((other) => {
          const label = memberById.get(other.userId)?.label ?? "—";
          const range = `${formatShort(other.startDate)}–${formatShort(other.endDate)}`;
          return `${label} (${TEAM_ABSENCE_KIND_LABELS[other.kind].toLowerCase()} ${range}${
            other.status === "pending" ? ", запит" : ""
          })`;
        });

      const isDesigner = (memberById.get(request.userId)?.jobRole ?? "").trim().toLowerCase() === "designer";
      const tasks = requesterTasks.get(request.userId) ?? [];
      const dueInPeriod = tasks.filter(
        (task) => task.deadlineKey && task.deadlineKey >= request.startDate && task.deadlineKey <= request.endDate
      ).length;

      if (overlaps.length === 0 && (!isDesigner || tasks.length === 0)) return null;
      return {
        overlaps,
        activeTasks: isDesigner ? tasks.length : null,
        dueInPeriod: isDesigner ? dueInPeriod : 0,
      };
    },
    [absencesWithPending, canManageAbsences, memberById, requesterTasks]
  );

  /**
   * Свої записи — той самий напрямок, що й у черзі погоджень: свіже зверху.
   * Разом із чергою це одна вкладка з одним правилом, а не два протилежні.
   */
  const myAbsences = useMemo(
    () => sortAbsencesByNewest(absencesWithPending.filter((absence) => absence.userId === userId)),
    [absencesWithPending, userId]
  );

  /** Скільки моїх заявок на розгляді припадає не на показаний рік. */
  const myPendingOutsideYear = useMemo(
    () =>
      myAbsences.filter(
        (absence) => absence.status === "pending" && Number(absence.startDate.slice(0, 4)) !== year
      ).length,
    [myAbsences, year]
  );

  const myBalance = useMemo(
    () => (userId ? (balances.get(userId) ?? fallbackBalance(userId)) : null),
    [balances, userId]
  );

  const awayToday = useMemo(
    () =>
      activeMembers
        .filter((member) => {
          const absence = absenceTodayByUser.get(member.userId);
          // «З дому» — не відсутність: людина працює, у списку їй не місце.
          return absence ? !isPresenceKind(absence.kind) : false;
        })
        .map((member) => ({ member, absence: absenceTodayByUser.get(member.userId)! })),
    [activeMembers, absenceTodayByUser]
  );

  /** Хто сьогодні працює з дому — окремий рядок під списком відсутніх. */
  const wfhToday = useMemo(
    () =>
      activeMembers.filter((member) => {
        const absence = absenceTodayByUser.get(member.userId);
        return absence ? isPresenceKind(absence.kind) : false;
      }),
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
      const todaysAbsence = absenceTodayByUser.get(member.userId);
      const awayNow = Boolean(todaysAbsence && !isPresenceKind(todaysAbsence.kind));
      if (peopleFilter === "away" && !awayNow) return false;
      if (peopleFilter === "present" && (member.inactive || awayNow)) return false;
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
      absence: toAvatarAbsence(member.absenceToday),
      card: toPersonHoverCardData(member, {
        online: member.online,
        lastSeenLabel: member.inactive ? null : formatPresenceText(member.lastSeenAt, member.online),
        birthdayToday: member.birthdayInsight?.daysUntil === 0,
        inactive: member.inactive,
      }),
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
      /** У свята людини немає — тоді рядок показує іконку без аватарки. */
      userId: string | null;
      type: keyof typeof EVENT_TONE;
      title: string;
      caption: string;
      dateLabel: string;
      daysUntil: number;
    }> = [];

    activeMembers.forEach((member) => {
      const birthday = member.birthdayInsight;
      if (birthday && birthday.daysUntil <= 45) {
        events.push({
          id: `b:${member.userId}`,
          userId: member.userId,
          type: "birthday",
          title: member.label,
          caption: birthday.daysUntil === 0 ? "День народження — сьогодні" : "День народження",
          dateLabel: formatShort(addDaysKey(todayKey, birthday.daysUntil)),
          daysUntil: birthday.daysUntil,
        });
      }
      const anniversary = member.anniversaryInsight;
      if (anniversary && anniversary.daysUntil <= 45) {
        events.push({
          id: `a:${member.userId}`,
          userId: member.userId,
          type: "anniversary",
          title: member.label,
          caption: anniversary.label,
          dateLabel: formatShort(addDaysKey(todayKey, anniversary.daysUntil)),
          daysUntil: anniversary.daysUntil,
        });
      }
      const absence = absenceTodayByUser.get(member.userId);
      // «Повертається з дому» — нонсенс: людина й не зникала.
      if (absence && !isPresenceKind(absence.kind)) {
        const back = addDaysKey(absence.endDate, 1);
        const daysUntil = eachDateKey(todayKey, back).length - 1;
        if (daysUntil >= 0 && daysUntil <= 45) {
          events.push({
            id: `r:${member.userId}`,
            userId: member.userId,
            type: "return",
            title: member.label,
            caption: `Повертається з ${TEAM_ABSENCE_KIND_LABELS[absence.kind].toLowerCase()}`,
            dateLabel: formatShort(back),
            daysUntil,
          });
        }
      }
    });

    // Свята — теж подія команди: «через 3 тижні День Незалежності» рятує від
    // планування дедлайну на день, коли половини людей немає.
    upcomingHolidays(holidayNames, todayKey, 3).forEach((holiday) => {
      const daysUntil = eachDateKey(todayKey, holiday.dateKey).length - 1;
      if (daysUntil < 0 || daysUntil > 45) return;
      // Свято не означає вихідний: буває, що в цей день команда працює.
      // Підпис бере це з календаря, а не припускає — інакше сторінка каже
      // «не робочий» там, де насправді робочий, і люди планують навпаки.
      const isWorkingHoliday = exceptions.get(holiday.dateKey) === true;
      events.push({
        id: `h:${holiday.dateKey}`,
        userId: null,
        type: "holiday",
        title: holiday.name,
        caption: isWorkingHoliday
          ? daysUntil === 0
            ? "Свято — сьогодні, але робочий день"
            : "Святковий, але робочий день"
          : daysUntil === 0
            ? "Свято — сьогодні"
            : "Святковий день, вихідний",
        dateLabel: formatShort(holiday.dateKey),
        daysUntil,
      });
    });

    // Стелю тримає кнопка «ще N», а не обрізання: інакше лічильник у шапці
    // брехав би, показуючи 8 замість справжньої кількості.
    return events.sort((a, b) => a.daysUntil - b.daysUntil).slice(0, 20);
  }, [activeMembers, absenceTodayByUser, exceptions, holidayNames, todayKey]);

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
          // Запис І сповіщення робить сервер одним викликом: раніше слав їх
          // браузер, і закрита відразу вкладка лишала заявку без адресата.
          await createOwnAbsenceRequest({
            startDate: value.startDate,
            endDate: value.endDate,
            kind,
            comment: value.comment.trim() || null,
          });

          toast.success(kind === "sick_leave" ? "Лікарняний зафіксовано" : "Заявку надіслано");
          setAbsenceDialogOpen(false);
          await reloadAbsenceData();
          return;
        }

        if (absenceEditingId) {
          await updateTeamAbsence({
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
            userId: value.userId,
            startDate: value.startDate,
            endDate: value.endDate,
            kind: value.kind,
            comment: value.comment.trim() || null,
          });
          toast.success("Відсутність додано");
        }
        setAbsenceDialogOpen(false);
        setAbsenceEditingId(null);
        await reloadAbsenceData();
      } catch (error) {
        console.error("[team] absence save failed", error);
        // Заявка ходить через нашу функцію — там текст відмови вже людський
        // («лікарняних на рік лишилось N»), і саме він каже, що робити далі.
        // Ручне ж внесення падає сирою помилкою Postgres, її не показуємо.
        const ownRequest = absenceDialogMode === "request" && !absenceEditingId;
        toast.error(
          ownRequest && error instanceof Error && error.message
            ? error.message
            : "Не вдалося зберегти відсутність"
        );
      } finally {
        setAbsenceSaving(false);
      }
    },
    [absenceDialogMode, absenceEditingId, reloadAbsenceData, workspaceId]
  );

  const handleAbsenceDelete = useCallback(
    async (absence: TeamAbsence) => {
      if (!workspaceId) return;
      setAbsenceDeletingId(absence.id);
      try {
        await deleteTeamAbsence(absence.id);
        toast.success("Відсутність видалено");
        await reloadAbsenceData();
      } catch (error) {
        console.error("[team] absence delete failed", error);
        // Причину показуємо: без неї «не вдалося» однаково виглядає і коли немає
        // прав, і коли ендпойнта просто немає (локальний npm run dev).
        toast.error("Не вдалося видалити відсутність", {
          description: error instanceof Error ? error.message : undefined,
        });
      } finally {
        setAbsenceDeletingId(null);
      }
    },
    [reloadAbsenceData, workspaceId]
  );

  // Видалення з діалогу редагування: сам запис бере зі стану, а не з аргументу —
  // діалог знає лише «видали те, що зараз редагую». Після успіху закривається,
  // бо редагувати вже нічого.
  const handleAbsenceDeleteFromDialog = useCallback(async () => {
    // Шукаємо і серед заявок поза роком: у чергу погоджень тепер потрапляють
    // заявки на наступний рік, і в журналі поточного їх немає (REQ-22).
    const target = absencesWithPending.find((absence) => absence.id === absenceEditingId);
    if (!target) return;
    await handleAbsenceDelete(target);
    setAbsenceDialogOpen(false);
    setAbsenceEditingId(null);
  }, [absencesWithPending, absenceEditingId, handleAbsenceDelete]);

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
            // Сама людина виключена навмисно: цей блок відповідає на питання
            // «чи не лишимось без рук», а не «чи не подаю я вдруге». Власний
            // конфлікт показує окремий рядок — findOwnConflict нижче.
            // «З дому» — теж не перетин: руки на місці.
            absence.userId !== forUserId &&
            !isPresenceKind(absence.kind) &&
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
   * ВЛАСНИЙ конфлікт: у цієї людини вже є запис, що перетинає ці дати.
   *
   * Саме його бракувало, коли Ілля подав ту саму відпустку двічі за 32
   * секунди: блок перетинів каже про КОЛЕГ і свого автора виключає, тож
   * власна щойно подана заявка ніде не світилась.
   */
  const findOwnConflict = useCallback(
    ({ userId: forUserId, startDate, endDate }: { userId: string; startDate: string; endDate: string }) => {
      const hit = liveAbsences.find(
        (absence) =>
          absence.userId === forUserId &&
          absence.startDate <= endDate &&
          absence.endDate >= startDate
      );
      if (!hit) return null;
      return {
        kindLabel: TEAM_ABSENCE_KIND_LABELS[hit.kind],
        rangeLabel: formatRange(hit),
        pending: hit.status === "pending",
        exact: hit.startDate === startDate && hit.endDate === endDate,
      };
    },
    [liveAbsences]
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
          <div className="flex w-full items-center gap-2 lg:w-auto">
          <SegmentedGroup className={cn(SEGMENTED_GROUP, "w-full lg:w-auto")}>
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
          </SegmentedGroup>

          {/* Перемикач ВИДУ — ОКРЕМА група, а не хвіст вкладок.
              Плашка в групі одна, тож усередині вкладок іконка активного
              виду лишалась би без підсвітки: перша активна кнопка («Люди»)
              забирала б плашку собі. Плюс так чесніше семантично — це два
              різні перемикачі, а не один із п'яти станів. */}
          {tab === "people" && canManageAbsences ? (
            <SegmentedGroup className={cn(SEGMENTED_GROUP, "shrink-0 gap-0.5")}>
              <Button
                variant="segmented"
                size="xs"
                aria-pressed={peopleView === "cards"}
                onClick={() => setPeopleView("cards")}
                className={cn(SEGMENTED_TRIGGER, "w-9 flex-none px-0")}
                title="Картки"
                aria-label="Показати картками"
              >
                <LayoutGrid className="h-4 w-4" aria-hidden />
              </Button>
              <Button
                variant="segmented"
                size="xs"
                aria-pressed={peopleView === "balances"}
                onClick={() => setPeopleView("balances")}
                className={cn(SEGMENTED_TRIGGER, "w-9 flex-none px-0")}
                title="Баланси таблицею"
                aria-label="Показати баланси таблицею"
              >
                <Rows3 className="h-4 w-4" aria-hidden />
              </Button>
            </SegmentedGroup>
          ) : null}
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
                <Button
                  variant="outline"
                  onClick={() => setHolidayDialogOpen(true)}
                  className={cn(TOOLBAR_ACTION_BUTTON, "gap-2")}
                >
                  <PartyPopper className="h-4 w-4" aria-hidden />
                  Свята
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
              <ToolbarFilterSelect
                value={roleFilter}
                onValueChange={setRoleFilter}
                neutralValue="all"
                className="sm:w-[190px]"
                options={[
                  { value: "all", label: "Усі ролі" },
                  ...roleOptions.map((option) => ({ value: option.value, label: option.label })),
                ]}
              />
              <ToolbarFilterSelect
                value={peopleFilter}
                onValueChange={(next) => setPeopleFilter(next as PeopleFilter)}
                neutralValue="all"
                className="sm:w-[170px]"
                options={[
                  { value: "all", label: "Усі статуси" },
                  { value: "present", label: "На місці" },
                  { value: "away", label: "Відсутні" },
                ]}
              />
              {/* Сортування — без neutralValue: воно нічого не ховає і не буває
                  вимкненим, тож постійна підсвітка нічого б не означала. */}
              <ToolbarFilterSelect
                value={sortMode}
                onValueChange={(next) => setSortMode(next as SortMode)}
                className="sm:w-[190px]"
                options={[
                  { value: "presence", label: "За присутністю" },
                  { value: "name", label: "За іменем" },
                  { value: "tenure", label: "За стажем" },
                  { value: "birthday", label: "За днем народження" },
                ]}
              />
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
      peopleView,
      resetFilters,
      roleFilter,
      roleOptions,
      search,
      setTab,
      sortMode,
      tab,
      userId,
    ]
  );

  usePageHeaderActions(headerActions, [headerActions]);

  if (loading || showSkeleton) return <PageLoading />;

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
                  <AbsenceBalanceMeters
                    balance={myBalance}
                    entries={userId ? balanceEntriesByUser.get(userId) : undefined}
                    year={year}
                  />
                  <p className="mt-3 border-t border-border/40 pt-2.5 text-2xs text-muted-foreground">
                    Відпустка міряється календарними днями — вихідні всередині неї
                    квоту списують. Day-off і лікарняний рахуються робочими. Свята не
                    списують нічого.
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
                  <EmptyRow
                    icon={CheckCircle2}
                    title={wfhToday.length > 0 ? "Відсутніх немає" : "Вся команда на місці"}
                    compact
                  />
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
                      <AbsenceKindChip kind={absence.kind} size="sm" />
                    </div>
                  ))
                )}
                              {wfhToday.length > 0 ? (
                  <div className="flex items-center gap-2 border-t border-border/40 pt-2.5 text-2xs">
                    <span className={cn("grid h-5 w-5 shrink-0 place-items-center rounded-full border", toneBadgeClass.success)}>
                      <House className="h-2.5 w-2.5" aria-hidden />
                    </span>
                    <span className="text-muted-foreground">З дому:</span>
                    <span className="min-w-0 flex-1 truncate font-semibold text-foreground">
                      {wfhToday.map((member) => member.label.split(" ")[0]).join(" · ")}
                    </span>
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <CalendarDays className="h-4 w-4 text-primary" aria-hidden />
                  Найближчі події
                  {upcomingEvents.length > 0 ? (
                    <span className="ml-auto text-xs font-normal tabular-nums text-muted-foreground">
                      {upcomingEvents.length}
                    </span>
                  ) : null}
                </CardTitle>
              </CardHeader>
              {/* Показуємо рівно EVENTS_PREVIEW_COUNT, решту віддаємо календарю:
                  список тут росте разом із командою, і без стелі картка ставала
                  вдвічі вищою за сусідні (правка CEO 2026-08-03). */}
              <CardContent className="px-0 pb-0">
                {upcomingEvents.length === 0 ? (
                  <div className="px-5 pb-4">
                    <EmptyRow icon={CalendarDays} title="Найближчим часом подій немає" compact />
                  </div>
                ) : (
                  <>
                    <div className="divide-y divide-border/30 px-5">
                      {upcomingEvents.slice(0, EVENTS_PREVIEW_COUNT).map((event) => {
                        const Icon = EVENT_ICONS[event.type];
                        const member = event.userId ? memberById.get(event.userId) : null;
                        const tone = EVENT_TONE[event.type];
                        return (
                          <div key={event.id} className="flex items-center gap-2 py-1.5">
                            <span className="relative shrink-0">
                              {event.userId ? (
                                <>
                                  <AvatarBase
                                    src={member?.avatarDisplayUrl}
                                    name={event.title}
                                    fallback={member ? getInitialsFromName(member.label, member.email) : "•"}
                                    assetVariant="xs"
                                    size={24}
                                  />
                                  {/* Кольорова іконка-коробка на аватарі: тип події
                                      видно одразу, але вона не фарбує весь рядок. */}
                                  <span
                                    className={cn(
                                      "absolute -bottom-0.5 -right-0.5 grid h-[13px] w-[13px] place-items-center rounded-full border",
                                      toneBadgeClass[tone]
                                    )}
                                  >
                                    <Icon className="h-2 w-2" aria-hidden />
                                  </span>
                                </>
                              ) : (
                                // У свята людини немає. Порожній сірий кружечок на
                                // її місці читався як незавантажена аватарка, тож
                                // ставимо саму іконку події в кольорі типу.
                                <span
                                  className={cn(
                                    "grid h-6 w-6 place-items-center rounded-full border",
                                    toneBadgeClass[tone]
                                  )}
                                >
                                  <Icon className="h-3 w-3" aria-hidden />
                                </span>
                              )}
                            </span>
                            <span className="min-w-0 flex-1 truncate text-2xs">
                              <b className="font-semibold text-foreground">{event.title}</b>
                              <span className="text-muted-foreground"> · {event.caption}</span>
                            </span>
                            <span className="shrink-0 text-2xs tabular-nums text-muted-foreground">
                              {formatEventWhen(event.daysUntil, event.dateLabel)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    {upcomingEvents.length > EVENTS_PREVIEW_COUNT ? (
                      <button
                        type="button"
                        onClick={() => setTab("calendar")}
                        className="mt-1 flex w-full items-center justify-center gap-1 border-t border-border/40 py-2 text-2xs font-semibold text-primary transition-colors hover:bg-muted/40"
                      >
                        Ще {upcomingEvents.length - EVENTS_PREVIEW_COUNT}{" "}
                        {pluralEvents(upcomingEvents.length - EVENTS_PREVIEW_COUNT)} →
                      </button>
                    ) : (
                      <div className="pb-4" />
                    )}
                  </>
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
                holidayNames={holidayNames}
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
          ) : canManageAbsences && peopleView === "balances" ? (
            <Card>
              <CardContent className="px-0 py-0">
                <TeamBalancesTable
                  people={filteredMembers.map((member) => ({
                    userId: member.userId,
                    name: member.label,
                    roleLabel: formatRoleLabel(member.jobRole),
                    avatarUrl: member.avatarDisplayUrl,
                    initials: getInitialsFromName(member.label, member.email),
                    absenceToday: absenceTodayByUser.get(member.userId) ?? null,
                  }))}
                  balances={balances}
                  entriesByUser={balanceEntriesByUser}
                  year={year}
                  onOpenPerson={(personId) => openAbsenceDialog({ userId: personId, mode: "manage" })}
                />
              </CardContent>
            </Card>
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
                  presenceExact: member.inactive ? null : formatLastSeenExact(member.lastSeenAt),
                  absence: toAvatarAbsence(member.absenceToday),
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
                    balanceEntries={showBalance ? balanceEntriesByUser.get(member.userId) : undefined}
                    year={year}
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
              {(["vacation", "sick_leave", "day_off", "wfh"] as TeamAbsenceKind[]).map((kind) => (
                <AbsenceKindChip key={kind} kind={kind} size="sm" />
              ))}
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="inline-block h-2.5 w-4 rounded-sm border border-dashed border-border bg-muted"
                  aria-hidden
                />
                На погодженні
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="inline-block h-2.5 w-4 rounded-sm border border-border/50 bg-[hsl(var(--festive-soft)/0.55)] dark:bg-[hsl(var(--festive-solid)/0.16)]"
                  aria-hidden
                />
                Свято
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-4 rounded-sm bg-muted" aria-hidden />
                Вихідний
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
              holidayNames={holidayNames}
              todayKey={todayKey}
              currentUserId={userId}
              canPickForOthers={canManageAbsences}
              onPickDay={handlePlannerPick}
              onOpenAbsence={canManageAbsences ? (absence) => openAbsenceDialog({ absence }) : undefined}
            />
            <p className="border-t border-border/40 px-5 py-3 text-2xs text-muted-foreground">
              Сірі стовпчики — вихідні та свята. Свята квоту не списують ніколи;
              вихідні всередині відпустки — списують, бо відпустка міряється
              календарними днями.
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
                  avatarUrl={memberById.get(absence.userId)?.avatarDisplayUrl}
                  initials={(() => {
                    const m = memberById.get(absence.userId);
                    return m ? getInitialsFromName(m.label, m.email) : undefined;
                  })()}
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
          {/* Рік цієї вкладки задається стрілками у «Календарі» — з самої
              вкладки цього не видно ніяк. Поки він поточний, мовчимо; щойно
              з'їхав — кажемо прямо й даємо чим повернутись (REQ-22). */}
          {year !== currentYear ? (
            <div
              className={cn(
                "flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border px-3 py-2 text-2xs",
                toneBadgeClass.warning
              )}
            >
              <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>
                Записи нижче — за {year} рік: його вибрано стрілками у вкладці «Календар».
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-2xs"
                onClick={() => setMonthOffset(0)}
              >
                Повернутись до {currentYear}
              </Button>
            </div>
          ) : null}
          {canManageAbsences ? (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <CalendarRange className="h-4 w-4 text-primary" aria-hidden />
                  На погодженні
                  {/* Роком не обмежено навмисно — на відміну від двох карток
                      нижче. Підпис це проговорює, бо вкладка загалом річна. */}
                  <span className="text-2xs font-normal text-muted-foreground">за всі роки</span>
                  <span className="ml-auto text-xs font-normal tabular-nums text-muted-foreground">
                    {pendingRequests.length}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {pendingRequests.length === 0 ? (
                  <EmptyRow
                    icon={CheckCircle2}
                    title="Заявок на погодженні немає"
                    hint="Щойно хтось попросить відпустку — вона зʼявиться тут."
                  />
                ) : (
                  <div className="divide-y divide-border/40">
                    {pendingRequests.map((absence) => {
                      const member = memberById.get(absence.userId);
                      const requesterPrivileged =
                        (member?.accessRole ?? "").toLowerCase() === "owner" ||
                        (member?.jobRole ?? "").toLowerCase() === "seo";
                      const decidableByViewer =
                        canManageAbsences &&
                        absence.userId !== userId &&
                        (viewerIsOwner || !requesterPrivileged);
                      return (
                        <AbsenceRow
                          key={absence.id}
                          absence={absence}
                          name={member?.label ?? "—"}
                          avatarUrl={member?.avatarDisplayUrl}
                          initials={member ? getInitialsFromName(member.label, member.email) : undefined}
                          exceptions={exceptions}
                          year={year}
                          canManage={canManageAbsences}
                          deleting={absenceDeletingId === absence.id}
                          onEdit={() => openAbsenceDialog({ absence })}
                          onDelete={() => handleAbsenceDelete(absence)}
                          decisionComment={decisionComments.get(absence.id) ?? null}
                          balance={balances.get(absence.userId) ?? null}
                          canDecide={decidableByViewer}
                          decisionNote={
                            !decidableByViewer && absence.userId !== userId && requesterPrivileged
                              ? "вирішує власник"
                              : undefined
                          }
                          deciding={decidingId === absence.id}
                          onApprove={() => void handleDecide(absence, "approved")}
                          onDecline={() => setDeclineTarget(absence)}
                          decideContext={decideContextFor(absence)}
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
                {/* Власні заявки на розгляді показуємо за будь-який рік: інакше
                    людина не бачила б і не могла скасувати те, що подала на
                    січень, поки вкладка стоїть на грудні. */}
                {myPendingOutsideYear > 0 ? (
                  <span className="text-2xs font-normal text-muted-foreground">
                    + {myPendingOutsideYear} на розгляді поза роком
                  </span>
                ) : null}
                <span className="ml-auto text-xs font-normal tabular-nums text-muted-foreground">
                  {myAbsences.length}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {myAbsences.length === 0 ? (
                <EmptyRow
                  icon={CalendarDays}
                  title="За цей рік відсутностей не записано"
                  hint="Відпустку чи day-off можна попросити кнопкою вгорі."
                  actionLabel="Запросити відсутність"
                  onAction={() => openAbsenceDialog({ mode: "request", userId: userId ?? undefined })}
                />
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
                  <EmptyRow icon={CalendarDays} title="За цей рік відсутностей не записано" />
                ) : (
                  <div className="divide-y divide-border/40">
                    {(absences ?? []).map((absence) => (
                      <AbsenceRow
                        key={absence.id}
                        absence={absence}
                        name={memberById.get(absence.userId)?.label ?? "—"}
                        avatarUrl={memberById.get(absence.userId)?.avatarDisplayUrl}
                        initials={(() => {
                          const m = memberById.get(absence.userId);
                          return m ? getInitialsFromName(m.label, m.email) : undefined;
                        })()}
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
          holidayNames={holidayNames}
          people={activeMembers.map((member) => ({
            userId: member.userId,
            name: member.label,
            roleLabel: formatRoleLabel(member.jobRole),
            avatarUrl: member.avatarDisplayUrl,
            initials: getInitialsFromName(member.label, member.email),
          }))}
          canPickPerson={canManageAbsences && absenceDialogMode === "manage"}
          balanceOf={(id) => balances.get(id) ?? null}
          exceptions={exceptions}
          saving={absenceSaving}
          editing={Boolean(absenceEditingId)}
          mode={absenceDialogMode}
          approverLabel={approverLabel}
          todayKey={todayKey}
          findOverlaps={findOverlaps}
          findOwnConflict={findOwnConflict}
          editingId={absenceEditingId}
          onSubmit={handleAbsenceSubmit}
          // Видаляти може лише той, хто взагалі керує відсутностями (owner/SEO) —
          // це той самий набір, що дозволяють RLS-політики team_absences_delete.
          onDelete={canManageAbsences && absenceEditingId ? handleAbsenceDeleteFromDialog : undefined}
          deleting={Boolean(absenceEditingId) && absenceDeletingId === absenceEditingId}
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

      <HolidayEditorDialog
        open={holidayDialogOpen}
        onOpenChange={setHolidayDialogOpen}
        workspaceId={workspaceId}
        year={year}
        currentUserId={userId ?? null}
        // Свята міняють і баланси, і сітку планера — перезавантажуємо все.
        onSaved={() => void reloadAbsenceData()}
      />
    </div>
  );
}

/**
 * Порожній стан усередині картки.
 *
 * Три картки поспіль із сірим рядком тексту читались як помилка завантаження —
 * тиха іконка й підказка дії знімають цю двозначність.
 */
function EmptyRow({
  icon: Icon,
  title,
  hint,
  actionLabel,
  onAction,
  compact,
}: {
  icon: LucideIcon;
  title: string;
  hint?: string;
  actionLabel?: string;
  onAction?: () => void;
  compact?: boolean;
}) {
  return (
    <div className={cn("flex flex-col items-center text-center", compact ? "gap-1 py-3" : "gap-1.5 py-6")}>
      <Icon className={cn("text-muted-foreground/50", compact ? "h-4 w-4" : "h-5 w-5")} aria-hidden />
      <div className="text-xs font-medium text-muted-foreground">{title}</div>
      {hint ? <div className="max-w-[38ch] text-2xs text-muted-foreground/80">{hint}</div> : null}
      {actionLabel && onAction ? (
        <Button variant="outline" size="sm" className="mt-1.5 h-8" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
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
  avatarUrl,
  initials,
  decisionComment,
  balance,
  canDecide,
  decisionNote,
  deciding,
  onApprove,
  onDecline,
  canCancel,
  cancelling,
  onCancel,
  decideContext,
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
  avatarUrl?: string | null;
  initials?: string;
  /** Причина рішення — приходить окремим RPC, видна лише заявнику й owner/SEO. */
  decisionComment?: string | null;
  /** Баланс заявника — щоб рішення приймалось із цифрами перед очима. */
  balance?: AbsenceBalance | null;
  canDecide?: boolean;
  /** Чому кнопок немає: напр. «вирішує власник» — для заявок SEO очима SEO. */
  decisionNote?: string;
  deciding?: boolean;
  onApprove?: () => void;
  onDecline?: () => void;
  canCancel?: boolean;
  cancelling?: boolean;
  onCancel?: () => void;
  /** Перетини з іншими відсутностями + навантаження заявника — для рішення. */
  decideContext?: AbsenceDecideContext | null;
}) {
  // «Інше» і «з дому» квоти не мають — рахуємо робочими днями, щоб показати
  // обсяг («3 роб. дн.»), але рядка «залишиться N із M» для них не буде.
  const quotaKind = isQuotaAbsenceKind(absence.kind) ? absence.kind : "day_off";
  // Рік беремо з самої відсутності, а не з курсора вкладки: у черзі погоджень
  // тепер бувають заявки на наступний рік, і з чужим роком вони показували б
  // «0 днів · квота не списується» (REQ-22).
  const rowYear = Number(absence.startDate.slice(0, 4)) || year;
  const chargedDays = countQuotaDaysInYear(quotaKind, absence, rowYear, exceptions);
  const unitLabel = ABSENCE_QUOTA_UNIT_LABEL[ABSENCE_QUOTA_UNIT[quotaKind]];
  const restOnly = chargedDays === 0;
  // Баланс порахований для завантаженого року. Для заявки на інший рік він
  // просто не про неї — мовчати чесніше, ніж показати чуже число.
  const bucket =
    balance && rowYear === year && isQuotaAbsenceKind(absence.kind) ? balance[absence.kind] : null;
  const submittedLabel = formatAbsenceSubmittedAgo(absence.createdAt);
  const waitingDays = absence.status === "pending" ? absenceWaitingDays(absence.createdAt) : null;
  // Три доби — та межа, після якої заявка вже не «щойно прилетіла». Свіжіші
  // вгорі, тож без цієї позначки задавнена мовчки з'їжджала б у хвіст.
  const waitingTooLong = waitingDays !== null && waitingDays >= 3;

  return (
    <div className="group flex items-center gap-3 py-2.5">
      {hideName ? null : (
        <AvatarBase
          src={avatarUrl}
          name={name}
          fallback={initials ?? getInitialsFromName(name)}
          assetVariant="xs"
          size={32}
          className="shrink-0"
        />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 text-xs">
          {hideName ? null : <span className="font-semibold">{name}</span>}
          <span className="font-medium tabular-nums">{formatRange(absence)}</span>
          <span className="text-muted-foreground">
            {restOnly ? "квота не списується" : `${chargedDays} ${pluralDays(chargedDays)} · ${unitLabel}`}
          </span>
          {/* Дата подання — те, за чим список і впорядкований. Без неї порядок
              «свіжі вгорі» виглядав би випадковим. */}
          {submittedLabel ? (
            <span className={cn("text-muted-foreground", waitingTooLong && toneTextClass.warning)}>
              · {submittedLabel}
            </span>
          ) : null}
        </div>
        {bucket && absence.status === "pending" ? (
          <div className="mt-0.5 text-2xs text-muted-foreground">
            після погодження залишиться{" "}
            <b className="font-medium tabular-nums text-foreground">
              {Math.max(0, bucket.remaining - chargedDays)}
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
        {decideContext ? (
          <div className="mt-1 space-y-0.5">
            {decideContext.overlaps.length > 0 ? (
              <div className={cn("flex items-start gap-1 text-2xs", toneTextClass.warning)}>
                <CalendarRange className="mt-px h-3 w-3 shrink-0" aria-hidden />
                <span className="min-w-0">У ці дні також: {decideContext.overlaps.join(" · ")}</span>
              </div>
            ) : null}
            {typeof decideContext.activeTasks === "number" ? (
              <div className="text-2xs text-muted-foreground">
                Активних задач:{" "}
                <b className="font-medium tabular-nums text-foreground">{decideContext.activeTasks}</b>
                {decideContext.dueInPeriod > 0 ? (
                  <>
                    {" "}
                    · дедлайнів у період:{" "}
                    <b className={cn("font-medium tabular-nums", toneTextClass.danger)}>
                      {decideContext.dueInPeriod}
                    </b>
                  </>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      <AbsenceKindChip kind={absence.kind} size="sm" className="hidden sm:inline-flex" />
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
      {!canDecide && decisionNote && absence.status === "pending" ? (
        <span className="shrink-0 text-2xs text-muted-foreground/80">{decisionNote}</span>
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
      {/* На тачі hover не існує, тож до sm дії видно завжди; 44px — мінімальна
          зона натискання, тому кнопка більша за саму іконку. */}
      {canManage ? (
        <div className="flex shrink-0 items-center gap-0.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100">
          <Button variant="ghost" size="icon" className="h-11 w-11 sm:h-9 sm:w-9" onClick={onEdit} aria-label="Редагувати">
            <Pencil className="h-3.5 w-3.5" aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-11 w-11 text-destructive sm:h-9 sm:w-9"
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
