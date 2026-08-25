import { onBoardColumns } from "./kanbanBoards";
import type { DesignTaskType } from "./designTaskType";

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

/**
 * Колонки дошки дизайну. Склад бере реєстр канбанів — @/lib/kanbanBoards:
 * «Скасовано» стовпчиком НЕ стає, воно живе окремим списком за перемикачем у
 * тулбарі (на проді це було 71 картка з 569).
 *
 * DESIGN_ALL_STATUSES вище лишається повним і саме з нього збирається меню
 * «Змінити статус»: скасувати задачу можна й далі, з дошки пішла КОЛОНКА, а не
 * стан. Не беріть цей масив для переліку переходів — там потрібні всі сім.
 */
export const DESIGN_BOARD_COLUMNS: { id: DesignStatus; label: string }[] = onBoardColumns(
  "design",
  DESIGN_ALL_STATUSES.map((id) => ({ id, label: DESIGN_STATUS_LABELS[id] })),
  (column) => column.id
);

export const DESIGN_STATUS_QUICK_ACTIONS: Partial<Record<DesignStatus, Array<{ next: DesignStatus; label: string }>>> = {
  new: [{ next: "in_progress", label: "Почати роботу" }],
  changes: [{ next: "in_progress", label: "Почати правки" }],
  in_progress: [
    { next: "pm_review", label: "Позначити як дизайн готовий" },
    { next: "changes", label: "Повернути на правки" },
  ],
  pm_review: [
    { next: "client_review", label: "Передати замовнику" },
    { next: "changes", label: "Повернути на правки" },
    { next: "in_progress", label: "Повернути в роботу" },
  ],
  client_review: [
    { next: "approved", label: "Позначити як затверджено" },
    { next: "changes", label: "Повернути на правки" },
  ],
};

