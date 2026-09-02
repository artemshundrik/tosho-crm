import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ACCESS_LEVELS, accessLevelLabel, normalizeJobRoleInput } from "@/features/team/personRoles";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";
import {
  ShieldAlert,
  MoreHorizontal,
  Calendar,
  Link as LinkIcon,
  Clock,
  Copy,
  Mail,
  Trash2,
  Loader2,
  AlertTriangle,
  Activity,
  Gift,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getCanonicalAvatarReference } from "@/lib/avatarUrl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  TableActionCell,
  TableActionHeaderCell,
  TableEmptyRow,
  TableTextHeaderCell,
} from "@/components/app/table-kit";
import { AppDropdown } from "@/components/app/AppDropdown";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { AvatarBase } from "@/components/app/avatar-kit";
import { PageLoading } from "@/components/app/page-loading";
import { usePageCache } from "@/hooks/usePageCache";
import { useMinimumLoading } from "@/hooks/useMinimumLoading";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  PersonActivitySection,
  PersonTimeInCrm,
} from "@/components/team/PersonDetailSections";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import {
  CONTROL_BASE,
  SEGMENTED_GROUP,
  SEGMENTED_TRIGGER,
  TOOLBAR_ACTION_BUTTON,
} from "@/components/ui/controlStyles";
import { resolveWorkspaceId } from "@/lib/workspace";
import { buildUserNameFromMetadata, formatUserShortName, getInitialsFromName } from "@/lib/userName";
import { formatLastSeenAgo } from "@/lib/lastSeen";
import {
  formatEmploymentDate,
  formatEmploymentDuration,
  getEmploymentDurationDays,
  isInactiveEmployment,
  getProbationSummary,
  type EmploymentStatus,
} from "@/lib/employment";
import { useWorkspacePresence } from "@/components/app/workspace-presence-context";
import { UnifiedPageToolbar } from "@/components/app/headers/UnifiedPageToolbar";
import { CountBadge } from "@/components/app/headers/toolbarPrimitives";
import { usePageHeaderActions } from "@/components/app/usePageHeaderActions";
import { TeamPulsePanel, type PulsePerson } from "@/components/team/TeamPulsePanel";
import { useAuth } from "@/auth/AuthProvider";
import { useTeamLastSeen } from "@/hooks/useTeamLastSeen";
import type { PulseRange } from "@/components/team/pulsePeriod";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  listWorkspaceMemberDirectory,
  upsertWorkspaceMemberProfile,
  type WorkspaceMemberDirectoryRow,
} from "@/lib/workspaceMemberDirectory";
import {
  getTeamAvailabilityBadgeClass,
  getTeamAvailabilityLabel,
  normalizeTeamAvailabilityStatus,
} from "@/lib/teamAvailability";
import {
  defaultModuleAccess,
  normalizeModuleAccess,
  type ModuleAccess,
} from "@/lib/moduleAccess";
import { SegmentedGroup } from "@/components/ui/segmented-group";
import { AccessMatrix, type MatrixPerson } from "@/components/team/AccessMatrix";
import {
  getAccessBadgeClass,
  getJobBadgeClass,
  getJobRoleLabel,
  getProbationBadgeClass,
} from "@/features/team/memberBadges";
import { AccessOverview } from "@/components/team/AccessOverview";
import { getCurrentUser, getCurrentUserId } from "@/lib/currentUser";

const AVATAR_BUCKET = (import.meta.env.VITE_SUPABASE_AVATAR_BUCKET as string | undefined) || "avatars";
const DEFAULT_MANAGER_RATE = 10;

function getMemberAvatarSource(
  profile: { avatarUrl: string | null } | null | undefined,
  member: { avatar_url?: string | null } | null | undefined
) {
  return getCanonicalAvatarReference({ avatarUrl: profile?.avatarUrl ?? member?.avatar_url ?? null }, AVATAR_BUCKET);
}

// --- TYPES ---
type Member = {
  user_id: string;
  email: string | null;
  full_name?: string | null;
  avatar_url?: string | null;
  access_role: string | null;
  job_role: string | null;
  created_at: string;
};

type MemberProfileMeta = {
  firstName: string;
  lastName: string;
  fullName: string;
  birthDate: string;
  phone: string;
  managerRate: number;
  availabilityStatus: "available" | "vacation" | "sick_leave" | "offline";
  availabilityStartDate: string;
  availabilityEndDate: string;
  startDate: string;
  probationEndDate: string;
  employmentStatus: EmploymentStatus;
  probationReviewNotifiedAt: string;
  probationReviewedAt: string;
  probationReviewedBy: string;
  probationExtensionCount: number;
  managerUserId: string;
  moduleAccess: ModuleAccess;
};

type MemberPresence = {
  currentLabel: string;
  lastSeenAt: string;
  online: boolean;
};

type Invite = {
  id: string;
  email: string;
  access_role: string;
  job_role: string | null;
  token: string;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
};

/** email — Supabase шле лист; link — отримуємо посилання й передаємо самі. */
type InviteDelivery = "email" | "link";

type InviteResult = {
  delivery: InviteDelivery;
  email: string;
  /** Лише для delivery=link: одноразове посилання входу від Supabase. */
  actionLink?: string;
};

type TeamMembersPageCache = {
  workspaceId: string | null;
  currentUserId: string | null;
  members: Member[];
  directoryRows: WorkspaceMemberDirectoryRow[];
  invites: Invite[];
  memberProfilesByUserId: Record<string, { label: string; avatarUrl: string | null }>;
  memberMetaByUserId: Record<string, MemberProfileMeta>;
};

type AccessRoleOption = {
  label: string;
  value: string;
};

type JobRoleOption = {
  label: string;
  value: string;
};

/** Підписи рівнів — зі спільного реєстру, щоб таблиця й картка казали те саме. */
const ACCESS_ROLE_OPTIONS: AccessRoleOption[] = ACCESS_LEVELS.map(({ value, label }) => ({ value, label }));

const JOB_ROLE_OPTIONS: JobRoleOption[] = [
  { value: "none", label: "Без ролі" },
  { value: "manager", label: "Менеджер" },
  { value: "printer", label: "Друкар" },
  { value: "head_of_logistics", label: "Начальник відділу логістики" },
  { value: "head_of_production", label: "Начальник з виробництва" },
  { value: "packer", label: "Пакувальник" },
  { value: "designer", label: "Дизайнер" },
  { value: "logistics", label: "Логіст" },
  { value: "pm", label: "PM" },
  { value: "sales_manager", label: "Менеджер з продажу" },
  { value: "top_manager", label: "Топ-менеджер" },
  { value: "junior_sales_manager", label: "Молодший менеджер з продажу" },
  { value: "office_manager", label: "Офіс-менеджер" },
  { value: "accountant", label: "Бухгалтер" },
  { value: "junior_accountant", label: "Молодший бухгалтер" },
  { value: "chief_accountant", label: "Головний бухгалтер" },
  { value: "marketer", label: "Маркетолог" },
  { value: "smm", label: "СММ" },
  /**
   * ЦЕ КЕРІВНИК, А НЕ ПОШУКОВА ОПТИМІЗАЦІЯ.
   *
   * Значення в базі — `seo`, і воно лишається: на ньому тримаються політики RLS
   * (`tosho.is_owner_or_seo()`), доступ до фінансів, приватні картки й
   * погодження відпусток. Перейменувати його означає переписати політики в базі
   * — окрема робота з міграцією.
   *
   * А от ПІДПИС був небезпечний. «CEO» у списку поруч із «Маркетолог» і «СММ»
   * читається як фахівець із пошукової оптимізації — тобто рядова посада. Той,
   * хто виставив би її новому маркетологу, мовчки видав би йому права рівня
   * власника. Тепер підпис каже, що це насправді: CEO.
   */
  { value: "seo", label: "CEO" },
  { value: "it_specialist", label: "IT-спеціаліст" },
];

/**
 * Що можна ВИСТАВИТИ руками. Відпустка й лікарняний зі списку прибрані
 * свідомо: вони живуть у журналі `tosho.team_absences` і виводяться з нього
 * (див. workspaceMemberDirectory). Поки їх можна було ставити й тут, бейдж
 * на аватарці розходився з календарем — статус лишався «у відпустці» тижнями
 * після повернення, бо перемкнути його назад ніхто не згадував.
 *
 * Ярлики й тони для ВІДОБРАЖЕННЯ беремо з канонічного teamAvailability.ts —
 * журнал і далі присилає vacation/sick_leave.
 */

/** Підписи, порядок і дефолти модулів — у реєстрі src/lib/moduleAccess.ts. */
const DEFAULT_MODULE_ACCESS = defaultModuleAccess();

const DEFAULT_MEMBER_META: MemberProfileMeta = {
  firstName: "",
  lastName: "",
  fullName: "",
  birthDate: "",
  phone: "",
  managerRate: DEFAULT_MANAGER_RATE,
  availabilityStatus: "available",
  availabilityStartDate: "",
  availabilityEndDate: "",
  startDate: "",
  probationEndDate: "",
  employmentStatus: "active",
  probationReviewNotifiedAt: "",
  probationReviewedAt: "",
  probationReviewedBy: "",
  probationExtensionCount: 0,
  managerUserId: "",
  moduleAccess: DEFAULT_MODULE_ACCESS,
};

const getAccessRoleLabel = accessLevelLabel;

// Делегує канонічному довіднику (src/lib/jobRoles.ts) — раніше тут була власна
// копія списку посад, яка розходилась із джерелом істини (нові посади показувались
// сирим ключем англійською: «it specialist» замість «IT-спеціаліст»).
// Probation was removed from this page. Legacy rows may still carry
// employment_status = 'probation'; show them as working so nobody is stranded
// with a badge that has no action behind it any more.
// Offboarded people stay visible (history, audit) but must never sit between
// active colleagues: they sink to the bottom, alphabetical within each group.
function sortMembersForList(
  list: Member[],
  metaByUserId: Record<string, MemberProfileMeta>
): Member[] {
  return [...list].sort((a, b) => {
    const aOut = isInactiveEmployment(metaByUserId[a.user_id]?.employmentStatus) ? 1 : 0;
    const bOut = isInactiveEmployment(metaByUserId[b.user_id]?.employmentStatus) ? 1 : 0;
    if (aOut !== bOut) return aOut - bOut;
    const aName = (a.full_name ?? a.email ?? "").toLowerCase();
    const bName = (b.full_name ?? b.email ?? "").toLowerCase();
    return aName.localeCompare(bName, "uk");
  });
}

async function parseJsonSafe<T>(response: Response): Promise<T | null> {
  const raw = await response.text();
  if (!raw.trim()) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function getErrorMessage(error: unknown, fallback = "Unknown error") {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "object" && error !== null) {
    const record = error as Record<string, unknown>;
    if (typeof record.message === "string" && record.message) return record.message;
  }
  return fallback;
}

function isRecoverableMemberDeleteError(message: string) {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("does not exist") ||
    normalized.includes("relation") ||
    normalized.includes("column") ||
    normalized.includes("could not find the table") ||
    normalized.includes("schema cache")
  );
}

function isRecoverableTeamProfileError(message: string) {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("team_member_profiles") &&
    (normalized.includes("does not exist") ||
      normalized.includes("relation") ||
      normalized.includes("schema cache") ||
      normalized.includes("column"))
  );
}

