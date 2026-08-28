import { formatJobRole } from "@/lib/jobRoles";

/**
 * Підписи й класи значків у списку людей.
 *
 * Винесено з TeamMembersPage: сторінка впирається в стелю розміру, а це чисті
 * функції без стану — саме те, що з гіганта варто забирати першим.
 */

export function getJobRoleLabel(role: string | null) {
  return formatJobRole(role) || "Без ролі";
}

export function getAccessBadgeClass(role: string | null) {
  if (role === "owner") return "tone-accent";
  if (role === "admin") return "bg-info-soft text-info-foreground border-info-soft-border";
  return "bg-muted/50 border-border text-muted-foreground";
}

export function getJobBadgeClass(role: string | null) {
  if (!role) return "bg-muted/50 border-border text-muted-foreground";
  return "bg-muted/30 border-border text-muted-foreground";
}

export function getProbationBadgeClass(status: "upcoming" | "active" | "completed") {
  if (status === "completed") return "bg-success-soft text-success-foreground border-success-soft-border";
  if (status === "active") return "bg-warning-soft text-warning-foreground border-warning-soft-border";
  return "bg-muted text-muted-foreground border-border";
}
