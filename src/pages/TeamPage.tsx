import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowUpDown,
  Award,
  Cake,
  CalendarDays,
  CalendarOff,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Mail,
  Pencil,
  Phone,
  Plane,
  Plus,
  Thermometer,
  Trash2,
  Undo2,
  UserCheck,
  UserMinus,
  Users,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/auth/AuthProvider";
import { AvatarBase } from "@/components/app/avatar-kit";
import { AppPageLoader } from "@/components/app/AppPageLoader";
import { UnifiedPageToolbar } from "@/components/app/headers/UnifiedPageToolbar";
import { ToolbarMeta, ToolbarSearch } from "@/components/app/headers/toolbarPrimitives";
import { usePageHeaderActions } from "@/components/app/page-header-actions";
import { TOOLBAR_CONTROL } from "@/components/ui/controlStyles";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyStateCard } from "@/components/ui/empty-state-card";
import { HoverCopyText } from "@/components/ui/hover-copy-text";
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
  getEmploymentDurationDays,
  getWorkAnniversaryInsight,
  isInactiveEmployment,
  type BirthdayInsight,
  type WorkAnniversaryInsight,
} from "@/lib/employment";
import {
  getTeamAvailabilityBadgeClass,
  getTeamAvailabilityLabel,
  normalizeTeamAvailabilityStatus,
  type TeamAvailabilityStatus,
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
import {
  toneBadgeClass,
  toneDotClass,
  toneIconBoxClass,
  toneSubtleClass,
  toneTextClass,
  type Tone,
} from "@/lib/statusTones";
import { getInitialsFromName } from "@/lib/userName";
import { listWorkspaceMembersForDisplay, type WorkspaceMemberDisplayRow } from "@/lib/workspaceMemberDirectory";
import { resolveWorkspaceId } from "@/lib/workspace";

type TeamEventType = "birthday" | "anniversary" | "return";

type TeamEvent = {
  id: string;
  type: TeamEventType;
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

type EnrichedMember = WorkspaceMemberDisplayRow & {
  availabilityStatus: TeamAvailabilityStatus;
  online: boolean;
  idle: boolean;
  lastSeenAt: string | null;
  inactive: boolean;
  birthdayInsight: BirthdayInsight | null;
  anniversaryInsight: WorkAnniversaryInsight | null;
  tenureDays: number | null;
};

type QuickFilter = "all" | "online" | "away";
type SortMode = "presence" | "name" | "tenure" | "birthday";

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

/** Домен → тон. Класи збираються ТІЛЬКИ через таблиці statusTones. */
const EVENT_TONE: Record<TeamEventType, Tone> = {
  birthday: "warning",
  anniversary: "accent",
  return: "success",
};

const EVENT_ICONS: Record<TeamEventType, LucideIcon> = {
  birthday: Cake,
  anniversary: Award,
  return: Undo2,
};

const ABSENCE_KIND_TONE: Record<TeamAbsenceKind, Tone> = {
  sick_leave: "danger",
  day_off: "info",
  vacation: "warning",
  other: "neutral",
};

/** Тон і іконка «недоступності» на картці людини. */
const AWAY_TONE: Record<Exclude<TeamAvailabilityStatus, "available">, Tone> = {
  vacation: "warning",
  sick_leave: "danger",
  offline: "neutral",
};

const AWAY_ICONS: Record<Exclude<TeamAvailabilityStatus, "available">, LucideIcon> = {
  vacation: Plane,
  sick_leave: Thermometer,
  offline: CalendarOff,
};

const CALENDAR_LEGEND: Array<{ label: string; swatchClass: string }> = [
  { label: TEAM_ABSENCE_KIND_LABELS.sick_leave, swatchClass: TEAM_ABSENCE_KIND_BADGE_CLASSES.sick_leave },
  { label: TEAM_ABSENCE_KIND_LABELS.vacation, swatchClass: TEAM_ABSENCE_KIND_BADGE_CLASSES.vacation },
  { label: TEAM_ABSENCE_KIND_LABELS.day_off, swatchClass: TEAM_ABSENCE_KIND_BADGE_CLASSES.day_off },
  { label: "День народження", swatchClass: toneBadgeClass[EVENT_TONE.birthday] },
  { label: "Річниця", swatchClass: toneBadgeClass[EVENT_TONE.anniversary] },
  { label: "Повернення", swatchClass: toneBadgeClass[EVENT_TONE.return] },
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

/** Компактне «до 28.07» для сайдбару, без року. */
function formatUntilShort(endDate?: string | null) {
  const trimmed = endDate?.trim();
  if (!trimmed) return "";
  return `до ${formatDayMonth(parseDateKey(trimmed))}`;
}

function formatDaysChip(daysUntil: number) {
  return daysUntil === 0 ? "Сьогодні" : `${daysUntil} дн`;
}

/* ------------------------------------------------------------------ */
/* Картка людини                                                       */
/* ------------------------------------------------------------------ */

type MemberRibbon = {
  toneClass: string;
  iconToneClass: string;
  icon: LucideIcon;
  text: string;
  chip?: string;
};

function getMemberRibbon(member: EnrichedMember): MemberRibbon | null {
  if (member.inactive) return null;

  const birthday = member.birthdayInsight;
  if (birthday && birthday.daysUntil === 0) {
    return {
      toneClass: toneSubtleClass[EVENT_TONE.birthday],
      iconToneClass: toneTextClass[EVENT_TONE.birthday],
      icon: Cake,
      text: birthday.ageTurning ? `День народження — ${birthday.ageTurning}` : "День народження",
      chip: "Сьогодні",
    };
  }

  if (member.availabilityStatus !== "available") {
    const status = member.availabilityStatus;
    const range = formatAvailabilityRange(member.availabilityStartDate, member.availabilityEndDate);
    return {
      toneClass: toneSubtleClass[AWAY_TONE[status]],
      iconToneClass: toneTextClass[AWAY_TONE[status]],
      icon: AWAY_ICONS[status],
      text: range ? `${getTeamAvailabilityLabel(status)} · ${range}` : getTeamAvailabilityLabel(status),
    };
  }

  if (birthday && birthday.daysUntil <= 7) {
    return {
      toneClass: toneSubtleClass[EVENT_TONE.birthday],
      iconToneClass: toneTextClass[EVENT_TONE.birthday],
      icon: Cake,
      text: birthday.ageTurning ? `ДН ${birthday.dateLabel} — виповниться ${birthday.ageTurning}` : `ДН ${birthday.dateLabel}`,
      chip: formatDaysChip(birthday.daysUntil),
    };
  }

  const anniversary = member.anniversaryInsight;
  if (anniversary && anniversary.daysUntil <= 7) {
    return {
      toneClass: toneSubtleClass[EVENT_TONE.anniversary],
      iconToneClass: toneTextClass[EVENT_TONE.anniversary],
      icon: Award,
      text: anniversary.label,
      chip: formatDaysChip(anniversary.daysUntil),
    };
  }

  return null;
}

function MemberContactRow({
  icon: Icon,
  value,
  successMessage,
}: {
  icon: LucideIcon;
  value: string;
  successMessage: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" aria-hidden />
      <HoverCopyText
        value={value}
        buttonStyle="inline"
        className="min-w-0 flex-1"
        textClassName="text-xs text-muted-foreground"
        successMessage={successMessage}
      />
    </div>
  );
}

function TeamMemberCard({ member }: { member: EnrichedMember }) {
  const ribbon = getMemberRibbon(member);
  const birthday = member.birthdayInsight;
  const tenure = formatEmploymentDuration(member.startDate);
  const email = member.email?.trim() ?? "";
  const phone = member.phone?.trim() ?? "";
  const isProbation = member.employmentStatus === "probation";

  return (
    <article
      className={cn(
        "group flex h-full flex-col overflow-hidden rounded-inner border border-border/50 bg-card shadow-card",
        "transition-all duration-200 hover:border-border hover:shadow-[var(--shadow-elevated-sm)]"
      )}
    >
      <div className="flex items-start gap-3 p-4 pb-0">
        <AvatarBase
          src={member.avatarDisplayUrl}
          name={member.label}
          fallback={getInitialsFromName(member.label, member.email)}
          assetVariant="md"
          size={46}
          availability={member.availabilityStatus}
          presence={member.online ? "online" : "offline"}
          inactive={member.inactive}
        />
        <div className="min-w-0 flex-1">
          <div
            className={cn(
              "truncate text-sm font-semibold text-foreground",
              member.inactive && "text-muted-foreground line-through"
            )}
          >
            {member.label}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="truncate text-xs text-muted-foreground">{formatRoleLabel(member.jobRole)}</span>
            {isProbation ? (
              <Badge tone="info" size="sm">
                Випробувальний
              </Badge>
            ) : null}
          </div>
          <div className="mt-1.5 flex items-center gap-1.5 text-2xs text-muted-foreground">
            <span
              aria-hidden
              className={cn("h-1.5 w-1.5 shrink-0 rounded-full", member.online ? "tone-dot-success" : "bg-border")}
            />
            <span className="truncate">
              {member.inactive ? "Співпрацю завершено" : formatPresenceText(member.lastSeenAt, member.online)}
            </span>
          </div>
        </div>
      </div>

      {email || phone ? (
        <div className="mt-3 space-y-1 px-4">
          {email ? <MemberContactRow icon={Mail} value={email} successMessage="Email скопійовано" /> : null}
          {phone ? <MemberContactRow icon={Phone} value={phone} successMessage="Номер скопійовано" /> : null}
        </div>
      ) : (
        <div className="mt-3 px-4 text-2xs text-muted-foreground/70">Контактів не вказано</div>
      )}

      <div className="mt-auto grid grid-cols-2 gap-2 px-4 pb-4 pt-3">
        <div className="rounded-[var(--radius)] border border-border/40 bg-muted/20 px-2.5 py-2">
          <div className="text-3xs font-medium uppercase tracking-wide text-muted-foreground">Стаж</div>
          <div className="mt-0.5 truncate text-xs font-semibold tabular-nums text-foreground">{tenure || "—"}</div>
          <div className="truncate text-3xs text-muted-foreground">
            {member.startDate ? `з ${formatEmploymentDate(member.startDate)}` : "дата не вказана"}
          </div>
        </div>
        <div className="rounded-[var(--radius)] border border-border/40 bg-muted/20 px-2.5 py-2">
          <div className="text-3xs font-medium uppercase tracking-wide text-muted-foreground">День народження</div>
          <div className="mt-0.5 truncate text-xs font-semibold tabular-nums text-foreground">
            {birthday ? birthday.dateLabel : "—"}
          </div>
          <div className="truncate text-3xs text-muted-foreground">
            {birthday
              ? birthday.daysUntil === 0
                ? "сьогодні!"
                : `через ${birthday.daysUntil} ${pluralizeDays(birthday.daysUntil)}`
              : "дата не вказана"}
          </div>
        </div>
      </div>

      {ribbon ? (
        <div className={cn("flex items-center gap-2 border-t px-4 py-2", ribbon.toneClass)}>
          <ribbon.icon className={cn("h-3.5 w-3.5 shrink-0", ribbon.iconToneClass)} aria-hidden />
          <span className="min-w-0 flex-1 truncate text-2xs font-medium text-foreground">{ribbon.text}</span>
          {ribbon.chip ? (
            <span className={cn("shrink-0 text-2xs font-semibold tabular-nums", ribbon.iconToneClass)}>
              {ribbon.chip}
            </span>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

/* ------------------------------------------------------------------ */
/* KPI-плитка                                                          */
/* ------------------------------------------------------------------ */

function StatTile({
  label,
  value,
  icon: Icon,
  tone,
  pressed,
  onClick,
  ariaLabel,
  title,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  tone?: Tone;
  pressed?: boolean;
  onClick: () => void;
  ariaLabel: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pressed}
      aria-label={ariaLabel}
      title={title ?? ariaLabel}
      className={cn(
        "rounded-inner border border-border/40 bg-card p-4 text-left shadow-card",
        "transition-all duration-200 hover:border-border hover:shadow-[var(--shadow-elevated-sm)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20",
        tone ? toneSubtleClass[tone] : null,
        pressed && "border-primary/50 ring-1 ring-primary/40"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className={cn("truncate text-sm", tone ? toneTextClass[tone] : "text-muted-foreground")}>{label}</div>
          <div className="mt-2 text-3xl font-semibold tabular-nums tracking-tight text-foreground">{value}</div>
        </div>
        <div
          className={cn(
            "shrink-0 rounded-xl border p-2.5",
            tone ? toneIconBoxClass[tone] : "border-border/60 bg-muted/20"
          )}
        >
          <Icon className={cn("h-5 w-5", tone ? toneTextClass[tone] : "text-muted-foreground")} aria-hidden />
        </div>
      </div>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Сторінка                                                            */
/* ------------------------------------------------------------------ */

export function TeamPage() {
  const { userId, loading, permissions } = useAuth();
  const workspacePresence = useWorkspacePresence();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [availabilityFilter, setAvailabilityFilter] = useState<string>("all");
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("presence");
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

  const enrichedMembers = useMemo<EnrichedMember[]>(() => {
    return members.map((member) => {
      const presence = presenceByUserId.get(member.userId);
      const inactive = isInactiveEmployment(member.employmentStatus);
      return {
        ...member,
        availabilityStatus: normalizeTeamAvailabilityStatus(member.availabilityStatus),
        online: Boolean(presence?.online) && !inactive,
        idle: Boolean(presence?.idle),
        lastSeenAt: presence?.lastSeenAt ?? null,
        inactive,
        birthdayInsight: getBirthdayInsight(member.birthDate),
        anniversaryInsight: getWorkAnniversaryInsight(member.startDate),
        tenureDays: getEmploymentDurationDays(member.startDate),
      };
    });
  }, [members, presenceByUserId]);

  const memberById = useMemo(
    () => new Map(enrichedMembers.map((member) => [member.userId, member])),
    [enrichedMembers]
  );

  /** Активний склад: без завершеної співпраці. KPI та події рахуємо по ньому. */
  const activeMembers = useMemo(() => enrichedMembers.filter((member) => !member.inactive), [enrichedMembers]);
  const onlineCount = useMemo(() => activeMembers.filter((member) => member.online).length, [activeMembers]);
  const awayMembers = useMemo(
    () => activeMembers.filter((member) => member.availabilityStatus !== "available"),
    [activeMembers]
  );

  const roleOptions = useMemo(() => {
    return Array.from(new Set(enrichedMembers.map((member) => member.jobRole).filter(Boolean) as string[]))
      .sort((a, b) => formatRoleLabel(a).localeCompare(formatRoleLabel(b), "uk"))
      .map((role) => ({ value: role, label: formatRoleLabel(role) }));
  }, [enrichedMembers]);

  const filteredMembers = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    const presenceRank = (member: EnrichedMember) =>
      member.availabilityStatus !== "available" ? 2 : member.online ? 0 : 1;

    const list = enrichedMembers.filter((member) => {
      if (roleFilter !== "all" && (member.jobRole ?? "") !== roleFilter) return false;
      if (availabilityFilter !== "all" && member.availabilityStatus !== availabilityFilter) return false;
      if (quickFilter === "online" && !member.online) return false;
      if (quickFilter === "away" && (member.inactive || member.availabilityStatus === "available")) return false;
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
  }, [availabilityFilter, enrichedMembers, quickFilter, roleFilter, search, sortMode]);

  const teamEvents = useMemo(() => {
    const next: TeamEvent[] = [];
    const today = startOfDay(new Date());

    activeMembers.forEach((member) => {
      const birthday = member.birthdayInsight;
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

      const anniversary = member.anniversaryInsight;
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
  }, [activeMembers]);

  const todayEvents = useMemo(() => teamEvents.filter((event) => event.daysUntil === 0), [teamEvents]);
  const upcomingEvents = useMemo(() => teamEvents.filter((event) => event.daysUntil > 0).slice(0, 8), [teamEvents]);
  const extraUpcomingCount = useMemo(
    () => Math.max(0, teamEvents.filter((event) => event.daysUntil > 0).length - 8),
    [teamEvents]
  );

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

  const openCreateAbsenceDialog = useCallback(
    (presetDate?: string) => {
      const today = new Date();
      const inSelectedMonth =
        today.getFullYear() === selectedMonth.getFullYear() && today.getMonth() === selectedMonth.getMonth();
      const defaultDate = presetDate ?? toDateInputValue(inSelectedMonth ? today : selectedMonth);
      setAbsenceEditingId(null);
      setAbsenceDraftUserId("");
      setAbsenceDraftStart(defaultDate);
      setAbsenceDraftEnd(defaultDate);
      setAbsenceMultiDay(false);
      setAbsenceDraftKind("sick_leave");
      setAbsenceDraftComment("");
      setAbsenceDialogOpen(true);
    },
    [selectedMonth]
  );

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

  const todayLabel = useMemo(() => {
    const label = new Date().toLocaleDateString("uk-UA", { weekday: "long", day: "numeric", month: "long" });
    return `${label.charAt(0).toUpperCase()}${label.slice(1)}`;
  }, []);

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
          .map((event) => ({ id: event.id, label: event.title, toneClass: toneBadgeClass[EVENT_TONE[event.type]] })),
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
        isWeekend: index % 7 >= 5,
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

  const headerActions = useMemo(
    () => (
      <UnifiedPageToolbar
        topLeft={
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-border/60 bg-muted/30">
              <Users className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <div className="text-lg font-semibold text-foreground">Команда</div>
              <div className="text-sm text-muted-foreground">
                Присутність, журнал відсутностей та найближчі події.
              </div>
            </div>
          </div>
        }
        topRight={
          <>
            <Button type="button" variant="outline" className="gap-2" onClick={() => setCalendarOpen(true)}>
              <CalendarDays className="h-4 w-4" />
              Календар
            </Button>
            {canManageAbsences ? (
              <Button type="button" className="gap-2" onClick={() => openCreateAbsenceDialog()}>
                <Plus className="h-4 w-4" />
                Відсутність
              </Button>
            ) : null}
          </>
        }
        search={<ToolbarSearch value={search} onChange={setSearch} placeholder="Пошук по команді..." />}
        filters={
          <>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className={cn(TOOLBAR_CONTROL, "w-full sm:w-[180px]")}>
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
              <SelectTrigger className={cn(TOOLBAR_CONTROL, "w-full sm:w-[180px]")}>
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
          </>
        }
        meta={<ToolbarMeta count={filteredMembers.length} />}
      />
    ),
    [
      availabilityFilter,
      canManageAbsences,
      filteredMembers.length,
      openCreateAbsenceDialog,
      roleFilter,
      roleOptions,
      search,
    ]
  );

  usePageHeaderActions(headerActions, [headerActions]);

  if (loading || showSkeleton) {
    return <AppPageLoader title="Завантаження" subtitle="Готуємо сторінку команди." />;
  }

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-6 pb-20 md:pb-8">
      {/* KPI-плитки — не просто цифри, а швидкі фільтри списку. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="У команді"
          value={activeMembers.length}
          icon={Users}
          pressed={quickFilter === "all" ? undefined : false}
          onClick={() => setQuickFilter("all")}
          ariaLabel="Показати всіх людей"
          title="Скинути швидкий фільтр"
        />
        <StatTile
          label="Онлайн"
          value={onlineCount}
          icon={UserCheck}
          tone="success"
          pressed={quickFilter === "online"}
          onClick={() => setQuickFilter((prev) => (prev === "online" ? "all" : "online"))}
          ariaLabel="Показати тільки тих, хто онлайн"
        />
        <StatTile
          label="Відсутні"
          value={awayMembers.length}
          icon={UserMinus}
          tone="warning"
          pressed={quickFilter === "away"}
          onClick={() => setQuickFilter((prev) => (prev === "away" ? "all" : "away"))}
          ariaLabel="Показати тільки відсутніх"
        />
        <StatTile
          label="Подій попереду"
          value={teamEvents.length}
          icon={CalendarDays}
          tone="info"
          onClick={() => setCalendarOpen(true)}
          ariaLabel="Відкрити календар команди"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_360px]">
        <Card className="order-2 xl:order-1">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="h-4 w-4 text-muted-foreground" />
                Люди в команді
                <span className="text-sm font-normal tabular-nums text-muted-foreground">{filteredMembers.length}</span>
              </CardTitle>
              <Select value={sortMode} onValueChange={(value) => setSortMode(value as SortMode)}>
                <SelectTrigger
                  aria-label="Сортування списку"
                  className="h-8 w-auto gap-1.5 rounded-lg border-border/50 bg-muted/40 px-2.5 text-xs shadow-inner"
                >
                  <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="end">
                  <SelectItem value="presence">Спочатку онлайн</SelectItem>
                  <SelectItem value="name">За іменем</SelectItem>
                  <SelectItem value="tenure">За стажем</SelectItem>
                  <SelectItem value="birthday">Найближчі ДН</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {filteredMembers.length === 0 ? (
              <EmptyStateCard
                badgeLabel="Порожньо"
                title="Немає людей за цими фільтрами"
                description="Змініть пошук або скиньте фільтри — і список оживе."
                actionLabel="Скинути фільтри"
                onAction={() => {
                  setSearch("");
                  setRoleFilter("all");
                  setAvailabilityFilter("all");
                  setQuickFilter("all");
                }}
              />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
                {filteredMembers.map((member) => (
                  <TeamMemberCard key={member.userId} member={member} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="order-1 space-y-4 xl:order-2">
          {/* Сьогодні: хто відсутній і що святкуємо — перший погляд ранку. */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarDays className="h-4 w-4 text-muted-foreground" />
                Сьогодні
              </CardTitle>
              <div className="text-xs text-muted-foreground">{todayLabel}</div>
            </CardHeader>
            <CardContent className="space-y-2">
              {awayMembers.length === 0 && todayEvents.length === 0 ? (
                <div className={cn("flex items-center gap-2 rounded-[var(--radius)] border px-3 py-2.5", toneSubtleClass.success)}>
                  <UserCheck className={cn("h-4 w-4 shrink-0", toneTextClass.success)} aria-hidden />
                  <span className="text-xs font-medium text-foreground">Вся команда доступна</span>
                </div>
              ) : (
                <>
                  {awayMembers.map((member) => (
                    <div
                      key={`today-away:${member.userId}`}
                      className="flex items-center gap-2.5 rounded-[var(--radius)] border border-border/50 bg-muted/10 px-3 py-2"
                    >
                      <AvatarBase
                        src={member.avatarDisplayUrl}
                        name={member.label}
                        fallback={getInitialsFromName(member.label, member.email)}
                        assetVariant="md"
                        size={28}
                        availability={member.availabilityStatus}
                        presence={member.online ? "online" : "offline"}
                      />
                      <span className="min-w-0 flex-1 truncate text-sm text-foreground">{member.label}</span>
                      {formatUntilShort(member.availabilityEndDate) ? (
                        <span className="shrink-0 text-2xs tabular-nums text-muted-foreground">
                          {formatUntilShort(member.availabilityEndDate)}
                        </span>
                      ) : null}
                      <Badge className={cn("shrink-0", getTeamAvailabilityBadgeClass(member.availabilityStatus))} size="sm">
                        {getTeamAvailabilityLabel(member.availabilityStatus)}
                      </Badge>
                    </div>
                  ))}
                  {todayEvents.map((event) => {
                    const EventIcon = EVENT_ICONS[event.type];
                    return (
                      <div
                        key={`today-event:${event.id}`}
                        className={cn("flex items-center gap-2.5 rounded-[var(--radius)] border px-3 py-2", toneSubtleClass[EVENT_TONE[event.type]])}
                      >
                        <EventIcon className={cn("h-4 w-4 shrink-0", toneTextClass[EVENT_TONE[event.type]])} aria-hidden />
                        <span className="min-w-0 flex-1 truncate text-sm text-foreground">{event.title}</span>
                        <span className="shrink-0 text-2xs text-muted-foreground">{event.caption}</span>
                      </div>
                    );
                  })}
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <CalendarOff className="h-4 w-4 text-muted-foreground" />
                  Відсутності
                  {absences && absences.length > 0 ? (
                    <span className="text-sm font-normal tabular-nums text-muted-foreground">{absences.length}</span>
                  ) : null}
                </CardTitle>
                {canManageAbsences ? (
                  <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => openCreateAbsenceDialog()}>
                    <Plus className="h-3.5 w-3.5" />
                    Додати
                  </Button>
                ) : null}
              </div>
              <div className="mt-3 flex items-center justify-between gap-1 rounded-xl border border-border/50 bg-muted/40 p-1 shadow-inner">
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
                <div className="flex min-w-0 items-center justify-center gap-1.5">
                  <span className="truncate text-sm font-semibold capitalize text-foreground">{monthLabel}</span>
                  {monthOffset !== 0 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 rounded-md px-1.5 text-2xs text-muted-foreground"
                      onClick={() => setMonthOffset(0)}
                    >
                      Зараз
                    </Button>
                  ) : null}
                </div>
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
                <div className="flex items-center gap-2 rounded-[var(--radius)] border border-border/50 bg-muted/10 px-3 py-3 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Завантажуємо журнал...
                </div>
              ) : !absences || absences.length === 0 ? (
                <div className="rounded-[var(--radius)] border border-dashed border-border/60 bg-muted/10 px-4 py-6 text-center text-sm text-muted-foreground">
                  За цей місяць відсутностей не записано.
                </div>
              ) : (
                absences.map((entry) => {
                  const member = memberById.get(entry.userId);
                  const label = member?.label ?? "Колишній співробітник";
                  const durationDays = getAbsenceDurationDays(entry.startDate, entry.endDate);
                  return (
                    <div
                      key={entry.id}
                      className="group rounded-[var(--radius)] border border-border/50 bg-muted/10 px-3 py-2.5 transition-colors hover:border-border"
                    >
                      <div className="flex items-start gap-3">
                        <AvatarBase
                          src={member?.avatarDisplayUrl ?? null}
                          name={label}
                          fallback={getInitialsFromName(label, member?.email)}
                          assetVariant="md"
                          size={32}
                          inactive={member?.inactive ?? false}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium text-foreground">{label}</div>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5">
                            <Badge className={cn("text-2xs", TEAM_ABSENCE_KIND_BADGE_CLASSES[entry.kind])} size="sm">
                              {TEAM_ABSENCE_KIND_LABELS[entry.kind]}
                            </Badge>
                            <span className="text-xs tabular-nums text-muted-foreground">
                              {formatAbsenceRange(entry.startDate, entry.endDate)}
                            </span>
                            {durationDays > 1 ? (
                              <span className="text-xs text-muted-foreground">
                                · {durationDays} {pluralizeDays(durationDays)}
                              </span>
                            ) : null}
                          </div>
                          {entry.comment ? (
                            <p className="mt-1 break-words text-xs text-muted-foreground">{entry.comment}</p>
                          ) : null}
                        </div>
                        {canManageAbsences ? (
                          <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
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

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Cake className="h-4 w-4 text-muted-foreground" />
                Найближчі події
              </CardTitle>
              <div className="text-xs text-muted-foreground">Дні народження, річниці та повернення</div>
            </CardHeader>
            <CardContent className="space-y-2">
              {upcomingEvents.length === 0 ? (
                <div className="rounded-[var(--radius)] border border-dashed border-border/60 bg-muted/10 px-4 py-6 text-center text-sm text-muted-foreground">
                  Додайте дати народження, старту роботи та періоди відсутності.
                </div>
              ) : (
                <>
                  {upcomingEvents.map((event) => {
                    const EventIcon = EVENT_ICONS[event.type];
                    const tone = EVENT_TONE[event.type];
                    return (
                      <div
                        key={event.id}
                        className="flex items-center gap-3 rounded-[var(--radius)] border border-border/50 bg-muted/10 px-3 py-2.5 transition-colors hover:border-border"
                      >
                        <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border", toneIconBoxClass[tone])}>
                          <EventIcon className={cn("h-4 w-4", toneTextClass[tone])} aria-hidden />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium text-foreground">{event.title}</div>
                          <div className="truncate text-2xs text-muted-foreground">{event.caption}</div>
                        </div>
                        <Badge tone={tone} size="sm" className="shrink-0 tabular-nums">
                          {formatDaysChip(event.daysUntil)}
                        </Badge>
                      </div>
                    );
                  })}
                  {extraUpcomingCount > 0 ? (
                    <button
                      type="button"
                      className="w-full rounded-[var(--radius)] px-3 py-1.5 text-center text-2xs text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
                      onClick={() => setCalendarOpen(true)}
                    >
                      і ще {extraUpcomingCount} — у календарі
                    </button>
                  ) : null}
                </>
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
            <DialogDescription>
              Відсутності, дні народження, річниці та повернення за місяць.
              {canManageAbsences ? " Клік по дню — новий запис відсутності." : ""}
            </DialogDescription>
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
              {monthOffset !== 0 ? (
                <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={() => setMonthOffset(0)}>
                  Сьогодні
                </Button>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              {CALENDAR_LEGEND.map((legend) => (
                <span key={legend.label} className="inline-flex items-center gap-1.5 text-2xs text-muted-foreground">
                  <span className={cn("h-2.5 w-2.5 rounded-full border", legend.swatchClass)} />
                  {legend.label}
                </span>
              ))}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="hidden md:block">
              <div className="grid grid-cols-7 gap-1.5">
                {WEEKDAY_LABELS.map((label) => (
                  <div key={label} className="px-2 py-1 text-center text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {label}
                  </div>
                ))}
                {monthDays.map((day) => {
                  const dayInner = (
                    <>
                      <div className="flex items-center justify-between">
                        <div
                          className={cn(
                            "flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium tabular-nums",
                            day.isToday ? "bg-primary text-primary-foreground" : "text-foreground"
                          )}
                        >
                          {day.date.getDate()}
                        </div>
                        {day.items.length > 3 ? (
                          <span className="text-3xs font-medium text-muted-foreground">+{day.items.length - 3}</span>
                        ) : null}
                      </div>
                      <div className="mt-1.5 space-y-1">
                        {day.items.slice(0, 3).map((item) => (
                          <div
                            key={item.id}
                            className={cn("truncate rounded-md border px-1.5 py-0.5 text-3xs font-medium leading-4", item.toneClass)}
                            title={item.label}
                          >
                            {item.label}
                          </div>
                        ))}
                      </div>
                    </>
                  );
                  const dayClass = cn(
                    "min-h-[92px] rounded-xl border p-2 text-left transition-colors",
                    day.inMonth
                      ? day.isWeekend
                        ? "border-border/60 bg-muted/30"
                        : "border-border/60 bg-background/60"
                      : "border-border/40 bg-background/40 opacity-55",
                    day.isToday ? "ring-1 ring-primary/30" : ""
                  );
                  if (canManageAbsences && day.inMonth) {
                    return (
                      <button
                        key={day.key}
                        type="button"
                        className={cn(
                          dayClass,
                          "cursor-pointer hover:border-primary/40 hover:ring-1 hover:ring-primary/20",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20"
                        )}
                        title={`Записати відсутність: ${formatDayMonth(day.date)}`}
                        aria-label={`Записати відсутність на ${formatDayMonth(day.date)}`}
                        onClick={() => {
                          setCalendarOpen(false);
                          openCreateAbsenceDialog(day.key);
                        }}
                      >
                        {dayInner}
                      </button>
                    );
                  }
                  return (
                    <div key={day.key} className={dayClass}>
                      {dayInner}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2 md:hidden">
              {agendaDays.length === 0 ? (
                <div className="rounded-[var(--radius)] border border-dashed border-border/60 bg-muted/10 px-4 py-8 text-center text-sm text-muted-foreground">
                  Цього місяця подій немає.
                </div>
              ) : (
                agendaDays.map((day) => (
                  <div
                    key={day.key}
                    className={cn(
                      "flex items-start gap-3 rounded-[var(--radius)] border bg-background/60 px-3 py-2.5",
                      day.isToday ? "border-primary/40 ring-1 ring-primary/20" : "border-border/60"
                    )}
                  >
                    <div className="w-11 shrink-0 text-center">
                      <div className="text-2xs uppercase text-muted-foreground">{formatWeekdayShort(day.date)}</div>
                      <div className="text-lg font-semibold leading-tight tabular-nums text-foreground">{day.date.getDate()}</div>
                    </div>
                    <div className="flex min-w-0 flex-1 flex-wrap gap-1.5 pt-0.5">
                      {day.items.map((item) => (
                        <span
                          key={item.id}
                          className={cn("rounded-md border px-2 py-0.5 text-2xs font-medium", item.toneClass)}
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
                  {enrichedMembers
                    .filter((member) => !member.inactive)
                    .map((member) => (
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
                      <span className="flex items-center gap-2">
                        <span className={cn("h-2 w-2 rounded-full", toneDotClass[ABSENCE_KIND_TONE[option.value]])} aria-hidden />
                        {option.label}
                      </span>
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
