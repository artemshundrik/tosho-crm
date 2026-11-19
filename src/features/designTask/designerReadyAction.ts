import { toast } from "sonner";

import { logDesignTaskActivity } from "@/lib/designTaskActivity";
import { resolveDesignerReadiness } from "@/lib/designTaskReadiness";

import { writeDesignerReady } from "./writeDesignerReady";

/**
 * «Моя версія готова» / «Ще не готово» з картки дизайн-задачі (REQ-365).
 *
 * Пише позначку дизайнера, кладе подію в історію, і коли здав останній —
 * переводить задачу в «Дизайн готовий» тим самим шляхом, що й звичайна кнопка
 * (`moveToReady` = updateTaskStatus сторінки): події, сповіщення, таймери.
 *
 * Окремий модуль, бо сторінка задачі під ратчетом розміру.
 */
export async function runDesignerReadyAction(deps: {
  task: {
    id: string;
    quoteId?: string | null;
    assigneeUserId?: string | null;
    metadata?: Record<string, unknown> | null;
  };
  teamId: string;
  userId: string;
  ready: boolean;
  getMemberLabel: (userId: string) => string;
  onMetadata: (metadata: Record<string, unknown>) => void;
  loadHistory: () => Promise<void>;
  /** Поставити на паузу власний таймер, якщо він іде. */
  pauseOwnTimer: () => Promise<void>;
  moveToReady: () => Promise<void>;
}): Promise<void> {
  const { task, teamId, userId, ready, getMemberLabel } = deps;
  const result = await writeDesignerReady({
    taskId: task.id,
    teamId,
    userId,
    ready,
    fallbackMetadata: task.metadata,
  });
  if (result.kind === "not_in_progress") {
    toast.error("Задача вже не в роботі", { description: "Оновіть сторінку — статус змінили з іншого місця." });
    return;
  }
  if (result.kind === "conflict") {
    toast.error("Не вдалося зберегти — спробуйте ще раз");
    return;
  }

  deps.onMetadata(result.metadata);
  const after = resolveDesignerReadiness({
    status: "in_progress",
    metadata: result.metadata,
    assigneeUserId: task.assigneeUserId,
  });
  const actorLabel = getMemberLabel(userId);

  try {
    await logDesignTaskActivity({
      teamId,
      designTaskId: task.id,
      quoteId: task.quoteId,
      userId,
      actorName: actorLabel,
      action: "design_task_designer_ready",
      title: ready
        ? `Версію здано: ${actorLabel} (${after.readyIds.length} з ${after.designerIds.length})`
        : `Версію забрано на доопрацювання: ${actorLabel}`,
      metadata: {
        source: "design_task_designer_ready",
        ready,
        ready_user_ids: after.readyIds,
        waiting_user_ids: after.waitingIds,
      },
    });
    await deps.loadHistory();
  } catch (logError) {
    console.warn("Failed to log designer readiness", logError);
  }

  if (!ready) {
    toast.success("Позначку знято — версія знову в роботі");
    return;
  }

  await deps.pauseOwnTimer();

  if (after.waitingIds.length === 0) {
    await deps.moveToReady();
    return;
  }

  toast.success("Вашу версію здано", {
    description: `Задача перейде в «Дизайн готовий», коли здадуть: ${after.waitingIds.map(getMemberLabel).join(", ")}.`,
  });
}

/**
 * Менеджер приймає, коли частина дизайнерів уже здала, а частина ні: історія
 * має сказати, без чиєї версії. Порожньо — звичайний перехід.
 */
export function describeAcceptedWithout(input: {
  nextStatus: string;
  viaReadiness: boolean;
  readiness: { required: boolean; readyIds: string[]; waitingIds: string[] };
  getMemberLabel: (userId: string) => string;
}): { titleSuffix: string; metadata: Record<string, unknown> } {
  const { readiness } = input;
  const ids =
    input.nextStatus === "pm_review" && !input.viaReadiness && readiness.required && readiness.readyIds.length > 0
      ? readiness.waitingIds
      : [];
  if (ids.length === 0) return { titleSuffix: "", metadata: {} };
  return {
    titleSuffix: ` · прийнято без версії: ${ids.map(input.getMemberLabel).join(", ")}`,
    metadata: { accepted_without_user_ids: ids },
  };
}
