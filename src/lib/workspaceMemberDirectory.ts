import { supabase } from "@/lib/supabaseClient";
import { resolveWorkspaceId } from "@/lib/workspace";
import { buildUserNameFromMetadata, formatUserShortName, getInitialsFromName } from "@/lib/userName";
import { getCanonicalAvatarReference, resolveAvatarDisplayUrl, sanitizeAvatarReference } from "@/lib/avatarUrl";
import { normalizeEmploymentStatus, type EmploymentStatus } from "@/lib/employment";

const AVATAR_BUCKET = (import.meta.env.VITE_SUPABASE_AVATAR_BUCKET as string | undefined) || "avatars";
const workspaceDirectoryCache = new Map<string, WorkspaceMemberDirectoryRow[]>();
const workspaceDirectoryInFlight = new Map<string, Promise<WorkspaceMemberDirectoryRow[]>>();
const workspaceDisplayDirectoryCache = new Map<string, WorkspaceMemberDisplayRow[]>();
const workspaceDisplayDirectoryInFlight = new Map<string, Promise<WorkspaceMemberDisplayRow[]>>();
let currentWorkspaceMemberDirectoryEntryCache: WorkspaceMemberDirectoryRow | null | undefined = undefined;
let unifiedViewUnsupported = false;
export const WORKSPACE_MEMBER_DIRECTORY_UPDATED_EVENT = "workspace-member-directory-updated";
type BasicQueryBuilder = {
  select: (columns: string) => {
    eq: (column: string, value: string) => Promise<{ data: unknown; error: unknown }>;
  };
};

export type WorkspaceMemberDirectoryRow = {
  workspaceId: string;
  userId: string;
  email: string | null;
  firstName: string;
  lastName: string;
  fullName: string;
  displayName: string;
  initials: string;
  avatarUrl: string | null;
  avatarPath: string | null;
  accessRole: string | null;
  jobRole: string | null;
  birthDate: string;
  phone: string;
  availabilityStatus: "available" | "vacation" | "sick_leave" | "offline";
  startDate: string;
  probationEndDate: string;
  employmentStatus: EmploymentStatus;
  probationReviewNotifiedAt: string;
  probationReviewedAt: string;
  probationReviewedBy: string;
  probationExtensionCount: number;
  managerUserId: string;
  moduleAccess: Record<string, boolean>;
};

export type WorkspaceMemberDisplayRow = WorkspaceMemberDirectoryRow & {
  label: string;
  avatarDisplayUrl: string | null;
};

type DirectoryViewRow = {
  workspace_id: string;
  user_id: string;
  email?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
  avatar_url?: string | null;
  avatar_path?: string | null;
  access_role?: string | null;
  job_role?: string | null;
  birth_date?: string | null;
  phone?: string | null;
  availability_status?: string | null;
  start_date?: string | null;
  probation_end_date?: string | null;
  employment_status?: string | null;
  probation_review_notified_at?: string | null;
  probation_reviewed_at?: string | null;
  probation_reviewed_by?: string | null;
  probation_extension_count?: number | null;
  manager_user_id?: string | null;
  module_access?: unknown;
};

type MembershipRow = {
  workspace_id: string;
  user_id: string;
  email?: string | null;
  full_name?: string | null;
  avatar_url?: string | null;
  access_role?: string | null;
  job_role?: string | null;
};

type TeamProfileRow = {
  workspace_id: string;
  user_id: string;
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
  avatar_url?: string | null;
  avatar_path?: string | null;
  birth_date?: string | null;
  phone?: string | null;
  availability_status?: string | null;
  start_date?: string | null;
  probation_end_date?: string | null;
  employment_status?: string | null;
  probation_review_notified_at?: string | null;
  probation_reviewed_at?: string | null;
  probation_reviewed_by?: string | null;
  probation_extension_count?: number | null;
  manager_user_id?: string | null;
  module_access?: unknown;
};

