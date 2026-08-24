import type { ComponentType } from "react";
import {
  Bug,
  CircleSlash,
  Database,
  Gauge,
  Hammer,
  Inbox,
  Info,
  KeyRound,
  Laptop,
  Lightbulb,
  ListTodo,
  MousePointerClick,
  Plus,
  Rocket,
  SwatchBook,
  Workflow,
} from "lucide-react";

import { MODULE_DEFINITIONS } from "@/lib/moduleAccess";
import { offBoardStatuses, onBoardColumns } from "@/lib/kanbanBoards";
import { parseChecklist, type ChecklistItem } from "./checklist";
import { isKnownModuleKey } from "@/lib/projectMap";
import type { Tone } from "@/lib/statusTones";

/**
 * Перші п'ять — колонки дошки в порядку зліва направо. Два останні колонок не
 * мають і живуть окремими списками за перемиканням (див. BOARD_COLUMNS).
 */
export const REQUEST_STATUSES = [
  "triage",
  "queued",
  "in_progress",
  "done_local",
  "released",
  "wont_do",
  "someday",
] as const;

export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const REQUEST_KINDS = ["bug", "friction", "feature"] as const;
export type RequestKind = (typeof REQUEST_KINDS)[number];

export const REQUEST_PRIORITIES = ["low", "normal", "high"] as const;
export type RequestPriority = (typeof REQUEST_PRIORITIES)[number];

/**
 * Зона роботи — друга вісь картки, поруч із `kind`.
 *
 * `kind` каже, ЩО СТАЛОСЬ, і це знає той, хто просить. Зона каже, ЩО ЧІПАЄМО,
 * і це видно лише після розбору. Дві осі, бо вони не є підвидами одна одної:
 * «бухгалтер бачить собівартість» — це одночасно `bug` і робота з доступами,
 * і жодне зі значень не можна викинути. Спроба скласти їх в один список типів
 * ламається на першому ж такому запиті.
 */
/**
 * ПОРЯДОК — за очікуваною частотою: саме в ньому зони стоять у фільтрі й у
 * формі, і першими мають бути ті, які обирають щодня.
 *
 * `ux` доданий 2026-08-09, коли замір показав, що вісь не працює: 12 карток із
 * 17 лежали в `logic`, бо в CRM майже все є «що система робить». Тепер `logic`
 * ВУЗЬКИЙ — саме правила й розрахунки, — а «як людина цим користується» пішло
 * в окрему зону. На тих самих 17 картках розклад став 5/6/4/2 замість 12.
 *
 * Ключі лишились старі (`polish` замість `ui`, `logic` замість `rules`) —
 * навмисно: вони лежать у базі, і перейменування знецінило б зону на всіх
 * наявних картках доти, доки не викотиться новий фронт. Підпис і ключ тут
 * розходяться так само, як у модуля `nova_poshta` з підписом «Інтеграції».
 */
export const REQUEST_ZONES = ["polish", "ux", "logic", "data", "access", "speed"] as const;
export type RequestZone = (typeof REQUEST_ZONES)[number];

export type DevRequest = {
  id: string;
  number: number;
  /** Готовий підпис «REQ-42» — щоб не збирати його в кожному компоненті. */
  label: string;
  teamId: string;
  title: string;
  body: string;
  kind: RequestKind;
  status: RequestStatus;
  /** Напрямок CRM — ключ модуля з реєстру. Невідомий ключ читаємо як «немає». */
  moduleKey: string | null;
  priority: RequestPriority | null;
  /** Що чіпаємо. Порожньо — картку ще не розбирали. */
  zone: RequestZone | null;
  /** Коли поїхало в прод. Ставить плагін релізів; null — ще не викочено. */
  releasedAt: string | null;
  /** Вільна мітка-тема: групує картки однієї роботи замість дерева підзадач. */
  theme: string | null;
  /** Пункти великої задачі. Порожній масив — звичайна картка. */
  checklist: ChecklistItem[];
  /** Напрямок і пріоритет проставив розбір, а не людина. */
  autoClassified: boolean;
  isPrivate: boolean;
  authorUserId: string | null;
  tgUsername: string | null;
  /** Ім'я автора з Telegram: username там необов'язковий. */
  displayName: string | null;
  askedByCount: number;
  /**
   * Короткі sha комітів, якими картку закрили (7 символів, як у гаку).
   * У `tosho.commits` вони по 8 — звіряти доводиться початком рядка.
   */
  commitShas: string[];
  createdAt: string;
};

