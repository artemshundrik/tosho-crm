export type TeamRole = "super_admin" | "manager" | "viewer" | null;

export type AccessRole = string | null;
export type JobRole = string | null;

export type AppPermissions = {
  isSuperAdmin: boolean;
  isAdmin: boolean;
  isSeo: boolean;
  isManagerJob: boolean;
  isDesigner: boolean;
  canManageMembers: boolean;
  canEditMemberRoles: boolean;
  canManageAssignments: boolean;
  canManageDesignStatuses: boolean;
  canSelfAssignDesign: boolean;
  canWriteStandings: boolean;
  canViewManagerOverview: boolean;
};

type QuoteAccessContext = {
  userId?: string | null;
  quoteManagerUserId?: string | null;
  viewerJobRole?: string | null;
  permissions: AppPermissions;
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
  const isSeo = normalizedJobRole === "seo";
  const isManagerJob = normalizedJobRole === "manager";
  const isDesigner = isDesignerJobRole(jobRole);

  const canManageMembers = isSuperAdmin || isAdmin || isSeo;
  const canEditMemberRoles = isSuperAdmin || isAdmin;
  const canManageAssignments = canManageMembers || isManagerJob;
  const canManageDesignStatuses = canManageAssignments && !isDesigner;
  const canSelfAssignDesign = canManageAssignments || isDesigner;
  const canWriteStandings = canManageMembers || isManagerJob;
  const canViewManagerOverview = canManageMembers || isManagerJob;

  return {
    isSuperAdmin,
    isAdmin,
    isSeo,
    isManagerJob,
    isDesigner,
    canManageMembers,
    canEditMemberRoles,
    canManageAssignments,
    canManageDesignStatuses,
    canSelfAssignDesign,
    canWriteStandings,
    canViewManagerOverview,
  };
}

const normalizeId = (value?: string | null) => (value ?? "").trim();

export function canOpenQuoteDetails({ userId, quoteManagerUserId, permissions }: QuoteAccessContext) {
  if (permissions.isSuperAdmin || permissions.isSeo) return true;
  if (!permissions.isAdmin && !permissions.isManagerJob) return true;
  return normalizeId(userId) !== "" && normalizeId(userId) === normalizeId(quoteManagerUserId);
}

export function canViewQuoteSummary({ userId, quoteManagerUserId, permissions }: QuoteAccessContext) {
  if (permissions.isSuperAdmin || permissions.isSeo) return true;
  if (!permissions.isAdmin && !permissions.isManagerJob) return false;
  return normalizeId(userId) !== "" && normalizeId(userId) === normalizeId(quoteManagerUserId);
}

export function canEditQuoteContent({
  userId,
  quoteManagerUserId,
  viewerJobRole,
  permissions,
}: QuoteAccessContext) {
  if (permissions.isSuperAdmin || permissions.isSeo) return true;
  if (normalizeJobRole(viewerJobRole) === "pm") return true;
  if (!permissions.isAdmin && !permissions.isManagerJob) return true;
  return normalizeId(userId) !== "" && normalizeId(userId) === normalizeId(quoteManagerUserId);
}

export function canEditQuoteDelivery({
  userId,
  quoteManagerUserId,
  viewerJobRole,
  permissions,
}: QuoteAccessContext) {
  if (permissions.isSuperAdmin || permissions.isSeo) return true;
  const role = normalizeJobRole(viewerJobRole);
  if (role === "pm" || role === "logistics") return true;
  if (!permissions.isAdmin && !permissions.isManagerJob) return true;
  return normalizeId(userId) !== "" && normalizeId(userId) === normalizeId(quoteManagerUserId);
}