type UpsertWorkspaceMemberProfileInput = {
  workspaceId: string;
  userId: string;
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
  avatarUrl?: string | null;
  avatarPath?: string | null;
  birthDate?: string | null;
  phone?: string | null;
  availabilityStatus?: "available" | "vacation" | "sick_leave" | "offline" | null;
  startDate?: string | null;
  probationEndDate?: string | null;
  employmentStatus?: EmploymentStatus | null;
  probationReviewNotifiedAt?: string | null;
  probationReviewedAt?: string | null;
  probationReviewedBy?: string | null;
  probationExtensionCount?: number | null;
  managerUserId?: string | null;
  moduleAccess?: Record<string, boolean> | null;
  updatedBy?: string | null;
};

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

function getErrorMessage(error: unknown) {
  if (typeof error !== "object" || !error) return "";
  const message = (error as { message?: unknown }).message;
  return typeof message === "string" ? message : "";
}

function isMissingSchemaObject(error: unknown) {
  const normalized = getErrorMessage(error).toLowerCase();
  return (
    normalized.includes("does not exist") ||
    normalized.includes("relation") ||
    normalized.includes("schema cache") ||
    normalized.includes("could not find")
  );
}

function isMissingColumn(error: unknown, column?: string) {
  const normalized = getErrorMessage(error).toLowerCase();
  if (!normalized.includes("column") || !normalized.includes("does not exist")) return false;
  return !column || normalized.includes(column.toLowerCase());
}

function normalizeModuleAccess(value: unknown) {
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

async function fetchTeamProfileSupplements(workspaceId: string, userIds: string[]) {
  const uniqueUserIds = Array.from(new Set(userIds.map((value) => value.trim()).filter(Boolean)));
  if (uniqueUserIds.length === 0) {
    return new Map<string, Pick<TeamProfileRow, "manager_user_id" | "module_access">>();
  }

  const profileVariants = [
    "workspace_id,user_id,manager_user_id,module_access",
    "workspace_id,user_id,module_access",
    "workspace_id,user_id,manager_user_id",
    "workspace_id,user_id",
  ];

  let rows: Array<Pick<TeamProfileRow, "user_id" | "manager_user_id" | "module_access">> = [];
  let lastError: unknown = null;

  for (const columns of profileVariants) {
    const result = await supabase
      .schema("tosho")
      .from("team_member_profiles")
      .select(columns)
      .eq("workspace_id", workspaceId)
      .in("user_id", uniqueUserIds);

    lastError = result.error;
    if (!result.error) {
      rows =
        ((result.data as unknown) as Array<Pick<TeamProfileRow, "user_id" | "manager_user_id" | "module_access">> | null) ??
        [];
      break;
    }
    if (!isMissingColumn(result.error) && !isMissingSchemaObject(result.error)) break;
  }

  if (lastError && !isMissingSchemaObject(lastError) && !isMissingColumn(lastError)) {
    throw lastError;
  }

  return new Map(rows.map((row) => [row.user_id, row]));
}

function notifyWorkspaceMemberDirectoryUpdated(workspaceId: string, userId: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(WORKSPACE_MEMBER_DIRECTORY_UPDATED_EVENT, {
      detail: { workspaceId, userId },
    })
  );
}

function updateCachedWorkspaceMemberProfile(
  workspaceId: string,
  userId: string,
  updates: Partial<Pick<WorkspaceMemberDirectoryRow, "moduleAccess">>
) {
  const cached = workspaceDirectoryCache.get(workspaceId);
  if (!cached) return;

  workspaceDirectoryCache.set(
    workspaceId,
    cached.map((row) =>
      row.userId === userId
        ? {
            ...row,
            ...(updates.moduleAccess ? { moduleAccess: normalizeModuleAccess(updates.moduleAccess) } : {}),
          }
        : row
    )
  );
  workspaceDisplayDirectoryCache.delete(workspaceId);

  if (currentWorkspaceMemberDirectoryEntryCache?.workspaceId === workspaceId && currentWorkspaceMemberDirectoryEntryCache.userId === userId) {
    currentWorkspaceMemberDirectoryEntryCache = {
      ...currentWorkspaceMemberDirectoryEntryCache,
      ...(updates.moduleAccess ? { moduleAccess: normalizeModuleAccess(updates.moduleAccess) } : {}),
    };
  }
}

