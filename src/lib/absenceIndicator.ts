import { CalendarOff, Coffee, Plane, Thermometer, type LucideIcon } from "lucide-react";

import type { Tone } from "@/lib/statusTones";

/**
 * Індикатор відсутності на аватарці — правила в одному місці.
 *
 * ДВА РІВНІ ДЕТАЛІЗАЦІЇ (рішення CEO 2026-08-02):
 *  · `full`   — сторінка «Команда»: кільце + іконка типу. Там людина
 *               розбирається саме з відсутностями, тож треба знати й «чому».
 *  · `simple` — увесь інший застосунок: лише кільце. У «Дизайні» чи
 *               «Прорахунках» досить знати «на цю людину зараз не розраховуй»;
 *               розрізняти відпустку від day-off там нема потреби.
 *
 * ПРАВИЛО КОНФЛІКТУ: відсутність завжди перебиває «онлайн». Людина у відпустці
 * може зайти з телефону — зелена крапка збрехала б, що на неї можна
 * розраховувати. Маркер звільнення перебиває і те, і те.
 */

export type AbsenceIndicatorKind = "vacation" | "sick_leave" | "day_off" | "other";

export type AvatarAbsence = {
  kind: AbsenceIndicatorKind;
  startDate?: string | null;
  endDate?: string | null;
};

export type AbsenceIndicatorLevel = "simple" | "full";

const KIND_TONE: Record<AbsenceIndicatorKind, Tone> = {
  vacation: "info",
  sick_leave: "warning",
  day_off: "accent",
  other: "neutral",
};

/**
 * Токени тонів названі неоднорідно: у accent префікс `accent-tone-`, у решти —
 * саме ім'я тону. Помилитись тут легко (і я вже помилявся: day-off виходив
 * чорним, бо `--accent-foreground` — це службовий колір тексту, а не тон).
 */
const TONE_VAR: Record<Tone, string> = {
  neutral: "--neutral-foreground",
  info: "--info-foreground",
  accent: "--accent-tone-foreground",
  success: "--success-foreground",
  warning: "--warning-foreground",
  danger: "--danger-foreground",
  festive: "--festive-foreground",
};

/** Іконки типів — один словник на чип, планер і аватарку. */
export const ABSENCE_KIND_ICONS: Record<AbsenceIndicatorKind, LucideIcon> = {
  vacation: Plane,
  sick_leave: Thermometer,
  day_off: Coffee,
  other: CalendarOff,
};

export function getAbsenceTone(kind: AbsenceIndicatorKind): Tone {
  return KIND_TONE[kind];
}

/**
 * Стилі кільця для ОБГОРТКИ аватарки.
 *
 * Чому саме тут і чому на обгортці:
 *  1. У застосунку тіні глобально вимкнені `!important` (src/index.css), лишені
 *     тільки в поповерах. Єдиний спосіб намалювати кільце — ring-змінні, які
 *     те правило свідомо пропускає.
 *  2. Приглушення відсутнього робиться через `grayscale`, а CSS-фільтр діє на
 *     всю коробку РАЗОМ із тінню. Якби кільце сиділо на тому ж елементі, воно
 *     б знебарвлювалось разом з аватаркою — перевірено, виходив сірий кант.
 *
 * Просвіт між аватаркою й кільцем — кольору поверхні (`--card`), а не білий:
 * так кільце однаково читається і в темній темі.
 */
export function getAbsenceRingStyle(kind: AbsenceIndicatorKind, size: number): React.CSSProperties {
  const width = size <= 24 ? 1.5 : 2;
  const gap = size <= 24 ? 1 : 2;
  return {
    "--tw-ring-offset-shadow": `0 0 0 ${gap}px hsl(var(--card))`,
    "--tw-ring-shadow": `0 0 0 ${gap + width}px hsl(var(${TONE_VAR[KIND_TONE[kind]]}) / 0.9)`,
  } as React.CSSProperties;
}

/** Нижче цього розміру кільце перетворюється на товстий кант — не малюємо. */
export const MIN_INDICATOR_SIZE = 24;

/** Іконка-бейдж має сенс лише коли гліф ще читається. */
export const MIN_ICON_BADGE_SIZE = 32;

const KIND_LABEL: Record<AbsenceIndicatorKind, string> = {
  vacation: "у відпустці",
  sick_leave: "на лікарняному",
  day_off: "day-off",
  other: "відсутній",
};

function shortDate(dateKey?: string | null) {
  if (!dateKey || dateKey.length < 10) return "";
  return `${dateKey.slice(8, 10)}.${dateKey.slice(5, 7)}`;
}

/**
 * Підпис відсутності з датами: «у відпустці 10.08–21.08».
 * Саме дати — те, що люди питають насамперед, а не сам факт.
 */
export function formatAbsenceLabel(absence: AvatarAbsence): string {
  const base = KIND_LABEL[absence.kind];
  const from = shortDate(absence.startDate);
  const to = shortDate(absence.endDate);
  if (from && to) return from === to ? `${base} ${from}` : `${base} ${from}–${to}`;
  if (to) return `${base} до ${to}`;
  return base;
}

/** Дата виходу на роботу — наступний день після кінця відсутності. */
export function formatReturnDate(absence: AvatarAbsence): string {
  if (!absence.endDate || absence.endDate.length < 10) return "";
  const next = new Date(`${absence.endDate}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const key = next.toISOString().slice(0, 10);
  return shortDate(key);
}

/** Рядок директорії → проп аватарки. null, якщо людина на місці. */
export function toAvatarAbsence(
  value?: { kind: string; startDate?: string | null; endDate?: string | null } | null
): AvatarAbsence | null {
  if (!value) return null;
  const kind =
    value.kind === "vacation" || value.kind === "sick_leave" || value.kind === "day_off"
      ? value.kind
      : "other";
  return { kind, startDate: value.startDate ?? null, endDate: value.endDate ?? null };
}