/**
 * Підписи станів. Один список на дошку й на історію змін: у стрічці «Стан на
 * дошці: У черзі → В роботі» мають стояти рівно ті слова, що на колонках.
 *
 * «Вхідні», а НЕ «Треба уточнити». Статус triage означає «щойно прилетіло, ще
 * не розбирали» — це кошик входу, а не діагноз картці. Старий підпис читався
 * як «в картці бракує інформації», тож зрозумілі задачі з Cowork і Telegram
 * виглядали браком, хоч із ними все гаразд. Не повертайте назад: «уточнити» —
 * це стан ОДНІЄЇ картки, а не колонки, і живе він у тексті картки, а не в
 * підписі стовпчика.
 */
export const STATUS_LABELS: Record<RequestStatus, string> = {
  triage: "Вхідні",
  queued: "У черзі",
  in_progress: "В роботі",
  done_local: "Готово локально",
  released: "Викочено",
  wont_do: "Не робимо",
  someday: "Ідеї",
};

/**
 * Іконка й тон СТАТУСУ — для всіх семи, а не лише для колонок дошки.
 *
 * BOARD_COLUMNS нижче описує п'ять етапів, але дровер картки відкривають ще й
 * зі списків «Ідеї» та «Не робимо», і статус там треба показати теж. Тримати
 * для цього другий набір іконок означало б, що «Вхідні» на дошці й «Вхідні» у
 * дровері колись розійдуться.
 *
 * Тон «Не робимо» — neutral, а не danger: відхилена картка не аварія, це
 * рішення. Червоне тут кричало б про помилку там, де її немає.
 */
export const STATUS_ICONS: Record<RequestStatus, ComponentType<{ className?: string }>> = {
  triage: Inbox,
  queued: ListTodo,
  in_progress: Hammer,
  done_local: Laptop,
  released: Rocket,
  someday: Lightbulb,
  wont_do: CircleSlash,
};

export const STATUS_TONE: Record<RequestStatus, Tone> = {
  triage: "warning",
  queued: "neutral",
  in_progress: "info",
  done_local: "accent",
  released: "success",
  someday: "neutral",
  wont_do: "neutral",
};

/**
 * КОЛОНОК П'ЯТЬ. «Не робимо» і «Ідеї» сюди НЕ додаються — ніколи.
 *
 * Дошка показує роботу в польоті: кожна колонка — етап, який картка проходить
 * і залишає. «Не робимо» — тупик, а «Ідеї» — купа «хочеться, але не зараз»,
 * тобто те, за що ніхто не брався й не збирається найближчим часом. Обидва
 * стани роботою не є, і шостий стовпчик перетворив би їх на етап самим фактом
 * того, що стоїть у ряду з рештою.
 *
 * ЩО ЛАМАЄТЬСЯ, ЯКЩО ДОДАТИ. Черга перестає щось означати. Саме через це
 * «Ідеї» й заводили: «колись зроблю» лежало в «У черзі» разом із роботою, на
 * яку виділено час, і за довжиною черги не було видно, скільки роботи справді
 * попереду. Колонка «Ідеї» повертає рівно ту саму ваду на рівень дошки: очі
 * рахують усі стовпчики разом, і купа «колись» знову починає виглядати планом.
 *
 * ДЕ ВОНИ ЖИВУТЬ НАСПРАВДІ: окремими списками за перемиканням у тулбарі
 * (DevRequestsPage — «Дошка / Ідеї / Не робимо»). Це не обхідний шлях і не
 * тимчасове рішення, поки «руки не дійшли зробити колонку», — це і є задум.
 *
 * Тому: якщо ви прийшли сюди «полагодити» відсутню колонку — не треба. Картку
 * кладуть в «Ідеї» дією в меню («В ідеї»), повертають дією «У чергу», і саме
 * так це має лишатись. Тест «колонки дошки» у types.test.ts стоїть на сторожі
 * цього рішення навмисно.
 *
 * Форма запису підігнана під наявний KanbanColumnHeader — він приймає рівно
 * { icon, toneClassName, label, count } і поля «підказка» не має.
 *
 * toneClassName бере класи ТІЛЬКИ з реєстру src/lib/statusTones.ts
 * (tone-text-neutral/info/accent/success/warning/danger/festive) — інших
 * tone-text-* класів у проєкті немає. Тому «жовтий/синій/фіолетовий/зелений»
 * зі спеки лягли на найближчі канонічні тони: amber→warning, blue→info,
 * violet→accent (як і pm_review в дизайн-задачах), emerald→success.
 */