// Sections of a person's card. One surface per person: the card owns every
// per-person view and edit, so there is no separate edit drawer or roles dialog.

/** Вкладки адмін-центру «Люди та доступи». */
type AdminTab = "overview" | "people" | "matrix" | "pulse" | "invites";

/**
 * Окремої вкладки «Посади» немає навмисно: стартові набори посад лежать у коді
 * (`ROLE_MENUS` у src/lib/moduleAccess.ts), а не в базі, — редагувати їх з
 * інтерфейсу нічого. Погляд «що дає посада» живе віссю «Посади» в матриці.
 */
const ADMIN_TABS: { key: AdminTab; label: string }[] = [
  { key: "overview", label: "Огляд" },
  { key: "people", label: "Люди" },
  { key: "matrix", label: "Матриця" },
  { key: "pulse", label: "Пульс" },
  { key: "invites", label: "Запрошення" },
];

type MemberFilterKey = "attention" | "birthday" | "startDate" | "absence";

function FilterChip({
  label,
  count,
  active,
  tone = "default",
  icon: Icon,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  tone?: "default" | "warning";
  icon?: LucideIcon;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors duration-200",
        active
          ? "border-primary bg-primary/10 text-primary"
          : tone === "warning"
            ? "tone-warning-subtle tone-text-warning border-transparent hover:brightness-[0.97]"
            : "border-border/70 bg-muted/[0.04] text-muted-foreground hover:bg-muted/[0.08] hover:text-foreground",
      )}
    >
      {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
      <span>{label}</span>
      <span className="tabular-nums opacity-70">{count}</span>
    </button>
  );
}

