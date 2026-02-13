export type TeamRole = "super_admin" | "manager" | "viewer" | null;

export type AccessRole = string | null;
export type JobRole = string | null;

export type AppPermissions = {
  isSuperAdmin: boolean;
  isAdmin: boolean;
  isManagerJob: boolean;
  isDesigner: boolean;
  canManageMembers: boolean;
  canEditMemberRoles: boolean;
  canManageAssignments: boolean;
  canSelfAssignDesign: boolean;
  canWriteStandings: boolean;
  canViewManagerOverview: boolean;
};

const normalize = (value?: string | null) => (value ?? "").trim().toLowerCase();

export const normalizeAccessRole = (value?: string | null): string => normalize(value);
export const normalizeJobRole = (value?: string | null): string => normalize(value);

export const isDesignerJobRole = (value?: string | null) => {
  const jobRole = normalizeJobRole(value);
  return jobRole === "designer" || jobRole === "дизайнер";
};

export const mapAccessRoleToTeamRole = (accessRole?: string | null): TeamRole => {
  const normalized = normalizeAccessRole(accessRole);
  if (normalized === "owner") return "super_admin";
  if (normalized === "admin") return "manager";
  if (normalized) return "viewer";
  return null;
};

export function buildPermissions({
  role,
  accessRole,
  jobRole,
}: {
  role?: TeamRole;
  accessRole?: string | null;
  jobRole?: string | null;
}): AppPermissions {
  const normalizedAccessRole = normalizeAccessRole(accessRole);
  const normalizedJobRole = normalizeJobRole(jobRole);

  const isSuperAdmin = role === "super_admin" || normalizedAccessRole === "owner";
  const isAdmin = role === "manager" || normalizedAccessRole === "admin";
  const isManagerJob = normalizedJobRole === "manager";
  const isDesigner = isDesignerJobRole(jobRole);

  const canManageMembers = isSuperAdmin || isAdmin;
  const canEditMemberRoles = isSuperAdmin;
  const canManageAssignments = canManageMembers || isManagerJob;
  const canSelfAssignDesign = canManageAssignments || isDesigner;
  const canWriteStandings = canManageMembers || isManagerJob;
  const canViewManagerOverview = canManageMembers || isManagerJob;

  return {
    isSuperAdmin,
    isAdmin,
    isManagerJob,
    isDesigner,
    canManageMembers,
    canEditMemberRoles,
    canManageAssignments,
    canSelfAssignDesign,
    canWriteStandings,
    canViewManagerOverview,
  };
}