function normalizeAvailabilityStatus(value?: string | null): WorkspaceMemberDirectoryRow["availabilityStatus"] {
  return value === "vacation" || value === "sick_leave" || value === "offline" ? value : "available";
}

function buildRow(input: {
  workspaceId: string;
  userId: string;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
  avatarUrl?: string | null;
  avatarPath?: string | null;
  accessRole?: string | null;
  jobRole?: string | null;
  birthDate?: string | null;
  phone?: string | null;
  availabilityStatus?: string | null;
  startDate?: string | null;
  probationEndDate?: string | null;
  employmentStatus?: string | null;
  probationReviewNotifiedAt?: string | null;
  probationReviewedAt?: string | null;
  probationReviewedBy?: string | null;
  probationExtensionCount?: number | null;
  managerUserId?: string | null;
  moduleAccess?: unknown;
}): WorkspaceMemberDirectoryRow {
  const names = buildUserNameFromMetadata(
    {
      first_name: input.firstName,
      last_name: input.lastName,
      full_name: input.fullName,
    },
    input.email
  );

  const displayName =
    formatUserShortName({
      firstName: names.firstName,
      lastName: names.lastName,
      fullName: names.fullName,
      email: input.email,
      fallback: "Користувач",
    }) || "Користувач";

  return {
    workspaceId: input.workspaceId,
    userId: input.userId,
    email: input.email ?? null,
    firstName: names.firstName,
    lastName: names.lastName,
    fullName: names.fullName,
    displayName,
    initials: getInitialsFromName(displayName, input.email),
    avatarUrl: sanitizeAvatarReference(input.avatarUrl ?? null, AVATAR_BUCKET),
    avatarPath: sanitizeAvatarReference(input.avatarPath ?? null, AVATAR_BUCKET),
    accessRole: input.accessRole ?? null,
    jobRole: input.jobRole ?? null,
    birthDate: input.birthDate?.trim() || "",
    phone: input.phone?.trim() || "",
    availabilityStatus: normalizeAvailabilityStatus(input.availabilityStatus),
    startDate: input.startDate?.trim() || "",
    probationEndDate: input.probationEndDate?.trim() || "",
    employmentStatus: normalizeEmploymentStatus(input.employmentStatus, input.probationEndDate),
    probationReviewNotifiedAt: input.probationReviewNotifiedAt?.trim() || "",
    probationReviewedAt: input.probationReviewedAt?.trim() || "",
    probationReviewedBy: input.probationReviewedBy?.trim() || "",
    probationExtensionCount: Math.max(0, Number(input.probationExtensionCount) || 0),
    managerUserId: input.managerUserId?.trim() || "",
    moduleAccess: normalizeModuleAccess(input.moduleAccess),
  };
}