export const BOARD_COLUMNS: Array<{
  status: RequestStatus;
  label: string;
  icon: ComponentType<{ className?: string }>;
  toneClassName?: string;
}> = onBoardColumns("devRequests", [
  // Підписи беруться зі STATUS_LABELS — див. коментар там, зокрема про те,
  // чому колонка називається «Вхідні», а не «Треба уточнити».
  { status: "triage", label: STATUS_LABELS.triage, icon: STATUS_ICONS.triage, toneClassName: "tone-text-warning" },
  { status: "queued", label: STATUS_LABELS.queued, icon: STATUS_ICONS.queued },
  { status: "in_progress", label: STATUS_LABELS.in_progress, icon: STATUS_ICONS.in_progress, toneClassName: "tone-text-info" },
  // Ноутбук, а не пакунок: «локально» тут — це «на моєму компʼютері, у прод ще
  // не поїхало». Пакунок читався як щось спаковане й готове до відправлення —
  // тобто рівно навпаки, і плутав саме там, де різниця найважливіша.
  { status: "done_local", label: STATUS_LABELS.done_local, icon: STATUS_ICONS.done_local, toneClassName: "tone-text-accent" },
  { status: "released", label: STATUS_LABELS.released, icon: STATUS_ICONS.released, toneClassName: "tone-text-success" },
  // Склад стовпчиків тепер відсіює реєстр канбанів (@/lib/kanbanBoards) — той
  // самий, що й на прорахунках, дизайні й замовленнях. Дописати сюди «Ідеї» чи
  // «Не робимо» вже недосить: у реєстрі вони в offBoard, і на дошку не пройдуть.
], (column) => column.status);

/**
 * Стани поза дошкою: кожен показується власним СПИСКОМ за перемиканням у
 * тулбарі, а не колонкою (чому саме так — розгорнуто над BOARD_COLUMNS).
 * Порядок тут = порядок кнопок перемикача після «Дошки».
 */
export const OFF_BOARD_STATUSES = offBoardStatuses("devRequests") as readonly RequestStatus[];
/**
 * Тип лишається явним переліком: масив вище приходить із реєстру як рядки, і
 * звузити його назад до літералів без дублювання значень не вийде. Те, що ці
 * два джерела не розійшлись, стереже тест у kanbanBoards.test.ts.
 */
export type OffBoardStatus = "someday" | "wont_do";

/**
 * ВІДКРИТА ЧЕРГА — те, що справді попереду.
 *
 * Перелік ДОЗВОЛЕНИХ, а не заборонених, і це принципово. Раніше «відкрите»
 * описувалось відніманням («усе, крім released і wont_do»), і кожен новий стан
 * мовчки потрапляв у чергу, поки хтось не згадає дописати його у виняток. Саме
 * так «Ідеї» ледь не опинились у списку, з якого їх і виносили. З дозвільним
 * переліком новий стан за замовчуванням поза чергою — і щоб він туди потрапив,
 * його треба дописати сюди свідомо.
 *
 * Дзеркало OPEN_STATUSES із netlify/functions/_lib/devRequestBoard.ts: те саме
 * питання «що відкрито» для дошки, ендпоінта й бота має мати одну відповідь.
 */
export const OPEN_STATUSES: readonly RequestStatus[] = [
  "triage",
  "queued",
  "in_progress",
  "done_local",
];

export function isOpenRequestStatus(status: RequestStatus): boolean {
  return OPEN_STATUSES.includes(status);
}

/**
 * Через скільки днів викочене йде з дошки в архів.
 *
 * Місяць — це приблизно та відстань, на якій «щойно поїхало» перестає бути
 * новиною: результат своєї заявки людина встигає побачити, а колонка не
 * перетворюється на стрічку за всю історію.
 */
export const ARCHIVE_AFTER_DAYS = 30;

const DAY_MS = 86_400_000;

/**
 * Архів — ПРАВИЛО НА ЧИТАННІ, а не колонка зі станом.
 *
 * Свідомо без `archived_at` і без крона: дата викочення вже лежить у картці,
 * тож архівність — це питання до даних, а не ще одне поле, яке хтось має
 * вчасно проставити. Крон, який тихо не спрацював, у нас уже був — і поки він
 * мовчав, дошка показувала б неправду з виглядом правди.
 *
 * Стосується лише «Викочено»: це єдиний стан, який росте нескінченно і має
 * надійну дату. «Ідеї» не архівуються взагалі — вони не завершені, а
 * відкладені.
 */
