import { CircleDashed, CircleDot, Clock, CheckCircle2, HelpCircle } from "lucide-react";
import type { ComponentType } from "react";

import type { Tone } from "@/lib/statusTones";

/**
 * Пункти великої задачі.
 *
 * Живуть у колонці `checklist jsonb` картки (scripts/dev-requests-checklist.sql).
 * Перелік станів свідомо НЕ винесений у check-констрейнт бази — його звіряє цей
 * модуль, щоб не завести другий список, який розійдеться з першим.
 */

export const CHECK_STATES = ["todo", "doing", "waiting", "done"] as const;
export type CheckState = (typeof CHECK_STATES)[number];

export const CHECK_KINDS = ["task", "question"] as const;
export type CheckKind = (typeof CHECK_KINDS)[number];

export type ChecklistItem = {
  id: string;
  kind: CheckKind;
  text: string;
  state: CheckState;
  /** Розділ списку: «Документи», «Дошка». Порожньо — пункт поза групами. */
  group: string | null;
  /** На кого чекаємо. Має сенс лише у стані `waiting`. */
  who: string | null;
  /** Відколи чекаємо, YYYY-MM-DD. З неї рахується «зависло N днів». */
  since: string | null;
  /** Розгорнутий текст під рядком: подробиці, посилання, уточнення. */
  note: string | null;
  /** Для питання — що відповіли. Заповнена відповідь закриває питання. */
  answer: string | null;
};

/**
 * Підписи станів.
 *
 * «Чекає» — не синонім «не почато». Перше означає «зроблено все, що можна без
 * людини», друге — «руки не дійшли». Поки вони однакові, велика задача тихо
 * зависає: картка виглядає закинутою, хоч насправді заблокована.
 */
export const CHECK_STATE_LABELS: Record<CheckState, string> = {
  todo: "Не почато",
  doing: "В роботі",
  waiting: "Чекає",
  done: "Готово",
};

export const CHECK_STATE_TONE: Record<CheckState, Tone> = {
  todo: "neutral",
  doing: "info",
  waiting: "warning",
  done: "success",
};

export const CHECK_STATE_ICONS: Record<CheckState, ComponentType<{ className?: string }>> = {
  todo: CircleDashed,
  doing: CircleDot,
  waiting: Clock,
  done: CheckCircle2,
};

/** Іконка питання — щоб воно читалось як питання ще до тексту. */
export const QUESTION_ICON = HelpCircle;

/** Клік по стану веде по колу: не почато → в роботі → чекає → готово → ... */
export function nextState(state: CheckState): CheckState {
  const index = CHECK_STATES.indexOf(state);
  return CHECK_STATES[(index + 1) % CHECK_STATES.length];
}

const asString = (value: unknown): string => (typeof value === "string" ? value.trim() : "");
const asNullable = (value: unknown): string | null => asString(value) || null;

function asState(value: unknown): CheckState {
  return typeof value === "string" && (CHECK_STATES as readonly string[]).includes(value)
    ? (value as CheckState)
    : "todo";
}

function asKind(value: unknown): CheckKind {
  return value === "question" ? "question" : "task";
}

/**
 * Приводить збережений JSON до списку пунктів.
 *
 * Пункт без тексту відкидаємо: порожній рядок у списку неможливо ні зробити,
 * ні прибрати — він просто займає місце й лякає. Пункт без id отримує його з
 * позиції: старі записи мають лишитись робочими.
 */
export function parseChecklist(value: unknown): ChecklistItem[] {
  if (!Array.isArray(value)) return [];
  const items: ChecklistItem[] = [];
  value.forEach((raw, index) => {
    if (!raw || typeof raw !== "object") return;
    const row = raw as Record<string, unknown>;
    const text = asString(row.text);
    if (!text) return;
    items.push({
      id: asString(row.id) || `p${index + 1}`,
      kind: asKind(row.kind),
      text,
      state: asState(row.state),
      group: asNullable(row.group),
      who: asNullable(row.who),
      since: asNullable(row.since),
      note: asNullable(row.note),
      answer: asNullable(row.answer),
    });
  });
  return items;
}