async function listFromUnifiedView(workspaceId: string) {
  if (unifiedViewUnsupported) {
    throw new Error('relation "workspace_member_directory" does not exist');
  }

  const unifiedViewVariants = [
    "workspace_id,user_id,email,first_name,last_name,full_name,avatar_url,avatar_path,access_role,job_role,birth_date,phone,availability_status,start_date,probation_end_date,manager_user_id,module_access",
    "workspace_id,user_id,email,first_name,last_name,full_name,avatar_url,access_role,job_role,birth_date,phone,availability_status,start_date,probation_end_date,manager_user_id,module_access",
    "workspace_id,user_id,email,first_name,last_name,full_name,avatar_url,access_role,job_role,birth_date,phone",
    "workspace_id,user_id,email,first_name,last_name,full_name,access_role,job_role",
    "workspace_id,user_id,access_role,job_role",
  ];

  let data: DirectoryViewRow[] | null = null;
  let error: unknown = null;

  for (const columns of unifiedViewVariants) {
    const table = supabase
      .schema("tosho")
      .from("workspace_member_directory") as unknown as BasicQueryBuilder;
    const result = await table
      .select(columns)
      .eq("workspace_id", workspaceId);

    error = result.error;
    if (!result.error) {
      data = ((result.data as unknown) as DirectoryViewRow[] | null) ?? [];
      break;
    }
    if (!isMissingColumn(result.error)) break;
  }

  if (error) {
    if (isMissingSchemaObject(error) || isMissingColumn(error)) {
      unifiedViewUnsupported = true;
    }
    throw error;
  }

  const rawRows = ((data as DirectoryViewRow[] | null) ?? []);
  const needsSupplement = rawRows.some((row) => row.module_access === undefined || row.manager_user_id === undefined);
  const supplementByUserId = needsSupplement
    ? await fetchTeamProfileSupplements(
        workspaceId,
        rawRows.map((row) => row.user_id)
      )
    : new Map<string, Pick<TeamProfileRow, "manager_user_id" | "module_access">>();

  return rawRows.map((row) => {
    const supplement = supplementByUserId.get(row.user_id);
    const managerUserId = row.manager_user_id !== undefined ? row.manager_user_id : supplement?.manager_user_id;
    const moduleAccess = row.module_access !== undefined ? row.module_access : supplement?.module_access;
    return (
    buildRow({
      workspaceId: row.workspace_id,
      userId: row.user_id,
      email: row.email ?? null,
      firstName: row.first_name ?? null,
      lastName: row.last_name ?? null,
      fullName: row.full_name ?? null,
      avatarUrl: row.avatar_url ?? null,
      avatarPath: row.avatar_path ?? null,
      accessRole: row.access_role ?? null,
      jobRole: row.job_role ?? null,
      birthDate: row.birth_date ?? null,
      phone: row.phone ?? null,
      availabilityStatus: row.availability_status ?? null,
      startDate: row.start_date ?? null,
      probationEndDate: row.probation_end_date ?? null,
      employmentStatus: row.employment_status ?? null,
      probationReviewNotifiedAt: row.probation_review_notified_at ?? null,
      probationReviewedAt: row.probation_reviewed_at ?? null,
      probationReviewedBy: row.probation_reviewed_by ?? null,
      probationExtensionCount: row.probation_extension_count ?? null,
      managerUserId: managerUserId ?? null,
      moduleAccess,
    })
    );
  });
}