export function TeamMembersPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  /**
   * Вкладки адмін-центру.
   *
   * До 28.08.2026 тут були дві вкладки («Учасники» / «Запрошення») і окремий
   * перемикач вигляду (панель / рядки / Пульс) — тобто два ряди контролів, які
   * керували тим самим. Пульс при цьому був «виглядом списку людей», хоча це
   * не вигляд, а окреме питання керівника. Тепер усе — рівноправні вкладки, а
   * картка людини живе окремим маршрутом (`/team/:userId`).
   */
  const [activeTab, setActiveTab] = useState<AdminTab>("overview");
  const { entries } = useWorkspacePresence();
  const { teamId } = useAuth();
  /**
   * Присутність із контексту знає лише свіже вікно, тож у Пульсі люди, які
   * закрили вкладку годину тому, лишались зовсім без часу — рядок писав
   * «Присутність без дій» і мовчав про те, коли людина була. Повна історія
   * читається окремо, тим самим запитом, що й на сторінці «Команда».
   */
  const lastSeenByUser = useTeamLastSeen(teamId);

  const { cached, setCache } = usePageCache<TeamMembersPageCache>("team-members");
  const hasCache = Boolean(cached?.workspaceId);
  /**
   * Що з кешу ми вже можемо намалювати. Від цього залежить не вміст (він
   * підставлений в ініціалізаторах нижче), а чи вмикати каркас на час звірки з
   * сервером: показувати його поверх наявних людей означає «усе зникло».
   */
  const hasCachedMembers = Boolean(cached?.members?.length);
  const hasCachedProfiles = Boolean(
    cached?.memberProfilesByUserId && Object.keys(cached.memberProfilesByUserId).length > 0
  );
  const hasCachedMeta = Boolean(
    cached?.memberMetaByUserId && Object.keys(cached.memberMetaByUserId).length > 0
  );
  /**
   * Ті самі прапорці, але для завантажувачів.
   *
   * У залежності ефектів їх класти НЕ МОЖНА: кеш пишеться після кожного
   * успішного завантаження, прапорець миттю стає true — і ефект пішов би на
   * друге коло за власним записом. Ref читається всередині, ідентичності не
   * має, кола не робить.
   */
  const cacheReadyRef = useRef({
    workspace: hasCache,
    members: hasCachedMembers,
    profiles: hasCachedProfiles,
    meta: hasCachedMeta,
  });
  useEffect(() => {
    cacheReadyRef.current = {
      workspace: hasCache,
      members: hasCachedMembers,
      profiles: hasCachedProfiles,
      meta: hasCachedMeta,
    };
  }, [hasCache, hasCachedMembers, hasCachedProfiles, hasCachedMeta]);
  const [workspaceResolved, setWorkspaceResolved] = useState(Boolean(cached?.workspaceId));

  const [workspaceId, setWorkspaceId] = useState<string | null>(cached?.workspaceId ?? null);
  const [workspaceLoading, setWorkspaceLoading] = useState(!hasCache);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);

  const [currentUserId, setCurrentUserId] = useState<string | null>(cached?.currentUserId ?? null);

  /**
   * Повторний вхід — миттєвий (REQ-19).
   *
   * Кеш сторінки писався й раніше, але читались із нього лише воркспейс і
   * інвайти: люди, профілі й метадані щоразу починали з порожнечі, тож розділ
   * ЗАВЖДИ показував каркас, скільки б разів на день у нього не зайшли.
   */
  const [members, setMembers] = useState<Member[]>(cached?.members ?? []);
  const [membersLoading, setMembersLoading] = useState(!cached?.members?.length);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [memberProfilesByUserId, setMemberProfilesByUserId] = useState<
    Record<string, { label: string; avatarUrl: string | null }>
  >(cached?.memberProfilesByUserId ?? {});
  const [directoryRows, setDirectoryRows] = useState<WorkspaceMemberDirectoryRow[]>(
    cached?.directoryRows ?? []
  );
  const [memberProfilesLoading, setMemberProfilesLoading] = useState(
    !cached?.memberProfilesByUserId
  );
  const [memberMetaByUserId, setMemberMetaByUserId] = useState<Record<string, MemberProfileMeta>>(
    cached?.memberMetaByUserId ?? {}
  );
  const [memberMetaLoading, setMemberMetaLoading] = useState(!cached?.memberMetaByUserId);
  const [memberProfileStorageAvailable, setMemberProfileStorageAvailable] = useState(true);
  const [memberPresenceByUserId, setMemberPresenceByUserId] = useState<Record<string, MemberPresence>>({});

  const [invites, setInvites] = useState<Invite[]>(cached?.invites ?? []);
  const [invitesLoading, setInvitesLoading] = useState(false);
  const [invitesError, setInvitesError] = useState<string | null>(null);

  const [activeFilter, setActiveFilter] = useState<MemberFilterKey | null>(null);
  const [pulseRange, setPulseRange] = useState<PulseRange>("day");
  const [pulsePeriodOffset, setPulsePeriodOffset] = useState(0);
  // Drilling into somebody from Пульс opens a peek beside the dashboard instead
  // of navigating away, so the compare loop (глянула одного → другого) keeps its
  // ranked list and period on screen.
  const [pulsePeekUserId, setPulsePeekUserId] = useState<string | null>(null);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteAccessRole, setInviteAccessRole] = useState("member");
  const [inviteJobRole, setInviteJobRole] = useState("none");
  const [inviteResult, setInviteResult] = useState<InviteResult | null>(null);
  const [inviteBusy, setInviteBusy] = useState<InviteDelivery | null>(null);
  const [inviteRowBusy, setInviteRowBusy] = useState<string | null>(null);

  const [revokeId, setRevokeId] = useState<string | null>(null);
  const [revokeBusy, setRevokeBusy] = useState(false);
  const [memberToDelete, setMemberToDelete] = useState<Member | null>(null);
  const [memberDeleteBusy, setMemberDeleteBusy] = useState(false);
  const [, setWorkspaceFunctionAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    const tab = params.get("tab");
    if (tab === "overview" || tab === "matrix" || tab === "pulse" || tab === "invites") {
      setActiveTab(tab);
    } else if (tab === "roles") {
      // «Посади» були окремою вкладкою лише в чернетці — це вісь матриці.
      setActiveTab("matrix");
    } else if (tab === "members" || tab === "people") {
      setActiveTab("people");
    } else if (tab === "activity") {
      // Легасі-адреса: Пульс був вкладкою, потім виглядом списку, тепер знову вкладка.
      setActiveTab("pulse");
    }
  }, [params]);

  const currentMembership = useMemo(
    () => members.find((m) => m.user_id === currentUserId) ?? null,
    [currentUserId, members]
  );
  const isSuperAdmin = currentMembership?.access_role === "owner";
  const isAdmin = currentMembership?.access_role === "admin";
  const isSeo = (currentMembership?.job_role ?? "").toLowerCase() === "seo";
  const canManage = isSuperAdmin || isAdmin;
  const canManageManagerRates = isSuperAdmin || isSeo;
  const canOpenProfileCard = canManage || canManageManagerRates;
  // "Пульс" (team activity analytics) is owner/CEO only — the CEO surface.
  const canPulse = isSuperAdmin || isSeo;

  useEffect(() => {
    const memberId = params.get("member")?.trim();
    if (!memberId) return;
    // Легасі-адреса ?member=… вела в панель поруч зі списком. Панелі більше
    // немає — картка людини живе окремим маршрутом, тож просто перекидаємо.
    navigate(`/team/${memberId}`, { replace: true });
  }, [navigate, params]);

  useEffect(() => {
    let cancelled = false;

    const loadUser = async () => {
      const user = await getCurrentUser();
      if (cancelled) return;
      setCurrentUserId(user?.id ?? null);
    };

    void loadUser();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadWorkspaceId = async () => {
      // Воркспейс у нас уже є з кешу — звіряємось тихо. Інакше кожен вхід у
      // розділ починався з каркаса, хоч показувати було що (REQ-19).
      if (!cacheReadyRef.current.workspace) setWorkspaceLoading(true);
      setWorkspaceError(null);

      let resolvedId: string | null = null;

      try {
        resolvedId = await resolveWorkspaceId(await getCurrentUserId());
      } catch (error: unknown) {
        if (!cancelled) setWorkspaceError(getErrorMessage(error));
      } finally {
        if (!cancelled) {
          setWorkspaceId(resolvedId);
          setWorkspaceLoading(false);
          setWorkspaceResolved(true);
        }
      }
    };

    void loadWorkspaceId();

    return () => {
      cancelled = true;
    };
  }, []);

  // Лічильник ручних перечитувань довідника: матриця міняє доступи одразу
  // кільком людям (пояснення — в AccessMatrix, onPeopleChanged).
  const [membersReloadToken, setMembersReloadToken] = useState(0);

  useEffect(() => {
    if (!workspaceId) return;

    let cancelled = false;

    const loadMembers = async () => {
      // Є кого показати — звіряємось тихо (той самий підхід, що й для інвайтів).
      if (!cacheReadyRef.current.members) setMembersLoading(true);
      setMembersError(null);

      try {
        const directory = await listWorkspaceMemberDirectory(workspaceId);

        if (cancelled) return;

        setDirectoryRows(directory);
        setMembers(
          directory.map((row) => ({
            user_id: row.userId,
            email: row.email,
            full_name: row.fullName || null,
            avatar_url: row.avatarUrl,
            access_role: row.accessRole,
            job_role: row.jobRole,
            created_at: "",
          }))
        );
      } catch (error: unknown) {
        if (!cancelled) {
          setMembersError(getErrorMessage(error));
          setMembers([]);
          setDirectoryRows([]);
        }
      } finally {
        if (!cancelled) setMembersLoading(false);
      }
    };

    void loadMembers();

    return () => {
      cancelled = true;
    };
  }, [workspaceId, membersReloadToken]);

  useEffect(() => {
    if (!workspaceId || directoryRows.length === 0) {
      setMemberProfilesByUserId({});
      setMemberProfilesLoading(false);
      return;
    }

    let cancelled = false;

    const loadMemberProfiles = async () => {
      if (!cacheReadyRef.current.profiles) setMemberProfilesLoading(true);
      try {
        const memberIds = Array.from(new Set(directoryRows.map((member) => member.userId).filter(Boolean)));

        if (memberIds.length === 0) {
          setMemberProfilesByUserId({});
          return;
        }

        const warmMap = memberIds.reduce<Record<string, { label: string; avatarUrl: string | null }>>((acc, id) => {
          const baseMember = directoryRows.find((member) => member.userId === id);
          const emailFallback = baseMember?.email?.split("@")[0]?.trim() || baseMember?.email || id;
          acc[id] = {
            label: baseMember?.displayName || emailFallback,
            avatarUrl: getCanonicalAvatarReference(
              { avatarUrl: baseMember?.avatarUrl ?? null, avatarPath: baseMember?.avatarPath ?? null },
              AVATAR_BUCKET
            ),
          };
          return acc;
        }, {});
        setMemberProfilesByUserId((prev) => ({ ...warmMap, ...prev }));

        const hasWarmProfiles = memberIds.every((id) => {
          const cachedProfile = memberProfilesByUserId[id];
          return Boolean(cachedProfile?.label || cachedProfile?.avatarUrl);
        });
        setMemberProfilesLoading(!hasWarmProfiles);

        const nextMap = memberIds.reduce<Record<string, { label: string; avatarUrl: string | null }>>((acc, id) => {
          const baseMember = directoryRows.find((member) => member.userId === id);
          const emailFallback = baseMember?.email?.split("@")[0]?.trim() || baseMember?.email || id;

          acc[id] = {
            label: baseMember?.displayName || emailFallback,
            avatarUrl: getCanonicalAvatarReference(
              { avatarUrl: baseMember?.avatarUrl ?? null, avatarPath: baseMember?.avatarPath ?? null },
              AVATAR_BUCKET
            ),
          };
          return acc;
        }, {});

        const currentUserData = await getCurrentUser();
        const currentUserId = currentUserData?.id ?? null;
        const currentUserAvatar = getCanonicalAvatarReference(
          {
            avatarUrl: (currentUserData?.user_metadata?.avatar_url as string | undefined) || null,
            avatarPath: (currentUserData?.user_metadata?.avatar_path as string | undefined) || null,
          },
          AVATAR_BUCKET
        );
        if (currentUserId && currentUserAvatar) {
          const resolvedName = buildUserNameFromMetadata(
            currentUserData?.user_metadata as Record<string, unknown> | undefined,
            currentUserData?.email
          );
          const existing = nextMap[currentUserId];
          nextMap[currentUserId] = {
            label: existing?.label || resolvedName.displayName || currentUserData?.email?.split("@")[0] || "Користувач",
            avatarUrl: existing?.avatarUrl ?? currentUserAvatar,
          };
        }

        setMemberProfilesByUserId(nextMap);
      } catch {
        if (cancelled) return;
        try {
          const currentUserData = await getCurrentUser();
          const currentUserId = currentUserData?.id ?? null;
          const currentUserAvatar = getCanonicalAvatarReference(
            {
              avatarUrl: (currentUserData?.user_metadata?.avatar_url as string | undefined) || null,
              avatarPath: (currentUserData?.user_metadata?.avatar_path as string | undefined) || null,
            },
            AVATAR_BUCKET
          );
          const currentUserLabel = buildUserNameFromMetadata(
            currentUserData?.user_metadata as Record<string, unknown> | undefined,
            currentUserData?.email
          ).displayName;

          if (currentUserId && currentUserAvatar) {
            setMemberProfilesByUserId({
              [currentUserId]: {
                label: currentUserLabel,
                avatarUrl: currentUserAvatar,
              },
            });
            return;
          }
        } catch {
          // ignore fallback load errors
        }
      setMemberProfilesByUserId({});
      } finally {
        if (!cancelled) setMemberProfilesLoading(false);
      }
    };

    void loadMemberProfiles();

    return () => {
      cancelled = true;
    };
// eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, directoryRows, members]);

  useEffect(() => {
    if (!workspaceId || !canOpenProfileCard || directoryRows.length === 0) {
      setMemberMetaLoading(false);
      /**
       * Витирати метадані можна лише коли права ВІДОМІ.
       *
       * `canOpenProfileCard` виводиться з членства поточної людини, а воно
       * зʼявляється не в першому кадрі. Поки його немає, прапорець хибно каже
       * «не можна» — і ця гілка стирала щойно засіяні з кешу метадані, а ефект
       * запису клав порожнечу назад у кеш. Наслідок: наступний вхід у розділ
       * знову показував каркас, хоч кеш начебто був (REQ-19).
       */
      if (!canOpenProfileCard && currentUserId) setMemberMetaByUserId({});
      return;
    }

    let cancelled = false;

    const loadMemberMeta = async () => {
      if (!cacheReadyRef.current.meta) setMemberMetaLoading(true);
      try {
        const profilesByUserId = directoryRows.reduce<Record<string, MemberProfileMeta>>((acc, row) => {
          acc[row.userId] = {
            firstName: row.firstName,
            lastName: row.lastName,
            fullName: row.fullName,
            birthDate: row.birthDate,
            phone: row.phone,
            managerRate: DEFAULT_MANAGER_RATE,
            availabilityStatus: row.availabilityStatus,
            availabilityStartDate: row.availabilityStartDate,
            availabilityEndDate: row.availabilityEndDate,
            startDate: row.startDate,
            probationEndDate: row.probationEndDate,
            employmentStatus: row.employmentStatus,
            probationReviewNotifiedAt: row.probationReviewNotifiedAt,
            probationReviewedAt: row.probationReviewedAt,
            probationReviewedBy: row.probationReviewedBy,
            probationExtensionCount: row.probationExtensionCount,
            managerUserId: row.managerUserId,
            moduleAccess: normalizeModuleAccess(row.moduleAccess, row.accessRole, row.jobRole),
          };
          return acc;
        }, {});

        const selfUser = await getCurrentUser();
        if (selfUser?.id) {
          const meta = (selfUser.user_metadata ?? {}) as Record<string, unknown>;
          const existing = profilesByUserId[selfUser.id] ?? DEFAULT_MEMBER_META;
          profilesByUserId[selfUser.id] = {
            ...existing,
            firstName: existing.firstName || (typeof meta.first_name === "string" ? meta.first_name.trim() : ""),
            lastName: existing.lastName || (typeof meta.last_name === "string" ? meta.last_name.trim() : ""),
            fullName: existing.fullName || (typeof meta.full_name === "string" ? meta.full_name.trim() : ""),
            birthDate: existing.birthDate || (typeof meta.birth_date === "string" ? meta.birth_date.trim() : ""),
            phone: existing.phone || (typeof meta.phone === "string" ? meta.phone.trim() : ""),
          };
        }

        if (canManageManagerRates) {
          const { data: ratesData, error: ratesError } = await supabase
            .schema("tosho")
            .from("team_member_manager_rates")
            .select("user_id,manager_rate")
            .eq("workspace_id", workspaceId);

          if (ratesError) {
            if (!/does not exist|relation|schema cache|could not find the table/i.test(ratesError.message ?? "")) {
              throw ratesError;
            }
          } else {
            for (const row of ((ratesData ?? []) as Array<{ user_id: string; manager_rate?: number | null }>)) {
              const existing = profilesByUserId[row.user_id] ?? DEFAULT_MEMBER_META;
              profilesByUserId[row.user_id] = {
                ...existing,
                managerRate: Math.max(0, Number(row.manager_rate) || DEFAULT_MANAGER_RATE),
              };
            }
          }
        }

        if (!cancelled) {
          setMemberProfileStorageAvailable(true);
          setMemberMetaByUserId(profilesByUserId);
        }
      } catch (error: unknown) {
        if (!cancelled) {
          toast.error("Не вдалося завантажити профілі команди", {
            description: getErrorMessage(error),
          });
        }
      } finally {
        if (!cancelled) setMemberMetaLoading(false);
      }
    };

    void loadMemberMeta();

    return () => {
      cancelled = true;
    };
  }, [workspaceId, canOpenProfileCard, canManageManagerRates, currentUserId, directoryRows]);

  useEffect(() => {
    if (members.length === 0) {
      setMemberPresenceByUserId({});
      return;
    }
    const presenceMap = entries.reduce<Record<string, MemberPresence>>((acc, entry) => {
      acc[entry.userId] = {
        currentLabel: entry.currentLabel?.trim() || "У CRM",
        lastSeenAt: entry.lastSeenAt ?? "",
        online: entry.online,
      };
      return acc;
    }, {});

    setMemberPresenceByUserId(presenceMap);
  }, [entries, members.length]);

  useEffect(() => {
    if (!workspaceId || !canManage) {
      setInvites([]);
      setInvitesLoading(false);
      return;
    }

    let cancelled = false;

    const loadInvites = async () => {
      if (!hasCache) setInvitesLoading(true);
      setInvitesError(null);

      try {
        const { data, error } = await supabase
          .schema("tosho")
          .from("workspace_invites")
          .select("id,email,access_role,job_role,token,created_at,expires_at,accepted_at")
          .eq("workspace_id", workspaceId)
          .order("created_at", { ascending: false });

        if (cancelled) return;

        if (error) {
          setInvitesError(error.message);
          setInvites([]);
        } else {
          setInvites((data as Invite[]) ?? []);
        }
      } catch (error: unknown) {
        if (!cancelled) {
          setInvitesError(getErrorMessage(error));
          setInvites([]);
        }
      } finally {
        if (!cancelled) setInvitesLoading(false);
      }
    };

    void loadInvites();

    return () => {
      cancelled = true;
    };
// eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, canManage]);

  useEffect(() => {
    if (workspaceError) {
      toast.error("Не вдалося завантажити workspace", { description: workspaceError });
    }
  }, [workspaceError]);

  useEffect(() => {
    if (membersError) {
      toast.error("Не вдалося завантажити учасників", { description: membersError });
    }
  }, [membersError]);

  useEffect(() => {
    if (invitesError) {
      toast.error("Не вдалося завантажити інвайти", { description: invitesError });
    }
  }, [invitesError]);


  useEffect(() => {
    if (!workspaceId) return;
    setCache({
      workspaceId,
      currentUserId,
      members,
      directoryRows,
      invites,
      memberProfilesByUserId,
      memberMetaByUserId,
    });
  }, [workspaceId, currentUserId, members, directoryRows, invites, memberProfilesByUserId, memberMetaByUserId, setCache]);

  const filteredMembers = sortMembersForList(members.filter((m) => {
    if (!activeFilter) return true;
    const meta = memberMetaByUserId[m.user_id];
    switch (activeFilter) {
      case "birthday":
        return !meta?.birthDate;
      case "startDate":
        return !meta?.startDate;
      case "absence": {
        const availabilityStatus = normalizeTeamAvailabilityStatus(meta?.availabilityStatus);
        return (
          availabilityStatus !== "available" &&
          !!meta?.availabilityStartDate &&
          !meta?.availabilityEndDate
        );
      }
      case "attention":
        // Missing profile data only — probation is no longer tracked here.
        return !meta?.birthDate || !meta?.startDate || !(m.job_role ?? "").trim();
      default:
        return true;
    }
  }), memberMetaByUserId);

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "Не вказано";
    return new Date(dateStr).toLocaleString("uk-UA", {
      dateStyle: "short",
      timeStyle: "short",
    });
  };

  const formatBirthDate = (dateStr?: string | null) => {
    if (!dateStr) return "Не вказано";
    return formatEmploymentDate(dateStr);
  };

  const formatAvailabilityRange = (
    status: MemberProfileMeta["availabilityStatus"],
    startDate?: string | null,
    endDate?: string | null
  ) => {
    if (status === "available") return "";
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
  };

  const getEmploymentSummary = (meta?: MemberProfileMeta | null) => {
    const startLabel = meta?.startDate ? formatEmploymentDate(meta.startDate) : "";
    const durationLabel = formatEmploymentDuration(meta?.startDate);
    if (!startLabel && !durationLabel) {
      return { primary: "Не задано", secondary: "" };
    }
    return {
      primary: startLabel || durationLabel || "Не задано",
      secondary: startLabel && durationLabel ? durationLabel : "",
    };
  };

  const formatRelativeTime = (dateStr?: string | null) => {
    if (!dateStr) return "Немає даних";
    // Спільний форматер: дві суміжні одиниці, після 30 днів — дата.
    return formatLastSeenAgo(dateStr);
  };

  const getMemberDisplayName = useCallback((member: Member) => {
    const profile = memberProfilesByUserId[member.user_id];
    const meta = memberMetaByUserId[member.user_id];
    return (
      formatUserShortName({
        fullName: meta?.fullName ?? member.full_name ?? profile?.label ?? null,
        email: member.email ?? null,
        fallback: "Користувач",
      }) || "Користувач"
    );
  }, [memberMetaByUserId, memberProfilesByUserId]);

  const resolvePulsePerson = useCallback(
    (userId: string): PulsePerson => {
      const member = members.find((candidate) => candidate.user_id === userId) ?? null;
      const profile = memberProfilesByUserId[userId] ?? null;
      const displayName = member ? getMemberDisplayName(member) : profile?.label || "Користувач";
      return {
        userId,
        displayName,
        avatarSrc: member ? getMemberAvatarSource(profile, member) : null,
        initials: getInitialsFromName(displayName, member?.email ?? null),
        jobRole: member?.job_role ?? null,
        online: !!memberPresenceByUserId[userId]?.online,
        // Той самий візит, що показує картка людини. Пульс без нього мовчав
        // про тих, хто заходив, але не набрав активних хвилин. Контекст
        // присутності тримає лише свіжих — далі падаємо на повну історію.
        lastSeenAt: memberPresenceByUserId[userId]?.lastSeenAt || lastSeenByUser.get(userId) || null,
      };
    },
    [members, memberProfilesByUserId, memberPresenceByUserId, getMemberDisplayName, lastSeenByUser]
  );

  const pulsePeople = useMemo<PulsePerson[]>(
    () => members.map((member) => resolvePulsePerson(member.user_id)),
    [members, resolvePulsePerson]
  );

  // Row-action menu items, shared by the desktop master list and (potentially)
  // other member surfaces. Mirrors the previous inline table row menu.
  // Підпис один на всіх, хто картку відкриває. «Відсоток менеджера» стояв тут
  // для СЕО, поки це справді було єдине, що він у картці міг зробити; тепер він
  // редагує там і дані людини, і доступи, — підпис обіцяв би менше, ніж є.
  const getMemberRowMenuItems = (m: Member, availability: string) => [
    { type: "label" as const, label: "Дії" },
    { type: "separator" as const },
    canOpenProfileCard
      ? (canManage ? memberProfileStorageAvailable : true)
        ? {
            label: "Відкрити картку",
            onSelect: () => navigate(`/team/${m.user_id}`),
          }
        : { label: "Профіль (read-only)", disabled: true, muted: true }
      : { label: "Тільки перегляд", disabled: true, muted: true },
    canManage && (isSuperAdmin || (m.user_id !== currentUserId && (m.access_role ?? null) !== "owner"))
      ? {
            label: "Змінити доступи",
            onSelect: () => navigate(`/team/${m.user_id}?section=access`),
          }
      : {
          label: !isSuperAdmin && m.user_id === currentUserId ? "Admin не може змінити себе" : "Тільки перегляд",
          disabled: true,
          muted: true,
        },
    canManage
      ? { label: "Надіслати reset паролю", onSelect: () => void sendPasswordReset(m) }
      : { label: "Reset паролю недоступний", disabled: true, muted: true },
    canManage
      ? {
          label: availability === "offline" ? "Повернути в роботу" : "Позначити як неактивного",
          onSelect: () => void updateAvailabilityStatus(m, availability === "offline" ? "available" : "offline"),
        }
      : { label: "Зміна статусу недоступна", disabled: true, muted: true },
    canManage && (isSuperAdmin || (m.user_id !== currentUserId && (m.access_role ?? null) !== "owner"))
      ? { label: "Видалити користувача", destructive: true, onSelect: () => confirmDeleteMember(m) }
      : {
          label: m.user_id === currentUserId ? "Не можна видалити себе" : "Видалення недоступне",
          disabled: true,
          muted: true,
        },
  ];

  const localProfileFallbackHint =
    "Локально fallback-функція недоступна. Запусти через `netlify dev` або застосуй SQL зі scripts/team-member-profiles.sql.";

  const isExpired = (dateStr: string) => new Date(dateStr) < new Date();

  const handleTabChange = (next: AdminTab) => {
    setActiveTab(next);
    setParams(next === "overview" ? {} : { tab: next });
  };

  /**
   * Провалитись із Пульсу в людину — тепер це перехід у її картку.
   *
   * Раніше треба було спершу зняти фільтр і перемкнути вигляд, інакше панель
   * показувала когось іншого: людина, яку шукали, могла не пройти фільтр
   * списку. Окремий маршрут знімає цю залежність повністю.
   */
  const openPersonCard = (userId: string) => {
    setPulsePeekUserId(null);
    navigate(`/team/${userId}`);
  };

  const sendPasswordReset = async (member: Member) => {
    if (!member.email) {
      toast.error("У користувача немає email");
      return;
    }
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(member.email, {
        redirectTo: `${window.location.origin}/update-password`,
      });
      if (error) throw error;
      toast.success("Лист для скидання паролю надіслано");
    } catch (error: unknown) {
      toast.error("Не вдалося надіслати лист", { description: getErrorMessage(error) });
    }
  };

  const confirmDeleteMember = (member: Member) => {
    if (member.user_id === currentUserId) {
      toast.error("Не можна видалити самого себе");
      return;
    }
    if (!isSuperAdmin && (member.access_role ?? null) === "owner") {
      toast.error("Admin не може видалити Super Admin");
      return;
    }
    setMemberToDelete(member);
  };

  const handleDeleteMember = async () => {
    if (!memberToDelete || !workspaceId || !canManage) return;
    if (memberToDelete.user_id === currentUserId) {
      toast.error("Не можна видалити самого себе");
      return;
    }
    if (!isSuperAdmin && (memberToDelete.access_role ?? null) === "owner") {
      toast.error("Admin не може видалити Super Admin");
      return;
    }

    setMemberDeleteBusy(true);
    try {
      const { data: membershipTarget, error: membershipTargetError } = await supabase
        .schema("tosho")
        .from("memberships_view")
        .select("id")
        .eq("workspace_id", workspaceId)
        .eq("user_id", memberToDelete.user_id)
        .maybeSingle<{ id?: string | null }>();

      if (membershipTargetError && !isRecoverableMemberDeleteError(membershipTargetError.message)) {
        throw new Error(membershipTargetError.message);
      }

      const membershipId = membershipTarget?.id ?? null;
      const membershipSchemas = ["tosho", "public"] as const;
      const deleteAttempts: Array<{
        tableName: string;
        scopes: Array<"workspace_user" | "membership_id" | "team_user">;
      }> = [
        { tableName: "memberships", scopes: ["workspace_user", "membership_id"] },
        { tableName: "workspace_members", scopes: ["workspace_user", "membership_id"] },
        { tableName: "workspace_memberships", scopes: ["workspace_user", "membership_id"] },
        { tableName: "team_members", scopes: ["membership_id", "team_user"] },
      ];

      for (const attempt of deleteAttempts) {
        for (const scope of attempt.scopes) {
          for (const schemaName of membershipSchemas) {
            if (scope === "membership_id" && !membershipId) continue;

            const { error } =
              scope === "workspace_user"
                ? await supabase
                    .schema(schemaName)
                    .from(attempt.tableName as never)
                    .delete()
                    .eq("workspace_id", workspaceId)
                    .eq("user_id", memberToDelete.user_id)
                : scope === "membership_id"
                  ? await supabase
                      .schema(schemaName)
                      .from(attempt.tableName as never)
                      .delete()
                      .eq("id", membershipId as string)
                  : await supabase
                      .schema(schemaName)
                      .from(attempt.tableName as never)
                      .delete()
                      // Саме team_id, НЕ workspaceId: це різні сутності, і з
                      // воркспейсом делет мовчки видаляв нуль рядків. Через це
                      // «видалені» люди лишались у public.team_members — а на
                      // цій таблиці тримається is_team_member(), тобто вся RLS
                      // даних. Знайдено аудитом 21.08.2026: двоє видалених
                      // зберігали повний доступ до CRM.
                      .eq("team_id", teamId ?? "")
                      .eq("user_id", memberToDelete.user_id);

            if (error && !isRecoverableMemberDeleteError(error.message)) {
              throw new Error(error.message);
            }
          }
        }
      }

      const { error: profileDeleteError } = await supabase
        .schema("tosho")
        .from("team_member_profiles")
        .delete()
        .eq("workspace_id", workspaceId)
        .eq("user_id", memberToDelete.user_id);
      if (profileDeleteError && !isRecoverableTeamProfileError(profileDeleteError.message)) {
        throw new Error(profileDeleteError.message);
      }

      setMembers((prev) => prev.filter((member) => member.user_id !== memberToDelete.user_id));
      setMemberProfilesByUserId((prev) => {
        const next = { ...prev };
        delete next[memberToDelete.user_id];
        return next;
      });
      setMemberMetaByUserId((prev) => {
        const next = { ...prev };
        delete next[memberToDelete.user_id];
        return next;
      });
      setMemberPresenceByUserId((prev) => {
        const next = { ...prev };
        delete next[memberToDelete.user_id];
        return next;
      });
      setMemberToDelete(null);
      toast.success("Користувача видалено");
    } catch (error: unknown) {
      toast.error("Не вдалося видалити користувача", { description: getErrorMessage(error) });
    } finally {
      setMemberDeleteBusy(false);
    }
  };

  const updateAvailabilityStatus = async (
    member: Member,
    status: MemberProfileMeta["availabilityStatus"],
    options?: {
      availabilityStartDate?: string;
      availabilityEndDate?: string;
    }
  ) => {
    if (!workspaceId) return;
    try {
      const currentMeta = memberMetaByUserId[member.user_id] ?? DEFAULT_MEMBER_META;
      const availabilityStartDate =
        status === "available" ? "" : (options?.availabilityStartDate ?? currentMeta.availabilityStartDate ?? "");
      const availabilityEndDate =
        status === "available" ? "" : (options?.availabilityEndDate ?? currentMeta.availabilityEndDate ?? "");
      try {
        await upsertWorkspaceMemberProfile({
          workspaceId,
          userId: member.user_id,
          firstName: currentMeta.firstName,
          lastName: currentMeta.lastName,
          fullName: currentMeta.fullName,
          // Аватарку не передаємо — див. коментар у збереженні картки профілю:
          // пересилання значення з кешу затирало щойно завантажену аватарку.
          birthDate: currentMeta.birthDate,
          phone: currentMeta.phone,
          availabilityStatus: status,
          availabilityStartDate,
          availabilityEndDate,
          startDate: currentMeta.startDate,
          probationEndDate: currentMeta.probationEndDate,
          employmentStatus: currentMeta.employmentStatus,
          probationReviewNotifiedAt: currentMeta.probationReviewNotifiedAt,
          probationReviewedAt: currentMeta.probationReviewedAt,
          probationReviewedBy: currentMeta.probationReviewedBy,
          probationExtensionCount: currentMeta.probationExtensionCount,
          managerUserId: currentMeta.managerUserId,
          moduleAccess: currentMeta.moduleAccess,
          updatedBy: currentUserId ?? null,
        });
      } catch (profileUpsertError: unknown) {
        if (!isRecoverableTeamProfileError(getErrorMessage(profileUpsertError))) {
          throw profileUpsertError;
        }
        setMemberProfileStorageAvailable(false);

        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData.session?.access_token;
        if (!accessToken) throw new Error("Не вдалося підтвердити авторизацію", { cause: profileUpsertError });
        const response = await fetch("/.netlify/functions/create-workspace-invite", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            mode: "update_member_profile",
            userId: member.user_id,
            firstName: currentMeta.firstName,
            lastName: currentMeta.lastName,
            birthDate: currentMeta.birthDate,
            phone: currentMeta.phone,
            availabilityStatus: status,
            availabilityStartDate,
            availabilityEndDate,
            startDate: currentMeta.startDate,
            probationEndDate: currentMeta.probationEndDate,
            employmentStatus: currentMeta.employmentStatus,
            managerUserId: currentMeta.managerUserId,
            moduleAccess: currentMeta.moduleAccess,
          }),
        });
        if (response.status === 404) {
          setWorkspaceFunctionAvailable(false);
          throw new Error(localProfileFallbackHint, { cause: profileUpsertError });
        }
        setWorkspaceFunctionAvailable(true);
        const payload = await parseJsonSafe<{ error?: string }>(response);
        if (!response.ok) {
          throw new Error(payload?.error || `Не вдалося оновити статус (HTTP ${response.status})`, { cause: profileUpsertError });
        }
      }
      setMemberMetaByUserId((prev) => ({
        ...prev,
        [member.user_id]: {
          ...(prev[member.user_id] ?? DEFAULT_MEMBER_META),
          availabilityStatus: status,
          availabilityStartDate,
          availabilityEndDate,
        },
      }));
      toast.success(status === "offline" ? "Учасника переведено в неактивний стан" : "Статус учасника оновлено");
    } catch (error: unknown) {
      toast.error("Не вдалося змінити статус", { description: getErrorMessage(error) });
    }
  };

  const callInviteFunction = async (body: Record<string, unknown>) => {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) {
      throw new Error("Не вдалося підтвердити авторизацію");
    }

    const response = await fetch("/.netlify/functions/create-workspace-invite", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    });

    const payload = await parseJsonSafe<{ error?: string; token?: string; actionLink?: string }>(response);
    if (!response.ok) {
      throw new Error(payload?.error || `Invite failed (HTTP ${response.status})`);
    }
    return payload;
  };

  const reloadInvites = async () => {
    if (!workspaceId) return;
    const { data: invitesData } = await supabase
      .schema("tosho")
      .from("workspace_invites")
      .select("id,email,access_role,job_role,token,created_at,expires_at,accepted_at")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false });

    setInvites((invitesData as Invite[]) ?? []);
  };

  const createInvite = async (delivery: InviteDelivery) => {
    if (!workspaceId) return;
    if (!inviteEmail) {
      toast.error("Вкажіть email для інвайту");
      return;
    }
    if (!isSuperAdmin && inviteAccessRole === "owner") {
      toast.error("Admin не може запрошувати Super Admin");
      return;
    }

    setInviteBusy(delivery);
    try {
      const payload = await callInviteFunction({
        email: inviteEmail,
        accessRole: inviteAccessRole,
        jobRole: normalizeJobRoleInput(inviteJobRole),
        expiresInDays: 7,
        delivery,
      });

      setInviteResult({
        delivery,
        email: inviteEmail.trim().toLowerCase(),
        actionLink: payload?.actionLink,
      });

      if (delivery === "link" && payload?.actionLink) {
        await navigator.clipboard.writeText(payload.actionLink).catch(() => undefined);
      }

      await reloadInvites();
    } catch (e: unknown) {
      toast.error("Не вдалося створити інвайт", { description: getErrorMessage(e, "") });
    } finally {
      setInviteBusy(null);
    }
  };

  /** Перевидає вже створене запрошення: свіже посилання або ще один лист. */
  const deliverInvite = async (invite: Invite, delivery: InviteDelivery) => {
    setInviteRowBusy(`${invite.id}:${delivery}`);
    try {
      const payload = await callInviteFunction({
        mode: "deliver_invite",
        inviteId: invite.id,
        delivery,
      });

      if (delivery === "link") {
        const actionLink = payload?.actionLink;
        if (!actionLink) throw new Error("Функція не повернула посилання");
        await navigator.clipboard.writeText(actionLink);
        toast.success("Посилання для входу скопійовано", {
          description:
            "Одноразове, діє близько доби. Надішли в особисті, не в спільний чат. Гасить попереднє посилання і лист «Забув пароль».",
        });
      } else {
        toast.success(`Лист надіслано на ${invite.email}`, {
          description: "Попередній лист більше не діє — робочий лише новий.",
        });
      }
    } catch (e: unknown) {
      toast.error(
        delivery === "link" ? "Не вдалося видати посилання" : "Не вдалося надіслати лист",
        { description: getErrorMessage(e, "") }
      );
    } finally {
      setInviteRowBusy(null);
    }
  };

  const confirmRevoke = (id: string) => {
    setRevokeId(id);
  };

  const openInviteDialog = () => {
    setActiveTab("invites");
    setInviteOpen(true);
    setInviteResult(null);
    setInviteEmail("");
    setInviteAccessRole("member");
    setInviteJobRole("none");
    setParams({ tab: "invites" });
  };

  const handleRevoke = async () => {
    if (!revokeId || !workspaceId) return;
    setRevokeBusy(true);

    const { error } = await supabase
      .schema("tosho")
      .from("workspace_invites")
      .delete()
      .eq("id", revokeId)
      .eq("workspace_id", workspaceId);

    if (error) {
      toast.error("Не вдалося видалити інвайт", { description: error.message });
    } else {
      setInvites((prev) => prev.filter((i) => i.id !== revokeId));
      toast.success("Інвайт скасовано");
    }

    setRevokeBusy(false);
    setRevokeId(null);
  };

  const showSkeleton = useMinimumLoading(
    !workspaceResolved ||
      workspaceLoading ||
      membersLoading ||
      memberProfilesLoading ||
      (canOpenProfileCard && memberMetaLoading) ||
      (activeTab === "invites" && invitesLoading)
  );
  const inviteAccessRoleOptions = isSuperAdmin
    ? ACCESS_ROLE_OPTIONS
    : ACCESS_ROLE_OPTIONS.filter((option) => option.value !== "owner");
  const activeInvitesCount = invites.filter((i) => !i.accepted_at && !isExpired(i.expires_at)).length;

  /**
   * Люди для «Огляду» й «Матриці» — один перелік на обидві вкладки.
   *
   * Дві копії цього мапінгу розійшлися б рівно так, як свого часу розійшлися
   * шість списків модулів: одна врахувала б аватарки, друга — ні.
   */
  const matrixPeople = useMemo<MatrixPerson[]>(
    () =>
      members.map((m) => {
        const name = getMemberDisplayName(m);
        return {
          userId: m.user_id,
          name,
          initials: getInitialsFromName(name, m.email ?? null),
          avatarUrl: getMemberAvatarSource(memberProfilesByUserId[m.user_id], m),
          accessRole: m.access_role ?? null,
          jobRole: m.job_role ?? null,
          moduleAccess: memberMetaByUserId[m.user_id]?.moduleAccess ?? null,
        };
      }),
    [members, memberProfilesByUserId, memberMetaByUserId, getMemberDisplayName]
  );
  const needsAttentionCount = useMemo(() => {
    return members.filter((member) => {
      const meta = memberMetaByUserId[member.user_id];
      return !meta?.birthDate || !meta?.startDate || !(member.job_role ?? "").trim();
    }).length;
  }, [members, memberMetaByUserId]);
  const missingBirthdayCount = useMemo(() => {
    return members.filter((member) => !memberMetaByUserId[member.user_id]?.birthDate).length;
  }, [members, memberMetaByUserId]);
  const missingStartDateCount = useMemo(() => {
    return members.filter((member) => !memberMetaByUserId[member.user_id]?.startDate).length;
  }, [members, memberMetaByUserId]);
  const openAbsenceRangeCount = useMemo(() => {
    return members.filter((member) => {
      const meta = memberMetaByUserId[member.user_id];
      const availabilityStatus = normalizeTeamAvailabilityStatus(meta?.availabilityStatus);
      return availabilityStatus !== "available" && !!meta?.availabilityStartDate && !meta?.availabilityEndDate;
    }).length;
  }, [members, memberMetaByUserId]);

  const headerActions = useMemo(
    () => (
      <UnifiedPageToolbar
        topLeft={
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-3">
            <div className="flex items-center gap-2.5">
              <h1 className="text-lg font-semibold tracking-tight text-foreground">Люди та доступи</h1>
              <CountBadge value={members.length} />
            </div>
            <SegmentedGroup className={cn(SEGMENTED_GROUP, "h-auto flex-wrap")}>
              {ADMIN_TABS.filter((tab) => (tab.key === "pulse" ? canPulse : tab.key === "invites" ? canManage : true)).map(
                (tab) => (
                  <Button
                    key={tab.key}
                    type="button"
                    variant="segmented"
                    size="xs"
                    aria-pressed={activeTab === tab.key}
                    onClick={() => handleTabChange(tab.key)}
                    className={SEGMENTED_TRIGGER}
                  >
                    {tab.label}
                    {tab.key === "people" ? ` (${members.length})` : null}
                    {tab.key === "invites"
                      ? ` (${invites.filter((i) => !i.accepted_at && !isExpired(i.expires_at)).length})`
                      : null}
                  </Button>
                )
              )}
            </SegmentedGroup>
          </div>
        }
        topRight={
          <div className="flex w-full flex-wrap items-center gap-2 md:w-auto md:justify-end lg:ml-auto">
            {canManage ? (
              <Button variant="primary" size="lg" className={cn(TOOLBAR_ACTION_BUTTON, "md:px-5")} onClick={openInviteDialog}>
                Інвайт
              </Button>
            ) : null}
          </div>
        }
        filters={
          activeTab === "people" ? (
            <div className="flex flex-wrap items-center gap-1.5">
            <FilterChip
              label="Всі"
              count={members.length}
              active={activeFilter === null}
              onClick={() => setActiveFilter(null)}
            />
            {needsAttentionCount > 0 ? (
              <FilterChip
                label="Неповні профілі"
                count={needsAttentionCount}
                tone="warning"
                icon={AlertTriangle}
                active={activeFilter === "attention"}
                onClick={() => setActiveFilter((prev) => (prev === "attention" ? null : "attention"))}
              />
            ) : null}
            {openAbsenceRangeCount > 0 ? (
              <FilterChip
                label="Відсутність без кінця"
                count={openAbsenceRangeCount}
                tone="warning"
                icon={Activity}
                active={activeFilter === "absence"}
                onClick={() => setActiveFilter((prev) => (prev === "absence" ? null : "absence"))}
              />
            ) : null}
            {missingBirthdayCount > 0 ? (
              <FilterChip
                label="Без дня народження"
                count={missingBirthdayCount}
                icon={Gift}
                active={activeFilter === "birthday"}
                onClick={() => setActiveFilter((prev) => (prev === "birthday" ? null : "birthday"))}
              />
            ) : null}
            {missingStartDateCount > 0 ? (
              <FilterChip
                label="Без дати старту"
                count={missingStartDateCount}
                icon={Calendar}
                active={activeFilter === "startDate"}
                onClick={() => setActiveFilter((prev) => (prev === "startDate" ? null : "startDate"))}
              />
            ) : null}
            {activeInvitesCount > 0 && canManage ? (
              <button
                type="button"
                onClick={() => handleTabChange("invites")}
                className="tone-success-subtle tone-text-success ml-auto inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-transparent px-3 py-1 text-xs font-medium transition-colors duration-200 hover:brightness-[0.97]"
              >
                <LinkIcon className="h-3.5 w-3.5" />
                <span>Активні інвайти</span>
                <span className="tabular-nums opacity-70">{activeInvitesCount}</span>
              </button>
            ) : null}
            </div>
          ) : undefined
        }
      />
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      activeTab,
      members.length,
      invites,
      canManage,
      canPulse,
      activeFilter,
      needsAttentionCount,
      missingBirthdayCount,
      missingStartDateCount,
      openAbsenceRangeCount,
      activeInvitesCount,
    ]
  );

  usePageHeaderActions(headerActions, [headerActions]);

  if (showSkeleton) {
    return <PageLoading />;
  }

  if (!workspaceId) {
    return (
      <div className="flex flex-col gap-6 w-full max-w-[1400px] mx-auto pb-20 md:pb-0">
        <div className="overflow-hidden flex flex-col">
          <div className="p-6">
            <div className="text-sm font-semibold text-foreground">Workspace not selected</div>
            <div className="mt-1 text-sm text-muted-foreground">
              Немає доступного workspace. Перевір права доступу або створіть workspace.
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col pb-20 md:pb-0">
      <div className="overflow-hidden flex flex-col">
        {activeTab === "people" ? (
          <>
          <div className="space-y-3 px-4 lg:hidden">
            {membersError ? (
              <Card className="border-border/60 p-4 text-sm text-destructive">Помилка завантаження: {membersError}</Card>
            ) : filteredMembers.length === 0 ? (
              <Card className="border-border/60 p-4 text-sm text-muted-foreground">Нема учасників.</Card>
            ) : (
              filteredMembers.map((m) => {
                const profile = memberProfilesByUserId[m.user_id];
                const meta = memberMetaByUserId[m.user_id];
                const availability = meta?.availabilityStatus ?? "available";
                const availabilityRange = formatAvailabilityRange(
                  availability,
                  meta?.availabilityStartDate,
                  meta?.availabilityEndDate
                );
                const presence = memberPresenceByUserId[m.user_id];
                const employmentDays = getEmploymentDurationDays(meta?.startDate);
                const probation = getProbationSummary(meta?.startDate, meta?.probationEndDate);
                const employmentSummary = getEmploymentSummary(meta);
                const isInactive = isInactiveEmployment(meta?.employmentStatus);
                const displayName = getMemberDisplayName(m);
                const initials = getInitialsFromName(displayName, m.email ?? null);
                return (
                  <Card
                    key={m.user_id}
                    className={cn("border-border/60 p-4", canOpenProfileCard && "cursor-pointer")}
                    onClick={() => navigate(`/team/${m.user_id}`)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="relative shrink-0">
                          <AvatarBase
                            src={getMemberAvatarSource(profile, m)}
                            name={displayName}
                            fallback={initials}
                            assetVariant="md"
                            size={44}
                            shape="circle"
                            className="border-border bg-muted/50"
                            fallbackClassName="text-xs font-bold"
                            availability={availability}
                            presence={presence?.online ? "online" : "offline"}
                            inactive={isInactive}
                          />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={cn("truncate text-sm font-semibold text-foreground", isInactive && "text-muted-foreground line-through")}>{displayName}</span>
                            {isInactive ? (
                              <Badge
                                variant="outline"
                                className="shrink-0 px-1.5 py-0 text-3xs font-medium border-destructive/40 bg-destructive/10 text-destructive"
                              >
                                Завершено
                              </Badge>
                            ) : null}
                          </div>
                          <div className="mt-1 truncate text-xs text-muted-foreground">{m.email || "Не вказано"}</div>
                          <div className="mt-1 text-xs text-muted-foreground">{meta?.phone || "Телефон не вказано"}</div>
                        </div>
                      </div>
                      <AppDropdown
                        align="end"
                        contentClassName="w-48"
                        trigger={
                          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        }
                        items={[
                          { type: "label", label: "Дії" },
                          { type: "separator" },
                          canOpenProfileCard
                            ? (canManage ? memberProfileStorageAvailable : true)
                              ? {
                                  label: "Відкрити картку",
                                  onSelect: () => navigate(`/team/${m.user_id}`),
                                }
                              : {
                                  label: "Профіль (read-only)",
                                  disabled: true,
                                  muted: true,
                                }
                            : {
                                label: "Тільки перегляд",
                                disabled: true,
                                muted: true,
                              },
                          canManage &&
                          (isSuperAdmin || (m.user_id !== currentUserId && (m.access_role ?? null) !== "owner"))
                            ? {
                                label: "Змінити доступи",
                                onSelect: () => navigate(`/team/${m.user_id}?section=access`),
                              }
                            : {
                                label:
                                  !isSuperAdmin && m.user_id === currentUserId
                                    ? "Admin не може змінити себе"
                                    : "Тільки перегляд",
                                disabled: true,
                                muted: true,
                              },
                          canManage
                            ? {
                                label: "Надіслати reset паролю",
                                onSelect: () => void sendPasswordReset(m),
                              }
                            : {
                                label: "Reset паролю недоступний",
                                disabled: true,
                                muted: true,
                              },
                          canManage
                            ? {
                                label:
                                  availability === "offline"
                                    ? "Повернути в роботу"
                                    : "Позначити як неактивного",
                                onSelect: () =>
                                  void updateAvailabilityStatus(
                                    m,
                                  availability === "offline" ? "available" : "offline"
                                  ),
                              }
                            : {
                                label: "Зміна статусу недоступна",
                                disabled: true,
                                muted: true,
                              },
                          canManage &&
                          (isSuperAdmin || (m.user_id !== currentUserId && (m.access_role ?? null) !== "owner"))
                            ? {
                                label: "Видалити користувача",
                                destructive: true,
                                onSelect: () => confirmDeleteMember(m),
                              }
                            : {
                                label: m.user_id === currentUserId ? "Не можна видалити себе" : "Видалення недоступне",
                                disabled: true,
                                muted: true,
                              },
                        ]}
                      />
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Badge variant="outline" className={cn("px-2.5 py-1 font-medium", getAccessBadgeClass(m.access_role))}>
                        {getAccessRoleLabel(m.access_role)}
                      </Badge>
                      <Badge variant="outline" className={cn("px-2.5 py-1 font-medium", getJobBadgeClass(m.job_role))}>
                        {getJobRoleLabel(m.job_role)}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={cn(
                          "px-2 py-0.5 text-xs",
                          isInactive
                            ? "border-muted-foreground/30 bg-muted text-muted-foreground"
                            : getTeamAvailabilityBadgeClass(availability)
                        )}
                      >
                        {isInactive ? "Неактивний" : getTeamAvailabilityLabel(availability)}
                      </Badge>
                      {!isInactive && availabilityRange ? (
                        <Badge variant="outline" className="px-2 py-0.5 text-xs text-muted-foreground">
                          {availabilityRange}
                        </Badge>
                      ) : null}
                    </div>
                    <div className="mt-3 grid grid-cols-1 gap-2 text-xs text-muted-foreground">
                      <div>Народження: {formatBirthDate(meta?.birthDate)}</div>
                      <div>Робота: {employmentSummary.primary}</div>
                      {employmentSummary.secondary ? <div>Стаж: {employmentSummary.secondary}</div> : null}
                      {employmentDays !== null && employmentDays >= 0 ? <div>У компанії: {employmentDays} днів</div> : null}
                      {probation ? (
                        <div className="rounded-[var(--radius)] border border-border/70 bg-muted/30 px-2.5 py-2 text-foreground">
                          <div className="flex items-center justify-between gap-2">
                            <span
                              className={cn(
                                "inline-flex rounded-full border px-2 py-0.5 text-2xs font-medium",
                                getProbationBadgeClass(probation.status)
                              )}
                            >
                              Випробувальний: {probation.statusLabel}
                            </span>
                            {probation.status !== "completed" ? (
                              <span className="text-2xs text-muted-foreground">{probation.progress}%</span>
                            ) : null}
                          </div>
                          {probation.status !== "completed" ? (
                            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-background">
                              <div
                                className={cn(
                                  "h-full rounded-full",
                                  probation.status === "active"
                                    ? "tone-dot-warning"
                                    : "bg-muted-foreground/40"
                                )}
                                style={{ width: `${probation.progress}%` }}
                              />
                            </div>
                          ) : null}
                          <div className="mt-2 text-2xs text-muted-foreground">{probation.caption}</div>
                        </div>
                      ) : null}
                      <div>{presence?.online ? "Зараз онлайн" : formatRelativeTime(presence?.lastSeenAt)}</div>
                    </div>
                  </Card>
                );
              })
            )}
          </div>

          {/* Порівняльна таблиця — десктопний вигляд вкладки «Люди».
              Клік по рядку веде в картку людини (/team/:userId), а не
              розкриває панель поруч: картка тепер одна на застосунок. */}
            <div className="hidden border-t border-border/60 pb-8 lg:block">
              <Table variant="list" size="md" className="[&_td]:px-4 [&_th]:px-4">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableTextHeaderCell widthClass="w-[24%]" className="pl-6">Користувач</TableTextHeaderCell>
                    <TableTextHeaderCell>Доступ</TableTextHeaderCell>
                    <TableTextHeaderCell>Посада</TableTextHeaderCell>
                    <TableTextHeaderCell>Статус</TableTextHeaderCell>
                    <TableTextHeaderCell>День народження</TableTextHeaderCell>
                    <TableTextHeaderCell widthClass="w-[20%]">Робота / Випробувальний</TableTextHeaderCell>
                    <TableActionHeaderCell />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredMembers.length === 0 ? (
                    <TableEmptyRow colSpan={7}>Нема учасників за фільтром.</TableEmptyRow>
                  ) : (
                    filteredMembers.map((m) => {
                      const rowProfile = memberProfilesByUserId[m.user_id];
                      const rowMeta = memberMetaByUserId[m.user_id];
                      const rowAvailability = rowMeta?.availabilityStatus ?? "available";
                      const rowRange = formatAvailabilityRange(rowAvailability, rowMeta?.availabilityStartDate, rowMeta?.availabilityEndDate);
                      const rowPresence = memberPresenceByUserId[m.user_id];
                      const rowInactive = isInactiveEmployment(rowMeta?.employmentStatus);
                      const rowName = getMemberDisplayName(m);
                      const rowInitials = getInitialsFromName(rowName, m.email ?? null);
                      const rowEmployment = getEmploymentSummary(rowMeta);
                      const rowProbation = getProbationSummary(rowMeta?.startDate, rowMeta?.probationEndDate);
                      return (
                        <TableRow
                          key={m.user_id}
                          className="cursor-pointer transition-colors hover:bg-muted/40"
                          onClick={() => navigate(`/team/${m.user_id}`)}
                        >
                          <TableCell className="pl-6">
                            <div className="flex items-center gap-2.5">
                              <AvatarBase
                                src={getMemberAvatarSource(rowProfile, m)}
                                name={rowName}
                                fallback={rowInitials}
                                assetVariant="xs"
                                size={34}
                                shape="circle"
                                className="border-border bg-muted/50"
                                fallbackClassName="text-3xs font-bold"
                                availability={rowAvailability}
                                presence={rowPresence?.online ? "online" : "offline"}
                                inactive={rowInactive}
                              />
                              <div className="min-w-0">
                                <div className={cn("truncate text-sm font-medium text-foreground", rowInactive && "text-muted-foreground line-through")}>{rowName}</div>
                                <div className="truncate text-xs text-muted-foreground">{m.email ?? ""}</div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={cn("px-2 py-0.5 text-xs font-medium rounded-full", getAccessBadgeClass(m.access_role ?? null))}>
                              {getAccessRoleLabel(m.access_role ?? null)}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={cn("px-2 py-0.5 text-xs font-medium rounded-full", getJobBadgeClass(m.job_role ?? null))}>
                              {getJobRoleLabel(m.job_role ?? null)}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1">
                              {rowInactive ? (
                                <Badge variant="outline" className="w-fit px-2 py-0.5 text-xs rounded-full border-muted-foreground/30 bg-muted text-muted-foreground">
                                  Співпрацю завершено
                                </Badge>
                              ) : (
                                <Badge variant="outline" className={cn("w-fit px-2 py-0.5 text-xs rounded-full", getTeamAvailabilityBadgeClass(rowAvailability))}>
                                  {getTeamAvailabilityLabel(rowAvailability)}
                                </Badge>
                              )}
                              {!rowInactive && rowRange ? (
                                <Badge variant="outline" className="w-fit px-2 py-0.5 text-xs text-muted-foreground">{rowRange}</Badge>
                              ) : null}
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm text-muted-foreground">{formatBirthDate(rowMeta?.birthDate)}</span>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1">
                              <span className="text-sm font-medium text-foreground">{rowEmployment.primary}</span>
                              {rowEmployment.secondary ? (
                                <span className="text-xs text-muted-foreground">{rowEmployment.secondary}</span>
                              ) : null}
                              {rowProbation && rowProbation.status !== "completed" ? (
                                <div className="flex items-center gap-2">
                                  <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                                    <div className="h-full rounded-full bg-primary" style={{ width: `${rowProbation.progress}%` }} />
                                  </div>
                                  <span className="whitespace-nowrap text-2xs tabular-nums text-muted-foreground">{rowProbation.statusLabel}</span>
                                </div>
                              ) : null}
                            </div>
                          </TableCell>
                          <TableActionCell>
                            <div onClick={(event) => event.stopPropagation()}>
                              <AppDropdown
                                align="end"
                                contentClassName="w-48"
                                trigger={
                                  <Button variant="ghost" size="icon" className="h-8 w-8">
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                }
                                items={getMemberRowMenuItems(m, rowAvailability)}
                              />
                            </div>
                          </TableActionCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </>
        ) : null}

        {activeTab === "invites" && canManage ? (
          <>
          <div className="space-y-3 px-4 md:hidden">
            {invitesError ? (
              <Card className="border-border/60 p-4 text-sm text-destructive">Помилка завантаження: {invitesError}</Card>
            ) : invites.length === 0 ? (
              <Card className="border-border/60 p-4 text-sm text-muted-foreground">Немає активних запрошень.</Card>
            ) : (
              invites.map((inv) => {
                const expired = isExpired(inv.expires_at);
                const used = !!inv.accepted_at;
                return (
                  <Card key={inv.id} className="border-border/60 p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-border bg-muted">
                        <LinkIcon className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-foreground">
                          {inv.email || "Публічне посилання"}
                        </div>
                        <div className="mt-1 truncate font-mono text-xs text-muted-foreground">...{inv.token.slice(-8)}</div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Badge variant="outline" className={cn("px-2 py-0.5 text-xs", getAccessBadgeClass(inv.access_role))}>
                            {getAccessRoleLabel(inv.access_role)}
                          </Badge>
                          <Badge variant="outline" className={cn("px-2 py-0.5 text-xs", getJobBadgeClass(inv.job_role))}>
                            {getJobRoleLabel(inv.job_role)}
                          </Badge>
                          {used ? (
                            <Badge variant="secondary" className="bg-muted text-muted-foreground hover:bg-muted">
                              Використано
                            </Badge>
                          ) : expired ? (
                            <Badge variant="destructive" className="bg-danger-soft text-danger-foreground border-danger-soft-border hover:bg-danger-soft">
                              Прострочено
                            </Badge>
                          ) : (
                            <Badge variant="default" className="bg-warning-soft text-warning-foreground border-warning-soft-border hover:bg-warning-soft">
                              Очікує входу
                            </Badge>
                          )}
                        </div>
                        <div className="mt-3 text-xs text-muted-foreground">Створено: {formatDate(inv.created_at)}</div>
                        <div className="mt-3 flex gap-2">
                          {!expired && !used ? (
                            <>
                              <Button
                                size="iconXs"
                                variant="control"
                                title="Скопіювати посилання для входу"
                                disabled={inviteRowBusy !== null}
                                onClick={() => deliverInvite(inv, "link")}
                              >
                                {inviteRowBusy === `${inv.id}:link` ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Copy className="w-4 h-4" />
                                )}
                              </Button>
                              <Button
                                size="iconXs"
                                variant="control"
                                title="Надіслати лист ще раз"
                                disabled={inviteRowBusy !== null}
                                onClick={() => deliverInvite(inv, "email")}
                              >
                                {inviteRowBusy === `${inv.id}:email` ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Mail className="w-4 h-4" />
                                )}
                              </Button>
                            </>
                          ) : null}
                          <Button size="iconXs" variant="controlDestructive" onClick={() => confirmRevoke(inv.id)}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </Card>
                );
              })
            )}
          </div>
          <div className="hidden overflow-x-auto md:block">
            <Table variant="list" size="md" className="[&_td]:px-4 [&_th]:px-4">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableTextHeaderCell widthClass="w-[40%]" className="pl-6">
                    Посилання / Email
                  </TableTextHeaderCell>
                  <TableTextHeaderCell>Доступ</TableTextHeaderCell>
                  <TableTextHeaderCell>Роль</TableTextHeaderCell>
                  <TableTextHeaderCell>Статус</TableTextHeaderCell>
                  <TableTextHeaderCell>Створено</TableTextHeaderCell>
                  <TableActionHeaderCell>Дії</TableActionHeaderCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invitesError ? (
                  <TableEmptyRow colSpan={6}>Помилка завантаження: {invitesError}</TableEmptyRow>
                ) : invites.length === 0 ? (
                  <TableEmptyRow colSpan={6}>Немає активних запрошень.</TableEmptyRow>
                ) : (
                  invites.map((inv) => {
                    const expired = isExpired(inv.expires_at);
                    const used = !!inv.accepted_at;

                    return (
                      <TableRow key={inv.id} className="hover:bg-muted/40 transition-colors">
                        <TableCell className="pl-6">
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius)] bg-muted border border-border">
                              <LinkIcon className="w-4 h-4 text-muted-foreground" />
                            </div>
                            <div className="flex flex-col max-w-[240px]">
                              <span className="text-sm font-medium truncate text-foreground">
                                {inv.email || "Публічне посилання"}
                              </span>
                              <span className="text-xs text-muted-foreground truncate font-mono opacity-70">
                                ...{inv.token.slice(-8)}
                              </span>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={cn("px-2 py-0.5 text-xs rounded-full", getAccessBadgeClass(inv.access_role))}
                          >
                            {getAccessRoleLabel(inv.access_role)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={cn("px-2 py-0.5 text-xs rounded-full", getJobBadgeClass(inv.job_role))}
                          >
                            {getJobRoleLabel(inv.job_role)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {used ? (
                            <Badge variant="secondary" className="bg-muted text-muted-foreground hover:bg-muted">
                              Використано
                            </Badge>
                          ) : expired ? (
                            <Badge
                              variant="destructive"
                              className="bg-danger-soft text-danger-foreground border-danger-soft-border hover:bg-danger-soft"
                            >
                              Прострочено
                            </Badge>
                          ) : (
                            <Badge
                              variant="default"
                              className="bg-warning-soft text-warning-foreground border-warning-soft-border hover:bg-warning-soft"
                            >
                              Очікує входу
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground" title={new Date(inv.created_at).toLocaleString()}>
                            <Clock className="w-3.5 h-3.5 opacity-70" />
                            <span>{formatDate(inv.created_at)}</span>
                          </div>
                        </TableCell>
                        <TableActionCell className="pr-6">
                          <div className="flex items-center justify-end gap-2">
                            {!expired && !used ? (
                              <>
                                <Button
                                  size="iconXs"
                                  variant="control"
                                  title="Скопіювати посилання для входу"
                                  disabled={inviteRowBusy !== null}
                                  onClick={() => deliverInvite(inv, "link")}
                                >
                                  {inviteRowBusy === `${inv.id}:link` ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <Copy className="w-4 h-4" />
                                  )}
                                </Button>
                                <Button
                                  size="iconXs"
                                  variant="control"
                                  title="Надіслати лист ще раз"
                                  disabled={inviteRowBusy !== null}
                                  onClick={() => deliverInvite(inv, "email")}
                                >
                                  {inviteRowBusy === `${inv.id}:email` ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <Mail className="w-4 h-4" />
                                  )}
                                </Button>
                              </>
                            ) : null}
                            <Button size="iconXs" variant="controlDestructive" onClick={() => confirmRevoke(inv.id)}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableActionCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
          </>
        ) : null}

        {activeTab === "matrix" ? (
          <AccessMatrix
            people={matrixPeople}
            workspaceId={workspaceId}
            // Набори посад міняють ті самі, хто редагує доступи людей.
            canEditRoles={isSuperAdmin || isSeo}
            actorUserId={currentUserId}
            onPeopleChanged={() => setMembersReloadToken((token) => token + 1)}
          />
        ) : null}

        {activeTab === "overview" ? (
          <AccessOverview
            people={matrixPeople}
            workspaceId={workspaceId}
            pendingInvites={activeInvitesCount}
            onOpenMatrix={() => handleTabChange("matrix")}
          />
        ) : null}

        {activeTab === "pulse" && canPulse ? (
          <TeamPulsePanel
            workspaceId={workspaceId}
            people={pulsePeople}
            resolvePerson={resolvePulsePerson}
            onSelectPerson={setPulsePeekUserId}
            periodState={{
              range: pulseRange,
              setRange: setPulseRange,
              periodOffset: pulsePeriodOffset,
              setPeriodOffset: setPulsePeriodOffset,
            }}
          />
        ) : null}
      </div>

      {/* Пульс peek: activity detail without leaving the dashboard. Read-only on
          purpose — managing a person stays in their card, one place as before. */}
      <Sheet open={!!pulsePeekUserId} onOpenChange={(open) => { if (!open) setPulsePeekUserId(null); }}>
        <SheetContent
          side="right"
          className="flex h-full w-full flex-col gap-0 overflow-hidden border-l border-border bg-card p-0 text-foreground sm:max-w-[640px]"
          dismissible={true}
        >
          {pulsePeekUserId ? (() => {
            const peekPerson = resolvePulsePerson(pulsePeekUserId);
            const peekMember = members.find((m) => m.user_id === pulsePeekUserId) ?? null;
            return (
              <>
                <div className="shrink-0 border-b border-border bg-muted/10 px-6 py-5">
                  <SheetHeader>
                    <SheetTitle className="flex items-center gap-3 text-left">
                      <AvatarBase
                        src={peekPerson.avatarSrc}
                        name={peekPerson.displayName}
                        fallback={peekPerson.initials}
                        assetVariant="xs"
                        size={40}
                        shape="circle"
                        className="border-border bg-muted/50"
                        fallbackClassName="text-2xs font-bold"
                        presence={peekPerson.online ? "online" : "offline"}
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-lg font-semibold text-foreground">
                          {peekPerson.displayName}
                        </span>
                        <span className="block truncate text-sm font-normal text-muted-foreground">
                          {getJobRoleLabel(peekMember?.job_role ?? null)}
                        </span>
                      </span>
                    </SheetTitle>
                    <SheetDescription className="sr-only">Активність учасника</SheetDescription>
                  </SheetHeader>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto">
                  <div className="flex flex-col gap-4 px-6 py-5">
                    {canPulse ? <PersonTimeInCrm userId={pulsePeekUserId} /> : null}
                    <PersonActivitySection userId={pulsePeekUserId} />
                  </div>
                </div>
                <div className="shrink-0 border-t border-border bg-card px-6 py-4">
                  <Button
                    variant="outline"
                    className="h-10 w-full"
                    onClick={() => openPersonCard(pulsePeekUserId)}
                  >
                    Відкрити картку учасника
                  </Button>
                </div>
              </>
            );
          })() : null}
        </SheetContent>
      </Sheet>

      <Dialog
        open={inviteOpen}
        onOpenChange={(open) => {
          setInviteOpen(open);
          if (!open) setInviteResult(null);
        }}
      >
        <DialogContent className="sm:max-w-[520px] p-0 gap-0 overflow-hidden border border-border bg-card text-foreground">
          <div className="p-6 border-b border-border bg-muted/10">
            <DialogHeader>
              <DialogTitle className="text-xl font-semibold text-foreground">Запросити в workspace</DialogTitle>
              <DialogDescription className="mt-1.5 text-muted-foreground">
                Дати новій людині доступ до workspace.
              </DialogDescription>
            </DialogHeader>
          </div>
          <div className="p-6">
            {!inviteResult ? (
              <div className="space-y-6">
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-foreground">Email</Label>
                  <Input
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="user@company.com"
                    className="h-11"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-foreground">Рівень доступу</Label>
                  <Select value={inviteAccessRole} onValueChange={setInviteAccessRole}>
                    <SelectTrigger className={cn(CONTROL_BASE, "h-11")}>{
                      inviteAccessRoleOptions.find((o) => o.value === inviteAccessRole)?.label
                    }</SelectTrigger>
                    <SelectContent>
                      {inviteAccessRoleOptions.map((role) => (
                        <SelectItem key={role.value} value={role.value}>
                          {role.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-foreground">Роль у команді</Label>
                  <Select value={inviteJobRole} onValueChange={setInviteJobRole}>
                    <SelectTrigger className={cn(CONTROL_BASE, "h-11")}>{
                      JOB_ROLE_OPTIONS.find((o) => o.value === inviteJobRole)?.label
                    }</SelectTrigger>
                    <SelectContent>
                      {JOB_ROLE_OPTIONS.map((role) => (
                        <SelectItem key={role.value} value={role.value}>
                          {role.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-3">
                  <Button
                    onClick={() => createInvite("link")}
                    disabled={inviteBusy !== null}
                    className="w-full h-11"
                  >
                    {inviteBusy === "link" ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <LinkIcon className="mr-2 h-4 w-4" /> Отримати посилання для входу
                      </>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => createInvite("email")}
                    disabled={inviteBusy !== null}
                    className="w-full h-11"
                  >
                    {inviteBusy === "email" ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <Mail className="mr-2 h-4 w-4" /> Надіслати лист-запрошення
                      </>
                    )}
                  </Button>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Посилання працює одразу — передаєш його людині сам. Лист залежить від доставки
                    пошти й нерідко потрапляє у спам. Одне одному вони не заважають, але повторна
                    видача того самого способу лишає робочим тільки останнє.
                  </p>
                </div>
              </div>
            ) : inviteResult.delivery === "link" ? (
              <div className="space-y-6">
                <div className="tone-success-subtle tone-text-success flex flex-col items-center justify-center rounded-inner border p-6">
                  <div className="tone-icon-box-success mb-3 flex h-12 w-12 items-center justify-center rounded-full border">
                    <LinkIcon className="w-6 h-6" />
                  </div>
                  <span className="font-bold text-lg text-foreground">Посилання готове!</span>
                  <span className="text-sm opacity-80 mt-1 text-center max-w-xs text-muted-foreground">
                    Уже в буфері обміну. Надішли його {inviteResult.email} — воно і впустить в
                    акаунт, і відкриє сторінку, де людина задасть свій пароль.
                  </span>
                </div>
                <div className="space-y-2">
                  <Label className="font-medium text-foreground">Посилання для копіювання</Label>
                  <div className="flex gap-2">
                    <Input
                      value={inviteResult.actionLink ?? ""}
                      readOnly
                      className="font-mono text-sm bg-muted/50 h-11 border-dashed text-foreground"
                    />
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-11 w-11 shrink-0"
                      onClick={() => {
                        if (!inviteResult.actionLink) return;
                        navigator.clipboard.writeText(inviteResult.actionLink);
                        toast.success("Скопійовано в буфер обміну");
                      }}
                    >
                      <Copy className="w-5 h-5" />
                    </Button>
                  </div>
                </div>
                <div className="flex items-start gap-3 rounded-inner border border-warning-soft-border bg-warning-soft p-4 text-warning-foreground">
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                  <p className="text-xs leading-relaxed">
                    Це ключ від акаунта: хто перейде за ним, той і зайде. Одноразове, діє близько
                    доби. Надсилай в особисті, не в спільний чат.
                  </p>
                </div>
                <Button variant="ghost" className="w-full h-11" onClick={() => setInviteOpen(false)}>
                  Закрити
                </Button>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="tone-success-subtle tone-text-success flex flex-col items-center justify-center rounded-inner border p-6">
                  <div className="tone-icon-box-success mb-3 flex h-12 w-12 items-center justify-center rounded-full border">
                    <Mail className="w-6 h-6" />
                  </div>
                  <span className="font-bold text-lg text-foreground">Лист надіслано</span>
                  <span className="text-sm opacity-80 mt-1 text-center max-w-xs text-muted-foreground">
                    На {inviteResult.email}. Хай відкриє лист — і одразу потрапить на сторінку, де
                    задасть пароль. Якщо не дійшов, варто пошукати у спамі.
                  </span>
                </div>
                <Button
                  variant="outline"
                  className="w-full h-11"
                  disabled={inviteBusy !== null}
                  onClick={() => createInvite("link")}
                >
                  {inviteBusy === "link" ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <LinkIcon className="mr-2 h-4 w-4" /> Отримати посилання замість листа
                    </>
                  )}
                </Button>
                <Button variant="ghost" className="w-full h-11" onClick={() => setInviteOpen(false)}>
                  Закрити
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>



      <Dialog open={!!revokeId} onOpenChange={(open) => !open && setRevokeId(null)}>
        {/* Підтвердження, а не форма: тут нема введеного, яке можна втратити. */}
        <DialogContent dismissible className="sm:max-w-[420px] p-0 gap-0 border border-border bg-card text-foreground overflow-hidden rounded-inner">
          <div className="p-6 flex flex-col items-center text-center">
            <div className="w-14 h-14 bg-danger-soft rounded-full flex items-center justify-center mb-4 text-destructive border border-danger-soft-border">
              <AlertTriangle className="w-7 h-7" />
            </div>
            <DialogHeader>
              <DialogTitle className="text-xl font-bold text-foreground text-center">Скасувати інвайт?</DialogTitle>
              <DialogDescription className="text-muted-foreground text-center mt-2">
                Це посилання перестане працювати, і ніхто не зможе приєднатися за ним.
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="flex flex-col gap-3 p-6 pt-0 sm:flex-row">
            <Button variant="outline" className="flex-1 h-11" onClick={() => setRevokeId(null)}>
              Скасувати
            </Button>
            <Button
              variant="destructiveSolid"
              className="flex-1 h-11"
              onClick={handleRevoke}
              disabled={revokeBusy}
            >
              {revokeBusy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />}
              Так, видалити
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!memberToDelete} onOpenChange={(open) => !open && !memberDeleteBusy && setMemberToDelete(null)}>
        {/* Підтвердження, а не форма: тут нема введеного, яке можна втратити. */}
        <DialogContent dismissible className="sm:max-w-[420px] p-0 gap-0 border border-border bg-card text-foreground overflow-hidden rounded-inner">
          <div className="p-6 flex flex-col items-center text-center">
            <div className="w-14 h-14 bg-danger-soft rounded-full flex items-center justify-center mb-4 text-destructive border border-danger-soft-border">
              <AlertTriangle className="w-7 h-7" />
            </div>
            <DialogHeader>
              <DialogTitle className="text-xl font-bold text-foreground text-center">Видалити користувача?</DialogTitle>
              <DialogDescription className="text-muted-foreground text-center mt-2">
                {memberToDelete
                  ? `Користувач ${getMemberDisplayName(memberToDelete)} буде видалений з команди. Дію не можна скасувати.`
                  : "Користувач буде видалений з команди."}
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="flex flex-col gap-3 p-6 pt-0 sm:flex-row">
            <Button variant="outline" className="flex-1 h-11" onClick={() => setMemberToDelete(null)} disabled={memberDeleteBusy}>
              Скасувати
            </Button>
            <Button
              variant="destructiveSolid"
              className="flex-1 h-11"
              onClick={handleDeleteMember}
              disabled={memberDeleteBusy}
            >
              {memberDeleteBusy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />}
              Так, видалити
            </Button>
          </div>
        </DialogContent>
      </Dialog>


    </div>
  );
}
