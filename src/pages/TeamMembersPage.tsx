import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";
import {
  ShieldAlert,
  MoreHorizontal,
  Search,
  Mail,
  Calendar,
  Link as LinkIcon,
  Clock,
  Copy,
  Trash2,
  Loader2,
  AlertTriangle,
  Activity,
  Shield,
  Gift,
  Award,
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
} from "@/components/ui/controlStyles";
import { Checkbox } from "@/components/ui/checkbox";
import { resolveWorkspaceId } from "@/lib/workspace";
import { buildUserNameFromMetadata, formatUserShortName, getInitialsFromName } from "@/lib/userName";
import {
  addMonthsToDateOnly,
  getEmploymentStatusLabel,
  getBirthdayInsight,
  formatEmploymentDate,
  formatEmploymentDuration,
  getEmploymentDurationDays,
  getWorkAnniversaryInsight,
  isProbationReviewDue,
  normalizeEmploymentStatus,
  getProbationSummary,
  type EmploymentStatus,
} from "@/lib/employment";
import { useWorkspacePresence } from "@/components/app/workspace-presence-context";
import { AppSectionLoader } from "@/components/app/AppSectionLoader";
import { ConfirmDialog } from "@/components/app/ConfirmDialog";
import {
  listWorkspaceMemberDirectory,
  upsertWorkspaceMemberProfile,
  type WorkspaceMemberDirectoryRow,
} from "@/lib/workspaceMemberDirectory";

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
    finance: boolean;
    design: boolean;
    logistics: boolean;
    catalog: boolean;
    contractors: boolean;
    team: boolean;
  };
};

type MemberPresence = {
  currentLabel: string;
  lastSeenAt: string;
  online: boolean;
};

type TeamActivityItem = {
  userId: string;
  title: string;
  createdAt: string;
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
  finance: false,
  design: true,
  logistics: false,
  catalog: false,
  contractors: false,
  team: false,
};

const MODULE_ACCESS_LABELS: Record<keyof MemberProfileMeta["moduleAccess"], string> = {
  overview: "Огляд",
  orders: "Замовлення",
  finance: "Фінанси",
  design: "Дизайн",
  logistics: "Логістика",
  catalog: "Каталог",
  contractors: "Підрядники",
  team: "Управління командою",
};

const VISIBLE_MODULE_ACCESS_KEYS: Array<keyof MemberProfileMeta["moduleAccess"]> = [
  "overview",
  "orders",
  "finance",
  "design",
  "logistics",
  "catalog",
  "contractors",
  "team",
];