export function isArchivedRequest(request: Pick<DevRequest, "status" | "releasedAt">, now: Date): boolean {
  if (request.status !== "released" || !request.releasedAt) return false;
  const releasedMs = new Date(request.releasedAt).getTime();
  if (Number.isNaN(releasedMs)) return false;
  return now.getTime() - releasedMs > ARCHIVE_AFTER_DAYS * DAY_MS;
}

export const KIND_LABELS: Record<RequestKind, string> = {
  bug: "Не працює",
  friction: "Незручно",
  feature: "Нова можливість",
};

/**
 * Тон типу запиту. Береться з реєстру тонів (src/lib/statusTones.ts), свого
 * набору кольорів картка не заводить: «не працює» звучить як помилка (danger),
 * «незручно» — як попередження (warning), «нова можливість» — як щось нове
 * (accent, той самий тон, що й «Готово локально» на дошці).
 */
export const KIND_TONE: Record<RequestKind, Tone> = {
  bug: "danger",
  friction: "warning",
  feature: "accent",
};

/**
 * Іконка типу. Потрібна не для краси: тип у верхньому рядку картки позначений
 * кольором, а колір сам по собі не читається дальтоніком і не переживає
 * чорно-білий друк дошки. Слово + іконка + тон — три канали на одне значення.
 */
export const KIND_ICONS: Record<RequestKind, ComponentType<{ className?: string }>> = {
  bug: Bug,
  friction: Info,
  feature: Plus,
};

/** Підписи зони. Малою літерою: на картці це мітка, а не заголовок. */
export const ZONE_LABELS: Record<RequestZone, string> = {
  polish: "вигляд",
  ux: "взаємодія",
  // Було «логіка» — під цим словом опинялась будь-яка робота, бо «логіка» в
  // коді є скрізь. «Правила» звужують до того, що справді розрізняє: умови,
  // статуси, розрахунки.
  logic: "правила",
  data: "дані",
  access: "доступи",
  speed: "швидкість",
};

/**
 * Тон зони — з того самого реєстру тонів, що й `KIND_TONE`.
 *
 * Тони між двома осями подекуди збігаються (`access` і `bug` обидва danger), і
 * це навмисно: тон каже про характер ризику, а не про вісь. Плутанини немає,
 * бо форми різні — тип малюється словом з іконкою в колір тону, зона —
 * заливеною міткою. `access` саме danger: помилка в доступах показує чужі
 * гроші, і мітка має про це кричати незалежно від того, який у картки тип.
 */
export const ZONE_TONE: Record<RequestZone, Tone> = {
  polish: "info",
  ux: "accent",
  // Бірюзовий, а не амбер: жовта мітка на терміновій червоній картці читалась
  // як другий сигнал тривоги поруч із типом «Не працює». Зелений теж не
  // підходив — він каже «добре», а зона нічого не оцінює. `teal` доданий у
  // реєстр тонів саме під цю потребу: помітний, але мовчазний.
  logic: "teal",
  // Не `neutral`: сірий збігався з контурними мітками теми й напрямку, і зона
  // переставала бути якорем ряду — на дошці «дані» читались як ще один
  // контур. `festive` (340°) досить далеко і від accent (262°), і від info.
  data: "festive",
  access: "danger",
  speed: "success",
};

/**
 * Іконка зони.
 *
 * «Вигляд» — саме `SwatchBook` (зразки кольорів), а НЕ палітра: палітра вже
 * стоїть на розділі «Дизайн» у сайдбарі, і та сама іконка означала б дві різні
 * речі — дизайн-задачі для клієнтів і косметику в самій CRM.
 */
export const ZONE_ICONS: Record<RequestZone, ComponentType<{ className?: string }>> = {
  polish: SwatchBook,
  // Курсор із кліком, а не «рука» чи «маршрут»: зона про те, що людина РОБИТЬ
  // руками — тисне, підтверджує, сортує, — а не про подорож користувача.
  ux: MousePointerClick,
  logic: Workflow,
  data: Database,
  access: KeyRound,
  speed: Gauge,
};