async function listFromFallback(workspaceId: string) {
  let membershipRows: MembershipRow[] = [];
  let membershipError: unknown = null;

  const membershipVariants = [
    "workspace_id,user_id,access_role,job_role",
    "workspace_id,user_id,email,access_role,job_role",
    "workspace_id,user_id,email,full_name,avatar_url,access_role,job_role",
    "workspace_id,user_id,email,full_name,access_role,job_role",
  ];

  for (const columns of membershipVariants) {
    const result = await supabase
      .schema("tosho")
      .from("memberships_view")
      .select(columns)
      .eq("workspace_id", workspaceId);

    membershipError = result.error;
    if (!result.error) {
      membershipRows = ((result.data as unknown) as MembershipRow[] | null) ?? [];
      break;
    }
    if (!isMissingColumn(result.error)) break;
  }

  if (membershipError) throw membershipError;

  let teamProfileRows: TeamProfileRow[] = [];
  let teamProfileError: unknown = null;

  const teamProfileVariants = [
    "workspace_id,user_id,first_name,last_name,full_name,avatar_url,avatar_path,birth_date,phone,availability_status,start_date,probation_end_date,employment_status,probation_review_notified_at,probation_reviewed_at,probation_reviewed_by,probation_extension_count,manager_user_id,module_access",
    "workspace_id,user_id,first_name,last_name,full_name,avatar_url,birth_date,phone,availability_status,start_date,probation_end_date,employment_status,probation_review_notified_at,probation_reviewed_at,probation_reviewed_by,probation_extension_count,manager_user_id,module_access",
    "workspace_id,user_id,first_name,last_name,full_name,birth_date,phone,availability_status,start_date,probation_end_date,employment_status,probation_review_notified_at,probation_reviewed_at,probation_reviewed_by,probation_extension_count,manager_user_id,module_access",
    "workspace_id,user_id,first_name,last_name,full_name,birth_date,phone",
  ];

  for (const columns of teamProfileVariants) {
    const result = await supabase
      .schema("tosho")
      .from("team_member_profiles")
      .select(columns)
      .eq("workspace_id", workspaceId);

    teamProfileError = result.error;
    if (!result.error) {
      teamProfileRows = ((result.data as unknown) as TeamProfileRow[] | null) ?? [];
      break;
    }
    if (!isMissingColumn(result.error) && !isMissingSchemaObject(result.error)) break;
  }

  if (teamProfileError && !isMissingSchemaObject(teamProfileError)) {
    throw teamProfileError;
  }

  const profileByUserId = new Map(teamProfileRows.map((row) => [row.user_id, row]));

  const merged = membershipRows.map((membership) => {
    const profile = profileByUserId.get(membership.user_id);
    return buildRow({
      workspaceId,
      userId: membership.user_id,
      email: membership.email ?? null,
      firstName: profile?.first_name ?? null,
      lastName: profile?.last_name ?? null,
      fullName: profile?.full_name ?? membership.full_name ?? null,
      avatarUrl: profile?.avatar_url ?? membership.avatar_url ?? null,
      avatarPath: profile?.avatar_path ?? null,
      accessRole: membership.access_role ?? null,
      jobRole: membership.job_role ?? null,
      birthDate: profile?.birth_date ?? null,
      phone: profile?.phone ?? null,
      availabilityStatus: profile?.availability_status ?? null,
      startDate: profile?.start_date ?? null,
      probationEndDate: profile?.probation_end_date ?? null,
      employmentStatus: profile?.employment_status ?? null,
      probationReviewNotifiedAt: profile?.probation_review_notified_at ?? null,
      probationReviewedAt: profile?.probation_reviewed_at ?? null,
      probationReviewedBy: profile?.probation_reviewed_by ?? null,
      probationExtensionCount: profile?.probation_extension_count ?? null,
      managerUserId: profile?.manager_user_id ?? null,
      moduleAccess: profile?.module_access,
    });
  });

  try {
    const { data: currentUserData } = await supabase.auth.getUser();
    const currentUser = currentUserData.user;
    if (currentUser && !merged.some((row) => row.userId === currentUser.id)) {
      return merged;
    }
    if (currentUser) {
      const currentUserRow = merged.find((row) => row.userId === currentUser.id);
      if (currentUserRow && (!currentUserRow.fullName || !currentUserRow.avatarUrl)) {
        const meta = currentUser.user_metadata as Record<string, unknown> | undefined;
        const resolved = buildRow({
          workspaceId,
          userId: currentUser.id,
          email: currentUser.email ?? currentUserRow.email,
          firstName: currentUserRow.firstName || (typeof meta?.first_name === "string" ? meta.first_name : null),
          lastName: currentUserRow.lastName || (typeof meta?.last_name === "string" ? meta.last_name : null),
          fullName: currentUserRow.fullName || (typeof meta?.full_name === "string" ? meta.full_name : null),
          avatarUrl: currentUserRow.avatarUrl || (typeof meta?.avatar_url === "string" ? meta.avatar_url : null),
          avatarPath: currentUserRow.avatarPath,
          accessRole: currentUserRow.accessRole,
          jobRole: currentUserRow.jobRole,
          birthDate: currentUserRow.birthDate,
          phone: currentUserRow.phone,
          availabilityStatus: currentUserRow.availabilityStatus,
          startDate: currentUserRow.startDate,
          probationEndDate: currentUserRow.probationEndDate,
          employmentStatus: currentUserRow.employmentStatus,
          probationReviewNotifiedAt: currentUserRow.probationReviewNotifiedAt,
          probationReviewedAt: currentUserRow.probationReviewedAt,
          probationReviewedBy: currentUserRow.probationReviewedBy,
          probationExtensionCount: currentUserRow.probationExtensionCount,
          managerUserId: currentUserRow.managerUserId,
          moduleAccess: currentUserRow.moduleAccess,
        });
        return merged.map((row) => (row.userId === currentUser.id ? resolved : row));
      }
    }
  } catch {
    // Ignore auth lookup errors.
  }

  return merged;
}

