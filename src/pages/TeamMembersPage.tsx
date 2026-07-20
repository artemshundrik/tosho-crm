import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";
import {
  ShieldAlert,
  MoreHorizontal,
  Columns2,
  Rows3,
  Calendar,
  Link as LinkIcon,
  Clock,
  Copy,
  Trash2,
  Loader2,
  AlertTriangle,
  Activity,
  Gift,
  ChevronRight,
  Users,
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
import { ListSkeleton } from "@/components/app/page-skeleton-templates";
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
  PersonAccessHistorySection,
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
  SEGMENTED_GROUP_SM,
  SEGMENTED_TRIGGER,
  SEGMENTED_TRIGGER_SM,
  TOOLBAR_ACTION_BUTTON,
} from "@/components/ui/controlStyles";
import { Checkbox } from "@/components/ui/checkbox";
import { resolveWorkspaceId } from "@/lib/workspace";
import { buildUserNameFromMetadata, formatUserShortName, getInitialsFromName } from "@/lib/userName";
import {
  getEmploymentStatusLabel,
  formatEmploymentDate,
  formatEmploymentDuration,
  getEmploymentDurationDays,
  isInactiveEmployment,
  normalizeEmploymentStatus,
  getProbationSummary,
  type EmploymentStatus,
} from "@/lib/employment";
import { useWorkspacePresence } from "@/components/app/workspace-presence-context";
import { ConfirmDialog } from "@/components/app/ConfirmDialog";
import { UnifiedPageToolbar } from "@/components/app/headers/UnifiedPageToolbar";
import { usePageHeaderActions } from "@/components/app/page-header-actions";
import { TeamPulsePanel, type PulsePerson } from "@/components/team/TeamPulsePanel";
import {
  listWorkspaceMemberDirectory,
  upsertWorkspaceMemberProfile,
  type WorkspaceMemberDirectoryRow,
} from "@/lib/workspaceMemberDirectory";
import { normalizeTeamAvailabilityStatus } from "@/lib/teamAvailability";

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
  moduleAccess: {
    overview: boolean;
    orders: boolean;
    design: boolean;
    logistics: boolean;
    catalog: boolean;
    contractors: boolean;
    stock: boolean;
    finance: boolean;
    vchasno: boolean;
    vchasno_send: boolean;
    marketing: boolean;
    team: boolean;
    pulse: boolean;
  };
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