/**
 * Підписи пріоритету у ФОРМІ. Тут «Звичайний» потрібен: у списку вибору має
 * бути видно всі три значення, зокрема й те, що стоїть за замовчуванням.
 */
export const PRIORITY_LABELS: Record<RequestPriority, string> = {
  low: "Не горить",
  normal: "Звичайний",
  high: "Терміново",
};

/**
 * Підписів пріоритету НА КАРТЦІ більше немає — там стоїть PriorityBars.
 *
 * Був `CARD_PRIORITY_LABELS` без «звичайного»: мітка-слово на більшості карток
 * нічого не розрізняла й з'їдала місце в ряду, який сканують очима. Але поки
 * шкала була словами, «звичайний» доводилось ховати — і картка без мітки
 * означала водночас і його, і «пріоритет ще не проставили». Стовпчики
 * показують усі три стани одним розміром, тож підписи потрібні лише у формі
 * (PRIORITY_LABELS вище) і в тултипі.
 */

/**
 * Людський підпис напрямку. Рядки НЕ дублюються — вони з того самого реєстру
 * модулів, що й перемикачі доступів і карта для розбору. Доданий модуль
 * зʼявляється у списку сам.
 */
export const MODULE_LABELS: Record<string, string> = Object.fromEntries(
  MODULE_DEFINITIONS.map((item) => [item.key, item.label])
);

export function formatRequestNumber(number: number): string {
  return `REQ-${number}`;
}

type DevRequestRow = {
  id: string;
  number: number;
  team_id: string;
  title: string;
  body: string | null;
  kind: string;
  status: string;
  module_key: string | null;
  priority: string | null;
  zone: string | null;
  released_at: string | null;
  theme: string | null;
  checklist: unknown;
  auto_classified: boolean | null;
  is_private: boolean;
  author_user_id: string | null;
  tg_username: string | null;
  display_name: string | null;
  asked_by_count: number;
  /**
   * Коміти, якими картку закрили. Поле необов'язкове: старіші виклики
   * `toDevRequest` (і тести) обходяться без нього, а мапер усе одно звіряє тип.
   */
  commit_shas?: string[] | null;
  created_at: string;
};

function asStatus(raw: string): RequestStatus {
  return (REQUEST_STATUSES as readonly string[]).includes(raw)
    ? (raw as RequestStatus)
    : "triage";
}

function asKind(raw: string): RequestKind {
  return (REQUEST_KINDS as readonly string[]).includes(raw) ? (raw as RequestKind) : "friction";
}

function asPriority(raw: string | null): RequestPriority | null {
  return raw && (REQUEST_PRIORITIES as readonly string[]).includes(raw)
    ? (raw as RequestPriority)
    : null;
}

/** Констрейнта на zone в базі немає — перелік звіряється тут, як і module_key. */
function asZone(raw: string | null): RequestZone | null {
  return raw && (REQUEST_ZONES as readonly string[]).includes(raw) ? (raw as RequestZone) : null;
}

/** Порожній рядок у темі — це «теми немає», а не тема з назвою «». */
function asTheme(raw: string | null): string | null {
  const trimmed = (raw ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Констрейнта на module_key в базі немає — напрямок звіряється застосунком.
 * Ключ, якого в реєстрі вже (чи ще) немає, читаємо як «напрямку немає»: пустий
 * чип чесніший за підпис «undefined» і одразу видно, що картку варто глянути.
 */
function asModuleKey(raw: string | null): string | null {
  return isKnownModuleKey(raw) ? raw : null;
}

export function toDevRequest(row: DevRequestRow): DevRequest {
  return {
    id: row.id,
    number: row.number,
    label: formatRequestNumber(row.number),
    teamId: row.team_id,
    title: row.title,
    body: row.body ?? "",
    kind: asKind(row.kind),
    status: asStatus(row.status),
    moduleKey: asModuleKey(row.module_key),
    priority: asPriority(row.priority),
    zone: asZone(row.zone),
    releasedAt: row.released_at ?? null,
    theme: asTheme(row.theme),
    checklist: parseChecklist(row.checklist),
    autoClassified: row.auto_classified ?? false,
    isPrivate: row.is_private,
    authorUserId: row.author_user_id,
    tgUsername: row.tg_username,
    displayName: row.display_name,
    askedByCount: row.asked_by_count,
    commitShas: Array.isArray(row.commit_shas) ? row.commit_shas : [],
    createdAt: row.created_at,
  };
}
