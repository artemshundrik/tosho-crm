import { getDesignTaskCollaboratorIds } from "./designTaskCollaborators";

/**
 * ГОТОВНІСТЬ КОЖНОГО ДИЗАЙНЕРА (REQ-365).
 *
 * ЩО ЛАМАЛОСЯ. Статус у задачі один на всіх, а співвиконавець для системи —
 * такий самий виконавець. Коли двоє дизайнерів роблять кожен свою версію,
 * перший, хто натиснув «Дизайн готовий», переводив задачу за обох: менеджер
 * отримував «готово», хоча друга версія ще не існувала (Влад, 19.11.2026).
 *
 * ПРАВИЛО. У задачі з кількома дизайнерами (виконавець + співвиконавці) кожен
 * позначає «Моя версія готова» окремо. Задача переходить у «Дизайн готовий»,
 * коли здали всі. Менеджер може не чекати й прийняти раніше.
 *
 * ДЕ ЖИВЕ. `metadata.designer_ready` задачі: `{ [userId]: { at } }`. Окремої
 * таблиці не треба — решта стану задачі лежить там само.
 *
 * ЧОМУ ГОТОВНІСТЬ НЕ ТРЕБА СКИДАТИ РУКАМИ. Позначка чинна, лише якщо зроблена
 * ПІСЛЯ того, як почався поточний статус «В роботі» (`status_changed_at`). Будь-яке
 * повернення — на правки, «Повернути в роботу» — ставить новий `status_changed_at`,
 * і старі позначки самі стають минулим раундом. Та сама форма порівняння, що в
 * гейтах дедлайну й правки (designTaskStatus.ts): людям знайома, і писати в базу
 * «зняти галочки» в кожному з чотирьох місць, що міняють статус, не доводиться.
 */

export type DesignerReadyEntry = { at: string };
export type DesignerReadyMap = Record<string, DesignerReadyEntry>;

type MetadataLike = Record<string, unknown> | null | undefined;

export const DESIGNER_READY_KEY = "designer_ready";

export function readDesignerReadyMap(metadata: MetadataLike): DesignerReadyMap {
  const raw = metadata?.[DESIGNER_READY_KEY];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const result: DesignerReadyMap = {};
  for (const [userId, entry] of Object.entries(raw as Record<string, unknown>)) {
    if (!userId || !entry || typeof entry !== "object") continue;
    const at = (entry as Record<string, unknown>).at;
    if (typeof at === "string" && Number.isFinite(new Date(at).getTime())) result[userId] = { at };
  }
  return result;
}

/** Усі, хто робить свою версію: виконавець першим, далі співвиконавці. */
export function getDesignTaskDesignerIds(metadata: MetadataLike, assigneeUserId: string | null | undefined): string[] {
  const ids = assigneeUserId ? [assigneeUserId] : [];
  return [...ids, ...getDesignTaskCollaboratorIds(metadata, assigneeUserId)];
}

export type DesignerReadiness = {
  /** Чи діє правило взагалі: задача «В роботі» і дизайнерів більше одного. */
  required: boolean;
  designerIds: string[];
  readyIds: string[];
  waitingIds: string[];
};

export function resolveDesignerReadiness(input: {
  status: string | null | undefined;
  metadata: MetadataLike;
  assigneeUserId: string | null | undefined;
}): DesignerReadiness {
  const designerIds = getDesignTaskDesignerIds(input.metadata, input.assigneeUserId);
  const required = input.status === "in_progress" && designerIds.length > 1;
  if (!required) return { required, designerIds, readyIds: [], waitingIds: designerIds };

  const map = readDesignerReadyMap(input.metadata);
  const statusChangedAtRaw = input.metadata?.status_changed_at;
  const roundStartedAt =
    typeof statusChangedAtRaw === "string" ? new Date(statusChangedAtRaw).getTime() : Number.NaN;

  const isReady = (userId: string) => {
    const entry = map[userId];
    if (!entry) return false;
    // Задачі без status_changed_at (заведені до появи поля) — позначці віримо.
    if (!Number.isFinite(roundStartedAt)) return true;
    return new Date(entry.at).getTime() >= roundStartedAt;
  };

  const readyIds = designerIds.filter(isReady);
  const waitingIds = designerIds.filter((id) => !isReady(id));
  return { required, designerIds, readyIds, waitingIds };
}

/** Metadata з позначкою «готово» (або знятою) для одного дизайнера. */
export function withDesignerReady(
  metadata: MetadataLike,
  userId: string,
  ready: boolean,
  nowIso: string
): Record<string, unknown> {
  const map = { ...readDesignerReadyMap(metadata) };
  if (ready) map[userId] = { at: nowIso };
  else delete map[userId];
  return { ...(metadata ?? {}), [DESIGNER_READY_KEY]: map };
}

/**
 * Рядок стану: «Готово: Еліна Л. · чекаємо: Ліна Н.».
 *
 * Без дієслова в минулому часі навмисно: «Еліна здала» вимагає роду, а імена тут
 * у називному відмінку й без статі (див. коментар у resolveDesignTaskActions).
 */
export function formatReadinessLine(readyNames: string[], waitingNames: string[]): string | null {
  if (readyNames.length === 0) return null;
  const ready = `Готово: ${readyNames.join(", ")}`;
  return waitingNames.length > 0 ? `${ready} · чекаємо: ${waitingNames.join(", ")}` : ready;
}