export type ChecklistProgress = {
  total: number;
  done: number;
  doing: number;
  waiting: number;
  todo: number;
  /** Скільки днів висить найстаріше очікування. 0 — нічого не чекає. */
  stuckDays: number;
  /** На кого чекаємо найдовше. Для підпису «чекає СЕО · 12 дн». */
  stuckWho: string | null;
};

/**
 * Підсумок для картки.
 *
 * `stuckDays` рахується автоматично від найстарішої дати серед пунктів у стані
 * «чекає» — саме тому, що памʼятати про це нікому: задача зависає тихо, і
 * помічають це, коли вже ніяково нагадувати.
 */
export function checklistProgress(items: ChecklistItem[], now = new Date()): ChecklistProgress {
  const progress: ChecklistProgress = {
    total: items.length,
    done: 0,
    doing: 0,
    waiting: 0,
    todo: 0,
    stuckDays: 0,
    stuckWho: null,
  };

  let oldest = Number.POSITIVE_INFINITY;
  for (const item of items) {
    progress[item.state] += 1;
    if (item.state !== "waiting" || !item.since) continue;
    const started = Date.parse(`${item.since}T00:00:00Z`);
    if (Number.isNaN(started) || started >= oldest) continue;
    oldest = started;
    progress.stuckWho = item.who;
  }

  if (Number.isFinite(oldest)) {
    const days = Math.floor((now.getTime() - oldest) / 86_400_000);
    progress.stuckDays = Math.max(0, days);
  }

  return progress;
}

/** Групи в порядку першої появи: порядок задає той, хто складав список. */
export function groupChecklist(items: ChecklistItem[]): Array<{ group: string | null; items: ChecklistItem[] }> {
  const groups: Array<{ group: string | null; items: ChecklistItem[] }> = [];
  const index = new Map<string, number>();
  for (const item of items) {
    const key = item.group ?? "";
    const at = index.get(key);
    if (at === undefined) {
      index.set(key, groups.length);
      groups.push({ group: item.group, items: [item] });
    } else {
      groups[at].items.push(item);
    }
  }
  return groups;
}

/**
 * Скільки днів висить це очікування. null — пункт не чекає або дати немає.
 *
 * На екрані показуємо саме дні, а не дату початку: питання ж не «коли
 * почалось», а «скільки вже висить» — і віднімати в голові щоразу нікому.
 */
export function waitingDays(item: ChecklistItem, now = new Date()): number | null {
  if (item.state !== "waiting" || !item.since) return null;
  const started = Date.parse(`${item.since}T00:00:00Z`);
  if (Number.isNaN(started)) return null;
  return Math.max(0, Math.floor((now.getTime() - started) / 86_400_000));
}

/**
 * Чи картку затримав гейт релізу: код уже поїхав, а задача не закінчена.
 *
 * ЗВІДКИ ВОНА ВЗЯЛАСЬ. Раніше деплой закривав картку за фактом коміта, не
 * дивлячись на пункти. Велика задача їхала шматками, після першого ж деплою
 * ставала «Викочено», зникала з відкритої черги й через місяць ішла в архів —
 * разом із хвостом. Тепер картку з незакритим хвостом деплой не бере
 * (scripts/lib/devRequestReleases.mjs), і вона лишається тут, на видноті.
 *
 * МЕЖА ТОЧНОСТІ. «Готово локально» ставить КОМІТ, а не деплой, тож у день між
 * комітом і найближчим пушем підпис забігає наперед. Свідомо: деплої тут
 * щоденні, а помилка на день дешевша за ще одне поле в базі, яке хтось мав би
 * вчасно проставляти. Вимагаємо хоча б один готовий пункт — інакше це не
 * «частина в проді», а просто початок роботи.
 */
export function isPartlyShipped(
  status: string,
  items: ChecklistItem[],
  commitShas: readonly string[]
): boolean {
  if (status !== "done_local" || commitShas.length === 0 || items.length === 0) return false;
  return items.some((item) => item.state === "done") && items.some((item) => item.state !== "done");
}

/** Сьогодні в YYYY-MM-DD — для позначки, відколи чекаємо. */
export function today(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}
