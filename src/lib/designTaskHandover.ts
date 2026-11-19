import { getDesignTaskCollaboratorIds } from "./designTaskCollaborators";
import { DESIGNER_READY_KEY, getDesignTaskDesignerIds, readDesignerReadyMap } from "./designTaskReadiness";

/**
 * ПЕРЕДАЧА ДИЗАЙН-ЗАДАЧІ ІНШОМУ ДИЗАЙНЕРУ (REQ-365#p5).
 *
 * ЩО ЛАМАЛОСЯ. Після того як кожен дизайнер почав здавати свою версію окремо,
 * задача, яку одна дизайнерка почала, а друга доробила, застрягла: система
 * чекала версію від тієї, що віддала роботу (Лєна, 19.11.2026: «мені передали
 * повністю замовлення Мар'яни, і її версію не чекаємо»). Прибрати людину зі
 * співвиконавців руками можна, але тоді не видно, що вона над задачею працювала.
 *
 * ПРАВИЛО. «Передати задачу» прибирає того, хто передає, з дизайнерів задачі —
 * її версії більше не чекають — і записує факт передачі в `designer_handovers`.
 * Якщо передає виконавець, виконавцем стає той, кому передали.
 *
 * ГРОШІ НЕ ЧІПАЄ. Відомість дизайнера рахує залиті ним файли (`user_id` події
 * `design_output_upload`), а не склад задачі; таймер теж у кожного свій. Усе,
 * що людина встигла зробити до передачі, лишається за нею.
 */

export const DESIGNER_HANDOVERS_KEY = "designer_handovers";

export type DesignerHandover = { from_user_id: string; to_user_id: string; by_user_id: string | null; at: string };

type MetadataLike = Record<string, unknown> | null | undefined;

export function readDesignerHandovers(metadata: MetadataLike): DesignerHandover[] {
  const raw = metadata?.[DESIGNER_HANDOVERS_KEY];
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const { from_user_id, to_user_id, by_user_id, at } = entry as Record<string, unknown>;
    if (typeof from_user_id !== "string" || typeof to_user_id !== "string" || typeof at !== "string") return [];
    return [{ from_user_id, to_user_id, by_user_id: typeof by_user_id === "string" ? by_user_id : null, at }];
  });
}

/**
 * Від кого людина може передати задачу: дизайнер — лише свою частину,
 * менеджер — частину будь-кого з дизайнерів задачі.
 */
export function getHandoverSources(input: {
  metadata: MetadataLike;
  assigneeUserId: string | null | undefined;
  actorUserId: string | null | undefined;
  canManageAssignments: boolean;
}): string[] {
  const designers = getDesignTaskDesignerIds(input.metadata, input.assigneeUserId);
  if (input.canManageAssignments) return designers;
  return input.actorUserId && designers.includes(input.actorUserId) ? [input.actorUserId] : [];
}

export type HandoverPlan = {
  assigneeUserId: string | null;
  collaboratorUserIds: string[];
  assigneeChanged: boolean;
  /** Metadata без складу дизайнерів — його допише withDesignTaskCollaboratorMetadata. */
  metadata: Record<string, unknown>;
};

export function planDesignerHandover(input: {
  metadata: MetadataLike;
  assigneeUserId: string | null | undefined;
  fromUserId: string;
  toUserId: string;
  byUserId: string | null;
  nowIso: string;
}): HandoverPlan | null {
  const { fromUserId, toUserId } = input;
  const assignee = input.assigneeUserId ?? null;
  if (!fromUserId || !toUserId || fromUserId === toUserId) return null;
  if (!getDesignTaskDesignerIds(input.metadata, assignee).includes(fromUserId)) return null;

  const collaborators = getDesignTaskCollaboratorIds(input.metadata, assignee);
  const nextAssignee = fromUserId === assignee ? toUserId : assignee;
  const nextCollaborators = [...collaborators, ...(fromUserId === assignee ? [] : [toUserId])].filter(
    (id, index, all) => id !== fromUserId && id !== nextAssignee && all.indexOf(id) === index
  );

  // Позначка «моя версія готова» того, хто пішов, більше нічого не означає.
  const ready = { ...readDesignerReadyMap(input.metadata) };
  delete ready[fromUserId];

  const assigneeChanged = nextAssignee !== assignee;
  return {
    assigneeUserId: nextAssignee,
    collaboratorUserIds: nextCollaborators,
    assigneeChanged,
    metadata: {
      ...(input.metadata ?? {}),
      assignee_user_id: nextAssignee,
      ...(assigneeChanged ? { assigned_at: input.nowIso } : {}),
      [DESIGNER_READY_KEY]: ready,
      [DESIGNER_HANDOVERS_KEY]: [
        ...readDesignerHandovers(input.metadata),
        { from_user_id: fromUserId, to_user_id: toUserId, by_user_id: input.byUserId, at: input.nowIso },
      ],
    },
  };
}
