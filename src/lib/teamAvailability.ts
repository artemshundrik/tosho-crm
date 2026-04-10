export type TeamAvailabilityStatus = "available" | "vacation" | "sick_leave" | "offline";
export type TeamPresenceStatus = "online" | "offline";

export function normalizeTeamAvailabilityStatus(value?: string | null): TeamAvailabilityStatus {
  return value === "vacation" || value === "sick_leave" || value === "offline" ? value : "available";
}

export function getTeamAvailabilityLabel(value?: TeamAvailabilityStatus | null) {
  const normalized = normalizeTeamAvailabilityStatus(value);
  if (normalized === "vacation") return "Відпустка";
  if (normalized === "sick_leave") return "Лікарняний";
  if (normalized === "offline") return "Поза офісом";
  return "Доступний";
}

export function getTeamAvailabilityBadgeClass(value?: TeamAvailabilityStatus | null) {
  const normalized = normalizeTeamAvailabilityStatus(value);
  if (normalized === "vacation") return "bg-warning-soft text-warning-foreground border-warning-soft-border";
  if (normalized === "sick_leave") return "bg-danger-soft text-danger-foreground border-danger-soft-border";
  if (normalized === "offline") return "bg-muted text-muted-foreground border-border";
  return "bg-success-soft text-success-foreground border-success-soft-border";
}

export function getTeamAvailabilityAvatarClass(value?: TeamAvailabilityStatus | null) {
  return "";
}

export function getTeamStatusIndicatorClass(params: {
  availability?: TeamAvailabilityStatus | null;
  presence?: TeamPresenceStatus | null;
}) {
  const availability = normalizeTeamAvailabilityStatus(params.availability);
  if (availability !== "available") return "bg-amber-500 dark:bg-amber-400";
  if (params.presence === "online") return "bg-emerald-500";
  return "";
}

export function getTeamPresenceLabel(value?: TeamPresenceStatus | null) {
  return value === "online" ? "Онлайн" : "Не в мережі";
}

export function buildTeamStatusTitle(params: {
  name?: string | null;
  availability?: TeamAvailabilityStatus | null;
  presence?: TeamPresenceStatus | null;
}) {
  const parts: string[] = [];
  const name = params.name?.trim();
  if (name) parts.push(name);
  if (params.presence) parts.push(getTeamPresenceLabel(params.presence));
  if (params.availability) parts.push(getTeamAvailabilityLabel(params.availability));
  return parts.join(" · ");
}
