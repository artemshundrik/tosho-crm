import type { Tone } from "@/lib/statusTones";

/**
 * Модель «Огляду»: що сторінка показує, незалежно від того, звідки взялись дані.
 *
 * ГОЛОВНА ІДЕЯ. Огляд відповідає на питання «що мені зараз робити», а не «як
 * справи в компанії». Для власника ці два питання збігаються, для решти — ні,
 * і саме тому стара сторінка з одним прапорцем «керівник / решта» була
 * однаково марною для дизайнера, бухгалтера й логіста.
 *
 * Тому центральна сутність тут — не метрика, а РЯДОК ЧЕРГИ: конкретна справа з
 * посиланням, яку видно, поки її не зробили.
 */

/**
 * Смуга черги. Групуємо за НАСЛІДКОМ, а не за модулем.
 *
 * «Горить» — уже прострочено або блокує когось іншого; «Сьогодні» — те, що
 * має зрушити за цю зміну; «Далі» — видиме, але не термінове. Групування за
 * модулем («Прорахунки», «Дизайн») тут не працює: людина не питає «що там у
 * дизайні», вона питає «з чого почати».
 */
export type OverviewLane = "now" | "today" | "later";

export const OVERVIEW_LANES: OverviewLane[] = ["now", "today", "later"];

export const OVERVIEW_LANE_LABEL: Record<OverviewLane, string> = {
  now: "Горить",
  today: "Сьогодні",
  later: "Далі",
};

export const OVERVIEW_LANE_TONE: Record<OverviewLane, Tone> = {
  now: "danger",
  today: "warning",
  later: "neutral",
};

export type OverviewQueueItem = {
  id: string;
  lane: OverviewLane;
  /** Звідки рядок — «Прорахунки», «Дизайн». Чипс, а не іконка: назва однозначна. */
  chip: string;
  chipTone: Tone;
  /** Номер сутності: TS-0826-0143. Порожньо — рядок не про пронумеровану річ. */
  code: string | null;
  title: string;
  subtitle: string;
  /** Правий стовпчик: «9 днів», «сьогодні», «прострочено 2 дні». */
  when: string;
  whenTone: Tone;
  to: string;
  /**
   * Ключ сутності для дедуплікації: `id` прорахунку або дизайн-задачі.
   *
   * ЧОМУ НЕ ПОСИЛАННЯ, ЯК БУЛО СПОЧАТКУ. Дедуплікація за `to` працює лише
   * поки кожен рядок веде на власну сторінку. Щойно зʼявились зведені рядки
   * («Прорахунки без відповідального»), усі вони почали вести в `/orders/
   * estimates` — і склеїлись в один, мовчки зʼївши сусідів. Порожньо тут
   * означає «рядок унікальний сам по собі», тобто зведення.
   */
  entityKey?: string;
  entityName: string | null;
  entityLogoUrl: string | null;
  /**
   * Порядок усередині смуги — менше значення вище.
   *
   * Рахується з віку/прострочення в днях зі знаком «мінус», тож найгостріше
   * завжди зверху, і сортування не залежить від того, в якому порядку
   * будівник додавав рядки.
   */
  rank: number;
};

export type OverviewHero = {
  label: string;
  value: number;
  /** Підпис праворуч від числа: «справ на мені зараз». */
  suffix: string;
  badge: { tone: Tone; text: string } | null;
  split: Array<{ key: string; label: string; weight: number; color: string }>;
  foot: Array<{ value: string; label: string }>;
  /** Що написати замість черги, коли робити нічого. */
  emptyText: string;
};

/** Рядок «ключ — значення» в бічній картці. */
export type OverviewFact = { key: string; label: string; value: string; tone?: Tone };

export type OverviewAsideCard =
  | { kind: "facts"; id: string; title: string; hint: string; rows: OverviewFact[]; to?: string; toLabel?: string }
  | {
      kind: "split";
      id: string;
      title: string;
      hint: string;
      parts: Array<{ key: string; label: string; weight: number; color: string }>;
      to?: string;
      toLabel?: string;
    }
  | { kind: "activity"; id: string; title: string; hint: string };

export type OverviewView = {
  /** «Мій робочий стіл», «Огляд команди» — підпис-бейдж над привітанням. */
  lensLabel: string;
  hero: OverviewHero;
  /** Те, що показуємо: перші рядки черги. */
  queue: OverviewQueueItem[];
  /** Скільки їх насправді. Число в героєві рахується звідси, а не з показаних. */
  queueTotal: number;
  aside: OverviewAsideCard[];
};

/* ── кольори смуги героя ───────────────────────────────────────────────────
   Не тони, а прямі токени заливки: смуга ділить за терміновістю, і три її
   кольори — це світлофор, а не статуси сутностей. Див. коментар у bento.tsx. */
export const SPLIT_COLOR: Record<OverviewLane, string> = {
  now: "bg-destructive",
  today: "bg-warning-solid",
  // Сіре, а не синє: смуга мусить збігатися з крапкою заголовка смуги «Далі»,
  // інакше та сама смуга називається двома кольорами на відстані 20 пікселів.
  later: "bg-muted-foreground/40",
};

/* ── дрібні перетворення часу ──────────────────────────────────────────────
   Дедлайни в CRM — настінний час (див. docs), тож порівнюємо календарні дні,
   а не мілісекунди: інакше «сьогодні о 23:50» і «завтра о 00:10» відрізняються
   на 20 хвилин, а показати їх треба по-різному. */

export const startOfDay = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate());

/** Скільки календарних днів від `from` до `to`. Минуле — відʼємне. */
export function dayDiff(from: Date, to: Date): number {
  const ms = startOfDay(to).getTime() - startOfDay(from).getTime();
  return Math.round(ms / 86_400_000);
}

export function parseDate(value?: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Скільки повних днів минуло від дати. Для «висить 9 днів». */
export function daysSince(value: string | null | undefined, now: Date): number | null {
  const parsed = parseDate(value);
  if (!parsed) return null;
  return Math.max(0, dayDiff(parsed, now));
}

const dayWord = (n: number) => {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "день";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "дні";
  return "днів";
};

/** «сьогодні», «завтра», «прострочено 3 дні», «через 5 днів». */
export function formatDeadline(deadline: Date, now: Date): { text: string; tone: Tone; overdueDays: number } {
  const diff = dayDiff(now, deadline);
  if (diff < 0) {
    const late = Math.abs(diff);
    return { text: `прострочено ${late} ${dayWord(late)}`, tone: "danger", overdueDays: late };
  }
  if (diff === 0) return { text: "сьогодні", tone: "warning", overdueDays: 0 };
  if (diff === 1) return { text: "завтра", tone: "warning", overdueDays: 0 };
  if (diff <= 7) return { text: `через ${diff} ${dayWord(diff)}`, tone: "neutral", overdueDays: 0 };
  return {
    text: deadline.toLocaleDateString("uk-UA", { day: "numeric", month: "short" }),
    tone: "neutral",
    overdueDays: 0,
  };
}

/** «9 днів» — вік рядка без дедлайну. */
export function formatAge(days: number): string {
  if (days <= 0) return "сьогодні";
  return `${days} ${dayWord(days)}`;
}
