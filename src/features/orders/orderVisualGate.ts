/** Те, що гейтам дизайну треба знати про задачу; повний знімок — у orderRecords. */
export type DesignTaskApprovalSnapshot = {
  status: string;
  type: string | null;
  hasSelectedVisualization: boolean;
  hasSelectedLayout: boolean;
  hasLegacySelectedOutput: boolean;
};

/** «Погоджено» ≠ status approved: потрібен ще обраний файл — той самий бар, що в DesignTaskPage. */
export const isVisualizationApprovedByTask = (task: DesignTaskApprovalSnapshot) =>
  task.status === "approved" &&
  (task.hasSelectedVisualization ||
    ((!task.type || task.type === "visualization") && task.hasLegacySelectedOutput));

export const isLayoutApprovedByTask = (task: DesignTaskApprovalSnapshot) =>
  task.status === "approved" &&
  (task.hasSelectedLayout ||
    ((!task.type || task.type === "layout" || task.type === "layout_adaptation") && task.hasLegacySelectedOutput));

/**
 * Чи чекає замовлення погодженого візуалу (REQ-322#p42, Влад 04.11.2026). Візуал не
 * тримає створення замовлення, договір і рахунок — лише СП з візуалом і запуск.
 *
 * Рахується з ПОТОЧНОГО стану відомих задач (прорахунку й привʼязаної до замовлення),
 * а не зі знімка при створенні: повернули візуал на доопрацювання — запуск знову
 * чекає. Задач не видно (standalone) — не блокуємо: CRM не має звідки дізнатись
 * погодження. Легасі «approved» без обраного файлу знімок уже зарахував — їх теж ні.
 */
export const isVisualizationPending = (
  requiresDesignApproval: boolean,
  snapshotApproved: boolean | null | undefined,
  tasks: DesignTaskApprovalSnapshot[]
) => {
  if (!requiresDesignApproval) return false;
  if (!tasks.some((task) => !task.type || task.type === "visualization")) return false;
  if (tasks.some(isVisualizationApprovedByTask)) return false;
  return !(Boolean(snapshotApproved) && tasks.every((task) => task.status === "approved"));
};
