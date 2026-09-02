/**
 * «Після якого викочування це почалось».
 *
 * Історія релізів і журнал помилок жили окремо: алерт казав, ЩО зламалось, і
 * мовчав про те, коли ця збірка приїхала в прод. Відповідь на «а що ми перед
 * цим викотили» доводилось шукати руками в двох розділах, звіряючи хвилини.
 *
 * ЧОМУ tosho.releases, А НЕ tosho.commits. Сторінка «Релізи» будується з
 * журналу комітів — вона відповідає на «що ЗРОБЛЕНО». Тут питання інше: код
 * ламає браузер людини не тоді, коли його написали, а тоді, коли викотили.
 *
 * ЧАС ВСЮДИ timestamptz. `released_at` ставить сама база значенням за
 * замовчуванням (writeRelease його не передає), `created_at` помилки приходить
 * із браузера — обидва нормалізовані в UTC, тож віднімати їх можна прямо.
 * Київський час з'являється лише на показі: formatReleaseMoment.
 *
 * ЦЕ НЕ ЗВИНУВАЧЕННЯ. Збіг у часі не робить реліз причиною, і формулювання
 * навмисно каже «почалось після», а не «через». Реліз поруч — привід глянути
 * діф першим, а не вирок.
 */

/** Реліз у тій формі, у якій його читають обидва боки. */
export type ReleaseLike = {
  released_at: string;
  commit_ref: string | null;
  changes: unknown;
};

export type AttributedRelease = {
  /** Людська назва: перший переказаний рядок релізу, інакше тема коміта. */
  title: string;
  /** Короткий sha — сім знаків, як у git log --oneline. */
  shortRef: string;
  releasedAt: string;
  /** Скільки хвилин минуло від викочування до першої помилки. */
  minutesAfter: number;
};

/**
 * Скільки часу після викочування помилку ще варто з ним пов'язувати.
 *
 * Дві години — це компроміс, який просила картка. Менше — і провтикаємо
 * помилку, яку побачив перший, хто зайшов у CRM після деплою; більше — і в
 * «підозрюваних» опиниться будь-який реліз робочого дня, а підказка, яка
 * показує щось завжди, не показує нічого.
 */
export const RELEASE_WINDOW_MINUTES = 120;

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * Назва релізу для людини.
 *
 * Колонка `title` у tosho.releases не заповнюється (writeRelease її не пише),
 * тож беремо перший рядок змін — той самий текст, який керівництво читає в
 * «Релізах»: переказ, якщо він є, інакше тему коміта як вона є.
 */
export function releaseTitle(changes: unknown): string | null {
  if (!Array.isArray(changes)) return null;
  for (const change of changes) {
    if (!change || typeof change !== "object") continue;
    const row = change as Record<string, unknown>;
    const title = readString(row.plain) ?? readString(row.subject);
    if (title) return title;
  }
  return null;
}

/**
 * Найближчий реліз ПЕРЕД моментом, у межах вікна.
 *
 * `releases` можуть приїхати в будь-якому порядку: беремо максимум серед тих,
 * що встигли раніше за помилку. Реліз, що стався ПІСЛЯ, не розглядається
 * взагалі — інакше підказка казала б, що зламало те, чого на той момент у
 * проді ще не було.
 */
export function findReleaseBefore(
  errorAt: string | null | undefined,
  releases: ReleaseLike[],
  windowMinutes: number = RELEASE_WINDOW_MINUTES
): AttributedRelease | null {
  const errorTime = Date.parse(errorAt ?? "");
  if (Number.isNaN(errorTime)) return null;

  let best: { release: ReleaseLike; time: number } | null = null;
  for (const release of releases) {
    const time = Date.parse(release?.released_at ?? "");
    if (Number.isNaN(time) || time > errorTime) continue;
    if (!best || time > best.time) best = { release, time };
  }
  if (!best) return null;

  const minutesAfter = Math.floor((errorTime - best.time) / 60_000);
  if (minutesAfter > windowMinutes) return null;

  const ref = readString(best.release.commit_ref) ?? "";
  return {
    title: releaseTitle(best.release.changes) ?? "без опису змін",
    shortRef: ref.slice(0, 7),
    releasedAt: best.release.released_at,
    minutesAfter,
  };
}

/**
 * Реліз, що ДІЯВ на момент помилки, — без обмеження вікна.
 *
 * Питання інше, ніж в алерті: не «чи почалось після викочування», а «на якій
 * версії людина це побачила». Відповідь потрібна завжди, навіть коли останній
 * деплой був три дні тому — саме цього бракувало в журналі, де замість релізу
 * стояв ідентифікатор збірки на кшталт «0.0.0-mta19pm5».
 */
export function findReleaseActiveAt(
  errorAt: string | null | undefined,
  releases: ReleaseLike[]
): AttributedRelease | null {
  return findReleaseBefore(errorAt, releases, Number.POSITIVE_INFINITY);
}

/** Час викочування настінним київським — саме ним люди й міряють день. */
export function formatReleaseMoment(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("uk-UA", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Kiev",
  }).format(date);
}

/** «через 12 хв», «одразу», «через 1 год 5 хв» — без «0 хв» і без «120 хв». */
export function formatMinutesAfter(minutes: number): string {
  if (minutes <= 0) return "одразу";
  if (minutes < 60) return `через ${minutes} хв`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `через ${hours} год` : `через ${hours} год ${rest} хв`;
}

/** Дата з часом — для журналу, де реліз може бути й тижневої давнини. */
export function formatReleaseDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("uk-UA", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Kiev",
  }).format(date);
}

/**
 * Рядок для алерта: «Почалось через 12 хв після релізу: Великі вікна в
 * Прорахунках відкриваються швидше (48eab51, 14:20)».
 *
 * null тут не буває мовчазним: викликач мусить сказати й протилежне («поруч
 * релізу немає»), інакше відсутність рядка читалась би як «забули додати».
 */
export function formatReleaseAttribution(attributed: AttributedRelease | null): string {
  if (!attributed) return "Релізу поруч немає — почалось не після викочування.";
  const parts = [attributed.shortRef, formatReleaseMoment(attributed.releasedAt)].filter(Boolean);
  const suffix = parts.length > 0 ? ` (${parts.join(", ")})` : "";
  return `Почалось ${formatMinutesAfter(attributed.minutesAfter)} після релізу: ${attributed.title}${suffix}`;
}
