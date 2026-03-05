export type DesignStatus =
  | "new"
  | "changes"
  | "in_progress"
  | "pm_review"
  | "client_review"
  | "approved"
  | "cancelled";

export const DESIGN_STATUS_LABELS: Record<DesignStatus, string> = {
  new: "Новий",
  changes: "Правки",
  in_progress: "В роботі",
  pm_review: "Дизайн готовий",
  client_review: "На погодженні",
  approved: "Затверджено",
  cancelled: "Скасовано",
};

export const DESIGN_ALL_STATUSES: DesignStatus[] = [
  "new",
  "changes",
  "in_progress",
  "pm_review",
  "client_review",
  "approved",
  "cancelled",
];

export const DESIGN_STATUS_QUICK_ACTIONS: Partial<Record<DesignStatus, Array<{ next: DesignStatus; label: string }>>> = {
  new: [{ next: "in_progress", label: "Почати роботу" }],
  changes: [{ next: "in_progress", label: "Почати правки" }],
  in_progress: [{ next: "pm_review", label: "Позначити як дизайн готовий" }],
  pm_review: [
    { next: "client_review", label: "Передати клієнту" },
    { next: "in_progress", label: "Повернути в роботу" },
  ],
  client_review: [
    { next: "approved", label: "Позначити як затверджено" },
    { next: "changes", label: "Повернути на правки" },
  ],
};

type DesignStatusPermissionInput = {
  currentStatus: DesignStatus;
  canManageAssignments: boolean;
  isAssignedToCurrentUser: boolean;
};

export const getAllowedDesignStatusTransitions = ({
  currentStatus,
  canManageAssignments,
  isAssignedToCurrentUser,
}: DesignStatusPermissionInput): DesignStatus[] => {
  if (canManageAssignments) {
    return DESIGN_ALL_STATUSES.filter((status) => status !== currentStatus);
  }
  if (!isAssignedToCurrentUser) return [];
  if (currentStatus === "new" || currentStatus === "changes") return ["in_progress"];
  if (currentStatus === "in_progress") return ["pm_review"];
  return [];
};

export const canChangeDesignStatus = (
  input: DesignStatusPermissionInput & {
    nextStatus: DesignStatus;
  }
) => getAllowedDesignStatusTransitions(input).includes(input.nextStatus);
