import type { AccessRole, JobRole, TeamRole } from '@/lib/permissions';
import type { ModuleAccess } from '@/lib/moduleAccess';

/**
 * Пам'ять про робочий контекст людини між сеансами.
 *
 * НАВІЩО. Кожна сторінка CRM чекає на `teamId`: на ньому тримається вся RLS
 * даних (48 таблиць у tosho), тож поки він невідомий, картка прорахунку не має
 * права нічого спитати. А дізнаємось ми його по мережі — дві хвилі запитів
 * після старту. Заміряно 21.08.2026 на проді: запити картки стартували на
 * 3670 мс, хоча чанк сторінки лежав готовий уже на 1727 мс.
 *
 * При цьому команда в CRM ОДНА (перевірено в базі: 1 рядок у public.teams,
 * у всіх 23 людей та сама), і в конкретної людини вона не змінюється. Тобто
 * ми щоразу платимо мережею за відповідь, яку вже знали минулого разу.
 *
 * Це НЕ «зашити одну команду в код»: значення лишається персональним, а
 * справжнє все одно резолвиться у фоні й виправляє збережене, якщо розійшлось.
 * З'явиться друга команда чи людина перейде — наступний старт це підхопить.
 *
 * ЧОМУ ТУТ Є Й РОЛІ, А НЕ ЛИШЕ teamId. Без ролей виграшу немає: ефект, який
 * читає картку доступів (`moduleAccess`), залежить від accessRole/jobRole.
 * Поки вони порожні, він устигає сходити в мережу, а тоді ролі приїжджають,
 * ефект скасовується і йде по дані вдруге — і вже ЦЕ тримає монтування
 * сторінки. Заміряно на зібраній збірці: ролі о 688 мс → повторний похід →
 * доступи о 1014 мс → монтування о 1024 мс. Тож кешуємо весь контекст.
 *
 * Ролі тут — підказка для першого кадру, а не право. Справжній кордон — RLS у
 * базі й перевірки в Netlify-функціях; підроблене значення в localStorage дає
 * рівно те саме, що й правка змінної в консолі, і живе до першої фонової
 * звірки. Показувати меню — не те саме, що віддавати дані.
 */
export type TeamContextSnapshot = {
  teamId: string;
  role: TeamRole;
  accessRole: AccessRole;
  jobRole: JobRole;
  /**
   * Картка доступів із минулого разу.
   *
   * Лежить поруч із командою не для швидкості показу меню, а щоб контекст
   * авторизації не мінявся ПІСЛЯ першого кадру. Коли доступи приїжджають
   * окремо й пізно, значення в контексті підмінюється, піддерево маршруту
   * перезбирається — і сторінка монтується вдруге, заново питаючи всі свої
   * дані. Заміряно на зібраній збірці: монтування о 624 мс, доступи о 759 мс,
   * повторне монтування о 765 мс.
   */
  moduleAccess: ModuleAccess | null;
};

type StoredTeamContext = TeamContextSnapshot & { userId: string };

const STORAGE_KEY = 'tosho.team-context.v1';

const readStored = (): StoredTeamContext | null => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredTeamContext> | null;
    if (!parsed || typeof parsed.userId !== 'string' || typeof parsed.teamId !== 'string') return null;
    return parsed as StoredTeamContext;
  } catch {
    // Приватний режим, вимкнене сховище або чужий формат — не привід падати.
    return null;
  }
};

/**
 * Контекст ЦІЄЇ людини, якщо ми його вже бачили.
 *
 * Ключ по userId навмисно всередині значення, а не в назві ключа: так у
 * сховищі лишається рівно один запис, і чужий контекст неможливо прочитати
 * навіть випадково — id не збігся, повертаємо null.
 */
export function readCachedTeamContext(userId: string | null | undefined): TeamContextSnapshot | null {
  if (!userId) return null;
  const stored = readStored();
  if (!stored || stored.userId !== userId) return null;
  return {
    teamId: stored.teamId,
    role: stored.role ?? null,
    accessRole: stored.accessRole ?? null,
    jobRole: stored.jobRole ?? null,
    moduleAccess: stored.moduleAccess ?? null,
  };
}

/**
 * Запам'ятати контекст після справжнього резолву.
 *
 * `teamId` без значення не зберігаємо: порожній кеш нічого не пришвидшує, зате
 * створив би враження, що ми вже все знаємо.
 */
export function writeCachedTeamContext(userId: string | null | undefined, snapshot: {
  teamId: string | null;
  role: TeamRole;
  accessRole: AccessRole;
  jobRole: JobRole;
}): void {
  if (!userId || !snapshot.teamId) return;
  const previous = readStored();
  persist({
    userId,
    teamId: snapshot.teamId,
    role: snapshot.role ?? null,
    accessRole: snapshot.accessRole ?? null,
    jobRole: snapshot.jobRole ?? null,
    // Доступи приходять іншим шляхом — те, що вже збережене за цією людиною,
    // не затираємо.
    moduleAccess: previous?.userId === userId ? previous.moduleAccess ?? null : null,
  });
}

/**
 * Доповнити збережений контекст карткою доступів.
 *
 * Окремо від `writeCachedTeamContext`, бо доступи резолвить інший ефект і в
 * інший момент. Якщо команди ще немає, писати нічого: запис без `teamId`
 * не пришвидшує наступний старт.
 */
export function writeCachedModuleAccess(
  userId: string | null | undefined,
  moduleAccess: ModuleAccess | null | undefined
): void {
  if (!userId || !moduleAccess) return;
  const previous = readStored();
  if (!previous || previous.userId !== userId) return;
  persist({ ...previous, moduleAccess });
}

const persist = (next: StoredTeamContext) => {
  try {
    const serialized = JSON.stringify(next);
    // Контекст перечитується на кожен фокус вкладки, а міняється майже ніколи.
    // Зайвий запис нічого не ламає, але й сенсу не має.
    if (window.localStorage.getItem(STORAGE_KEY) === serialized) return;
    window.localStorage.setItem(STORAGE_KEY, serialized);
  } catch {
    // Сховище переповнене або заборонене — працюємо як і раніше, по мережі.
  }
};

/** Вихід із системи: чужому за цим компом контекст попереднього не потрібен. */
export function clearCachedTeamContext(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Немає доступу до сховища — нема чого й чистити.
  }
}