export async function listWorkspaceMemberDirectory(workspaceId: string): Promise<WorkspaceMemberDirectoryRow[]> {
  if (workspaceDirectoryCache.has(workspaceId)) {
    return workspaceDirectoryCache.get(workspaceId) ?? [];
  }
  const existing = workspaceDirectoryInFlight.get(workspaceId);
  if (existing) return existing;

  const promise = (async () => {
  try {
    const rows = await listFromUnifiedView(workspaceId);
    if (rows.length > 0) {
      const resolved = rows.sort((a, b) => a.displayName.localeCompare(b.displayName, "uk"));
      workspaceDirectoryCache.set(workspaceId, resolved);
      return resolved;
    }
  } catch (error: unknown) {
    if (!isMissingSchemaObject(error) && !isMissingColumn(error)) {
      throw error;
    }
  }

  const rows = await listFromFallback(workspaceId);
  const resolved = rows.sort((a, b) => a.displayName.localeCompare(b.displayName, "uk"));
  workspaceDirectoryCache.set(workspaceId, resolved);
  return resolved;
  })();

  workspaceDirectoryInFlight.set(workspaceId, promise);
  try {
    return await promise;
  } finally {
    workspaceDirectoryInFlight.delete(workspaceId);
  }
}

export async function listWorkspaceMembersForDisplay(workspaceId: string): Promise<WorkspaceMemberDisplayRow[]> {
  if (workspaceDisplayDirectoryCache.has(workspaceId)) {
    return workspaceDisplayDirectoryCache.get(workspaceId) ?? [];
  }
  const existing = workspaceDisplayDirectoryInFlight.get(workspaceId);
  if (existing) return existing;

  const promise = (async () => {
    const rows = await listWorkspaceMemberDirectory(workspaceId);
    const resolvedEntries = await Promise.all(
      rows.map(async (row) => ({
        ...row,
        label: row.displayName || row.email?.split("@")[0]?.trim() || row.userId,
        avatarDisplayUrl: await resolveAvatarDisplayUrl(
          supabase,
          getCanonicalAvatarReference({ avatarUrl: row.avatarUrl, avatarPath: row.avatarPath }, AVATAR_BUCKET),
          AVATAR_BUCKET
        ),
      }))
    );
    const resolved = resolvedEntries.sort((a, b) => a.label.localeCompare(b.label, "uk"));
    workspaceDisplayDirectoryCache.set(workspaceId, resolved);
    return resolved;
  })();

  workspaceDisplayDirectoryInFlight.set(workspaceId, promise);
  try {
    return await promise;
  } finally {
    workspaceDisplayDirectoryInFlight.delete(workspaceId);
  }
}

export async function getCurrentWorkspaceMemberDirectoryEntry() {
  if (currentWorkspaceMemberDirectoryEntryCache !== undefined) {
    return currentWorkspaceMemberDirectoryEntryCache;
  }
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  const workspaceId = await resolveWorkspaceId(data.user.id);
  if (!workspaceId) return null;
  const rows = await listWorkspaceMemberDirectory(workspaceId);
  const entry = rows.find((row) => row.userId === data.user?.id) ?? null;
  currentWorkspaceMemberDirectoryEntryCache = entry;
  return entry;
}