type TeamMembersPageCache = {
  workspaceId: string | null;
  members: Member[];
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

const ACCESS_ROLE_LABELS: Record<string, string> = {
  owner: "Super Admin",
  admin: "Admin",
  member: "Member",
};

const JOB_ROLE_LABELS: Record<string, string> = {
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

const ACCESS_ROLE_OPTIONS: AccessRoleOption[] = [
  { value: "member", label: "Member" },
  { value: "admin", label: "Admin" },
  { value: "owner", label: "Super Admin" },
];

const MEMBER_ACCESS_ROLE_OPTIONS: AccessRoleOption[] = [
  ...ACCESS_ROLE_OPTIONS,
];

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
  { value: "chief_accountant", label: "Головний бухгалтер" },
  { value: "marketer", label: "Маркетолог" },
  { value: "smm", label: "СММ" },
  { value: "seo", label: "SEO" },
];

const AVAILABILITY_OPTIONS = [
  { value: "available", label: "Доступний" },
  { value: "vacation", label: "Відпустка" },
  { value: "sick_leave", label: "Лікарняний" },
  { value: "offline", label: "Поза офісом" },
] as const;

const DEFAULT_MODULE_ACCESS = {
  overview: true,
  orders: true,
  design: true,
  logistics: false,
  catalog: false,
  contractors: false,
  stock: false,
  finance: false,
  vchasno: false,
  vchasno_send: false,
  marketing: false,
  team: false,
  pulse: false,
};

const MODULE_ACCESS_LABELS: Record<keyof MemberProfileMeta["moduleAccess"], string> = {
  overview: "Огляд",
  orders: "Замовлення",
  design: "Дизайн",
  logistics: "Логістика",
  catalog: "Каталог",
  contractors: "Підрядники та постачальники",
  stock: "Склад",
  finance: "Фінанси",
  vchasno: "Вчасно — завантаження",
  vchasno_send: "Вчасно — надсилання",
  marketing: "Маркетинг",
  team: "Управління командою",
  pulse: "Пульс команди (аналітика)",
};

const VISIBLE_MODULE_ACCESS_KEYS: Array<keyof MemberProfileMeta["moduleAccess"]> = [
  "overview",
  "orders",
  "design",
  "logistics",
  "catalog",
  "contractors",
  "stock",
  "finance",
  "vchasno",
  "vchasno_send",
  "marketing",
  "team",
  "pulse",
];

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

function getAccessRoleLabel(role: string | null) {
  return ACCESS_ROLE_LABELS[role ?? ""] ?? "Member";
}

function getJobRoleLabel(role: string | null) {
  return JOB_ROLE_LABELS[role ?? ""] ?? "Без ролі";
}

function normalizeJobRoleInput(role: string | null) {
  return !role || role === "none" ? null : role;
}

function getAccessBadgeClass(role: string | null) {
  if (role === "owner") return "tone-accent";
  if (role === "admin") return "bg-info-soft text-info-foreground border-info-soft-border";
  return "bg-muted/50 border-border text-muted-foreground";
}

function getJobBadgeClass(role: string | null) {
  if (!role) return "bg-muted/50 border-border text-muted-foreground";
  return "bg-muted/30 border-border text-muted-foreground";
}

function supportsManagerRate(role: string | null) {
  return ["manager", "sales_manager", "junior_sales_manager", "top_manager"].includes((role ?? "").toLowerCase());
}

function getAvailabilityLabel(value: MemberProfileMeta["availabilityStatus"]) {
  return AVAILABILITY_OPTIONS.find((option) => option.value === value)?.label ?? "Доступний";
}

function getAvailabilityBadgeClass(value: MemberProfileMeta["availabilityStatus"]) {
  if (value === "vacation") return "bg-warning-soft text-warning-foreground border-warning-soft-border";
  if (value === "sick_leave") return "bg-danger-soft text-danger-foreground border-danger-soft-border";
  if (value === "offline") return "bg-muted text-muted-foreground border-border";
  return "bg-success-soft text-success-foreground border-success-soft-border";
}

function hasDefaultStockAccess(accessRole?: string | null, jobRole?: string | null) {
  return (accessRole ?? "").trim().toLowerCase() === "owner" || (jobRole ?? "").trim().toLowerCase() === "seo";
}

function hasDefaultFinanceAccess(accessRole?: string | null, jobRole?: string | null) {
  const role = (jobRole ?? "").trim().toLowerCase();
  return (
    (accessRole ?? "").trim().toLowerCase() === "owner" ||
    role === "seo" ||
    role === "accountant" ||
    role === "chief_accountant"
  );
}

function hasDefaultMarketingAccess(accessRole?: string | null, jobRole?: string | null) {
  const role = (jobRole ?? "").trim().toLowerCase();
  return (accessRole ?? "").trim().toLowerCase() === "owner" || role === "seo" || role === "marketer";
}

function isForcedModuleAccess(key: keyof MemberProfileMeta["moduleAccess"], accessRole?: string | null, jobRole?: string | null) {
  if (key === "contractors" && (accessRole ?? "").trim().toLowerCase() === "owner") return true;
  if (key === "stock" && hasDefaultStockAccess(accessRole, jobRole)) return true;
  if (key === "finance" && hasDefaultFinanceAccess(accessRole, jobRole)) return true;
  return false;
}

function normalizeModuleAccess(
  value: unknown,
  accessRole?: string | null,
  jobRole?: string | null
): MemberProfileMeta["moduleAccess"] {
  const input = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  return {
    overview: typeof input.overview === "boolean" ? input.overview : DEFAULT_MODULE_ACCESS.overview,
    orders: typeof input.orders === "boolean" ? input.orders : DEFAULT_MODULE_ACCESS.orders,
    design: typeof input.design === "boolean" ? input.design : DEFAULT_MODULE_ACCESS.design,
    logistics: typeof input.logistics === "boolean" ? input.logistics : DEFAULT_MODULE_ACCESS.logistics,
    catalog: typeof input.catalog === "boolean" ? input.catalog : DEFAULT_MODULE_ACCESS.catalog,
    contractors: typeof input.contractors === "boolean" ? input.contractors : DEFAULT_MODULE_ACCESS.contractors,
    stock: typeof input.stock === "boolean" ? input.stock : hasDefaultStockAccess(accessRole, jobRole),
    finance: typeof input.finance === "boolean" ? input.finance : hasDefaultFinanceAccess(accessRole, jobRole),
    vchasno: typeof input.vchasno === "boolean" ? input.vchasno : hasDefaultFinanceAccess(accessRole, jobRole),
    vchasno_send:
      typeof input.vchasno_send === "boolean"
        ? input.vchasno_send
        : (accessRole ?? "").trim().toLowerCase() === "owner" ||
          (jobRole ?? "").trim().toLowerCase() === "chief_accountant",
    marketing:
      typeof input.marketing === "boolean" ? input.marketing : hasDefaultMarketingAccess(accessRole, jobRole),
    team: typeof input.team === "boolean" ? input.team : DEFAULT_MODULE_ACCESS.team,
    pulse:
      typeof input.pulse === "boolean"
        ? input.pulse
        : (accessRole ?? "").trim().toLowerCase() === "owner" ||
          (jobRole ?? "").trim().toLowerCase() === "seo",
  };
}

function normalizeMemberModuleAccessForRole(
  moduleAccess: MemberProfileMeta["moduleAccess"],
  accessRole: string | null | undefined,
  jobRole: string | null | undefined
): MemberProfileMeta["moduleAccess"] {
  const normalizedAccessRole = (accessRole ?? "").trim().toLowerCase();
  return {
    ...moduleAccess,
    contractors: normalizedAccessRole === "owner" ? true : moduleAccess.contractors,
    stock: hasDefaultStockAccess(accessRole, jobRole) ? true : moduleAccess.stock,
    finance: hasDefaultFinanceAccess(accessRole, jobRole) ? true : moduleAccess.finance,
  };
}

function getProbationBadgeClass(status: "upcoming" | "active" | "completed") {
  if (status === "completed") return "bg-success-soft text-success-foreground border-success-soft-border";
  if (status === "active") return "bg-warning-soft text-warning-foreground border-warning-soft-border";
  return "bg-muted text-muted-foreground border-border";
}

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

function displayEmploymentStatus(value?: string | null): EmploymentStatus {
  const status = normalizeEmploymentStatus(value, null);
  return status === "probation" ? "active" : status;
}

function getEmploymentStatusBadgeClass(status: EmploymentStatus) {
  if (status === "rejected") return "bg-danger-soft text-danger-foreground border-danger-soft-border";
  if (status === "inactive") return "bg-muted text-muted-foreground border-border";
  if (status === "probation") return "bg-warning-soft text-warning-foreground border-warning-soft-border";
  return "bg-success-soft text-success-foreground border-success-soft-border";
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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function isRecoverableRoleUpdateError(message: string) {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("does not exist") ||
    normalized.includes("relation") ||
    normalized.includes("column") ||
    normalized.includes("cannot update view") ||
    normalized.includes("could not find the table")
  );
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

function normalizeRoleForCompare(value: string | null | undefined) {
  if (!value || value === "member") return null;
  return value;
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
type PersonSection = "overview" | "profile" | "access" | "activity" | "hr";

const PERSON_SECTIONS: { key: PersonSection; label: string }[] = [
  { key: "overview", label: "Огляд" },
  { key: "profile", label: "Профіль" },
  { key: "access", label: "Доступи" },
  { key: "activity", label: "Активність" },
  { key: "hr", label: "HR" },
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
  const [activeTab, setActiveTab] = useState<"members" | "invites">("members");
  const { entries } = useWorkspacePresence();

  const { cached, setCache } = usePageCache<TeamMembersPageCache>("team-members");
  const hasCache = Boolean(cached?.workspaceId);
  const [workspaceResolved, setWorkspaceResolved] = useState(Boolean(cached?.workspaceId));

  const [workspaceId, setWorkspaceId] = useState<string | null>(cached?.workspaceId ?? null);
  const [workspaceLoading, setWorkspaceLoading] = useState(!hasCache);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const [members, setMembers] = useState<Member[]>([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [memberProfilesByUserId, setMemberProfilesByUserId] = useState<
    Record<string, { label: string; avatarUrl: string | null }>
  >({});
  const [directoryRows, setDirectoryRows] = useState<WorkspaceMemberDirectoryRow[]>([]);
  const [memberProfilesLoading, setMemberProfilesLoading] = useState(true);
  const [memberMetaByUserId, setMemberMetaByUserId] = useState<Record<string, MemberProfileMeta>>({});
  const [memberMetaLoading, setMemberMetaLoading] = useState(true);
  const [memberProfileStorageAvailable, setMemberProfileStorageAvailable] = useState(true);
  const [memberPresenceByUserId, setMemberPresenceByUserId] = useState<Record<string, MemberPresence>>({});

  const [invites, setInvites] = useState<Invite[]>(cached?.invites ?? []);
  const [invitesLoading, setInvitesLoading] = useState(false);
  const [invitesError, setInvitesError] = useState<string | null>(null);

  const [activeFilter, setActiveFilter] = useState<MemberFilterKey | null>(null);
  const [activeSection, setActiveSection] = useState<PersonSection>("overview");
  // Two ways to look at the team: "panel" (master-detail card) for working with
  // one person, "rows" (comparison table) for scanning everyone side by side.
  const [viewMode, setViewMode] = useState<"panel" | "rows" | "pulse">(() => {
    if (typeof window === "undefined") return "panel";
    const stored = window.localStorage.getItem("team-members-view");
    return stored === "rows" || stored === "pulse" ? stored : "panel";
  });
  useEffect(() => {
    window.localStorage.setItem("team-members-view", viewMode);
  }, [viewMode]);
  // The two-pane columns fill the exact space below the toolbar/chips instead of
  // a hardcoded max-h calc (which drifted and clipped the list bottom).
  const twoPaneRef = useRef<HTMLDivElement | null>(null);
  const [twoPaneTop, setTwoPaneTop] = useState<number | null>(null);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteAccessRole, setInviteAccessRole] = useState("member");
  const [inviteJobRole, setInviteJobRole] = useState("none");
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [inviteBusy, setInviteBusy] = useState(false);

  const [revokeId, setRevokeId] = useState<string | null>(null);
  const [revokeBusy, setRevokeBusy] = useState(false);
  const [editMember, setEditMember] = useState<Member | null>(null);
  const [editAccessRole, setEditAccessRole] = useState("member");
  const [editJobRole, setEditJobRole] = useState("none");
  const [editBusy, setEditBusy] = useState(false);
  const [memberToDelete, setMemberToDelete] = useState<Member | null>(null);
  const [memberDeleteBusy, setMemberDeleteBusy] = useState(false);
  const [editProfileMember, setEditProfileMember] = useState<Member | null>(null);
  const [editProfileFirstName, setEditProfileFirstName] = useState("");
  const [editProfileLastName, setEditProfileLastName] = useState("");
  const [editProfileBirthDate, setEditProfileBirthDate] = useState("");
  const [editProfilePhone, setEditProfilePhone] = useState("");
  const [editProfileManagerRate, setEditProfileManagerRate] = useState(String(DEFAULT_MANAGER_RATE));
  const [editProfileAvailabilityStatus, setEditProfileAvailabilityStatus] =
    useState<MemberProfileMeta["availabilityStatus"]>("available");
  const [editProfileAvailabilityStartDate, setEditProfileAvailabilityStartDate] = useState("");
  const [editProfileAvailabilityEndDate, setEditProfileAvailabilityEndDate] = useState("");
  const [editProfileStartDate, setEditProfileStartDate] = useState("");
  const [editProfileProbationEndDate, setEditProfileProbationEndDate] = useState("");
  const [editProfileManagerUserId, setEditProfileManagerUserId] = useState("");
  const [editProfileModuleAccess, setEditProfileModuleAccess] =
    useState<MemberProfileMeta["moduleAccess"]>(DEFAULT_MODULE_ACCESS);
  const [editProfileBusy, setEditProfileBusy] = useState(false);
  const [employmentActionBusy, setEmploymentActionBusy] = useState<"inactive" | "reactivate" | null>(null);
  const [pendingEmploymentDecision, setPendingEmploymentDecision] = useState<"inactive" | null>(null);
  const [, setWorkspaceFunctionAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    const tab = params.get("tab");
    if (tab === "invites" || tab === "members") {
      setActiveTab(tab);
    } else if (tab === "activity" || tab === "pulse") {
      // Пульс used to be a tab; it is a view of Учасники now.
      setActiveTab("members");
      setViewMode("pulse");
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
  // "Пульс" (team activity analytics) is owner/SEO only — the CEO surface.
  const canPulse = isSuperAdmin || isSeo;

  const openEditProfileDialog = useCallback((member: Member) => {
    const meta = memberMetaByUserId[member.user_id] ?? DEFAULT_MEMBER_META;
    setEditProfileMember(member);
    setEditProfileFirstName(meta?.firstName ?? "");
    setEditProfileLastName(meta?.lastName ?? "");
    setEditProfileBirthDate(meta?.birthDate ?? "");
    setEditProfilePhone(meta?.phone ?? "");
    setEditProfileManagerRate(String(meta?.managerRate ?? DEFAULT_MANAGER_RATE));
    setEditProfileAvailabilityStatus(meta?.availabilityStatus ?? "available");
    setEditProfileAvailabilityStartDate(meta?.availabilityStartDate ?? "");
    setEditProfileAvailabilityEndDate(meta?.availabilityEndDate ?? "");
    setEditProfileStartDate(meta?.startDate ?? "");
    setEditProfileProbationEndDate(meta?.probationEndDate ?? "");
    setEditProfileManagerUserId(meta?.managerUserId ?? "");
    setEditProfileModuleAccess(
      normalizeMemberModuleAccessForRole(meta?.moduleAccess ?? DEFAULT_MODULE_ACCESS, member.access_role, member.job_role)
    );
  }, [memberMetaByUserId]);

  useEffect(() => {
    const memberId = params.get("member")?.trim();
    if (!memberId || !canOpenProfileCard || members.length === 0) return;
    if (editProfileMember?.user_id === memberId) return;
    const member = members.find((entry) => entry.user_id === memberId);
    if (!member) return;
    setActiveTab("members");
    openEditProfileDialog(member);
  }, [canOpenProfileCard, editProfileMember?.user_id, members, openEditProfileDialog, params]);

  useEffect(() => {
    let cancelled = false;

    const loadUser = async () => {
      const { data, error } = await supabase.auth.getUser();
      if (cancelled) return;
      if (error) return;
      setCurrentUserId(data.user?.id ?? null);
    };

    void loadUser();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadWorkspaceId = async () => {
      setWorkspaceLoading(true);
      setWorkspaceError(null);

      let resolvedId: string | null = null;

      try {
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError) {
          throw userError;
        }
        resolvedId = await resolveWorkspaceId(userData.user?.id ?? null);
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

  useEffect(() => {
    if (!workspaceId) return;

    let cancelled = false;

    const loadMembers = async () => {
      setMembersLoading(true);
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
  }, [workspaceId]);

  useEffect(() => {
    if (!workspaceId || directoryRows.length === 0) {
      setMemberProfilesByUserId({});
      setMemberProfilesLoading(false);
      return;
    }

    let cancelled = false;

    const loadMemberProfiles = async () => {
      setMemberProfilesLoading(true);
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

        const { data: currentUserData } = await supabase.auth.getUser();
        const currentUserId = currentUserData.user?.id ?? null;
        const currentUserAvatar = getCanonicalAvatarReference(
          {
            avatarUrl: (currentUserData.user?.user_metadata?.avatar_url as string | undefined) || null,
            avatarPath: (currentUserData.user?.user_metadata?.avatar_path as string | undefined) || null,
          },
          AVATAR_BUCKET
        );
        if (currentUserId && currentUserAvatar) {
          const resolvedName = buildUserNameFromMetadata(
            currentUserData.user?.user_metadata as Record<string, unknown> | undefined,
            currentUserData.user?.email
          );
          const existing = nextMap[currentUserId];
          nextMap[currentUserId] = {
            label: existing?.label || resolvedName.displayName || currentUserData.user?.email?.split("@")[0] || "Користувач",
            avatarUrl: existing?.avatarUrl ?? currentUserAvatar,
          };
        }

        setMemberProfilesByUserId(nextMap);
      } catch {
        if (cancelled) return;
        try {
          const { data: currentUserData } = await supabase.auth.getUser();
          const currentUserId = currentUserData.user?.id ?? null;
          const currentUserAvatar = getCanonicalAvatarReference(
            {
              avatarUrl: (currentUserData.user?.user_metadata?.avatar_url as string | undefined) || null,
              avatarPath: (currentUserData.user?.user_metadata?.avatar_path as string | undefined) || null,
            },
            AVATAR_BUCKET
          );
          const currentUserLabel = buildUserNameFromMetadata(
            currentUserData.user?.user_metadata as Record<string, unknown> | undefined,
            currentUserData.user?.email
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
      if (!canOpenProfileCard) setMemberMetaByUserId({});
      return;
    }

    let cancelled = false;

    const loadMemberMeta = async () => {
      setMemberMetaLoading(true);
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

        const { data: currentUserData } = await supabase.auth.getUser();
        const selfUser = currentUserData.user;
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
  }, [workspaceId, canOpenProfileCard, canManageManagerRates, directoryRows]);

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
      members,
      invites,
      memberProfilesByUserId,
      memberMetaByUserId,
    });
  }, [workspaceId, members, invites, memberProfilesByUserId, memberMetaByUserId, setCache]);

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
    const deltaMs = Date.now() - new Date(dateStr).getTime();
    const minutes = Math.floor(deltaMs / 60000);
    if (minutes < 1) return "щойно";
    if (minutes < 60) return `${minutes} хв тому`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} год тому`;
    const days = Math.floor(hours / 24);
    return `${days} дн тому`;
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
      };
    },
    [members, memberProfilesByUserId, memberPresenceByUserId, getMemberDisplayName]
  );

  const pulsePeople = useMemo<PulsePerson[]>(
    () => members.map((member) => resolvePulsePerson(member.user_id)),
    [members, resolvePulsePerson]
  );

  const resolveActorName = useCallback(
    (actorUserId: string | null, fallback: string | null) => {
      if (!actorUserId) return fallback || "Система";
      const member = members.find((candidate) => candidate.user_id === actorUserId);
      return member ? getMemberDisplayName(member) : fallback || "Користувач";
    },
    [members, getMemberDisplayName]
  );

  // Row-action menu items, shared by the desktop master list and (potentially)
  // other member surfaces. Mirrors the previous inline table row menu.
  const getMemberRowMenuItems = (m: Member, availability: string) => [
    { type: "label" as const, label: "Дії" },
    { type: "separator" as const },
    canOpenProfileCard
      ? (canManage ? memberProfileStorageAvailable : true)
        ? {
            label: canManage ? "Редагувати профіль" : "Відсоток менеджера",
            onSelect: () => {
              setSelectedMemberId(m.user_id);
              openEditProfileDialog(m);
              setActiveSection("profile");
            },
          }
        : { label: "Профіль (read-only)", disabled: true, muted: true }
      : { label: "Тільки перегляд", disabled: true, muted: true },
    canManage && (isSuperAdmin || (m.user_id !== currentUserId && (m.access_role ?? null) !== "owner"))
      ? {
            label: "Змінити доступи",
            onSelect: () => {
              setSelectedMemberId(m.user_id);
              openEditRolesDialog(m);
              setActiveSection("access");
            },
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

  const panelMember =
    (selectedMemberId ? members.find((m) => m.user_id === selectedMemberId) ?? null : null) ??
    filteredMembers[0] ??
    null;
  // "pulse" is owner/SEO-only; anyone else falls back to the panel view (the
  // preference may linger in localStorage from another account on this machine).
  const effectiveViewMode = viewMode === "pulse" && !canPulse ? "panel" : viewMode;

  // Mirrors the row-menu guard: an Admin may not edit their own roles nor an owner's.
  const canEditPanelRoles =
    canManage &&
    !!panelMember &&
    (isSuperAdmin || (panelMember.user_id !== currentUserId && (panelMember.access_role ?? null) !== "owner"));
  const visiblePersonSections = PERSON_SECTIONS.filter((section) => {
    if (section.key === "access" || section.key === "hr") return canOpenProfileCard;
    if (section.key === "profile") return canOpenProfileCard;
    return true;
  });
  const panelProfile = panelMember ? memberProfilesByUserId[panelMember.user_id] : null;
  const panelMeta = panelMember ? memberMetaByUserId[panelMember.user_id] : undefined;

  // One surface per person: whoever is selected in the list is also the person
  // the Профіль/Доступи sections edit, so the edit state follows the selection.
  const panelUserId = panelMember?.user_id ?? null;
  useEffect(() => {
    if (!panelMember || !canOpenProfileCard) return;
    if (editProfileMember?.user_id === panelUserId) return;
    openEditProfileDialog(panelMember);
    setEditMember(panelMember);
    setEditAccessRole(panelMember.access_role ?? "member");
    setEditJobRole(panelMember.job_role ?? "none");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelUserId, canOpenProfileCard]);
  const panelDisplayName = panelMember ? getMemberDisplayName(panelMember) : "";
  const panelInitials = panelMember ? getInitialsFromName(panelDisplayName, panelMember.email ?? null) : "";
  const panelSeniority = (() => {
    if (!panelMeta) return "—";
    const summary = getEmploymentSummary(panelMeta);
    return (typeof summary === "string" ? summary : summary?.primary) || "—";
  })();

  const getInviteLink = (token: string) => `${window.location.origin}/invite?token=${token}`;
  const localProfileFallbackHint =
    "Локально fallback-функція недоступна. Запусти через `netlify dev` або застосуй SQL зі scripts/team-member-profiles.sql.";
  const selectedEmploymentDuration = formatEmploymentDuration(editProfileStartDate);
  const selectedEmploymentDays = getEmploymentDurationDays(editProfileStartDate);
  const selectedEmploymentStatus = displayEmploymentStatus(
    memberMetaByUserId[editProfileMember?.user_id ?? ""]?.employmentStatus
  );
  const shouldShowManagerRateField =
    canManageManagerRates && supportsManagerRate(editProfileMember?.job_role ?? null);
  const shouldShowProbationSection =
    selectedEmploymentStatus === "probation" || selectedEmploymentStatus === "rejected";
  const selectedAvailabilityRange = formatAvailabilityRange(
    editProfileAvailabilityStatus,
    editProfileAvailabilityStartDate,
    editProfileAvailabilityEndDate
  );
  const canDeactivateEmployment = selectedEmploymentStatus === "active";
  const canReactivateEmployment = selectedEmploymentStatus === "inactive";

  const isExpired = (dateStr: string) => new Date(dateStr) < new Date();

  const handleTabChange = (next: "members" | "invites") => {
    setActiveTab(next);
    setParams(next === "members" ? {} : { tab: next });
  };

  // Пульс drill-down: jump to the person's card in Учасники. Clears the active
  // filter/search first, otherwise the target could be filtered out of the list
  // and the panel would fall back to someone else.
  const openPersonCard = (userId: string) => {
    setActiveFilter(null);
    setSelectedMemberId(userId);
    setActiveTab("members");
    setViewMode("panel");
    setParams({ member: userId });
  };

  const closeEditProfileDialog = () => {
    setEditProfileMember(null);
    const nextParams = new URLSearchParams(params);
    nextParams.delete("member");
    nextParams.delete("review");
    setParams(nextParams);
  };

  const saveMemberProfile = async () => {
    if (!editProfileMember || !workspaceId || !canOpenProfileCard) return;

    setEditProfileBusy(true);
    try {
      const currentMeta = memberMetaByUserId[editProfileMember.user_id] ?? DEFAULT_MEMBER_META;
      const firstName = editProfileFirstName.trim();
      const lastName = editProfileLastName.trim();
      const fullName = `${firstName} ${lastName}`.trim();
      const birthDate = editProfileBirthDate.trim();
      const phone = editProfilePhone.trim();
      const managerRate = Math.max(0, Number(editProfileManagerRate) || 0);
      const availabilityStatus = editProfileAvailabilityStatus;
      const availabilityStartDate = availabilityStatus === "available" ? "" : editProfileAvailabilityStartDate.trim();
      const availabilityEndDate = availabilityStatus === "available" ? "" : editProfileAvailabilityEndDate.trim();
      const startDate = editProfileStartDate.trim();
      const probationEndDate = editProfileProbationEndDate.trim();
      const managerUserId = editProfileManagerUserId.trim();
      const moduleAccess = normalizeMemberModuleAccessForRole(
        editProfileModuleAccess,
        editProfileMember.access_role,
        editProfileMember.job_role
      );
      const currentEmploymentStatus = normalizeEmploymentStatus(currentMeta.employmentStatus, currentMeta.probationEndDate);
      const nextEmploymentStatus =
        currentEmploymentStatus === "rejected" || currentEmploymentStatus === "inactive"
          ? currentEmploymentStatus
          : probationEndDate
          ? "probation"
          : "active";
      const probationDatesChanged = currentMeta.probationEndDate !== probationEndDate;
      const probationReviewNotifiedAt =
        nextEmploymentStatus === "probation" && probationDatesChanged ? "" : currentMeta.probationReviewNotifiedAt;
      const probationReviewedAt =
        nextEmploymentStatus === "probation" && probationDatesChanged ? "" : currentMeta.probationReviewedAt;
      const probationReviewedBy =
        nextEmploymentStatus === "probation" && probationDatesChanged ? "" : currentMeta.probationReviewedBy;
      const probationExtensionCount = currentMeta.probationExtensionCount ?? 0;

      if (
        availabilityStartDate &&
        availabilityEndDate &&
        new Date(`${availabilityEndDate}T12:00:00`).getTime() < new Date(`${availabilityStartDate}T12:00:00`).getTime()
      ) {
        throw new Error("Кінець відсутності не може бути раніше дати початку");
      }

      if (startDate && probationEndDate && new Date(`${probationEndDate}T12:00:00`).getTime() < new Date(`${startDate}T12:00:00`).getTime()) {
        throw new Error("Кінець випробувального не може бути раніше дати старту");
      }

      if (canManage) {
        try {
          const currentDirectoryRow = directoryRows.find((row) => row.userId === editProfileMember.user_id);
          await upsertWorkspaceMemberProfile({
            workspaceId,
            userId: editProfileMember.user_id,
            firstName,
            lastName,
            fullName,
            avatarUrl: currentDirectoryRow?.avatarPath ?? currentDirectoryRow?.avatarUrl ?? null,
            avatarPath: currentDirectoryRow?.avatarPath ?? null,
            birthDate,
            phone,
            availabilityStatus,
            availabilityStartDate,
            availabilityEndDate,
            startDate,
            probationEndDate,
            employmentStatus: nextEmploymentStatus,
            probationReviewNotifiedAt,
            probationReviewedAt,
            probationReviewedBy,
            probationExtensionCount,
            managerUserId,
            moduleAccess,
            updatedBy: currentUserId ?? null,
          });
        } catch (error: unknown) {
          if (!isRecoverableTeamProfileError(getErrorMessage(error))) {
            throw error;
          }
          setMemberProfileStorageAvailable(false);

          const { data: sessionData } = await supabase.auth.getSession();
          const accessToken = sessionData.session?.access_token;
          if (!accessToken) throw new Error("Не вдалося підтвердити авторизацію");
          const response = await fetch("/.netlify/functions/create-workspace-invite", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({
              mode: "update_member_profile",
              userId: editProfileMember.user_id,
              firstName,
              lastName,
              birthDate,
              phone,
              availabilityStatus,
              availabilityStartDate,
              availabilityEndDate,
              startDate,
              probationEndDate,
              employmentStatus: nextEmploymentStatus,
              managerUserId,
              moduleAccess,
            }),
          });
          if (response.status === 404) {
            setWorkspaceFunctionAvailable(false);
            throw new Error(localProfileFallbackHint);
          }
          setWorkspaceFunctionAvailable(true);
          const payload = await parseJsonSafe<{ error?: string }>(response);
          if (!response.ok) {
            throw new Error(payload?.error || `Не вдалося оновити профіль (HTTP ${response.status})`);
          }
        }
      }

      if (canManageManagerRates) {
        const { error: managerRateError } = await supabase
          .schema("tosho")
          .from("team_member_manager_rates")
          .upsert(
            {
              workspace_id: workspaceId,
              user_id: editProfileMember.user_id,
              manager_rate: managerRate,
              updated_by: currentUserId ?? null,
            },
            { onConflict: "workspace_id,user_id" }
          );

        if (managerRateError && !/does not exist|relation|schema cache|could not find the table/i.test(managerRateError.message ?? "")) {
          throw managerRateError;
        }
      }

      setMemberMetaByUserId((prev) => ({
        ...prev,
        [editProfileMember.user_id]: {
          firstName,
          lastName,
          fullName,
          birthDate,
          phone,
          managerRate,
          availabilityStatus,
          availabilityStartDate,
          availabilityEndDate,
          startDate,
          probationEndDate,
          employmentStatus: nextEmploymentStatus,
          probationReviewNotifiedAt,
          probationReviewedAt,
          probationReviewedBy,
          probationExtensionCount,
          managerUserId,
          moduleAccess,
        },
      }));
      setMembers((prev) =>
        prev.map((member) =>
          member.user_id === editProfileMember.user_id
            ? {
                ...member,
                full_name: fullName || member.full_name,
              }
            : member
        )
      );

      toast.success(canManage ? "Профіль учасника оновлено" : "Відсоток менеджера оновлено");
      closeEditProfileDialog();
    } catch (error: unknown) {
      toast.error("Не вдалося оновити профіль", { description: getErrorMessage(error) });
    } finally {
      setEditProfileBusy(false);
    }
  };


  const applyEmploymentDecision = async (decision: "inactive" | "reactivate") => {
    if (!editProfileMember || !workspaceId) return;

    setEmploymentActionBusy(decision);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error("Не вдалося підтвердити авторизацію");

      const response = await fetch("/.netlify/functions/team-member-employment", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          userId: editProfileMember.user_id,
          decision,
        }),
      });

      const payload = await parseJsonSafe<{
        error?: string;
        profile?: Partial<MemberProfileMeta>;
      }>(response);

      if (!response.ok) {
        throw new Error(payload?.error || `Не вдалося оновити статус співпраці (HTTP ${response.status})`);
      }

      const current = memberMetaByUserId[editProfileMember.user_id] ?? DEFAULT_MEMBER_META;
      const nextMeta: MemberProfileMeta = {
        ...current,
        ...payload?.profile,
        employmentStatus: normalizeEmploymentStatus(payload?.profile?.employmentStatus, payload?.profile?.probationEndDate),
        probationReviewNotifiedAt: payload?.profile?.probationReviewNotifiedAt ?? current.probationReviewNotifiedAt,
        probationReviewedAt: payload?.profile?.probationReviewedAt ?? current.probationReviewedAt,
        probationReviewedBy: payload?.profile?.probationReviewedBy ?? current.probationReviewedBy,
        probationExtensionCount: payload?.profile?.probationExtensionCount ?? current.probationExtensionCount,
      };

      setMemberMetaByUserId((prev) => ({
        ...prev,
        [editProfileMember.user_id]: nextMeta,
      }));
      setEditProfileProbationEndDate(nextMeta.probationEndDate);

      toast.success(
        decision === "inactive" ? "Співпрацю завершено" : "Співробітника повернуто в штат"
      );
      setPendingEmploymentDecision(null);
    } catch (error: unknown) {
      toast.error("Не вдалося оновити статус співпраці", { description: getErrorMessage(error) });
    } finally {
      setEmploymentActionBusy(null);
    }
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
                      .eq("team_id", workspaceId)
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
        const currentDirectoryRow = directoryRows.find((row) => row.userId === member.user_id);
        await upsertWorkspaceMemberProfile({
          workspaceId,
          userId: member.user_id,
          firstName: currentMeta.firstName,
          lastName: currentMeta.lastName,
          fullName: currentMeta.fullName,
          avatarUrl: currentDirectoryRow?.avatarPath ?? currentDirectoryRow?.avatarUrl ?? null,
          avatarPath: currentDirectoryRow?.avatarPath ?? null,
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
        if (!accessToken) throw new Error("Не вдалося підтвердити авторизацію");
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
          throw new Error(localProfileFallbackHint);
        }
        setWorkspaceFunctionAvailable(true);
        const payload = await parseJsonSafe<{ error?: string }>(response);
        if (!response.ok) {
          throw new Error(payload?.error || `Не вдалося оновити статус (HTTP ${response.status})`);
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

  const openEditRolesDialog = (member: Member) => {
    setEditMember(member);
    setEditAccessRole(member.access_role ?? "member");
    setEditJobRole(member.job_role ?? "none");
  };

  // The Доступи section owns both halves of "access": roles live in memberships
  // (Netlify fn) and module toggles live in the profile row, so saving the
  // section persists roles first, then the profile.
  const saveAccessSection = async () => {
    if (!panelMember) return;
    const rolesChanged =
      (panelMember.access_role ?? "member") !== editAccessRole ||
      (panelMember.job_role ?? "none") !== editJobRole;
    if (rolesChanged && canEditPanelRoles) {
      await saveMemberRoles();
    }
    await saveMemberProfile();
  };

  const saveMemberRoles = async () => {
    if (!editMember || !workspaceId || !canManage) return;
    if (!isSuperAdmin && (editMember.access_role ?? null) === "owner") {
      toast.error("Admin не може редагувати Super Admin");
      return;
    }
    if (!isSuperAdmin && editAccessRole === "owner") {
      toast.error("Admin не може призначати Super Admin");
      return;
    }
    const nextAccessRole = editAccessRole;
    const nextJobRole = editJobRole;
    const normalizedAccessRole = nextAccessRole === "member" ? null : nextAccessRole;
    const normalizedJobRole = normalizeJobRoleInput(nextJobRole);
    const accessRoleChanged = (editMember.access_role ?? "member") !== nextAccessRole;
    const jobRoleChanged = (editMember.job_role ?? "none") !== nextJobRole;
    const roleDidChange =
      accessRoleChanged || jobRoleChanged;
    if (!roleDidChange) {
      return;
    }

    const verifyRoles = async () => {
      const { data, error } = await supabase
        .schema("tosho")
        .from("memberships_view")
        .select("access_role,job_role")
        .eq("workspace_id", workspaceId)
        .eq("user_id", editMember.user_id)
        .maybeSingle<{ access_role?: string | null; job_role?: string | null }>();

      if (error) throw new Error(error.message);
      if (!data) return false;

      const currentAccessRole = normalizeRoleForCompare(data.access_role ?? null);
      const currentJobRole = normalizeRoleForCompare(data.job_role ?? null);
      return (
        currentAccessRole === normalizeRoleForCompare(normalizedAccessRole) &&
        currentJobRole === normalizeRoleForCompare(normalizedJobRole)
      );
    };

    const verifyRolesEventually = async (attempts = 5, delayMs = 120) => {
      for (let i = 0; i < attempts; i += 1) {
        const ok = await verifyRoles();
        if (ok) return true;
        if (i < attempts - 1) {
          await sleep(delayMs);
        }
      }
      return false;
    };

    setEditBusy(true);
    try {
      const fallbackUpdateRolesDirectly = async () => {
        const membershipUpdateSchemas = ["tosho", "public"] as const;
        const { data: membershipTarget, error: membershipTargetError } = await supabase
          .schema("tosho")
          .from("memberships_view")
          .select("id")
          .eq("workspace_id", workspaceId)
          .eq("user_id", editMember.user_id)
          .maybeSingle<{ id?: string | null }>();

        if (membershipTargetError) throw new Error(membershipTargetError.message);
        const membershipId = membershipTarget?.id ?? null;

        const attempts: Array<{
          tableName: string;
          payload: Record<string, string | null>;
          scopes: Array<"workspace_user" | "membership_id" | "team_user">;
        }> = [
          {
            tableName: "memberships",
            payload: {
              ...(accessRoleChanged ? { access_role: normalizedAccessRole } : {}),
              ...(jobRoleChanged ? { job_role: normalizedJobRole } : {}),
            },
            scopes: ["workspace_user", "membership_id"] as Array<"workspace_user" | "membership_id" | "team_user">,
          },
          {
            tableName: "memberships",
            payload: {
              ...(accessRoleChanged ? { role: normalizedAccessRole ?? "member" } : {}),
              ...(jobRoleChanged ? { job_role: normalizedJobRole } : {}),
            },
            scopes: ["workspace_user", "membership_id"] as Array<"workspace_user" | "membership_id" | "team_user">,
          },
          {
            tableName: "workspace_members",
            payload: {
              ...(accessRoleChanged ? { access_role: normalizedAccessRole } : {}),
              ...(jobRoleChanged ? { job_role: normalizedJobRole } : {}),
            },
            scopes: ["workspace_user", "membership_id"] as Array<"workspace_user" | "membership_id" | "team_user">,
          },
          {
            tableName: "workspace_members",
            payload: {
              ...(accessRoleChanged ? { role: normalizedAccessRole ?? "member" } : {}),
              ...(jobRoleChanged ? { job_role: normalizedJobRole } : {}),
            },
            scopes: ["workspace_user", "membership_id"] as Array<"workspace_user" | "membership_id" | "team_user">,
          },
          {
            tableName: "workspace_memberships",
            payload: {
              ...(accessRoleChanged ? { access_role: normalizedAccessRole } : {}),
              ...(jobRoleChanged ? { job_role: normalizedJobRole } : {}),
            },
            scopes: ["workspace_user", "membership_id"] as Array<"workspace_user" | "membership_id" | "team_user">,
          },
          {
            tableName: "workspace_memberships",
            payload: {
              ...(accessRoleChanged ? { role: normalizedAccessRole ?? "member" } : {}),
              ...(jobRoleChanged ? { job_role: normalizedJobRole } : {}),
            },
            scopes: ["workspace_user", "membership_id"] as Array<"workspace_user" | "membership_id" | "team_user">,
          },
          {
            tableName: "team_members",
            payload: {
              ...(accessRoleChanged ? { access_role: normalizedAccessRole } : {}),
              ...(jobRoleChanged ? { job_role: normalizedJobRole } : {}),
            },
            scopes: ["membership_id", "team_user"] as Array<"workspace_user" | "membership_id" | "team_user">,
          },
          {
            tableName: "team_members",
            payload: {
              ...(accessRoleChanged ? { role: normalizedAccessRole ?? "member" } : {}),
              ...(jobRoleChanged ? { job_role: normalizedJobRole } : {}),
            },
            scopes: ["membership_id", "team_user"] as Array<"workspace_user" | "membership_id" | "team_user">,
          },
        ].filter((attempt) => Object.keys(attempt.payload).length > 0);

        let lastRecoverableError = "Не вдалося оновити ролі напряму";
        let wroteData = false;
        for (const attempt of attempts) {
          for (const scope of attempt.scopes) {
            for (const schemaName of membershipUpdateSchemas) {
              if (scope === "membership_id" && !membershipId) {
                continue;
              }

              const { error } =
                scope === "workspace_user"
                  ? await supabase
                      .schema(schemaName)
                      .from(attempt.tableName as never)
                      .update(attempt.payload as never)
                      .eq("workspace_id", workspaceId)
                      .eq("user_id", editMember.user_id)
                  : scope === "membership_id"
                    ? await supabase
                        .schema(schemaName)
                        .from(attempt.tableName as never)
                        .update(attempt.payload as never)
                        .eq("id", membershipId as string)
                    : await supabase
                        .schema(schemaName)
                        .from(attempt.tableName as never)
                        .update(attempt.payload as never)
                        .eq("team_id", workspaceId)
                        .eq("user_id", editMember.user_id);

              if (error) {
                if (!isRecoverableRoleUpdateError(error.message)) {
                  throw new Error(error.message);
                }
                lastRecoverableError = `${schemaName}.${attempt.tableName}[${scope}]: ${error.message}`;
                continue;
              }

              wroteData = true;
              const updated = await verifyRolesEventually();
              if (updated) return;

              // If write succeeded in one schema, do not continue
              // trying the same attempt in another schema just to avoid
              // false-negative recoverable errors.
              break;
            }
          }
        }

        if (wroteData) {
          const eventuallyUpdated = await verifyRolesEventually(8, 150);
          if (eventuallyUpdated) return;
          // DB write likely succeeded but membership view can lag.
          // Do not raise a blocking error in this case.
          return;
        }

        throw new Error(lastRecoverableError);
      };

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
        body: JSON.stringify({
          mode: "update_member_roles",
          userId: editMember.user_id,
          accessRole: nextAccessRole,
          jobRole: nextJobRole,
        }),
      });

      const payload = await parseJsonSafe<{
        error?: string;
        accessRole?: string | null;
        jobRole?: string | null;
      }>(response);

      let appliedByRecoverableServerError = false;
      if (!response.ok) {
        if (response.status === 404) {
          await fallbackUpdateRolesDirectly();
        } else {
          const message = payload?.error || `Не вдалося оновити ролі (HTTP ${response.status})`;
          if (isRecoverableRoleUpdateError(message)) {
            const updated = await verifyRolesEventually(8, 150);
            if (!updated) throw new Error(message);
            appliedByRecoverableServerError = true;
          } else {
            throw new Error(message);
          }
        }
      }

      if (response.ok || appliedByRecoverableServerError) {
        const savedAccessRole: string | null = payload?.accessRole ?? normalizedAccessRole;
        const savedJobRole: string | null = payload?.jobRole ?? normalizedJobRole;

        setMembers((prev) =>
          prev.map((member) =>
            member.user_id === editMember.user_id
              ? { ...member, access_role: savedAccessRole, job_role: savedJobRole }
              : member
          )
        );
      } else {
        setMembers((prev) =>
          prev.map((member) =>
            member.user_id === editMember.user_id
              ? { ...member, access_role: normalizedAccessRole, job_role: normalizedJobRole }
              : member
          )
        );
      }

      if (!response.ok && response.status === 404) {
        toast.success("Права учасника оновлено (fallback)");
      } else {
        toast.success("Права учасника оновлено");
      }
    } catch (error: unknown) {
      toast.error("Не вдалося змінити ролі", { description: getErrorMessage(error) });
    } finally {
      setEditBusy(false);
    }
  };

  const createInvite = async () => {
    if (!workspaceId) return;
    if (!inviteEmail) {
      toast.error("Вкажіть email для інвайту");
      return;
    }
    if (!isSuperAdmin && inviteAccessRole === "owner") {
      toast.error("Admin не може запрошувати Super Admin");
      return;
    }

    setInviteBusy(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) {
        toast.error("Не вдалося підтвердити авторизацію");
        return;
      }

      const response = await fetch("/.netlify/functions/create-workspace-invite", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          email: inviteEmail,
          accessRole: inviteAccessRole,
          jobRole: normalizeJobRoleInput(inviteJobRole),
          expiresInDays: 7,
        }),
      });

      const payload = await parseJsonSafe<{ error?: string; token?: string }>(response);
      if (!response.ok) {
        throw new Error(payload?.error || `Invite failed (HTTP ${response.status})`);
      }

      const token = payload?.token as string | undefined;
      if (token) {
        setGeneratedLink(getInviteLink(token));
      } else {
        setGeneratedLink(null);
      }

      const { data: invitesData } = await supabase
        .schema("tosho")
        .from("workspace_invites")
        .select("id,email,access_role,job_role,token,created_at,expires_at,accepted_at")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false });

      setInvites((invitesData as Invite[]) ?? []);
    } catch (e: unknown) {
      toast.error("Не вдалося створити інвайт", { description: getErrorMessage(e, "") });
    } finally {
      setInviteBusy(false);
    }
  };

  const confirmRevoke = (id: string) => {
    setRevokeId(id);
  };

  const openInviteDialog = () => {
    setActiveTab("invites");
    setInviteOpen(true);
    setGeneratedLink(null);
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
  useEffect(() => {
    const el = twoPaneRef.current;
    if (!el || activeTab !== "members" || effectiveViewMode !== "panel") return;
    const update = () => setTwoPaneTop(Math.round(el.getBoundingClientRect().top));
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [activeTab, effectiveViewMode, activeFilter, showSkeleton]);

  const inviteAccessRoleOptions = isSuperAdmin
    ? ACCESS_ROLE_OPTIONS
    : ACCESS_ROLE_OPTIONS.filter((option) => option.value !== "owner");
  const memberAccessRoleOptions = isSuperAdmin
    ? MEMBER_ACCESS_ROLE_OPTIONS
    : MEMBER_ACCESS_ROLE_OPTIONS.filter((option) => option.value !== "owner");
  const activeInvitesCount = invites.filter((i) => !i.accepted_at && !isExpired(i.expires_at)).length;
  const managerOptions = members.map((member) => {
    const profile = memberProfilesByUserId[member.user_id];
    const label =
      formatUserShortName({
        fullName: member.full_name ?? profile?.label ?? null,
        email: member.email ?? null,
        fallback: member.email ?? member.user_id,
      }) || "Користувач";
    return {
      id: member.user_id,
      label,
    };
  });
  const selectedManagerLabel =
    managerOptions.find((option) => option.id === editProfileManagerUserId)?.label ?? "Не обрано";
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
              <h1 className="text-lg font-semibold tracking-tight text-foreground">Співробітники</h1>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
                {members.length}
              </span>
            </div>
            <div className={cn(SEGMENTED_GROUP, "h-10")}>
                <Button
                  type="button"
                  variant="segmented"
                  size="xs"
                  aria-pressed={activeTab === "members"}
                  onClick={() => handleTabChange("members")}
                  className={cn(SEGMENTED_TRIGGER, "h-8")}
                >
                  Учасники ({members.length})
                </Button>
                {canManage ? (
                  <Button
                    type="button"
                    variant="segmented"
                    size="xs"
                    aria-pressed={activeTab === "invites"}
                    onClick={() => handleTabChange("invites")}
                    className={cn(SEGMENTED_TRIGGER, "h-8")}
                  >
                    Запрошення ({invites.filter((i) => !i.accepted_at && !isExpired(i.expires_at)).length})
                  </Button>
                ) : null}
              </div>
          </div>
        }
        topRight={
          <div className="flex w-full flex-wrap items-center gap-2 md:w-auto md:justify-end lg:ml-auto">
            {activeTab === "members" ? (
              <div className={cn(SEGMENTED_GROUP, "h-10")}>
                <Button
                  type="button"
                  variant="segmented"
                  size="xs"
                  aria-pressed={effectiveViewMode === "panel"}
                  onClick={() => setViewMode("panel")}
                  className={cn(SEGMENTED_TRIGGER, "h-8 px-3")}
                  title="Панель: список + картка людини"
                >
                  <Columns2 className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="segmented"
                  size="xs"
                  aria-pressed={effectiveViewMode === "rows"}
                  onClick={() => setViewMode("rows")}
                  className={cn(SEGMENTED_TRIGGER, "h-8 px-3")}
                  title="Рядки: таблиця для порівняння"
                >
                  <Rows3 className="h-4 w-4" />
                </Button>
                {canPulse ? (
                  <Button
                    type="button"
                    variant="segmented"
                    size="xs"
                    aria-pressed={effectiveViewMode === "pulse"}
                    onClick={() => setViewMode("pulse")}
                    className={cn(SEGMENTED_TRIGGER, "h-8 gap-1.5 px-3")}
                    title="Пульс: аналітика активності команди"
                  >
                    <Activity className="h-4 w-4" />
                    Пульс
                  </Button>
                ) : null}
              </div>
            ) : null}
            {canManage ? (
              <Button variant="primary" size="lg" className={cn(TOOLBAR_ACTION_BUTTON, "md:px-5")} onClick={openInviteDialog}>
                Інвайт
              </Button>
            ) : null}
          </div>
        }
        filters={
          activeTab === "members" && effectiveViewMode !== "pulse" ? (
            <div className="flex flex-wrap items-center gap-1.5">
            <FilterChip
              label="Всі"
              count={members.length}
              active={activeFilter === null}
              onClick={() => setActiveFilter(null)}
            />
            {needsAttentionCount > 0 ? (
              <FilterChip
                label="Потребують уваги"
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
      effectiveViewMode,
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
    return <ListSkeleton />;
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
        {activeTab === "members" && effectiveViewMode !== "pulse" ? (
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
                    onClick={canOpenProfileCard ? () => setSelectedMemberId(m.user_id) : undefined}
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
                                className="shrink-0 px-1.5 py-0 text-[10px] font-medium border-destructive/40 bg-destructive/10 text-destructive"
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
                                  label: canManage ? "Редагувати профіль" : "Відсоток менеджера",
                                  onSelect: () => {
                                    setSelectedMemberId(m.user_id);
                                    openEditProfileDialog(m);
                                    setActiveSection("profile");
                                  },
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
                                onSelect: () => openEditRolesDialog(m),
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
                            : getAvailabilityBadgeClass(availability)
                        )}
                      >
                        {isInactive ? "Неактивний" : getAvailabilityLabel(availability)}
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
                                "inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium",
                                getProbationBadgeClass(probation.status)
                              )}
                            >
                              Випробувальний: {probation.statusLabel}
                            </span>
                            {probation.status !== "completed" ? (
                              <span className="text-[11px] text-muted-foreground">{probation.progress}%</span>
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
                          <div className="mt-2 text-[11px] text-muted-foreground">{probation.caption}</div>
                        </div>
                      ) : null}
                      <div>{presence?.online ? "Зараз онлайн" : formatRelativeTime(presence?.lastSeenAt)}</div>
                    </div>
                  </Card>
                );
              })
            )}
          </div>
          <div
            ref={twoPaneRef}
            className={cn(
              "border-t border-border/60 lg:grid-cols-[minmax(300px,340px)_minmax(0,1fr)]",
              selectedMemberId ? "block" : "hidden",
              effectiveViewMode === "panel" ? "lg:grid" : "lg:hidden"
            )}
            style={twoPaneTop != null ? { ["--team-panes-h" as string]: `calc(100dvh - ${twoPaneTop}px)` } : undefined}
          >
            <div className="hidden border-r border-border/60 lg:block lg:h-[var(--team-panes-h,auto)] lg:overflow-y-auto">
              {membersError ? (
                <div className="p-4 text-sm text-destructive">Помилка завантаження: {membersError}</div>
              ) : filteredMembers.length === 0 ? (
                <div className="p-6 text-sm text-muted-foreground">Нема учасників за фільтром.</div>
              ) : (
                <ul className="flex flex-col">
                  {filteredMembers.map((m) => {
                    const listProfile = memberProfilesByUserId[m.user_id];
                    const listMeta = memberMetaByUserId[m.user_id];
                    const listAvailability = listMeta?.availabilityStatus ?? "available";
                    const listPresence = memberPresenceByUserId[m.user_id];
                    const listInactive = isInactiveEmployment(listMeta?.employmentStatus);
                    const listName = getMemberDisplayName(m);
                    const listInitials = getInitialsFromName(listName, m.email ?? null);
                    const isSelected = panelMember?.user_id === m.user_id;
                    return (
                      <li
                        key={m.user_id}
                        className={cn(
                          "group flex items-center gap-3 border-b border-border/40 px-4 py-2.5 transition-colors",
                          isSelected ? "bg-primary/[0.07]" : "hover:bg-muted/40"
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => setSelectedMemberId(m.user_id)}
                          className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left"
                        >
                          <AvatarBase
                            src={getMemberAvatarSource(listProfile, m)}
                            name={listName}
                            fallback={listInitials}
                            assetVariant="xs"
                            size={36}
                            shape="circle"
                            className="border-border bg-muted/50"
                            fallbackClassName="text-[10px] font-bold"
                            availability={listAvailability}
                            presence={listPresence?.online ? "online" : "offline"}
                            inactive={listInactive}
                          />
                          <span className="min-w-0 flex-1">
                            <span className={cn("block truncate text-sm font-medium text-foreground", listInactive && "text-muted-foreground line-through")}>
                              {listName}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">{getJobRoleLabel(m.job_role ?? null)}</span>
                          </span>
                        </button>
                        {isSelected ? <ChevronRight className="h-4 w-4 shrink-0 text-primary" /> : null}
                        <AppDropdown
                          align="end"
                          contentClassName="w-48"
                          trigger={
                            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          }
                          items={getMemberRowMenuItems(m, listAvailability)}
                        />
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <div className="lg:h-[var(--team-panes-h,auto)] lg:overflow-y-auto">
              {panelMember ? (
                <div className="flex flex-col gap-4 p-5">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="-ml-2 w-fit lg:hidden"
                    onClick={() => setSelectedMemberId(null)}
                  >
                    ← До списку
                  </Button>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex min-w-0 items-center gap-4">
                      <AvatarBase
                        src={getMemberAvatarSource(panelProfile, panelMember)}
                        name={panelDisplayName}
                        fallback={panelInitials}
                        size={56}
                        shape="circle"
                        className="border-border bg-muted/50"
                        fallbackClassName="text-sm font-bold"
                      />
                      <div className="min-w-0">
                        <div className="truncate text-lg font-semibold text-foreground">{panelDisplayName}</div>
                        <div className="truncate text-sm text-muted-foreground">{panelMember.email ?? "Не вказано"}</div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <Badge variant="outline" className={cn("px-2 py-0.5 text-xs font-medium", getAccessBadgeClass(panelMember.access_role ?? null))}>
                            {getAccessRoleLabel(panelMember.access_role ?? null)}
                          </Badge>
                          <Badge variant="outline" className={cn("px-2 py-0.5 text-xs font-medium", getJobBadgeClass(panelMember.job_role ?? null))}>
                            {getJobRoleLabel(panelMember.job_role ?? null)}
                          </Badge>
                          <Badge variant="outline" className={cn("px-2 py-0.5 text-xs font-medium", getEmploymentStatusBadgeClass(displayEmploymentStatus(panelMeta?.employmentStatus)))}>
                            {getEmploymentStatusLabel(displayEmploymentStatus(panelMeta?.employmentStatus))}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className={cn(SEGMENTED_GROUP_SM, "flex-wrap")}>
                    {visiblePersonSections.map((section) => (
                      <Button key={section.key} type="button" variant="segmented" size="xs"
                        aria-pressed={activeSection === section.key}
                        onClick={() => setActiveSection(section.key)}
                        className={SEGMENTED_TRIGGER_SM}>
                        {section.label}
                      </Button>
                    ))}
                  </div>

                  {activeSection === "overview" ? (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-[var(--radius)] border border-border bg-muted/20 p-3">
                          <div className="text-xs uppercase tracking-wide text-muted-foreground">День народження</div>
                          <div className="mt-1 text-sm font-medium text-foreground">{formatBirthDate(panelMeta?.birthDate)}</div>
                        </div>
                        <div className="rounded-[var(--radius)] border border-border bg-muted/20 p-3">
                          <div className="text-xs uppercase tracking-wide text-muted-foreground">Стаж</div>
                          <div className="mt-1 text-sm font-medium text-foreground">{panelSeniority}</div>
                        </div>
                        <div className="rounded-[var(--radius)] border border-border bg-muted/20 p-3">
                          <div className="text-xs uppercase tracking-wide text-muted-foreground">Доступність</div>
                          <div className="mt-1 text-sm font-medium text-foreground">{getAvailabilityLabel(panelMeta?.availabilityStatus ?? "available")}</div>
                        </div>
                        <div className="rounded-[var(--radius)] border border-border bg-muted/20 p-3">
                          <div className="text-xs uppercase tracking-wide text-muted-foreground">Телефон</div>
                          <div className="mt-1 text-sm font-medium text-foreground">{panelMeta?.phone || "—"}</div>
                        </div>
                      </div>
                      {canPulse ? <PersonTimeInCrm userId={panelMember.user_id} /> : null}
                    </>
                  ) : null}

                  {activeSection === "profile" ? (
                    <div className="flex flex-col gap-4">
                    <div className="rounded-[var(--radius)] border border-border bg-background/70 p-4">
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-foreground">Email</Label>
                        <Input value={editProfileMember?.email ?? "Не вказано"} disabled className="h-11" />
                      </div>
                    </div>
                    <div className="rounded-[var(--radius)] border border-border bg-background/70 p-4">
                      <div className="mb-4 text-sm font-semibold text-foreground">Особисті дані</div>
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-foreground">Імʼя</Label>
                          <Input
                            value={editProfileFirstName}
                            onChange={(event) => setEditProfileFirstName(event.target.value)}
                            className="h-11"
                            placeholder="Імʼя"
                            disabled={!canManage}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-foreground">Прізвище</Label>
                          <Input
                            value={editProfileLastName}
                            onChange={(event) => setEditProfileLastName(event.target.value)}
                            className="h-11"
                            placeholder="Прізвище"
                            disabled={!canManage}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-foreground">Дата народження</Label>
                          <Input
                            type="date"
                            value={editProfileBirthDate}
                            onChange={(event) => setEditProfileBirthDate(event.target.value)}
                            className="h-11"
                            disabled={!canManage}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-foreground">Телефон</Label>
                          <Input
                            value={editProfilePhone}
                            onChange={(event) => setEditProfilePhone(event.target.value)}
                            className="h-11"
                            placeholder="+380..."
                            disabled={!canManage}
                          />
                        </div>
                      </div>
                    </div>
                    <div className="rounded-[var(--radius)] border border-border bg-background/70 p-4">
                      <div className="mb-4 text-sm font-semibold text-foreground">Робочі параметри</div>
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        {shouldShowManagerRateField ? (
                          <div className="space-y-2 sm:col-span-2">
                            <Label className="text-sm font-medium text-foreground">% менеджера</Label>
                            <Input
                              type="number"
                              min="0"
                              value={editProfileManagerRate}
                              onChange={(event) => setEditProfileManagerRate(event.target.value)}
                              className="h-11"
                              placeholder={String(DEFAULT_MANAGER_RATE)}
                            />
                          </div>
                        ) : null}
                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-foreground">Статус доступності</Label>
                          <Select
                            value={editProfileAvailabilityStatus}
                            onValueChange={(value) => setEditProfileAvailabilityStatus(value as MemberProfileMeta["availabilityStatus"])}
                            disabled={!canManage}
                          >
                            <SelectTrigger className={cn(CONTROL_BASE, "h-11")}>
                              {getAvailabilityLabel(editProfileAvailabilityStatus)}
                            </SelectTrigger>
                            <SelectContent>
                              {AVAILABILITY_OPTIONS.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        {editProfileAvailabilityStatus !== "available" ? (
                          <>
                            <div className="space-y-2">
                              <Label className="text-sm font-medium text-foreground">Початок відсутності</Label>
                              <Input
                                type="date"
                                value={editProfileAvailabilityStartDate}
                                onChange={(event) => setEditProfileAvailabilityStartDate(event.target.value)}
                                className="h-11"
                                disabled={!canManage}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-sm font-medium text-foreground">Кінець відсутності</Label>
                              <Input
                                type="date"
                                value={editProfileAvailabilityEndDate}
                                onChange={(event) => setEditProfileAvailabilityEndDate(event.target.value)}
                                className="h-11"
                                disabled={!canManage}
                              />
                              <div className="text-xs text-muted-foreground">
                                {selectedAvailabilityRange || "Можна залишити порожнім, якщо дата повернення невідома"}
                              </div>
                            </div>
                          </>
                        ) : null}
                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-foreground">Менеджер</Label>
                          <Select
                            value={editProfileManagerUserId || "__none__"}
                            onValueChange={(value) => setEditProfileManagerUserId(value === "__none__" ? "" : value)}
                            disabled={!canManage}
                          >
                            <SelectTrigger className={cn(CONTROL_BASE, "h-11")}>{selectedManagerLabel}</SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">Не обрано</SelectItem>
                              {managerOptions
                                .filter((option) => option.id !== editProfileMember?.user_id)
                                .map((option) => (
                                  <SelectItem key={option.id} value={option.id}>
                                    {option.label}
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-foreground">Дата старту</Label>
                          <Input
                            type="date"
                            value={editProfileStartDate}
                            onChange={(event) => setEditProfileStartDate(event.target.value)}
                            className="h-11"
                            disabled={!canManage}
                          />
                        </div>
                      </div>
                    </div>
                    {canOpenProfileCard ? (
                      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                        <Button variant="outline" className="h-10 sm:min-w-[140px]" onClick={() => openEditProfileDialog(panelMember)} disabled={editProfileBusy}>
                          Скинути
                        </Button>
                        <Button className="h-10 sm:min-w-[180px]" onClick={saveMemberProfile} disabled={editProfileBusy}>
                          {editProfileBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : canManage ? "Зберегти профіль" : "Зберегти %"}
                        </Button>
                      </div>
                    ) : null}
                    </div>
                  ) : null}

                  {activeSection === "access" ? (
                    <div className="flex flex-col gap-4">
                    <div className="rounded-[var(--radius)] border border-border bg-background/70 p-4">
                      <div className="mb-4 text-sm font-semibold text-foreground">Ролі</div>
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-foreground">Рівень доступу</Label>
                          <Select value={editAccessRole} onValueChange={setEditAccessRole} disabled={!canEditPanelRoles}>
                            <SelectTrigger className={cn(CONTROL_BASE, "h-11")}>
                              {memberAccessRoleOptions.find((o) => o.value === editAccessRole)?.label}
                            </SelectTrigger>
                            <SelectContent>
                              {memberAccessRoleOptions.map((role) => (
                                <SelectItem key={role.value} value={role.value}>{role.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-foreground">Роль у команді</Label>
                          <Select value={editJobRole} onValueChange={setEditJobRole} disabled={!canEditPanelRoles}>
                            <SelectTrigger className={cn(CONTROL_BASE, "h-11")}>
                              {JOB_ROLE_OPTIONS.find((o) => o.value === editJobRole)?.label}
                            </SelectTrigger>
                            <SelectContent>
                              {JOB_ROLE_OPTIONS.map((role) => (
                                <SelectItem key={role.value} value={role.value}>{role.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      {!canEditPanelRoles ? (
                        <div className="mt-3 text-xs text-muted-foreground">
                          {!isSuperAdmin && panelMember.user_id === currentUserId
                            ? "Admin не може змінювати власні доступи"
                            : "Редагування доступів недоступне"}
                        </div>
                      ) : null}
                    </div>
                    <div className="rounded-[var(--radius)] border border-border bg-background/70 p-4">
                      <div className="mb-4 text-sm font-semibold text-foreground">Доступ до модулів</div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {VISIBLE_MODULE_ACCESS_KEYS.map((key) => (
                          <label
                            key={key}
                            className="flex items-center gap-3 rounded-[var(--radius)] border border-border bg-muted/20 px-3 py-2"
                          >
                            <Checkbox
                              checked={
                                isForcedModuleAccess(key, editProfileMember?.access_role ?? null, editProfileMember?.job_role ?? null)
                                  ? true
                                  : editProfileModuleAccess[key]
                              }
                              disabled={
                                !canManage ||
                                isForcedModuleAccess(key, editProfileMember?.access_role ?? null, editProfileMember?.job_role ?? null)
                              }
                              onCheckedChange={(checked) =>
                                setEditProfileModuleAccess((prev) => ({
                                  ...prev,
                                  [key]: checked === true,
                                }))
                              }
                            />
                            <span className="text-sm text-foreground">{MODULE_ACCESS_LABELS[key]}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                    {canManage ? (
                      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                        <Button className="h-10 sm:min-w-[180px]" onClick={saveAccessSection} disabled={editBusy || editProfileBusy}>
                          {editBusy || editProfileBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Зберегти доступи"}
                        </Button>
                      </div>
                    ) : null}
                      {canManage ? (
                        <PersonAccessHistorySection workspaceId={workspaceId} userId={panelMember.user_id} resolveActorName={resolveActorName} />
                      ) : null}
                    </div>
                  ) : null}

                  {activeSection === "activity" ? <PersonActivitySection userId={panelMember.user_id} /> : null}

                  {activeSection === "hr" ? (
                <div className="min-w-0 space-y-4">
                  <div className={cn("grid gap-4", shouldShowProbationSection ? "sm:grid-cols-2 xl:grid-cols-1" : "grid-cols-1")}>
                    <div className="rounded-[var(--radius)] border border-border bg-muted/20 p-4">
                      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                        <Activity className="h-4 w-4 text-muted-foreground" />
                        Стаж роботи
                      </div>
                      <div className="mt-2 text-lg font-semibold text-foreground">
                        {selectedEmploymentDuration || "Ще не задано"}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {editProfileStartDate
                          ? `${formatEmploymentDate(editProfileStartDate)}${selectedEmploymentDays !== null && selectedEmploymentDays >= 0 ? `, ${selectedEmploymentDays} днів у компанії` : ""}`
                          : "Вкажи дату старту, щоб побачити стаж"}
                      </div>
                    </div>
                  </div>
                  {selectedEmploymentStatus === "active" || selectedEmploymentStatus === "inactive" ? (
                    <div className="rounded-[var(--radius)] border border-border bg-muted/20 p-4">
                      <div className="flex flex-col gap-3">
                        <div>
                          <div className="text-sm font-medium text-foreground">Статус співпраці</div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {selectedEmploymentStatus === "active"
                              ? "Співробітник працює у штаті. Якщо людина пішла або її звільнили, тут можна завершити співпрацю."
                              : "Співпрацю вже завершено. За потреби співробітника можна повернути в штат."}
                          </div>
                        </div>
                        <Badge
                          variant="outline"
                          className={cn(
                            "w-fit px-2.5 py-1 rounded-[var(--radius)]",
                            getEmploymentStatusBadgeClass(selectedEmploymentStatus)
                          )}
                        >
                          {getEmploymentStatusLabel(selectedEmploymentStatus)}
                        </Badge>
                        {selectedEmploymentStatus === "active" ? (
                          <Button
                            type="button"
                            variant="outline"
                            className="h-10 w-full border-danger-soft-border text-danger-foreground"
                            onClick={() => setPendingEmploymentDecision("inactive")}
                            disabled={employmentActionBusy !== null || !canDeactivateEmployment}
                          >
                            {employmentActionBusy === "inactive" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                            Завершити співпрацю
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            className="h-10 w-full"
                            onClick={() => void applyEmploymentDecision("reactivate")}
                            disabled={employmentActionBusy !== null || !canReactivateEmployment}
                          >
                            {employmentActionBusy === "reactivate" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                            Повернути в штат
                          </Button>
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
                  ) : null}
                </div>
              ) : (
                <div className="flex h-full min-h-[300px] flex-col items-center justify-center gap-2 p-10 text-center">
                  <Users className="h-6 w-6 text-muted-foreground/60" />
                  <div className="text-sm text-muted-foreground">Оберіть людину зі списку</div>
                </div>
              )}
            </div>
          </div>

          {effectiveViewMode === "rows" ? (
            <div className="hidden border-t border-border/60 lg:block">
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
                          onClick={() => {
                            setSelectedMemberId(m.user_id);
                            setViewMode("panel");
                            setActiveSection("overview");
                          }}
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
                                fallbackClassName="text-[10px] font-bold"
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
                            <Badge variant="outline" className={cn("px-2 py-0.5 text-xs font-medium rounded-[var(--radius)]", getAccessBadgeClass(m.access_role ?? null))}>
                              {getAccessRoleLabel(m.access_role ?? null)}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={cn("px-2 py-0.5 text-xs font-medium rounded-[var(--radius)]", getJobBadgeClass(m.job_role ?? null))}>
                              {getJobRoleLabel(m.job_role ?? null)}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1">
                              {rowInactive ? (
                                <Badge variant="outline" className="w-fit px-2 py-0.5 text-xs rounded-[var(--radius)] border-muted-foreground/30 bg-muted text-muted-foreground">
                                  Співпрацю завершено
                                </Badge>
                              ) : (
                                <Badge variant="outline" className={cn("w-fit px-2 py-0.5 text-xs rounded-[var(--radius)]", getAvailabilityBadgeClass(rowAvailability))}>
                                  {getAvailabilityLabel(rowAvailability)}
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
                                  <span className="whitespace-nowrap text-[11px] tabular-nums text-muted-foreground">{rowProbation.statusLabel}</span>
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
          ) : null}
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
                            <Badge variant="default" className="bg-success-soft text-success-foreground border-success-soft-border hover:bg-success-soft shadow-none">
                              Активне
                            </Badge>
                          )}
                        </div>
                        <div className="mt-3 text-xs text-muted-foreground">Створено: {formatDate(inv.created_at)}</div>
                        <div className="mt-3 flex gap-2">
                          {!expired && !used ? (
                            <Button
                              size="iconXs"
                              variant="control"
                              onClick={() => {
                                navigator.clipboard.writeText(getInviteLink(inv.token));
                                toast.success("Посилання скопійовано");
                              }}
                            >
                              <Copy className="w-4 h-4" />
                            </Button>
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
                            className={cn("px-2 py-0.5 text-xs rounded-[var(--radius)]", getAccessBadgeClass(inv.access_role))}
                          >
                            {getAccessRoleLabel(inv.access_role)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={cn("px-2 py-0.5 text-xs rounded-[var(--radius)]", getJobBadgeClass(inv.job_role))}
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
                              className="bg-success-soft text-success-foreground border-success-soft-border hover:bg-success-soft shadow-none"
                            >
                              Активне
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
                              <Button
                                size="iconXs"
                                variant="control"
                                onClick={() => {
                                  navigator.clipboard.writeText(getInviteLink(inv.token));
                                  toast.success("Посилання скопійовано");
                                }}
                              >
                                <Copy className="w-4 h-4" />
                              </Button>
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

        {activeTab === "members" && effectiveViewMode === "pulse" && canPulse ? (
          <TeamPulsePanel
            workspaceId={workspaceId}
            people={pulsePeople}
            resolvePerson={resolvePulsePerson}
            onSelectPerson={openPersonCard}
          />
        ) : null}
      </div>

      <Dialog
        open={inviteOpen}
        onOpenChange={(open) => {
          setInviteOpen(open);
          if (!open) setGeneratedLink(null);
        }}
      >
        <DialogContent className="sm:max-w-[520px] p-0 gap-0 overflow-hidden border border-border bg-card text-foreground">
          <div className="p-6 border-b border-border bg-muted/10">
            <DialogHeader>
              <DialogTitle className="text-xl font-semibold text-foreground">Запросити в workspace</DialogTitle>
              <DialogDescription className="mt-1.5 text-muted-foreground">
                Створити посилання для доступу до workspace.
              </DialogDescription>
            </DialogHeader>
          </div>
          <div className="p-6">
            {!generatedLink ? (
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
                <Button onClick={createInvite} disabled={inviteBusy} className="w-full h-11">
                  {inviteBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Створити інвайт"}
                </Button>
              </div>
            ) : (
              <div className="space-y-6">
              <div className="tone-success-subtle tone-text-success flex flex-col items-center justify-center rounded-[var(--radius-inner)] border p-6">
                  <div className="tone-icon-box-success mb-3 flex h-12 w-12 items-center justify-center rounded-full border shadow-sm">
                    <ShieldAlert className="w-6 h-6" />
                  </div>
                  <span className="font-bold text-lg text-foreground">Посилання готове!</span>
                  <span className="text-sm opacity-80 mt-1 text-center max-w-xs text-muted-foreground">
                    Надішли його новому учаснику.
                  </span>
                </div>
                <div className="space-y-2">
                  <Label className="font-medium text-foreground">Посилання для копіювання</Label>
                  <div className="flex gap-2">
                    <Input value={generatedLink} readOnly className="font-mono text-sm bg-muted/50 h-11 border-dashed text-foreground" />
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-11 w-11 shrink-0"
                      onClick={() => {
                        if (!generatedLink) return;
                        navigator.clipboard.writeText(generatedLink);
                        toast.success("Скопійовано в буфер обміну");
                      }}
                    >
                      <Copy className="w-5 h-5" />
                    </Button>
                  </div>
                </div>
                <Button variant="ghost" className="w-full h-11" onClick={() => setInviteOpen(false)}>
                  Закрити
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>



      <Dialog open={!!revokeId} onOpenChange={(open) => !open && setRevokeId(null)}>
        <DialogContent className="sm:max-w-[420px] p-0 gap-0 border border-border bg-card text-foreground overflow-hidden rounded-[var(--radius-inner)]">
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
        <DialogContent className="sm:max-w-[420px] p-0 gap-0 border border-border bg-card text-foreground overflow-hidden rounded-[var(--radius-inner)]">
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


      <ConfirmDialog
        open={pendingEmploymentDecision === "inactive"}
        onOpenChange={(open) => {
          if (!open && employmentActionBusy !== "inactive") setPendingEmploymentDecision(null);
        }}
        title="Завершити співпрацю?"
        description={
          editProfileMember
            ? `Для ${getMemberDisplayName(editProfileMember)} буде зафіксовано, що співпрацю завершено. Це не те саме, що не пройти випробувальний термін.`
            : undefined
        }
        icon={<AlertTriangle className="h-5 w-5 text-danger-foreground" />}
        confirmLabel="Так, завершити"
        confirmClassName="bg-destructive text-destructive-foreground hover:bg-destructive/90"
        loading={employmentActionBusy === "inactive"}
        onConfirm={() => {
          void applyEmploymentDecision("inactive");
        }}
      />
    </div>
  );
}
