/**
 * Коли таймер дизайн-задачі має йти, а коли ні.
 *
 * Правило одне: **таймер працює рівно тоді, коли задача «В роботі»**. Усе інше
 * випливає з нього — не треба перелічувати пари статусів «звідки-куди».
 *
 * Навіщо винесено окремо: перехід статусу живе у ДВОХ місцях (канбан
 * `DesignPage` і картка `DesignTaskPage`), плюс перетягування картки мишею.
 * Якщо правило продублювати, вони розійдуться, і дизайнер отримає таймер в
 * одному місці й не отримає в іншому. Тут — без мережі, тому покрито тестами.
 *
 * Причина появи: дизайнери забувають тиснути «старт» і «пауза», через що час
 * у задачі не збігається з реальним, а на ньому тримається аналітика й зарплата.
 */

/** Єдиний статус, у якому таймер має право йти. */
export const TIMER_RUNNING_STATUS = "in_progress";

/**
 * Виходимо з «В роботі» — таймер зупиняємо завжди, ким би не був автор зміни.
 *
 * Зупинка нічого не вигадує: вона лише закриває відкриту сесію. Тому питання
 * «а хто натиснув» тут не стоїть — якщо робота більше не в роботі, час не йде.
 */
export function shouldPauseTimerForStatusChange(previousStatus: string, nextStatus: string): boolean {
  return previousStatus === TIMER_RUNNING_STATUS && nextStatus !== TIMER_RUNNING_STATUS;
}

/**
 * Заходимо в «В роботі» — таймер запускаємо, але ЛИШЕ якщо статус міняє той,
 * хто цю роботу й робитиме: виконавець або співвиконавець.
 *
 * ЧОМУ НЕ ЗАВЖДИ: якщо менеджер повертає задачу в роботу (наприклад, з
 * «Дизайн готовий»), дизайнер у цю мить може спати. Автостарт записав би йому
 * години, яких не було, — а це вже неправдиві дані в зарплаті. Тому менеджер
 * лише повертає статус, а час починає йти, коли дизайнер сам візьметься.
 */
export function shouldStartTimerForStatusChange(params: {
  previousStatus: string;
  nextStatus: string;
  actorUserId: string | null | undefined;
  assigneeUserId: string | null | undefined;
  collaboratorUserIds?: readonly (string | null | undefined)[];
}): boolean {
  const { previousStatus, nextStatus, actorUserId, assigneeUserId, collaboratorUserIds = [] } = params;

  if (nextStatus !== TIMER_RUNNING_STATUS) return false;
  if (previousStatus === TIMER_RUNNING_STATUS) return false;
  if (!actorUserId) return false;

  return actorUserId === assigneeUserId || collaboratorUserIds.some((id) => id === actorUserId);
}

/**
 * Остання правка = активний раунд: час має лягати саме на неї.
 *
 * Дублює вибір, який картка задачі робить для ручного старту, але читає ті самі
 * метадані, тож канбан і картка зараховують час однаково. Сортуємо за
 * `requested_at`, при рівних датах — за `id`, бо порядок у масиві не гарантований.
 */
export function pickNewestChangeRequestId(metadata: unknown): string | null {
  const raw = (metadata as { design_brief_change_requests?: unknown } | null | undefined)
    ?.design_brief_change_requests;
  if (!Array.isArray(raw)) return null;

  let newestId: string | null = null;
  let newestAt = "";

  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const id = typeof row.id === "string" ? row.id.trim() : "";
    const requestedAt = typeof row.requested_at === "string" ? row.requested_at.trim() : "";
    if (!id || !requestedAt) continue;

    if (requestedAt > newestAt || (requestedAt === newestAt && newestId !== null && id > newestId)) {
      newestId = id;
      newestAt = requestedAt;
    }
  }

  return newestId;
}