export function getCachedCurrentWorkspaceMemberDirectoryEntry() {
  return currentWorkspaceMemberDirectoryEntryCache;
}

export async function upsertWorkspaceMemberProfile(input: UpsertWorkspaceMemberProfileInput) {
  const payload = {
    workspace_id: input.workspaceId,
    user_id: input.userId,
    first_name: input.firstName === undefined ? undefined : input.firstName?.trim() || null,
    last_name: input.lastName === undefined ? undefined : input.lastName?.trim() || null,
    full_name: input.fullName === undefined ? undefined : input.fullName?.trim() || null,
    avatar_url: input.avatarUrl === undefined ? undefined : input.avatarUrl?.trim() || null,
    avatar_path: input.avatarPath === undefined ? undefined : input.avatarPath?.trim() || null,
    birth_date: input.birthDate === undefined ? undefined : input.birthDate?.trim() || null,
    phone: input.phone === undefined ? undefined : input.phone?.trim() || null,
    availability_status:
      input.availabilityStatus === undefined ? undefined : input.availabilityStatus?.trim() || "available",
    start_date: input.startDate === undefined ? undefined : input.startDate?.trim() || null,
    probation_end_date: input.probationEndDate === undefined ? undefined : input.probationEndDate?.trim() || null,
    employment_status: input.employmentStatus === undefined ? undefined : input.employmentStatus?.trim() || null,
    probation_review_notified_at:
      input.probationReviewNotifiedAt === undefined ? undefined : input.probationReviewNotifiedAt?.trim() || null,
    probation_reviewed_at:
      input.probationReviewedAt === undefined ? undefined : input.probationReviewedAt?.trim() || null,
    probation_reviewed_by:
      input.probationReviewedBy === undefined ? undefined : input.probationReviewedBy?.trim() || null,
    probation_extension_count:
      input.probationExtensionCount === undefined ? undefined : input.probationExtensionCount ?? 0,
    manager_user_id: input.managerUserId === undefined ? undefined : input.managerUserId?.trim() || null,
    module_access: input.moduleAccess === undefined ? undefined : input.moduleAccess ?? DEFAULT_MODULE_ACCESS,
    updated_by: input.updatedBy === undefined ? undefined : input.updatedBy?.trim() || null,
  };

  const variants = [
    payload,
    {
      ...payload,
      avatar_path: undefined,
    },
    {
      workspace_id: payload.workspace_id,
      user_id: payload.user_id,
      first_name: payload.first_name,
      last_name: payload.last_name,
      full_name: payload.full_name,
      birth_date: payload.birth_date,
      phone: payload.phone,
      availability_status: payload.availability_status,
      start_date: payload.start_date,
      probation_end_date: payload.probation_end_date,
      employment_status: payload.employment_status,
      probation_review_notified_at: payload.probation_review_notified_at,
      probation_reviewed_at: payload.probation_reviewed_at,
      probation_reviewed_by: payload.probation_reviewed_by,
      probation_extension_count: payload.probation_extension_count,
      manager_user_id: payload.manager_user_id,
      module_access: payload.module_access,
      updated_by: payload.updated_by,
    },
  ];

  let lastError: unknown = null;

  for (const variant of variants) {
    const { error } = await supabase
      .schema("tosho")
      .from("team_member_profiles")
      .upsert(variant, { onConflict: "workspace_id,user_id" });

    if (!error) {
      updateCachedWorkspaceMemberProfile(input.workspaceId, input.userId, {
        moduleAccess: payload.module_access ?? undefined,
      });
      notifyWorkspaceMemberDirectoryUpdated(input.workspaceId, input.userId);
      return;
    }
    lastError = error;
    if (!isMissingColumn(error) && !isMissingSchemaObject(error)) {
      throw error;
    }
  }

  if (lastError) throw lastError;
}
