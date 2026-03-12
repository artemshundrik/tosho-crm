import { supabase } from "@/lib/supabaseClient";
import { resolveWorkspaceId } from "@/lib/workspace";
import { buildUserNameFromMetadata, formatUserShortName, getInitialsFromName } from "@/lib/userName";
import { resolveAvatarDisplayUrl } from "@/lib/avatarUrl";

const AVATAR_BUCKET = (import.meta.env.VITE_SUPABASE_AVATAR_BUCKET as string | undefined) || "avatars";

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
  };
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
    avatarUrl: input.avatarUrl ?? null,
    avatarPath: input.avatarPath ?? null,
    accessRole: input.accessRole ?? null,
    jobRole: input.jobRole ?? null,
    birthDate: input.birthDate?.trim() || "",
    phone: input.phone?.trim() || "",
    availabilityStatus: normalizeAvailabilityStatus(input.availabilityStatus),
    startDate: input.startDate?.trim() || "",
    probationEndDate: input.probationEndDate?.trim() || "",
    managerUserId: input.managerUserId?.trim() || "",
    moduleAccess: normalizeModuleAccess(input.moduleAccess),
  };
}

async function listFromUnifiedView(workspaceId: string) {
  const { data, error } = await supabase
    .schema("tosho")
    .from("workspace_member_directory")
    .select(
      "workspace_id,user_id,email,first_name,last_name,full_name,avatar_url,avatar_path,access_role,job_role,birth_date,phone,availability_status,start_date,probation_end_date,manager_user_id,module_access"
    )
    .eq("workspace_id", workspaceId);

  if (error) throw error;

  return ((data as DirectoryViewRow[] | null) ?? []).map((row) =>
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
      managerUserId: row.manager_user_id ?? null,
      moduleAccess: row.module_access,
    })
  );
}

async function listFromFallback(workspaceId: string) {
  let membershipRows: MembershipRow[] = [];
  let membershipError: unknown = null;

  const membershipVariants = [
    "workspace_id,user_id,email,full_name,avatar_url,access_role,job_role",
    "workspace_id,user_id,email,full_name,access_role,job_role",
    "workspace_id,user_id,email,access_role,job_role",
    "workspace_id,user_id,access_role,job_role",
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
    "workspace_id,user_id,first_name,last_name,full_name,avatar_url,avatar_path,birth_date,phone,availability_status,start_date,probation_end_date,manager_user_id,module_access",
    "workspace_id,user_id,first_name,last_name,full_name,avatar_url,birth_date,phone,availability_status,start_date,probation_end_date,manager_user_id,module_access",
    "workspace_id,user_id,first_name,last_name,full_name,birth_date,phone,availability_status,start_date,probation_end_date,manager_user_id,module_access",
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
  try {
    const rows = await listFromUnifiedView(workspaceId);
    if (rows.length > 0) {
      return rows.sort((a, b) => a.displayName.localeCompare(b.displayName, "uk"));
    }
  } catch (error: unknown) {
    if (!isMissingSchemaObject(error) && !isMissingColumn(error)) {
      throw error;
    }
  }

  const rows = await listFromFallback(workspaceId);
  return rows.sort((a, b) => a.displayName.localeCompare(b.displayName, "uk"));
}

export async function listWorkspaceMembersForDisplay(workspaceId: string): Promise<WorkspaceMemberDisplayRow[]> {
  const rows = await listWorkspaceMemberDirectory(workspaceId);
  const resolvedEntries = await Promise.all(
    rows.map(async (row) => ({
      ...row,
      label: row.displayName || row.email?.split("@")[0]?.trim() || row.userId,
      avatarDisplayUrl: await resolveAvatarDisplayUrl(supabase, row.avatarUrl, AVATAR_BUCKET),
    }))
  );
  return resolvedEntries.sort((a, b) => a.label.localeCompare(b.label, "uk"));
}

export async function getCurrentWorkspaceMemberDirectoryEntry() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  const workspaceId = await resolveWorkspaceId(data.user.id);
  if (!workspaceId) return null;
  const rows = await listWorkspaceMemberDirectory(workspaceId);
  return rows.find((row) => row.userId === data.user?.id) ?? null;
}

export async function upsertWorkspaceMemberProfile(input: UpsertWorkspaceMemberProfileInput) {
  const payload = {
    workspace_id: input.workspaceId,
    user_id: input.userId,
    first_name: input.firstName?.trim() || null,
    last_name: input.lastName?.trim() || null,
    full_name: input.fullName?.trim() || null,
    avatar_url: input.avatarUrl?.trim() || null,
    avatar_path: input.avatarPath?.trim() || null,
    birth_date: input.birthDate?.trim() || null,
    phone: input.phone?.trim() || null,
    availability_status: input.availabilityStatus?.trim() || "available",
    start_date: input.startDate?.trim() || null,
    probation_end_date: input.probationEndDate?.trim() || null,
    manager_user_id: input.managerUserId?.trim() || null,
    module_access: input.moduleAccess ?? DEFAULT_MODULE_ACCESS,
    updated_by: input.updatedBy?.trim() || null,
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

    if (!error) return;
    lastError = error;
    if (!isMissingColumn(error) && !isMissingSchemaObject(error)) {
      throw error;
    }
  }

  if (lastError) throw lastError;
}