const DEFAULT_MEMBER_META: MemberProfileMeta = {
  firstName: "",
  lastName: "",
  fullName: "",
  birthDate: "",
  phone: "",
  managerRate: DEFAULT_MANAGER_RATE,
  availabilityStatus: "available",
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
  if (role === "owner") return "bg-purple-500/10 border-purple-500/25 text-foreground";
  if (role === "admin") return "bg-primary/10 border-primary/20 text-foreground";
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

function normalizeModuleAccess(value: unknown): MemberProfileMeta["moduleAccess"] {
  const input = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  return {
    overview: typeof input.overview === "boolean" ? input.overview : DEFAULT_MODULE_ACCESS.overview,
    orders: typeof input.orders === "boolean" ? input.orders : DEFAULT_MODULE_ACCESS.orders,
    finance: typeof input.finance === "boolean" ? input.finance : DEFAULT_MODULE_ACCESS.finance,
    design: typeof input.design === "boolean" ? input.design : DEFAULT_MODULE_ACCESS.design,
    logistics: typeof input.logistics === "boolean" ? input.logistics : DEFAULT_MODULE_ACCESS.logistics,
    catalog: typeof input.catalog === "boolean" ? input.catalog : DEFAULT_MODULE_ACCESS.catalog,
    contractors: typeof input.contractors === "boolean" ? input.contractors : DEFAULT_MODULE_ACCESS.contractors,
    team: typeof input.team === "boolean" ? input.team : DEFAULT_MODULE_ACCESS.team,
  };
}

function getProbationBadgeClass(status: "upcoming" | "active" | "completed") {
  if (status === "completed") return "bg-success-soft text-success-foreground border-success-soft-border";
  if (status === "active") return "bg-warning-soft text-warning-foreground border-warning-soft-border";
  return "bg-muted text-muted-foreground border-border";
}

function getEmploymentStatusBadgeClass(status: EmploymentStatus) {
  if (status === "rejected") return "bg-danger-soft text-danger-foreground border-danger-soft-border";
  if (status === "inactive") return "bg-muted text-muted-foreground border-border";
  if (status === "probation") return "bg-warning-soft text-warning-foreground border-warning-soft-border";
  return "bg-success-soft text-success-foreground border-success-soft-border";
}

function getRangeStartIso(range: "day" | "week" | "month") {
  const date = new Date();
  if (range === "day") {
    date.setDate(date.getDate() - 1);
  } else if (range === "week") {
    date.setDate(date.getDate() - 7);
  } else {
    date.setMonth(date.getMonth() - 1);
  }
  return date.toISOString();
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

export function TeamMembersPage() {
  const [params, setParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<"members" | "invites" | "activity">("members");
  const { entries, onlineEntries } = useWorkspacePresence();

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
  const [activityRange, setActivityRange] = useState<"day" | "week" | "month">("day");
  const [teamActivityItems, setTeamActivityItems] = useState<TeamActivityItem[]>([]);
  const [teamActivityLoading, setTeamActivityLoading] = useState(false);

  const [invites, setInvites] = useState<Invite[]>(cached?.invites ?? []);
  const [invitesLoading, setInvitesLoading] = useState(false);
  const [invitesError, setInvitesError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");

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
  const [editProfileStartDate, setEditProfileStartDate] = useState("");
  const [editProfileProbationEndDate, setEditProfileProbationEndDate] = useState("");
  const [editProfileManagerUserId, setEditProfileManagerUserId] = useState("");
  const [editProfileModuleAccess, setEditProfileModuleAccess] =
    useState<MemberProfileMeta["moduleAccess"]>(DEFAULT_MODULE_ACCESS);
  const [editProfileBusy, setEditProfileBusy] = useState(false);
  const [probationActionBusy, setProbationActionBusy] = useState<"active" | "rejected" | "extend" | null>(null);
  const [pendingProbationDecision, setPendingProbationDecision] = useState<"rejected" | null>(null);
  const [employmentActionBusy, setEmploymentActionBusy] = useState<"inactive" | "reactivate" | null>(null);
  const [pendingEmploymentDecision, setPendingEmploymentDecision] = useState<"inactive" | null>(null);
  const [, setWorkspaceFunctionAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    const tab = params.get("tab");
    if (tab === "invites" || tab === "members" || tab === "activity") {
      setActiveTab(tab);
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

  const openEditProfileDialog = useCallback((member: Member) => {
    const meta = memberMetaByUserId[member.user_id] ?? DEFAULT_MEMBER_META;
    setEditProfileMember(member);
    setEditProfileFirstName(meta?.firstName ?? "");
    setEditProfileLastName(meta?.lastName ?? "");
    setEditProfileBirthDate(meta?.birthDate ?? "");
    setEditProfilePhone(meta?.phone ?? "");
    setEditProfileManagerRate(String(meta?.managerRate ?? DEFAULT_MANAGER_RATE));
    setEditProfileAvailabilityStatus(meta?.availabilityStatus ?? "available");
    setEditProfileStartDate(meta?.startDate ?? "");
    setEditProfileProbationEndDate(meta?.probationEndDate ?? "");
    setEditProfileManagerUserId(meta?.managerUserId ?? "");
    setEditProfileModuleAccess(meta?.moduleAccess ?? DEFAULT_MODULE_ACCESS);
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
            startDate: row.startDate,
            probationEndDate: row.probationEndDate,
            employmentStatus: row.employmentStatus,
            probationReviewNotifiedAt: row.probationReviewNotifiedAt,
            probationReviewedAt: row.probationReviewedAt,
            probationReviewedBy: row.probationReviewedBy,
            probationExtensionCount: row.probationExtensionCount,
            managerUserId: row.managerUserId,
            moduleAccess: normalizeModuleAccess(row.moduleAccess),
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
    if (!workspaceId || activeTab !== "activity") {
      setTeamActivityLoading(false);
      return;
    }

    let cancelled = false;

    const loadTeamActivity = async () => {
      setTeamActivityLoading(true);
      try {
        const startIso = getRangeStartIso(activityRange);
        const loadScoped = async (scope: "team" | "workspace" | "none") => {
          let query = supabase
            .from("activity_log")
            .select("user_id,title,action,created_at")
            .gte("created_at", startIso)
            .order("created_at", { ascending: false })
            .limit(500);
          if (scope === "team") query = query.eq("team_id", workspaceId);
          if (scope === "workspace") query = query.eq("workspace_id", workspaceId);
          return query;
        };

        const [teamScoped, workspaceScoped, unscoped] = await Promise.all([
          loadScoped("team"),
          loadScoped("workspace"),
          loadScoped("none"),
        ]);

        const candidates = [teamScoped, workspaceScoped, unscoped].filter((candidate) => !candidate.error);
        const bestCandidate = candidates.sort((a, b) => (b.data?.length ?? 0) - (a.data?.length ?? 0))[0];
        const rows = (bestCandidate?.data ?? []) as Array<{
          user_id?: string | null;
          title?: string | null;
          action?: string | null;
          created_at?: string | null;
        }>;
        if (cancelled) return;

        const memberIds = new Set(members.map((member) => member.user_id));
        setTeamActivityItems(
          rows
            .filter((row) => (row.user_id ?? "") && memberIds.has(row.user_id ?? ""))
            .map((row) => ({
              userId: row.user_id ?? "",
              title: row.title?.trim() || row.action?.trim() || "Дія в CRM",
              createdAt: row.created_at ?? "",
            }))
        );
      } catch {
        if (cancelled) return;
        setTeamActivityItems([]);
      } finally {
        if (!cancelled) setTeamActivityLoading(false);
      }
    };

    void loadTeamActivity();

    return () => {
      cancelled = true;
    };
  }, [workspaceId, activeTab, activityRange, members]);

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

  const filteredMembers = members.filter((m) => {
    const email = (m.email ?? "").toLowerCase();
    const name = (m.full_name ?? "").toLowerCase();
    const fallbackName = (memberProfilesByUserId[m.user_id]?.label ?? "").toLowerCase();
    const firstName = (memberMetaByUserId[m.user_id]?.firstName ?? "").toLowerCase();
    const lastName = (memberMetaByUserId[m.user_id]?.lastName ?? "").toLowerCase();
    const phone = (memberMetaByUserId[m.user_id]?.phone ?? "").toLowerCase();
    const q = searchQuery.toLowerCase();
    return (
      email.includes(q) ||
      name.includes(q) ||
      fallbackName.includes(q) ||
      firstName.includes(q) ||
      lastName.includes(q) ||
      phone.includes(q)
    );
  });

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

  const getInviteLink = (token: string) => `${window.location.origin}/invite?token=${token}`;
  const localProfileFallbackHint =
    "Локально fallback-функція недоступна. Запусти через `netlify dev` або застосуй SQL зі scripts/team-member-profiles.sql.";
  const selectedEmploymentDuration = formatEmploymentDuration(editProfileStartDate);
  const selectedEmploymentDays = getEmploymentDurationDays(editProfileStartDate);
  const selectedProbation = getProbationSummary(editProfileStartDate, editProfileProbationEndDate);
  const selectedBirthdayInsight = getBirthdayInsight(editProfileBirthDate);
  const selectedAnniversaryInsight = getWorkAnniversaryInsight(editProfileStartDate);
  const selectedEmploymentStatus = normalizeEmploymentStatus(
    memberMetaByUserId[editProfileMember?.user_id ?? ""]?.employmentStatus,
    editProfileProbationEndDate
  );
  const selectedDisplayName = editProfileMember ? getMemberDisplayName(editProfileMember) : "Учасник";
  const selectedProfile = editProfileMember ? memberProfilesByUserId[editProfileMember.user_id] : null;
  const selectedInitials = editProfileMember
    ? getInitialsFromName(selectedDisplayName, editProfileMember.email ?? null)
    : "U";
  const shouldShowManagerRateField =
    canManageManagerRates && supportsManagerRate(editProfileMember?.job_role ?? null);
  const shouldShowProbationSection =
    selectedEmploymentStatus === "probation" || selectedEmploymentStatus === "rejected";
  const selectedProbationReviewDue = isProbationReviewDue(
    memberMetaByUserId[editProfileMember?.user_id ?? ""]?.employmentStatus,
    editProfileProbationEndDate
  );
  const canApproveProbationNow = selectedEmploymentStatus === "probation";
  const canRejectProbationNow = selectedEmploymentStatus === "probation";
  const canExtendProbationNow = selectedEmploymentStatus === "probation" && selectedProbationReviewDue;
  const canDeactivateEmployment = selectedEmploymentStatus === "active";
  const canReactivateEmployment = selectedEmploymentStatus === "inactive";

  const isExpired = (dateStr: string) => new Date(dateStr) < new Date();

  const handleTabChange = (next: "members" | "invites" | "activity") => {
    setActiveTab(next);
    setParams(next === "members" ? {} : { tab: next });
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
      const startDate = editProfileStartDate.trim();
      const probationEndDate = editProfileProbationEndDate.trim();
      const managerUserId = editProfileManagerUserId.trim();
      const moduleAccess = editProfileModuleAccess;
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

  const applyProbationDecision = async (decision: "active" | "rejected" | "extend") => {
    if (!editProfileMember || !workspaceId) return;

    setProbationActionBusy(decision);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error("Не вдалося підтвердити авторизацію");

      const response = await fetch("/.netlify/functions/team-member-probation", {
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
        throw new Error(payload?.error || `Не вдалося оновити випробувальний термін (HTTP ${response.status})`);
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
      setEditProfileStartDate(nextMeta.startDate);
      setEditProfileProbationEndDate(nextMeta.probationEndDate);

      toast.success(
        decision === "active"
          ? "Співробітника переведено в штат"
          : decision === "extend"
          ? "Випробувальний термін продовжено"
          : "Рішення по випробувальному збережено"
      );
      setPendingProbationDecision(null);
    } catch (error: unknown) {
      toast.error("Не вдалося оновити випробувальний термін", { description: getErrorMessage(error) });
    } finally {
      setProbationActionBusy(null);
    }
  };

  const requestProbationRejection = () => {
    if (!canRejectProbationNow) return;
    setPendingProbationDecision("rejected");
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
        redirectTo: `${window.location.origin}/reset-password`,
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
                    .from(attempt.tableName)
                    .delete()
                    .eq("workspace_id", workspaceId)
                    .eq("user_id", memberToDelete.user_id)
                : scope === "membership_id"
                  ? await supabase
                      .schema(schemaName)
                      .from(attempt.tableName)
                      .delete()
                      .eq("id", membershipId as string)
                  : await supabase
                      .schema(schemaName)
                      .from(attempt.tableName)
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

  const updateAvailabilityStatus = async (member: Member, status: MemberProfileMeta["availabilityStatus"]) => {
    if (!workspaceId) return;
    try {
      const currentMeta = memberMetaByUserId[member.user_id] ?? DEFAULT_MEMBER_META;
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
      setEditMember(null);
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
                      .from(attempt.tableName)
                      .update(attempt.payload)
                      .eq("workspace_id", workspaceId)
                      .eq("user_id", editMember.user_id)
                  : scope === "membership_id"
                    ? await supabase
                        .schema(schemaName)
                        .from(attempt.tableName)
                        .update(attempt.payload)
                        .eq("id", membershipId as string)
                    : await supabase
                        .schema(schemaName)
                        .from(attempt.tableName)
                        .update(attempt.payload)
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
      setEditMember(null);
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
      (activeTab === "invites" && invitesLoading) ||
      (activeTab === "activity" && teamActivityLoading)
  );
  const inviteAccessRoleOptions = isSuperAdmin
    ? ACCESS_ROLE_OPTIONS
    : ACCESS_ROLE_OPTIONS.filter((option) => option.value !== "owner");
  const memberAccessRoleOptions = isSuperAdmin
    ? MEMBER_ACCESS_ROLE_OPTIONS
    : MEMBER_ACCESS_ROLE_OPTIONS.filter((option) => option.value !== "owner");
  const activeInvitesCount = invites.filter((i) => !i.accepted_at && !isExpired(i.expires_at)).length;
  const memberIdsSet = new Set(members.map((member) => member.user_id));
  const onlineNowCount = onlineEntries.filter((entry) => memberIdsSet.has(entry.userId)).length;
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
  const upcomingBirthdayEvents = useMemo(() => {
    const candidates = members
      .map((member) => {
        const insight = getBirthdayInsight(memberMetaByUserId[member.user_id]?.birthDate);
        if (!insight) return null;
        return {
          type: "birthday" as const,
          member,
          insight,
        };
      })
      .filter(Boolean) as Array<{
      type: "birthday";
      member: Member;
      insight: NonNullable<ReturnType<typeof getBirthdayInsight>>;
    }>;

    candidates.sort((a, b) => a.insight.daysUntil - b.insight.daysUntil);
    return candidates;
  }, [members, memberMetaByUserId]);
  const upcomingAnniversaryEvents = useMemo(() => {
    const candidates = members
      .map((member) => {
        const insight = getWorkAnniversaryInsight(memberMetaByUserId[member.user_id]?.startDate);
        if (!insight) return null;
        return {
          type: "anniversary" as const,
          member,
          insight,
        };
      })
      .filter(Boolean) as Array<{
      type: "anniversary";
      member: Member;
      insight: NonNullable<ReturnType<typeof getWorkAnniversaryInsight>>;
    }>;

    candidates.sort((a, b) => a.insight.daysUntil - b.insight.daysUntil);
    return candidates;
  }, [members, memberMetaByUserId]);
  const upcomingTeamEvents = useMemo(() => {
    const combined = [...upcomingBirthdayEvents, ...upcomingAnniversaryEvents]
      .sort((a, b) => {
        if (a.insight.daysUntil !== b.insight.daysUntil) return a.insight.daysUntil - b.insight.daysUntil;
        return getMemberDisplayName(a.member).localeCompare(getMemberDisplayName(b.member), "uk");
      })
      .slice(0, 3);
    return combined;
  }, [getMemberDisplayName, upcomingAnniversaryEvents, upcomingBirthdayEvents]);
  const needsAttentionCount = useMemo(() => {
    return members.filter((member) => {
      const meta = memberMetaByUserId[member.user_id];
      const probation = getProbationSummary(meta?.startDate, meta?.probationEndDate);
      return (
        !meta?.birthDate ||
        !meta?.startDate ||
        !(member.job_role ?? "").trim() ||
        isProbationReviewDue(meta?.employmentStatus, meta?.probationEndDate) ||
        probation?.status === "upcoming"
      );
    }).length;
  }, [members, memberMetaByUserId]);
  const probationReviewDueCount = useMemo(() => {
    return members.filter((member) => {
      const meta = memberMetaByUserId[member.user_id];
      return isProbationReviewDue(meta?.employmentStatus, meta?.probationEndDate);
    }).length;
  }, [members, memberMetaByUserId]);

  if (showSkeleton) {
    return <ListSkeleton />;
  }

  if (!workspaceId) {
    return (
      <div className="flex flex-col gap-6 w-full max-w-[1400px] mx-auto pb-20 md:pb-0">
        <Card className="rounded-[var(--radius-section)] border border-border bg-card shadow-none overflow-hidden flex flex-col">
          <div className="p-6">
            <div className="text-sm font-semibold text-foreground">Workspace not selected</div>
            <div className="mt-1 text-sm text-muted-foreground">
              Немає доступного workspace. Перевір права доступу або створіть workspace.
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 w-full max-w-[1400px] mx-auto pb-20 md:pb-0">
      <Card className="overflow-hidden border border-border bg-card shadow-none">
        <div className="grid gap-0 xl:grid-cols-[minmax(0,1.55fr)_390px]">
          <div className="p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm font-semibold text-foreground">Команда сьогодні</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  Швидкий зріз по складу, присутності та тому, що потребує уваги.
                </div>
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-border/70 bg-muted/[0.04] px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Усього</div>
                  <Shield className="h-4 w-4 text-primary/70" />
                </div>
                <div className="mt-3 text-3xl font-semibold tabular-nums text-foreground">{members.length}</div>
                <div className="mt-1 text-sm text-muted-foreground">учасників у команді</div>
              </div>

              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.04] px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Онлайн</div>
                  <Activity className="h-4 w-4 text-emerald-600/80 dark:text-emerald-400/80" />
                </div>
                <div className="mt-3 text-3xl font-semibold tabular-nums text-foreground">{onlineNowCount}</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {onlineNowCount > 0 ? `з ${members.length} активних` : "нікого онлайн"}
                </div>
              </div>

              <div className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.04] px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Увага</div>
                  <AlertTriangle className="h-4 w-4 text-amber-600/80 dark:text-amber-400/80" />
                </div>
                <div className="mt-3 text-3xl font-semibold tabular-nums text-foreground">{needsAttentionCount}</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {probationReviewDueCount > 0
                    ? `${probationReviewDueCount} рішень по випробувальному`
                    : activeInvitesCount > 0
                    ? `${activeInvitesCount} інвайтів очікують`
                    : `перевірити профілі та ролі`}
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-border bg-muted/[0.03] p-5 xl:border-l xl:border-t-0">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-foreground">Найближчі події</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  День народження та річниці в компанії
                </div>
              </div>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-foreground/[0.04] text-foreground/70">
                <Calendar className="h-4 w-4" />
              </div>
            </div>

            <div className="mt-5 space-y-2">
              {upcomingTeamEvents.length > 0 ? (
                upcomingTeamEvents.map((event) => {
                  const eventLabel =
                    event.type === "birthday"
                      ? "День народження"
                      : `${event.insight.years} ${event.insight.years === 1 ? "рік" : event.insight.years >= 2 && event.insight.years <= 4 ? "роки" : "років"} в компанії`;
                  const timingLabel =
                    event.insight.daysUntil === 0 ? "Сьогодні" : `Через ${event.insight.daysUntil} дн`;
                  return (
                    <div
                      key={`${event.type}:${event.member.user_id}:${event.insight.dateLabel}`}
                      className="rounded-2xl border border-border/70 bg-background/70 px-3 py-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-start gap-3">
                          <div
                            className={cn(
                              "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                              event.type === "birthday"
                                ? "bg-amber-500/10 text-amber-600 dark:text-amber-300"
                                : "bg-sky-500/10 text-sky-600 dark:text-sky-300"
                            )}
                          >
                            {event.type === "birthday" ? (
                              <Gift className="h-4 w-4" />
                            ) : (
                              <Award className="h-4 w-4" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-foreground">
                              {getMemberDisplayName(event.member)}
                            </div>
                            <div className="mt-0.5 text-xs text-muted-foreground">
                              {eventLabel}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {event.insight.caption}
                            </div>
                          </div>
                        </div>
                        <div className="shrink-0 rounded-full border border-border/70 bg-muted/50 px-2.5 py-1 text-[11px] font-medium text-foreground/80">
                          {timingLabel}
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="rounded-lg border border-border/70 bg-background/70 px-3 py-3 text-sm text-muted-foreground">
                  Додай дати народження та старту в профілі учасників.
                </div>
              )}
            </div>
          </div>
        </div>
      </Card>

      <Card className="rounded-[var(--radius-section)] border border-border bg-card shadow-none overflow-hidden flex flex-col">
        <div className="flex flex-col gap-4 p-5 border-b border-border bg-muted/5">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className={SEGMENTED_GROUP}>
              <Button
                type="button"
                variant="segmented"
                size="xs"
                aria-pressed={activeTab === "members"}
                onClick={() => handleTabChange("members")}
                className={SEGMENTED_TRIGGER}
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
                  className={SEGMENTED_TRIGGER}
                >
                  Запрошення ({invites.filter((i) => !i.accepted_at && !isExpired(i.expires_at)).length})
                </Button>
              ) : null}
              {canManage ? (
                <Button
                  type="button"
                  variant="segmented"
                  size="xs"
                  aria-pressed={activeTab === "activity"}
                  onClick={() => handleTabChange("activity")}
                  className={SEGMENTED_TRIGGER}
                >
                  Активність
                </Button>
              ) : null}
            </div>

            <div className="flex w-full flex-col gap-3 md:w-auto md:flex-row md:items-center md:justify-end">
              {activeTab === "members" ? (
                <div className="relative w-full md:w-72">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 h-10 bg-background border-input rounded-[var(--radius-lg)]"
                    placeholder="Пошук учасників..."
                  />
                </div>
              ) : null}
              {canManage ? (
                <Button size="sm" className="h-10 md:px-5" onClick={openInviteDialog}>
                  Інвайт
                </Button>
              ) : null}
            </div>
          </div>
        </div>

        {activeTab === "members" ? (
          <>
          <div className="space-y-3 md:hidden">
            {membersError ? (
              <Card className="border-border/60 p-4 text-sm text-destructive">Помилка завантаження: {membersError}</Card>
            ) : filteredMembers.length === 0 ? (
              <Card className="border-border/60 p-4 text-sm text-muted-foreground">Нема учасників.</Card>
            ) : (
              filteredMembers.map((m) => {
                const profile = memberProfilesByUserId[m.user_id];
                const meta = memberMetaByUserId[m.user_id];
                const availability = meta?.availabilityStatus ?? "available";
                const presence = memberPresenceByUserId[m.user_id];
                const employmentDuration = formatEmploymentDuration(meta?.startDate);
                const employmentDays = getEmploymentDurationDays(meta?.startDate);
                const probation = getProbationSummary(meta?.startDate, meta?.probationEndDate);
                const displayName = getMemberDisplayName(m);
                const initials = getInitialsFromName(displayName, m.email ?? null);
                return (
                  <Card key={m.user_id} className="border-border/60 p-4">
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
                          />
                          <span
                            className={cn(
                              "absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-background",
                              presence?.online ? "bg-emerald-500" : "bg-muted-foreground/40"
                            )}
                          />
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-foreground">{displayName}</div>
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
                                  onSelect: () => openEditProfileDialog(m),
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
                      <Badge variant="outline" className={cn("px-2 py-0.5 text-xs", getAvailabilityBadgeClass(availability))}>
                        {getAvailabilityLabel(availability)}
                      </Badge>
                    </div>
                    <div className="mt-3 grid grid-cols-1 gap-2 text-xs text-muted-foreground">
                      <div>Народження: {formatBirthDate(meta?.birthDate)}</div>
                      <div>Почав роботу: {meta?.startDate ? formatEmploymentDate(meta.startDate) : "Не вказано"}</div>
                      <div>Стаж: {employmentDuration || "Не вказано"}</div>
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
                                    ? "bg-amber-500"
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
          <div className="hidden overflow-x-auto md:block">
            <Table variant="list" size="md">
              <TableHeader className="bg-muted/30">
                <TableRow className="hover:bg-transparent border-border/50">
                  <TableTextHeaderCell widthClass="w-[30%]" className="pl-6">
                    Користувач
                  </TableTextHeaderCell>
                  <TableTextHeaderCell>Доступ</TableTextHeaderCell>
                  <TableTextHeaderCell>Роль / Посада</TableTextHeaderCell>
                  <TableTextHeaderCell>Статус</TableTextHeaderCell>
                  <TableTextHeaderCell>Дата народження</TableTextHeaderCell>
                  <TableTextHeaderCell>Робота / Випробувальний</TableTextHeaderCell>
                  <TableActionHeaderCell>Дії</TableActionHeaderCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {membersError ? (
                  <TableEmptyRow colSpan={7}>Помилка завантаження: {membersError}</TableEmptyRow>
                ) : filteredMembers.length === 0 ? (
                  <TableEmptyRow colSpan={7}>Нема учасників.</TableEmptyRow>
                ) : (
                  filteredMembers.map((m) => {
                    const profile = memberProfilesByUserId[m.user_id];
                    const meta = memberMetaByUserId[m.user_id];
                    const availability = meta?.availabilityStatus ?? "available";
                    const presence = memberPresenceByUserId[m.user_id];
                    const employmentDuration = formatEmploymentDuration(meta?.startDate);
                    const probation = getProbationSummary(meta?.startDate, meta?.probationEndDate);
                    const showEmploymentDurationInline = !probation || probation.status === "completed";
                    const displayName = getMemberDisplayName(m);
                    const initials = getInitialsFromName(displayName, m.email ?? null);
                    return (
                      <TableRow
                        key={m.user_id}
                        className={cn(
                          "transition-colors group",
                          canOpenProfileCard ? "cursor-pointer hover:bg-muted/40" : "hover:bg-muted/40"
                        )}
                        onClick={() => {
                          if (canOpenProfileCard) openEditProfileDialog(m);
                        }}
                      >
                        <TableCell className="pl-6">
                          <div className="flex items-center gap-3">
                            <div className="relative shrink-0">
                              <AvatarBase
                                src={getMemberAvatarSource(profile, m)}
                                name={displayName}
                                fallback={initials}
                                assetVariant="md"
                                size={48}
                                shape="circle"
                                className="border-border bg-muted/50"
                                fallbackClassName="text-xs font-bold"
                              />
                              <span
                                className={cn(
                                  "absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-background",
                                  presence?.online ? "bg-emerald-500" : "bg-muted-foreground/40"
                                )}
                              />
                            </div>
                            <div className="flex flex-col">
                              <span className="text-sm font-semibold text-foreground">
                                {displayName}
                              </span>
                              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                <span className="inline-flex items-center gap-1.5">
                                  <Mail className="w-3 h-3 opacity-70" />
                                  <span className="truncate max-w-[220px]">{m.email || "Не вказано"}</span>
                                </span>
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={cn("px-2.5 py-1 font-medium rounded-[var(--radius)]", getAccessBadgeClass(m.access_role))}
                          >
                            {getAccessRoleLabel(m.access_role)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={cn("px-2.5 py-1 font-medium rounded-[var(--radius)]", getJobBadgeClass(m.job_role))}
                          >
                            {getJobRoleLabel(m.job_role)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1.5">
                            {canManage ? (
                              <div onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
                                <AppDropdown
                                  align="start"
                                  contentClassName="w-44"
                                  trigger={
                                    <Badge
                                      variant="outline"
                                      className={cn(
                                        "px-2 py-0.5 text-xs rounded-[var(--radius)] w-fit cursor-pointer transition-opacity hover:opacity-80",
                                        getAvailabilityBadgeClass(availability)
                                      )}
                                    >
                                      {getAvailabilityLabel(availability)}
                                    </Badge>
                                  }
                                  items={AVAILABILITY_OPTIONS.map((option) => ({
                                    label:
                                      option.value === availability
                                        ? `• ${option.label}`
                                        : option.label,
                                    onSelect: () => void updateAvailabilityStatus(m, option.value),
                                  }))}
                                />
                              </div>
                            ) : (
                              <Badge
                                variant="outline"
                                className={cn("px-2 py-0.5 text-xs rounded-[var(--radius)] w-fit", getAvailabilityBadgeClass(availability))}
                              >
                                {getAvailabilityLabel(availability)}
                              </Badge>
                            )}
                            <span className="text-xs text-muted-foreground/70">
                              {presence?.online ? "зараз онлайн" : formatRelativeTime(presence?.lastSeenAt)}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Calendar className="w-3.5 h-3.5 opacity-70" />
                            <span>{formatBirthDate(meta?.birthDate)}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                              <Calendar className="w-3.5 h-3.5 opacity-70" />
                              <span>{meta?.startDate ? formatEmploymentDate(meta.startDate) : "Старт не вказано"}</span>
                              {showEmploymentDurationInline ? (
                                <>
                                  <Activity className="h-3.5 w-3.5 opacity-70" />
                                  <span>{employmentDuration || "Стаж не розраховано"}</span>
                                </>
                              ) : null}
                            </div>
                            {probation && probation.status !== "completed" ? (
                                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                                  <Badge
                                    variant="outline"
                                    className={cn(
                                      "h-7 px-2.5 py-0 text-[11px] rounded-[var(--radius)] shrink-0",
                                      getProbationBadgeClass(probation.status)
                                    )}
                                  >
                                    {probation.statusLabel}
                                  </Badge>
                                  <div className="h-1.5 min-w-[72px] flex-1 max-w-[104px] overflow-hidden rounded-full bg-muted">
                                    <div
                                      className={cn(
                                        "h-full rounded-full",
                                        probation.status === "active"
                                          ? "bg-amber-500"
                                          : "bg-muted-foreground/40"
                                      )}
                                      style={{ width: `${probation.progress}%` }}
                                    />
                                  </div>
                                  <span className="min-w-[36px] whitespace-nowrap text-right">
                                    {probation.daysLeft >= 0
                                      ? `${probation.daysLeft} дн`
                                      : `${Math.abs(probation.daysLeft)} дн тому`}
                                  </span>
                                </div>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableActionCell
                          className="pr-6"
                          onClick={(event) => event.stopPropagation()}
                          onPointerDown={(event) => event.stopPropagation()}
                        >
                          <AppDropdown
                            align="end"
                            contentClassName="w-48"
                            trigger={
                              <Button variant="ghost" size="icon" className="h-8 w-8 opacity-50 group-hover:opacity-100">
                                <MoreHorizontal className="w-4 h-4" />
                              </Button>
                            }
                            items={[
                              { type: "label", label: "Дії" },
                              { type: "separator" },
                              canOpenProfileCard
                                ? (canManage ? memberProfileStorageAvailable : true)
                                  ? {
                                    label: canManage ? "Редагувати профіль" : "Відсоток менеджера",
                                    onSelect: () => openEditProfileDialog(m),
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
                              (isSuperAdmin ||
                                (m.user_id !== currentUserId && (m.access_role ?? null) !== "owner"))
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
                              (isSuperAdmin ||
                                (m.user_id !== currentUserId && (m.access_role ?? null) !== "owner"))
                                ? {
                                    label: "Видалити користувача",
                                    destructive: true,
                                    onSelect: () => confirmDeleteMember(m),
                                  }
                                : {
                                    label:
                                      m.user_id === currentUserId
                                        ? "Не можна видалити себе"
                                        : "Видалення недоступне",
                                    disabled: true,
                                    muted: true,
                                  },
                            ]}
                          />
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
          <div className="space-y-3 md:hidden">
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
            <Table variant="list" size="md">
              <TableHeader className="bg-muted/30">
                <TableRow className="hover:bg-transparent border-border/50">
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

        {activeTab === "activity" && canManage ? (
          <div className="p-5">
            <div className={cn("mb-4", SEGMENTED_GROUP_SM)}>
              <Button
                type="button"
                variant="segmented"
                size="xs"
                aria-pressed={activityRange === "day"}
                onClick={() => setActivityRange("day")}
                className={SEGMENTED_TRIGGER_SM}
              >
                24 години
              </Button>
              <Button
                type="button"
                variant="segmented"
                size="xs"
                aria-pressed={activityRange === "week"}
                onClick={() => setActivityRange("week")}
                className={SEGMENTED_TRIGGER_SM}
              >
                7 днів
              </Button>
              <Button
                type="button"
                variant="segmented"
                size="xs"
                aria-pressed={activityRange === "month"}
                onClick={() => setActivityRange("month")}
                className={SEGMENTED_TRIGGER_SM}
              >
                30 днів
              </Button>
            </div>
            {teamActivityLoading ? (
              <AppSectionLoader label="Завантаження активності..." compact />
            ) : teamActivityItems.length === 0 ? (
              <div className="text-sm text-muted-foreground">Немає дій за обраний період.</div>
            ) : (
              <>
              <div className="space-y-3 md:hidden">
                {teamActivityItems.map((item, index) => {
                  const member = members.find((candidate) => candidate.user_id === item.userId) ?? null;
                  const profile = member ? memberProfilesByUserId[member.user_id] : null;
                  const displayName = member ? getMemberDisplayName(member) : profile?.label || "Користувач";
                  return (
                    <Card key={`${item.userId}-${item.createdAt}-${index}`} className="border-border/60 p-4">
                      <div className="text-sm font-medium text-foreground">{displayName}</div>
                      <div className="mt-2 text-sm text-foreground">{item.title}</div>
                      <div className="mt-2 text-xs text-muted-foreground">{formatDate(item.createdAt)}</div>
                    </Card>
                  );
                })}
              </div>
              <div className="hidden overflow-x-auto md:block">
                <Table variant="list" size="md">
                  <TableHeader className="bg-muted/30">
                    <TableRow className="hover:bg-transparent border-border/50">
                      <TableTextHeaderCell widthClass="w-[28%]" className="pl-6">
                        Користувач
                      </TableTextHeaderCell>
                      <TableTextHeaderCell>Дія</TableTextHeaderCell>
                      <TableTextHeaderCell>Коли</TableTextHeaderCell>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {teamActivityItems.map((item, index) => {
                      const member = members.find((candidate) => candidate.user_id === item.userId) ?? null;
                      const profile = member ? memberProfilesByUserId[member.user_id] : null;
                      const displayName = member ? getMemberDisplayName(member) : profile?.label || "Користувач";
                      return (
                        <TableRow key={`${item.userId}-${item.createdAt}-${index}`} className="hover:bg-muted/40 transition-colors">
                          <TableCell className="pl-6">
                            <div className="text-sm font-medium text-foreground">{displayName}</div>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm text-foreground">{item.title}</div>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm text-muted-foreground">{formatDate(item.createdAt)}</div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              </>
            )}
          </div>
        ) : null}
      </Card>

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
                <div className="flex flex-col items-center justify-center p-6 bg-emerald-50/50 dark:bg-emerald-900/10 text-emerald-700 dark:text-emerald-400 rounded-[var(--radius-inner)] border border-emerald-100 dark:border-emerald-900/50">
                  <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center mb-3 shadow-sm">
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

      <Dialog
        open={!!editProfileMember}
        onOpenChange={(open) => {
          if (!open && !editProfileBusy) closeEditProfileDialog();
        }}
      >
        <DialogContent className="w-[calc(100vw-1rem)] max-w-[min(1180px,96vw)] !p-0 !gap-0 overflow-hidden border border-border bg-card text-foreground max-h-[94dvh] flex flex-col">
          <div className="border-b border-border bg-muted/10 px-6 py-5 shrink-0">
            <DialogHeader>
              <DialogTitle className="text-xl font-semibold text-foreground">Картка учасника</DialogTitle>
              <DialogDescription className="mt-1.5 text-muted-foreground">
                {canManage
                  ? "Редагування профілю учасника команди. Пароль змінюється тільки в його профілі."
                  : "SEO може керувати відсотком менеджера та приймати рішення по випробувальному терміну. Інші поля доступні лише для перегляду."}
              </DialogDescription>
            </DialogHeader>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable_both-edges]">
            <div className="px-6 py-5">
            <div className="mb-6 rounded-[var(--radius)] border border-border bg-background/80 p-5">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex items-center gap-4">
                  <AvatarBase
                    src={getMemberAvatarSource(selectedProfile, editProfileMember ?? undefined)}
                    name={selectedDisplayName}
                    fallback={selectedInitials}
                    size={64}
                    shape="circle"
                    className="border-border bg-muted/50"
                    fallbackClassName="text-base font-bold"
                  />
                  <div className="min-w-0">
                    <div className="text-xl font-semibold text-foreground">{selectedDisplayName}</div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      {editProfileMember?.email ?? "Не вказано"}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Badge variant="outline" className={cn("px-2.5 py-1 font-medium", getAccessBadgeClass(editProfileMember?.access_role ?? null))}>
                        {getAccessRoleLabel(editProfileMember?.access_role ?? null)}
                      </Badge>
                      <Badge variant="outline" className={cn("px-2.5 py-1 font-medium", getJobBadgeClass(editProfileMember?.job_role ?? null))}>
                        {getJobRoleLabel(editProfileMember?.job_role ?? null)}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={cn(
                          "px-2.5 py-1 font-medium rounded-[var(--radius)]",
                          getEmploymentStatusBadgeClass(selectedEmploymentStatus)
                        )}
                      >
                        {getEmploymentStatusLabel(selectedEmploymentStatus)}
                      </Badge>
                    </div>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-3 lg:min-w-[520px] lg:flex-1">
                  <div className="rounded-[var(--radius)] border border-border bg-muted/20 p-4">
                    <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      <Calendar className="h-3.5 w-3.5" />
                      День народження
                    </div>
                    <div className="mt-2 text-base font-semibold text-foreground">
                      {selectedBirthdayInsight?.label ?? formatBirthDate(editProfileBirthDate)}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {selectedBirthdayInsight?.caption ?? "Дата не вказана"}
                    </div>
                  </div>
                  <div className="rounded-[var(--radius)] border border-border bg-muted/20 p-4">
                    <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      <Activity className="h-3.5 w-3.5" />
                      Річниця в компанії
                    </div>
                    <div className="mt-2 text-base font-semibold text-foreground">
                      {selectedAnniversaryInsight?.label ?? (selectedEmploymentDuration || "Стаж не вказано")}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {selectedAnniversaryInsight?.caption ?? "Додай дату старту"}
                    </div>
                  </div>
                  <div className="rounded-[var(--radius)] border border-border bg-muted/20 p-4">
                    <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      <Clock className="h-3.5 w-3.5" />
                      Статус роботи
                    </div>
                    <div className="mt-2 text-base font-semibold text-foreground">
                      {selectedProbation && selectedProbation.status !== "completed"
                        ? selectedProbation.statusLabel
                        : selectedEmploymentDuration || getEmploymentStatusLabel(selectedEmploymentStatus)}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {selectedProbation && selectedProbation.status !== "completed"
                        ? selectedProbation.caption
                        : editProfileStartDate
                        ? `${formatEmploymentDate(editProfileStartDate)} • ${selectedEmploymentDuration || "Стаж"}`
                        : "Вкажи дату старту"}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(340px,0.95fr)]">
              <div className="min-w-0 space-y-6">
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
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-foreground">Кінець випробувального</Label>
                      <Input
                        type="date"
                        value={editProfileProbationEndDate}
                        onChange={(event) => setEditProfileProbationEndDate(event.target.value)}
                        className="h-11"
                        disabled={!canManage}
                      />
                      {canManage ? (
                        <button
                          type="button"
                          className="text-xs font-medium text-primary transition-opacity hover:opacity-80 disabled:text-muted-foreground"
                          disabled={!editProfileStartDate}
                          onClick={() => setEditProfileProbationEndDate(addMonthsToDateOnly(editProfileStartDate, 1))}
                        >
                          Поставити +1 місяць від дати старту
                        </button>
                      ) : null}
                    </div>
                  </div>
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
                          checked={editProfileModuleAccess[key]}
                          disabled={!canManage}
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
              </div>
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
                  {shouldShowProbationSection ? (
                    <div className="rounded-[var(--radius)] border border-border bg-muted/20 p-4">
                      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        Випробувальний
                      </div>
                      {selectedProbation ? (
                        <>
                          <div className="mt-2 flex items-center justify-between gap-2">
                            <Badge
                              variant="outline"
                              className={cn(
                                "px-2 py-0.5 text-[11px] rounded-[var(--radius)]",
                                getProbationBadgeClass(selectedProbation.status)
                              )}
                            >
                              {selectedProbation.statusLabel}
                            </Badge>
                            <span className="text-[11px] text-muted-foreground">{selectedProbation.progress}%</span>
                          </div>
                          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-background">
                            <div
                              className={cn(
                                "h-full rounded-full",
                                selectedProbation.status === "completed"
                                  ? "bg-emerald-500"
                                  : selectedProbation.status === "active"
                                  ? "bg-amber-500"
                                  : "bg-muted-foreground/40"
                              )}
                              style={{ width: `${selectedProbation.progress}%` }}
                            />
                          </div>
                          <div className="mt-2 text-xs text-muted-foreground">{selectedProbation.caption}</div>
                        </>
                      ) : (
                        <div className="mt-2 text-xs text-muted-foreground">
                          Вкажи дату завершення, щоб показати шкалу випробувального терміну.
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
                {shouldShowProbationSection ? (
                  <div className="rounded-[var(--radius)] border border-border bg-muted/20 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between xl:flex-col xl:items-start">
                      <div>
                        <div className="text-sm font-medium text-foreground">Рішення по випробувальному</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {selectedEmploymentStatus === "probation"
                            ? selectedProbationReviewDue
                              ? "Термін завершився. Можна взяти в штат, дати ще місяць або завершити співпрацю."
                              : "Рішення можна прийняти достроково. Продовження доступне після завершення терміну."
                            : "Співробітник не був прийнятий після випробувального."}
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
                    </div>
                    {selectedEmploymentStatus === "probation" ? (
                      <div className="mt-4 flex flex-col gap-2">
                        <Button
                          type="button"
                          className="h-10 w-full"
                          onClick={() => void applyProbationDecision("active")}
                          disabled={probationActionBusy !== null || !canApproveProbationNow}
                        >
                          {probationActionBusy === "active" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                          {selectedProbationReviewDue ? "Взяти на роботу" : "Взяти на роботу достроково"}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          className="h-10 w-full"
                          onClick={() => void applyProbationDecision("extend")}
                          disabled={probationActionBusy !== null || !canExtendProbationNow}
                        >
                          {probationActionBusy === "extend" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                          Дати ще місяць
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          className="h-10 w-full border-danger-soft-border text-danger-foreground"
                          onClick={requestProbationRejection}
                          disabled={probationActionBusy !== null || !canRejectProbationNow}
                        >
                          {probationActionBusy === "rejected" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                          {selectedProbationReviewDue ? "Не брати" : "Завершити співпрацю"}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
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
            </div>
            </div>
          </div>
          <div className="shrink-0 border-t border-border bg-card px-6 py-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
              <Button
                variant="outline"
                className="h-11 min-w-[180px]"
                onClick={closeEditProfileDialog}
                disabled={editProfileBusy}
              >
                Скасувати
              </Button>
              <Button className="h-11 min-w-[220px]" onClick={saveMemberProfile} disabled={editProfileBusy}>
                {editProfileBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : canManage ? "Зберегти профіль" : "Зберегти %"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!editMember}
        onOpenChange={(open) => {
          if (!open && !editBusy) setEditMember(null);
        }}
      >
        <DialogContent className="sm:max-w-[520px] p-0 gap-0 overflow-hidden border border-border bg-card text-foreground">
          <div className="p-6 border-b border-border bg-muted/10">
            <DialogHeader>
              <DialogTitle className="text-xl font-semibold text-foreground">Змінити доступи учасника</DialogTitle>
              <DialogDescription className="mt-1.5 text-muted-foreground">
                Доступно для Super Admin та Admin. Призначення Super Admin доступне лише Super Admin.
              </DialogDescription>
            </DialogHeader>
          </div>
          <div className="p-6 space-y-6">
            <div className="space-y-2">
              <Label className="text-sm font-medium text-foreground">Користувач</Label>
              <Input value={editMember?.email ?? "Не вказано"} disabled className="h-11" />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium text-foreground">Рівень доступу</Label>
              <Select value={editAccessRole} onValueChange={setEditAccessRole}>
                <SelectTrigger className={cn(CONTROL_BASE, "h-11")}>
                  {memberAccessRoleOptions.find((o) => o.value === editAccessRole)?.label}
                </SelectTrigger>
                <SelectContent>
                  {memberAccessRoleOptions.map((role) => (
                    <SelectItem key={role.value} value={role.value}>
                      {role.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium text-foreground">Роль у команді</Label>
              <Select value={editJobRole} onValueChange={setEditJobRole}>
                <SelectTrigger className={cn(CONTROL_BASE, "h-11")}>
                  {JOB_ROLE_OPTIONS.find((o) => o.value === editJobRole)?.label}
                </SelectTrigger>
                <SelectContent>
                  {JOB_ROLE_OPTIONS.map((role) => (
                    <SelectItem key={role.value} value={role.value}>
                      {role.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button
                variant="outline"
                className="flex-1 h-11"
                onClick={() => setEditMember(null)}
                disabled={editBusy}
              >
                Скасувати
              </Button>
              <Button className="flex-1 h-11" onClick={saveMemberRoles} disabled={editBusy}>
                {editBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Зберегти"}
              </Button>
            </div>
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
        open={pendingProbationDecision === "rejected"}
        onOpenChange={(open) => {
          if (!open && probationActionBusy !== "rejected") setPendingProbationDecision(null);
        }}
        title={selectedProbationReviewDue ? "Не брати після випробувального?" : "Достроково завершити співпрацю?"}
        description={
          editProfileMember
            ? selectedProbationReviewDue
              ? `Для ${getMemberDisplayName(editProfileMember)} буде зафіксовано рішення не брати на роботу після випробувального терміну.`
              : `Ти достроково завершуєш випробувальний термін для ${getMemberDisplayName(editProfileMember)} і позначаєш, що співпрацю не продовжено.`
            : undefined
        }
        icon={<AlertTriangle className="h-5 w-5 text-danger-foreground" />}
        confirmLabel={selectedProbationReviewDue ? "Так, не брати" : "Так, завершити"}
        confirmClassName="bg-destructive text-destructive-foreground hover:bg-destructive/90"
        loading={probationActionBusy === "rejected"}
        onConfirm={() => {
          void applyProbationDecision("rejected");
        }}
      />

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
