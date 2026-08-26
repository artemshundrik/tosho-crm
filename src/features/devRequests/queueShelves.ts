import { isBlockedOnPerson } from "./columnDate";
import type { DevRequest } from "./types";

/**
 * Полиці «Черги» — вигляду, який відповідає на «за що хвататись».
 *
 * НАВІЩО НЕ КОЛОНКИ. Колонка каже, на якому етапі картка. Це правильне питання
 * для того, хто рухає роботу через процес, і зайве для того, хто щоранку обирає
 * наступну справу. Замір 26.08.2026: 27 карток із 50 стояли у «Вхідних» — тобто
 * 54% дошки в першій колонці, і три чверті ширини екрана займали майже порожні
 * стовпчики.
 *
 * ПОЛИЦІ ВІДПОВІДАЮТЬ НА РІЗНІ ПИТАННЯ, а не на різні етапи:
 *   `today`   — що я взяв на сьогодні (максимум три, обирає людина);
 *   `free`    — що можна брати просто зараз: нічого не блокує;
 *   `blocked` — що стоїть НЕ через мене: у чекліста є пункт «Чекає»;
 *   `shipped` — зроблено локально, чекає найближчого деплою;
 *   `triage`  — ще не розібрано; згорнуте, бо це робота на раз на тиждень.
 *
 * ЧОМУ ЦЕ ЧИСТА ФУНКЦІЯ. Полиці — це правила, а не верстка: «заблоковане не
 * може лежати в „можна брати“» має бути перевіряним твердженням, а не
 * випадковим наслідком порядку умов у JSX.
 */

export type QueueShelfId = "today" | "free" | "blocked" | "shipped" | "triage";

export type QueueShelves = Record<QueueShelfId, DevRequest[]>;

/** Скільки справ дозволено взяти на день. Обмеження — і є сенс полиці. */
export const TODAY_LIMIT = 3;

/**
 * Розкладка карток по полицях.
 *
 * ПОРЯДОК ПЕРЕВІРОК ВАЖЛИВИЙ і саме тому зафіксований тестами. Картка потрапляє
 * рівно на одну полицю, а перша ознака сильніша за наступні:
 *
 * 1. «Взято на сьогодні» — сильніше за все: якщо людина сама поклала картку в
 *    роботу на день, вона має бачити її вгорі, навіть коли та заблокована.
 * 2. «Не розібрано» — сильніше за «заблоковане»: нерозібрана картка не може
 *    претендувати ні на «беру», ні на «чекаю», бо про неї ще нічого не вирішено.
 * 3. «Готово локально» — окремо від решти: рішень не потребує, лише деплою.
 * 4. «Стоїть за людьми» — перед «можна брати», інакше картка, яка чекає на СЕО
 *    27 днів, лежала б у списку доступного й щодня марно претендувала на увагу.
 */
export function splitQueue(requests: DevRequest[], todayIds: readonly string[]): QueueShelves {
  const today = new Set(todayIds);
  const shelves: QueueShelves = { today: [], free: [], blocked: [], shipped: [], triage: [] };

  for (const request of requests) {
    if (today.has(request.id)) shelves.today.push(request);
    else if (request.status === "triage") shelves.triage.push(request);
    else if (request.status === "done_local") shelves.shipped.push(request);
    else if (isBlockedOnPerson(request)) shelves.blocked.push(request);
    else shelves.free.push(request);
  }

  return shelves;
}

/**
 * Чи можна цю картку взяти на сьогодні.
 *
 * Нерозібране й готове-локально сюди не пускаємо: перше ще не рішення, друге
 * рішень уже не потребує. Заблоковане пускаємо свідомо — буває, що саме сьогодні
 * ти й збираєшся вибити ту відповідь.
 */
export function canTakeToday(request: DevRequest): boolean {
  return request.status === "queued" || request.status === "in_progress";
}

/**
 * Чистка вибраного на сьогодні.
 *
 * Картка, яку викотили або відхилили, зникає з полиці сама — інакше «Сьогодні»
 * за тиждень перетворилась би на список позавчорашніх намірів, а місця в ній
 * рівно три. Порядок збережених id зберігаємо: він і є порядком, у якому людина
 * їх туди клала.
 */
export function pruneToday(ids: readonly string[], requests: DevRequest[]): string[] {
  const alive = new Map(requests.map((request) => [request.id, request]));
  return ids.filter((id) => {
    const request = alive.get(id);
    return request ? canTakeToday(request) : false;
  });
}

/**
 * Вибране на сьогодні переживає перезавантаження сторінки.
 *
 * localStorage, а не база, і це свідомо: «сьогодні» — особиста замітка однієї
 * людини на один день, а не факт про картку. У базі вона стала б полем, яке
 * хтось має вчасно чистити, і ще одним станом, який може розійтися зі статусом.
 * Той самий підхід, що й у перемикача групування (grouping.ts).
 */
const TODAY_STORAGE_KEY = "devRequests.today";

export function readTodayIds(): string[] {
  try {
    const raw = localStorage.getItem(TODAY_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    // Чуже або зіпсоване значення читаємо як порожній список: втратити три
    // особисті замітки дешевше, ніж упасти на рендері дошки.
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export function writeTodayIds(ids: readonly string[]) {
  try {
    localStorage.setItem(TODAY_STORAGE_KEY, JSON.stringify(ids.slice(0, TODAY_LIMIT)));
  } catch {
    // Приватний режим або переповнене сховище — полиця просто не переживе
    // перезавантаження. Мовчки: ламати роботу через замітку не варто.
  }
}
