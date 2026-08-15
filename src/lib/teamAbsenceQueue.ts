/**
 * Порядок і вік заявок у черзі погоджень (вкладка «Команда → Запити»).
 *
 * Окремий модуль без Supabase — з тієї ж причини, що й teamAbsenceCalendar:
 * це чиста арифметика, і вона має перевірятись юнітами, а не очима.
 */
import { pluralUk } from "@/lib/lastSeen";

/**
 * Мінімум, потрібний для впорядкування. Структурний тип, а не TeamAbsence,
 * навмисно: інакше модуль потягнув би за собою супабейс-клієнт і перестав би
 * бути тестованим.
 */
export type AbsenceQueueItem = {
  id: string;
  /** YYYY-MM-DD */
  startDate: string;
  createdAt: string | null;
};

/**
 * Порядок у списках заявок: спершу за датою ПОДАННЯ, новіші вгорі.
 *
 * Один напрямок на всю вкладку. До REQ-22 «На погодженні» сортувалось за
 * початком відсутності за зростанням, а «Мої відсутності» просто під ним — за
 * спаданням: одна вкладка, два взаємно протилежні правила, і жодне ніде не
 * підписане. Плюс сам ключ був не той: заявка, подана сьогодні на грудень,
 * лягала в кінець черги, хоч прилетіла щойно.
 *
 * Дата початку лишається другим ключем — для старих рядків, де `created_at`
 * може бути порожній, і щоб порядок не стрибав у заявок, поданих однією
 * секундою; третій ключ — id, щоб сортування було стабільним.
 */
export function sortAbsencesByNewest<T extends AbsenceQueueItem>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const aCreated = a.createdAt ? new Date(a.createdAt).getTime() : NaN;
    const bCreated = b.createdAt ? new Date(b.createdAt).getTime() : NaN;
    const aOk = !Number.isNaN(aCreated);
    const bOk = !Number.isNaN(bCreated);
    if (aOk && bOk && aCreated !== bCreated) return bCreated - aCreated;
    // Рядок без дати подання не має витісняти той, у якого вона є: інакше
    // старий запис без created_at назавжди осідав би вгорі черги.
    if (aOk !== bOk) return aOk ? -1 : 1;
    const byStart = b.startDate.localeCompare(a.startDate);
    return byStart !== 0 ? byStart : a.id.localeCompare(b.id);
  });
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Початок доби — щоб «вчора о 23:50» було вчора, а не «менш ніж добу тому». */
function startOfDayMs(value: Date): number {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
}

/**
 * Скільки календарних днів заявка чекає рішення. null — дати подання немає.
 *
 * Число окремо від підпису навмисно: підпис читає людина, а число потрібне
 * тому, хто вирішує, чи підсвічувати задавнену заявку. Розбирати підпис назад
 * («чи є там слово „днів“») — найтихіший спосіб зламатись.
 */
export function absenceWaitingDays(
  createdAt: string | null | undefined,
  now: Date = new Date()
): number | null {
  if (!createdAt) return null;
  const created = new Date(createdAt).getTime();
  if (Number.isNaN(created)) return null;
  return Math.max(0, Math.round((startOfDayMs(now) - startOfDayMs(new Date(created))) / DAY_MS));
}

/**
 * «подано сьогодні», «подано 3 дні тому» — вік заявки в рядку.
 *
 * Шкала груба навмисно: у черзі погоджень треба «давно чи ні», а не години.
 * Після місяця показуємо дату — «подано 47 днів тому» вже нічого не додає.
 */
export function formatAbsenceSubmittedAgo(
  createdAt: string | null | undefined,
  now: Date = new Date()
): string | null {
  const days = absenceWaitingDays(createdAt, now);
  if (days === null) return null;
  if (days === 0) return "подано сьогодні";
  if (days === 1) return "подано вчора";
  if (days <= 30) return `подано ${pluralUk(days, "день", "дні", "днів")} тому`;
  return `подано ${new Intl.DateTimeFormat("uk-UA", {
    timeZone: "Europe/Kiev",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(createdAt as string))}`;
}
