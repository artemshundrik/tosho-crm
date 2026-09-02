import { moduleKeyLabel } from "../../../src/lib/projectMap";
import type { DevRequestKind, DevRequestPriority } from "./devRequestDraft";

/**
 * Спільні підписи картки запиту: тип, пріоритет, номер і рядок «тип · напрямок
 * · пріоритет».
 *
 * Ім'я файлу лишилось від гілки «завести задачу з Telegram» — вона жила тут
 * цілком, поки не пішла разом із самим входом (за 24 дні з неї приїхало три
 * картки з 238). Читають ці підписи тепер ендпоінт захоплення й дошка, тож
 * модуль лишився, а вміст звузився до того, що справді спільне.
 */

/**
 * Людські підписи типу й пріоритету.
 *
 * Експортовані, бо їх читає не лише бот: той самий рядок «тип · напрямок ·
 * пріоритет» показує і відповідь ендпоінта захоплення (_lib/devRequestCapture.ts).
 * Третя копія цих словників розійшлась би з дошкою на першій же правці.
 */
export const KIND_LABELS: Record<DevRequestKind, string> = {
  bug: "Не працює",
  friction: "Незручно",
  feature: "Нова можливість",
};

export const PRIORITY_LABELS: Record<DevRequestPriority, string> = {
  low: "Не горить",
  normal: "Звичайний",
  high: "Терміново",
};

export type DevRequestMetaInput = {
  kind: DevRequestKind;
  /** Ключ напрямку. Невідомий чи порожній — рядок просто коротший. */
  moduleKey: string | null;
  priority: DevRequestPriority;
};

/**
 * Рядок «Не працює · Прорахунки · Терміново».
 *
 * Порожні частини випадають разом із роздільником: невідомий напрямок має
 * робити рядок коротшим, а не додавати «null» чи «· ·».
 */
export function buildDevRequestMeta(input: DevRequestMetaInput): string {
  return [KIND_LABELS[input.kind], moduleKeyLabel(input.moduleKey), PRIORITY_LABELS[input.priority]]
    .map((part) => (part ?? "").trim())
    .filter(Boolean)
    .join(" · ");
}

/** Людський підпис «REQ-42». Той самий формат, що на дошці. */
export function formatRequestNumber(number: number): string {
  return `REQ-${number}`;
}
