/**
 * Версія в імені файлу дизайнера.
 *
 * НАВІЩО: ім'я файлу — єдине, що виживає за межами CRM. Файл їде в
 * прорахунок, у пошту клієнту, в Downloads, у друкарню — і там немає ні
 * привʼязки до раунду правок, ні картки задачі. Коли після правки дизайнер
 * вантажить нову версію під тим самим імʼям, у теці зʼявляється
 * «ToSho_футболка.webp» і «ToSho_футболка (1).webp», і фінал уже не
 * відрізнити від чернетки.
 *
 * ПРАВИЛО: версію призначає СИСТЕМА, а не людина (інакше маємо класику
 * «final», «final2», «new_final_2»). Перше завантаження — v1 (без суфікса, бо
 * це найчастіший випадок і зайвий шум нікому не потрібен). Далі номер
 * піднімається на ОДИНИЦЮ щоразу, коли після попереднього завантаження
 * зʼявилась хоча б одна нова правка.
 *
 * Чому саме так, а не «скільки всього правок»:
 *   · клієнт часто подає кілька правок одним списком, а дизайнер віддає за
 *     них ОДНУ нову версію — рахунок по правках роздував би номер;
 *   · дизайнер може перезалити виправлений файл у тому самому раунді — це
 *     та сама версія, а не наступна;
 *   · макет, зроблений уперше після трьох правок по візуалах, — це його
 *     ПЕРША версія, тож рахунок ведеться в межах свого виду (візуал/макет).
 *
 * Поточний номер читається назад із імен уже завантажених файлів: ім'я і є
 * носієм правди, тож логіка самовідновлюється, навіть якщо щось пішло не так.
 *
 * Ручні позначки версії, які дизайнер написав сам («_v2», «(1)», « v 3»),
 * зрізаються перед тим, як дописати канонічну: два джерела правди в одному
 * імені гірші за одне чуже.
 */

/** Перша версія — та, що до будь-яких правок. Суфікса не отримує. */
export const DESIGN_OUTPUT_FIRST_VERSION = 1;

/**
 * Хвіст «версії» в кінці базового імені: `_v2`, `-в3`, ` v 4`, `(1)`.
 * Голі числа (`Мокап 2`) навмисно НЕ чіпаємо — там цифра частіше означає
 * варіант, а не версію.
 */
const VERSION_MARKER = /(?:[ _.-]*[vв]\s?\d+|[ _.-]*\(\s*\d+\s*\))\s*$/i;

/** Той самий хвіст, але з номером — для читання версії назад з імені. */
const VERSION_READER = /[ _.-]*[vв]\s?(\d+)\s*$/i;

type ChangeRequestLike = { status?: string | null; requested_at?: string | null };
type OutputFileLike = { file_name?: string | null; created_at?: string | null };

function timestampOf(value: string | null | undefined): number {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function splitFileName(fileName: string): { base: string; ext: string } {
  const dot = fileName.lastIndexOf(".");
  // dot > 0 — щоб «.gitignore» лишився іменем, а не став розширенням.
  if (dot > 0) return { base: fileName.slice(0, dot), ext: fileName.slice(dot) };
  return { base: fileName, ext: "" };
}

/** Прибирає ручні позначки версії з кінця базового імені (без розширення). */
export function stripVersionSuffix(base: string): string {
  let out = base;
  // Цикл, бо позначки складаються: «макет_v2 (1)».
  for (let guard = 0; guard < 5; guard += 1) {
    const next = out.replace(VERSION_MARKER, "").trimEnd();
    if (next === out) break;
    out = next;
  }
  const trimmed = out.trim();
  // Ім'я, яке ЦІЛКОМ складається з позначки («v2.webp»), лишаємо як є:
  // порожня назва гірша за дивну.
  return trimmed || base.trim();
}

/**
 * Яку версію отримає файл, завантажений просто зараз.
 *
 * `existingFiles` — уже завантажені файли ТОГО САМОГО виду (візуали окремо,
 * макети окремо). Відхилені правки не рахуються: за ними дизайнер нічого не
 * переробляв.
 */
export function resolveDesignOutputVersion(input: {
  changeRequests?: readonly ChangeRequestLike[] | null;
  existingFiles?: readonly OutputFileLike[] | null;
}): number {
  const existingFiles = Array.isArray(input?.existingFiles) ? input.existingFiles : [];
  // Ще нічого не віддавали — це перша версія, скільки б правок не було
  // подано по сусідньому виду файлів.
  if (existingFiles.length === 0) return DESIGN_OUTPUT_FIRST_VERSION;

  const currentVersion = existingFiles.reduce(
    (max, file) => Math.max(max, parseDesignOutputVersion(file?.file_name) ?? DESIGN_OUTPUT_FIRST_VERSION),
    DESIGN_OUTPUT_FIRST_VERSION
  );
  const lastUploadAt = existingFiles.reduce((max, file) => Math.max(max, timestampOf(file?.created_at)), 0);

  const changeRequests = Array.isArray(input?.changeRequests) ? input.changeRequests : [];
  const hasFreshRequest = changeRequests.some(
    (row) => (row?.status ?? "pending") !== "rejected" && timestampOf(row?.requested_at) > lastUploadAt
  );

  // Нових правок після останнього завантаження немає — це той самий раунд
  // (дизайнер перезаливає виправлений файл), номер не рухаємо.
  return hasFreshRequest ? currentVersion + 1 : currentVersion;
}

/** Дописує канонічний суфікс версії перед розширенням. */
export function applyDesignOutputVersion(fileName: string, version: number): string {
  const source = typeof fileName === "string" ? fileName.trim() : "";
  if (!source) return fileName;
  const { base, ext } = splitFileName(source);
  const cleanBase = stripVersionSuffix(base);
  const safeVersion = Number.isFinite(version) ? Math.max(DESIGN_OUTPUT_FIRST_VERSION, Math.trunc(version)) : DESIGN_OUTPUT_FIRST_VERSION;
  if (safeVersion <= DESIGN_OUTPUT_FIRST_VERSION) return `${cleanBase}${ext}`;
  return `${cleanBase}_v${safeVersion}${ext}`;
}

/**
 * Читає версію назад з імені — для бейджа на картці файлу.
 * null означає «версії в імені немає» (v1 або файл, завантажений до цієї зміни).
 */
export function parseDesignOutputVersion(fileName: string | null | undefined): number | null {
  if (!fileName || typeof fileName !== "string") return null;
  const { base } = splitFileName(fileName.trim());
  const match = base.match(VERSION_READER);
  if (!match) return null;
  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}
