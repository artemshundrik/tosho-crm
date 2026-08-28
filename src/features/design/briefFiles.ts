/**
 * Файли ТЗ у новій дизайн-задачі: скільки їх можна й що робити з надлишком.
 *
 * Окремо від DesignPage навмисно — сторінка впирається в стелю розміру, а
 * правило тут перевіряється юнітом без React.
 */

/**
 * Стільки ж, скільки в решті зон вкладень CRM: `MAX_ATTACHMENTS` у прорахунку
 * і `MAX_QUOTE_ATTACHMENTS` у картці — обидві по 20. Доти тут стояло 5, і форма
 * мовчки відрізала зайве: людина з шістьма файлами бачила п'ять, а шостий
 * доносила дизайнерові в Telegram — повз CRM (REQ-197).
 */
export const MAX_BRIEF_FILES = 20;

export type BriefFilesPlan = {
  /** Що справді долучиться. */
  accepted: File[];
  /** Скільки не влізло — про це кажуть уголос, а не мовчки відрізають. */
  rejected: number;
  /** Місця не лишилось узагалі. */
  full: boolean;
};

/**
 * Скільки з доданого влізе поверх наявного.
 *
 * Рахує від ФАКТИЧНОГО списку, а не від замикання: цю функцію кличе і слухач
 * paste, у якого стан завжди застарілий.
 */
export function planBriefFiles(current: readonly File[], incoming: readonly File[]): BriefFilesPlan {
  const room = Math.max(0, MAX_BRIEF_FILES - current.length);
  if (room === 0) return { accepted: [], rejected: incoming.length, full: true };
  return {
    accepted: incoming.slice(0, room),
    rejected: Math.max(0, incoming.length - room),
    full: false,
  };
}