export const getDesignStatusActionLabel = (currentStatus: DesignStatus, nextStatus: DesignStatus) => {
  const quickAction = (DESIGN_STATUS_QUICK_ACTIONS[currentStatus] ?? []).find((action) => action.next === nextStatus);
  if (quickAction) return quickAction.label;
  // Фолбек — просто назва статусу: кольорова іконка + підменю «Змінити статус» уже
  // дають контекст, тож «Перевести в статус …» повторювалось зайве.
  return DESIGN_STATUS_LABELS[nextStatus];
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

/**
 * Гейт «Позначити як затверджено»: не можна закрити задачу, не сказавши, ЯКИЙ
 * саме варіант замовник обрав.
 *
 * ЧОМУ САМЕ ТУТ, А НЕ НА «ПЕРЕДАТИ ЗАМОВНИКУ». Спершу правило стояло на
 * переході «Дизайн готовий» → «На погодженні» — і вимагало погоджений візуал
 * ДО того, як роботу взагалі показали замовнику. Позначка ж називається
 * «погоджене замовником», тож виходила вимога результату до початку процесу:
 * менеджер не міг віддати роботу на погодження, поки не відмітить, що її вже
 * погодили. Тепер порядок природний: віддали → замовник обрав → позначили →
 * затвердили.
 *
 * Правило живе тут, бо його перевіряють ДВА місця — картка задачі й канбан (там
 * перехід робиться перетягуванням). Раніше воно було тільки в картці, і через
 * канбан гейт обходився.
 */
export type ApprovalGateInput = {
  designTaskType: DesignTaskType | null;
  approvedVisualizationCount: number;
  approvedLayoutCount: number;
  /** Чи є серед результатів хоч один макет. */
  hasLayoutOutputs: boolean;
};

/**
 * Підказка до блокерів — один текст на картку задачі й на канбан.
 *
 * Сам перелік блокерів каже, ЧОГО бракує, але не каже, ЧИМ це закривають, і
 * люди тицяли галочку зліва від матеріалу: вона підсвічує рядок, схожа на «ось
 * цей варіант обрано» — а насправді це вибір для масових дій. Погодження ставить
 * окрема кнопка «Погодити» в рядку.
 */
export const APPROVAL_GATE_HINT =
  "Погоджує кнопка «Погодити» в рядку матеріалу. Галочка зліва лише вибирає рядки для масових дій.";

export const getApprovalBlockers = ({
  designTaskType,
  approvedVisualizationCount,
  approvedLayoutCount,
  hasLayoutOutputs,
}: ApprovalGateInput): string[] => {
  const requiresVisualization = designTaskType === "visualization";
  const requiresLayout =
    designTaskType === "layout" ||
    designTaskType === "layout_adaptation" ||
    (designTaskType === "visualization" && hasLayoutOutputs);

  const blockers: string[] = [];
  if (requiresVisualization && approvedVisualizationCount === 0) {
    blockers.push("Потрібно погодити хоча б один візуал");
  }
  if (requiresLayout && approvedLayoutCount === 0) {
    blockers.push("Потрібно погодити хоча б один макет");
  }
  return blockers;
};

/* ────────────────────────────────────────────────────────────────────────────
 * Смуга дій задачі
 *
 * Одне джерело правди для питання «що показати людині». Сторінка задачі,
 * канбан і мобільна панель мають брати відповідь звідси, а не рахувати кожен
 * по-своєму — інакше та сама задача виглядає по-різному в трьох місцях.
 *
 * Правила (docs/DESIGN_TASK_ACTIONS_MATRIX.md):
 *   • рівно одна основна дія, максимум одна вторинна, решта в меню;
 *   • неактивних кнопок немає — дія або доступна, або її немає;
 *   • там, де дії немає, повертається stateText, який каже, чия зараз черга.
 * ──────────────────────────────────────────────────────────────────────────── */

export type DesignTaskActionId =
  | { kind: "assign_designer" }
  | { kind: "self_assign"; alsoStart: boolean }
  | { kind: "status"; next: DesignStatus }
  | { kind: "timer" }
  | { kind: "change_request" };

export type DesignTaskAction = {
  id: DesignTaskActionId;
  label: string;
};

export type DesignTaskActionPlan = {
  primary: DesignTaskAction | null;
  secondary: DesignTaskAction | null;
  /** Текст стану замість кнопки: «На перевірці у менеджера» тощо. */
  stateText: string | null;
};

export type DesignTaskActionContext = {
  status: DesignStatus;
  /** permissions.canManageDesignStatuses — право на довільну зміну статусу. */
  canManageStatuses: boolean;
  /** permissions.canManageAssignments — право призначати виконавця. */
  canManageAssignments: boolean;
  /** permissions.canSelfAssignDesign. */
  canSelfAssign: boolean;
  /** Виконавець АБО співвиконавець задачі. */
  isAssignee: boolean;
  hasAssignee: boolean;
  assigneeName: string | null;
  /** Задачу редагує інший користувач — усі дії ховаються, сторінка показує банер. */
  locked: boolean;
  /** Дата затвердження для тексту «Затверджено 3 серп.». */
  approvedAtLabel?: string | null;
};

const EMPTY_PLAN: DesignTaskActionPlan = { primary: null, secondary: null, stateText: null };

const statusAction = (currentStatus: DesignStatus, next: DesignStatus): DesignTaskAction => ({
  id: { kind: "status", next },
  label: getDesignStatusActionLabel(currentStatus, next),
});

export const resolveDesignTaskActions = (ctx: DesignTaskActionContext): DesignTaskActionPlan => {
  if (ctx.locked) return EMPTY_PLAN;

  // Ім'я підставляється тільки в називному відмінку: відмінювання в застосунку
  // асинхронне (мережевий виклик), і для підпису, що малюється на кожен рендер,
  // воно не годиться. Тому «В роботі · Мар'яна А.», а не «В роботі у Мар'яни А.».
  const who = ctx.assigneeName?.trim() || null;
  const statusLabel = DESIGN_STATUS_LABELS[ctx.status];
  const withWho = (prefix: string) => (who ? `${prefix} · ${who}` : prefix);
  const isTerminal = ctx.status === "approved" || ctx.status === "cancelled";
  const isStartable = ctx.status === "new" || ctx.status === "changes";

  // Задача без виконавця буває не тільки в «Новому» — менеджер міг зняти
  // виконавця з задачі в роботі. Але в робочих статусах рух уперед лишається
  // головною дією, а призначення стає вторинним: інакше зі смуги зникає
  // «Передати замовнику» саме тоді, коли її треба натиснути.
  const assignAction: DesignTaskAction = {
    id: { kind: "assign_designer" },
    label: "Призначити дизайнера",
  };
  const takeAction: DesignTaskAction = {
    id: { kind: "self_assign", alsoStart: isStartable },
    label: isStartable ? "Взяти на себе і почати" : "Взяти на себе",
  };

  const applyNoAssignee = (plan: DesignTaskActionPlan): DesignTaskActionPlan => {
    if (ctx.hasAssignee || isTerminal) return plan;
    // «Новий»/«Правки» без виконавця, або немає що робити далі → призначення
    // і є головна дія.
    if (isStartable || !plan.primary) {
      if (ctx.canManageAssignments) {
        return { primary: assignAction, secondary: ctx.canSelfAssign ? takeAction : null, stateText: null };
      }
      if (ctx.canSelfAssign) return { primary: takeAction, secondary: null, stateText: null };
      return { ...EMPTY_PLAN, stateText: `${statusLabel} · чекає призначення` };
    }
    // Робочий статус: основну дію лишаємо, вторинною підставляємо призначення.
    if (ctx.canManageAssignments) return { ...plan, secondary: assignAction };
    if (ctx.canSelfAssign) return { ...plan, secondary: takeAction };
    return plan;
  };

  const plan = ((): DesignTaskActionPlan => {
  switch (ctx.status) {
    case "new":
    case "changes": {
      const startLabel = ctx.status === "changes" ? "Почати правки" : "Почати роботу";

      if (ctx.isAssignee) {
        return {
          primary: { id: { kind: "status", next: "in_progress" }, label: startLabel },
          secondary: null,
          stateText: null,
        };
      }
      if (ctx.canManageStatuses) {
        const what = ctx.status === "changes" ? "візьме правки" : "візьме в роботу";
        return {
          ...EMPTY_PLAN,
          stateText: who ? `Чекаємо, поки ${who} ${what}` : `${statusLabel} · чекає старту`,
        };
      }
      return {
        ...EMPTY_PLAN,
        stateText: ctx.status === "new" && who ? `Призначено: ${who}` : withWho(statusLabel),
      };
    }

    case "in_progress": {
      if (ctx.isAssignee) {
        return {
          primary: { id: { kind: "status", next: "pm_review" }, label: "Дизайн готовий" },
          secondary: { id: { kind: "timer" }, label: "Таймер" },
          stateText: null,
        };
      }
      if (ctx.canManageStatuses) {
        return {
          primary: statusAction(ctx.status, "pm_review"),
          secondary: statusAction(ctx.status, "changes"),
          stateText: null,
        };
      }
      return { ...EMPTY_PLAN, stateText: withWho("В роботі") };
    }

    case "pm_review": {
      if (ctx.canManageStatuses) {
        return {
          primary: statusAction(ctx.status, "client_review"),
          secondary: statusAction(ctx.status, "changes"),
          stateText: null,
        };
      }
      if (ctx.isAssignee) {
        return {
          primary: null,
          secondary: { id: { kind: "change_request" }, label: "Правка" },
          stateText: "На перевірці у менеджера",
        };
      }
      return { ...EMPTY_PLAN, stateText: "Дизайн готовий · чекає менеджера" };
    }

    case "client_review": {
      if (ctx.canManageStatuses) {
        return {
          primary: { id: { kind: "status", next: "approved" }, label: "Затверджено замовником" },
          secondary: statusAction(ctx.status, "changes"),
          stateText: null,
        };
      }
      if (ctx.isAssignee) {
        return {
          primary: null,
          secondary: { id: { kind: "change_request" }, label: "Правка" },
          stateText: "У замовника на погодженні",
        };
      }
      return { ...EMPTY_PLAN, stateText: "На погодженні у замовника" };
    }

    case "approved":
      return {
        ...EMPTY_PLAN,
        stateText: ctx.approvedAtLabel ? `Затверджено ${ctx.approvedAtLabel}` : "Затверджено",
      };

    case "cancelled":
      if (ctx.canManageStatuses) {
        return {
          primary: { id: { kind: "status", next: "in_progress" }, label: "Повернути в роботу" },
          secondary: null,
          stateText: null,
        };
      }
      return { ...EMPTY_PLAN, stateText: "Скасовано" };

    default:
      return EMPTY_PLAN;
  }
  })();

  return applyNoAssignee(plan);
};
