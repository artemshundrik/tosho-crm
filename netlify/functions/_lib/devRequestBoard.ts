import type { SupabaseClient } from "@supabase/supabase-js";

import { isPapercutCard } from "../../../src/features/devRequests/papercuts";
import { hasOpenChecklistItems } from "../../../src/features/devRequests/checklist";
import { isKnownModuleKey, moduleKeyLabel } from "../../../src/lib/projectMap";
import { formatRequestNumber, KIND_LABELS, PRIORITY_LABELS } from "./devRequestBot";
import {
  DRAFT_KINDS,
  DRAFT_PRIORITIES,
  MAX_OPEN_TITLES,
  type DevRequestKind,
  type DevRequestPriority,
} from "./devRequestDraft";

/**
 * Черга запитів з телефона: що вважається відкритим, у якому порядку читається
 * і куди картку можна пересунути руками.
 *
 * ОДИН МОДУЛЬ НА ДВА ВХОДИ. Те саме читають ендпоінт для Claude Cowork
 * (dev-request-board.ts) і Telegram-бот. Дві копії питання «які статуси
 * відкриті» розійшлись би на першій же правці, і два входи почали б показувати
 * різні черги — причому мовчки.
 *
 * ЧОГО ТУТ НЕМАЄ: гейта прав. Ендпоінт пускає по токену власника, бот — по
 * ролі (owner/CEO), і це різні перевірки в різних місцях. Модуль лише читає й
 * пише картки для того, кого вже пустили.
 */

/* ------------------------------- Статуси ------------------------------- */

/**
 * УСІ стани картки, а не лише колонки дошки: «Не робимо» і «Ідеї» стовпчиків
 * не мають і живуть окремими списками в CRM (див. BOARD_COLUMNS у
 * src/features/devRequests/types.ts). Тут перелік потрібен цілим — щоб
 * прочитаний із бази статус не звалився у «Вхідні» через власну ж неповноту.
 */
export const BOARD_STATUSES = [
  "triage",
  "queued",
  "in_progress",
  "done_local",
  "released",
  "wont_do",
  "someday",
] as const;

export type BoardStatus = (typeof BOARD_STATUSES)[number];

/**
 * Підписи станів. Копія src/features/devRequests/types.ts і мусить нею
 * лишатись дослівно — на дошці людина бачить саме ці слова.
 *
 * Чому копія, а не імпорт: той модуль тягне React і lucide-react (іконки
 * колонок), а функції збираються з `types: ["node"]` і жодного DOM не мають.
 * Той самий компроміс, що з KIND_LABELS у devRequestBot.ts.
 */
export const STATUS_LABELS: Record<BoardStatus, string> = {
  triage: "Вхідні",
  queued: "У черзі",
  in_progress: "В роботі",
  done_local: "Готово локально",
  released: "Викочено",
  wont_do: "Не робимо",
  someday: "Ідеї",
};

/**
 * Що вважається відкритим: рівно ці чотири стани.
 *
 * ПЕРЕЛІК ДОЗВОЛЕНИХ, А НЕ ЗАБОРОНЕНИХ — і це принципово. Опис через
 * віднімання («усе, крім викоченого») означав би, що кожен новий стан
 * потрапляє в чергу сам собою, поки хтось не згадає дописати виняток. З
 * дозвільним переліком новий стан за замовчуванням поза чергою.
 *
 * Кого тут немає і чому:
 *   released — поїхало в проді, справу закрито фактом деплою;
 *   wont_do  — закрито свідомою відмовою;
 *   someday  — «Ідеї»: те, за що ніхто не брався й найближчим часом не візьметься.
 *
 * Останній — головний. «Ідеї» й заводили саме для того, щоб «колись зроблю» не
 * лежало в черзі поруч із роботою, на яку виділено час: інакше за довжиною
 * черги не видно, скільки роботи справді попереду. Повернути someday сюди —
 * означає скасувати всю затію, причому мовчки.
 */
export const OPEN_STATUSES: readonly BoardStatus[] = [
  "triage",
  "queued",
  "in_progress",
  "done_local",
];

/**
 * Порядок читання черги = порядок колонок на дошці.
 *
 * Свого порядку тут навмисно немає: людина, яка вранці дивиться дошку, а вдень
 * — телефон, не має тримати в голові дві різні картини одного й того самого.
 */
export const OPEN_STATUS_ORDER: readonly BoardStatus[] = OPEN_STATUSES;

/**
 * Статуси, які МОЖНА поставити з телефона.
 *
 * Рівно ті чотири, які ставить людина: взяти в роботу, повернути в чергу,
 * відмовитись, відкласти в «Ідеї». Останній тут не з ласки: «постав REQ-7 в
 * ідеї» — таке саме рішення людини, як і решта, і робити його доступним лише
 * за компʼютером означало б, що з телефона «колись зроблю» нікуди подіти й
 * воно лишиться в черзі.
 *
 * «Готово локально» і «Викочено» ставлять ФАКТИ — коміт і деплой (див. розділ
 * «Релізи»), — і рука людини тут зробила б дошку брехливою: «викочено» без
 * деплою означає, що в проді цього немає, а звіт керівництву скаже, що є. Не
 * додавайте їх у кнопки.
 */
export const MOVABLE_STATUSES = ["in_progress", "queued", "someday", "wont_do"] as const;

export type MovableStatus = (typeof MOVABLE_STATUSES)[number];

export function isMovableStatus(value: unknown): value is MovableStatus {
  return typeof value === "string" && (MOVABLE_STATUSES as readonly string[]).includes(value);
}

/** Значок стану — щоб рядок читався оком, а не вичитувався. */
export const STATUS_EMOJI: Record<MovableStatus, string> = {
  in_progress: "▶️",
  queued: "⏸",
  someday: "💡",
  wont_do: "✖️",
};

/** Куди веде посилання «відкрити в CRM». */
/** Дошка живе у вкладці «Беклог» розділу Dev; /dev-requests лишився редиректом. */
export const BOARD_PATH = "/dev/backlog";

/** Стеля вибірки. Довший список на телефоні все одно не читають. */
export const BOARD_LIST_LIMIT = 50;

/* -------------------------------- Картка ------------------------------- */

export type BoardCard = {
  number: number;
  /** Готовий підпис «REQ-42» — той самий, що на дошці. */
  label: string;
  title: string;
  body: string;
  kind: DevRequestKind;
  status: BoardStatus;
  /** Ключ напрямку з реєстру модулів. Невідомий читаємо як «немає». */
  moduleKey: string | null;
  priority: DevRequestPriority | null;
  /**
   * Приватна картка: у CRM її бачать лише власник і CEO.
   *
   * Тут вона не фільтрується (обидва входи відкриті саме цим людям), але
   * позначається: той, хто збирається переслати список чи зробити скріншот, має
   * бачити, який саме рядок не для всіх — ДО того, як натисне «поділитись».
   */
  isPrivate: boolean;
  /**
   * Коли картку поклали на полицю «Сьогодні» в CRM. null — не брали.
   *
   * Ця полиця сильніша за колонку: вона відповідає на «за що хвататись», тоді
   * як статус каже лише, на якому етапі картка (src/features/devRequests/
   * queueShelves.ts). Ззовні її доти не було видно взагалі — ні тут, ні в боті,
   * — і на питання «що сьогодні» обидва входи вивалювали всю чергу.
   */
  todayAt: string | null;
  createdAt: string;
};

type BoardRow = {
  number?: number | string | null;
  title?: string | null;
  body?: string | null;
  kind?: string | null;
  status?: string | null;
  module_key?: string | null;
  priority?: string | null;
  is_private?: boolean | null;
  today_at?: string | null;
  created_at?: string | null;
};

/**
 * Рядок бази → картка. Захист від сміття такий самий, як у мапері дошки
 * (src/features/devRequests/types.ts): невідомий ключ напрямку читається як
 * «немає», невідомий тип — як «незручно». Порожній чип чесніший за «undefined».
 */
export function toBoardCard(row: BoardRow): BoardCard | null {
  const number = typeof row.number === "string" ? Number(row.number) : row.number;
  if (typeof number !== "number" || !Number.isFinite(number)) return null;

  const kind = (DRAFT_KINDS as readonly string[]).includes(row.kind ?? "")
    ? (row.kind as DevRequestKind)
    : "friction";
  const status = (BOARD_STATUSES as readonly string[]).includes(row.status ?? "")
    ? (row.status as BoardStatus)
    : "triage";
  const priority = (DRAFT_PRIORITIES as readonly string[]).includes(row.priority ?? "")
    ? (row.priority as DevRequestPriority)
    : null;

  return {
    number,
    label: formatRequestNumber(number),
    title: (row.title ?? "").trim(),
    body: (row.body ?? "").trim(),
    kind,
    status,
    moduleKey: isKnownModuleKey(row.module_key) ? row.module_key : null,
    priority,
    // Невідоме значення читаємо як «приватна»: зайвий замок на спільній картці
    // дешевший за відсутній на приватній.
    isPrivate: row.is_private !== false,
    todayAt: (row.today_at ?? "").trim() || null,
    createdAt: (row.created_at ?? "").trim(),
  };
}

/**
 * Полиця «Сьогодні» в тому ж порядку, що на дошці, — у якому картки туди клали.
 *
 * Порядок саме за `today_at`, а не за терміновістю: полиця — це намір людини на
 * день, і переставляти в ній картки за власною шкалою означало б сперечатись із
 * тим, хто її склав.
 */
export function todayShelfCards(cards: BoardCard[]): BoardCard[] {
  return cards
    .filter(isTakenToday)
    .sort((a, b) => (a.todayAt ?? "").localeCompare(b.todayAt ?? ""));
}

/**
 * Чи взята картка на сьогодні.
 *
 * Питаємо про НАПОВНЕНІСТЬ рядка, а не `!== null`: BoardCard збирають не лише з
 * рядка бази (там завжди null), і поле, якого в об'єкті просто немає, під
 * перевіркою на null проходило б як «взято» — на цьому одразу впали тести
 * черги, де на полицю приїхала вся дошка.
 */
export function isTakenToday(card: Pick<BoardCard, "todayAt">): boolean {
  return typeof card.todayAt === "string" && card.todayAt.trim() !== "";
}

/**
 * Позначка «взято на сьогодні» в колонковому рядку.
 *
 * Без неї та сама картка виглядає у двох місцях як дві різні справи: угорі в
 * полиці й нижче в колонці.
 */
export function todayMark(card: Pick<BoardCard, "todayAt">): string {
  return isTakenToday(card) ? "📌 " : "";
}

/** Замок у рядку списку. Порожньо для спільних карток — позначаємо лише виняток. */
export function privacyMark(card: Pick<BoardCard, "isPrivate">): string {
  return card.isPrivate ? "🔒 " : "";
}

/**
 * Порядок: спершу термінові, далі свіжіші.
 *
 * Термінові вгорі — бо саме по них ухвалюють рішення «зараз чи потім». Далі
 * свіжіші, як на дошці (order created_at desc): залежалі картки пасе окремий
 * рядок у щоденному звіті (_lib/devRequestsDigest.ts), і дублювати цю роботу
 * зворотним сортуванням тут — означало б показувати те саме двічі й по-різному.
 */
export function sortBoardCards(cards: BoardCard[]): BoardCard[] {
  return [...cards].sort((a, b) => {
    const urgency = Number(b.priority === "high") - Number(a.priority === "high");
    if (urgency !== 0) return urgency;
    return b.createdAt.localeCompare(a.createdAt);
  });
}

export type BoardGroup = {
  status: BoardStatus;
  label: string;
  cards: BoardCard[];
};

/**
 * Розкладка по колонках. Порожні групи випадають: рядок «У черзі (0)» нічого
 * не повідомляє, а місце на екрані телефона з'їдає.
 */
export function groupBoardCards(cards: BoardCard[]): BoardGroup[] {
  const sorted = sortBoardCards(cards);
  return OPEN_STATUS_ORDER.map((status) => ({
    status,
    label: STATUS_LABELS[status],
    cards: sorted.filter((card) => card.status === status),
  })).filter((group) => group.cards.length > 0);
}

/** Мітка терміновості в рядку списку. «Звичайний» не позначаємо — див. CARD_PRIORITY_LABELS на дошці. */
export function priorityMark(priority: DevRequestPriority | null): string {
  if (priority === "high") return "🔥 ";
  if (priority === "low") return "💤 ";
  return "";
}

/**
 * Рядок «Не працює · Прорахунки · Терміново» для картки черги.
 *
 * Окремо від buildDevRequestMeta: там пріоритет обов'язковий (розбір завжди
 * його ставить), а в базі колонка nullable — стара картка може бути без нього.
 *
 * «Звичайний» не пишемо — та сама причина, що й у CARD_PRIORITY_LABELS на
 * дошці: ця мітка стоїть на більшості карток, нічого не розрізняє і з'їдає
 * місце в рядку, який сканують очима. Підписуємо лише краї шкали.
 */
export function boardCardMeta(card: BoardCard): string {
  return [
    KIND_LABELS[card.kind],
    moduleKeyLabel(card.moduleKey),
    card.priority && card.priority !== "normal" ? PRIORITY_LABELS[card.priority] : null,
  ]
    .map((part) => (part ?? "").trim())
    .filter(Boolean)
    .join(" · ");
}

/* ------------------------------ Тіло запиту ---------------------------- */

/** Поля картки, які дозволено міняти ззовні. Статусу тут немає навмисно. */
export type BoardCardPatch = {
  title?: string;
  body?: string;
  kind?: DevRequestKind;
  priority?: DevRequestPriority;
  moduleKey?: string | null;
  isPrivate?: boolean;
};

/** Адресована згадка з коміта: «закрито пункт `item` картки `number`». */
export type ChecklistMention = { number: number; item: string };

export type BoardRequest =
  | { ok: true; action: "list" }
  | { ok: true; action: "card"; number: number }
  | { ok: true; action: "move"; number: number; status: MovableStatus }
  | { ok: true; action: "commit"; numbers: number[]; items: ChecklistMention[]; sha: string }
  | { ok: true; action: "update"; number: number; patch: BoardCardPatch }
  | { ok: true; action: "checklist"; number: number; text: string }
  | { ok: false; status: number; error: string };

/** Довші теми на дошці не читаються — вони стають рядком у звіті керівництву. */
export const TITLE_MAX_LENGTH = 120;

/**
 * Довжина одного пункту чекліста.
 *
 * Пункт — це рядок, який читають у списку з десяти таких. Абзац на 400 знаків
 * там не читається, а означає, що це насправді окрема картка: якщо думку не
 * вдалось укласти в рядок, вона більша за дрібницю.
 */
export const CHECKLIST_TEXT_MAX = 200;

/** Скільки карток одна дія `commit` бере за раз. Більше — це не коміт, а помилка розбору. */
export const COMMIT_NUMBERS_LIMIT = 20;

/** Короткий чи повний git-sha. Коротший за 7 символів git і сам не видає. */
const SHA_PATTERN = /^[0-9a-f]{7,40}$/i;

function toCardNumber(value: unknown): number | null {
  const raw = typeof value === "string" ? Number(value.trim()) : value;
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw <= 0) return null;
  return raw;
}

/**
 * Адреса пункта чекліста: `p1`, `t3`. Той самий вигляд, що й у базі.
 *
 * ЛІТЕРА БУДЬ-ЯКА, і це не запас на майбутнє: на дошці вже лежать картки з
 * пунктами на `t` (REQ-123: t1…t3). Поки тут стояло рівно `p`, коміт із чесною
 * згадкою `REQ-123#t3` отримував 400 і пункт лишався відкритим — при тому, що
 * робота була зроблена. Знайдено 27.08.2026.
 */
const ITEM_ID_PATTERN = /^[a-z]\d{1,4}$/;

/**
 * Розбір поля `items` дії `commit`.
 *
 * `null` — поле є, але зіпсоване: краще 400 із поясненням, ніж мовчазна тиша.
 * Порожній масив і відсутнє поле — це нормально: коміт міг не згадати жодного
 * пункта, і старий хук цього поля не шле взагалі.
 */
function parseChecklistMentions(value: unknown): ChecklistMention[] | null {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) return null;
  if (value.length > COMMIT_NUMBERS_LIMIT) return null;

  const mentions: ChecklistMention[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") return null;
    const entry = raw as { number?: unknown; item?: unknown };
    const number = toCardNumber(entry.number);
    const item = typeof entry.item === "string" ? entry.item.trim().toLowerCase() : "";
    if (number === null || !ITEM_ID_PATTERN.test(item)) return null;
    // Той самий пункт двічі в одному коміті — шум, а не помилка.
    if (mentions.some((seen) => seen.number === number && seen.item === item)) continue;
    mentions.push({ number, item });
  }
  return mentions;
}

/**
 * Перелік дозволених статусів людською мовою — рівно те, що бачить у відповіді
 * той, хто спробував поставити «released» руками.
 */
export function movableStatusHint(): string {
  const allowed = MOVABLE_STATUSES.map((status) => `${status} (${STATUS_LABELS[status]})`).join(", ");
  return `Дозволені статуси: ${allowed}. «done_local» і «released» руками не ставляться — їх проставляють коміт і деплой.`;
}

/**
 * Тіло запиту до ендпоінта черги.
 *
 * Помилки українською: їх читає не сервер, а власник у вікні Cowork.
 */
export function parseBoardBody(raw: string | null | undefined): BoardRequest {
  let payload: unknown;
  try {
    payload = JSON.parse(raw ?? "{}");
  } catch {
    return { ok: false, status: 400, error: "Тіло запиту не читається як JSON." };
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { ok: false, status: 400, error: "Очікую об'єкт виду { \"action\": \"list\" }." };
  }

  const body = payload as {
    action?: unknown;
    number?: unknown;
    numbers?: unknown;
    /** Дія `commit`: адресовані згадки виду `[{ number: 180, item: "p1" }]`. */
    items?: unknown;
    status?: unknown;
    sha?: unknown;
    /** Дія `checklist`: текст пункту. Не плутати з `body` — описом картки. */
    text?: unknown;
    title?: unknown;
    body?: unknown;
    kind?: unknown;
    priority?: unknown;
    module?: unknown;
    private?: unknown;
  };
  const action = typeof body.action === "string" ? body.action.trim().toLowerCase() : "";

  if (action === "list") return { ok: true, action: "list" };

  if (action === "card") {
    const number = toCardNumber(body.number);
    if (number === null) {
      return { ok: false, status: 400, error: "Потрібен номер картки: { \"number\": 180 }." };
    }
    return { ok: true, action: "card", number };
  }

  if (action === "commit") {
    const source = Array.isArray(body.numbers)
      ? body.numbers
      : body.numbers !== undefined
        ? [body.numbers]
        : body.number !== undefined
          ? [body.number]
          : [];
    const items = parseChecklistMentions(body.items);
    if (items === null) {
      return {
        ok: false,
        status: 400,
        error:
          "Поле items — це [{ \"number\": 180, \"item\": \"p1\" }]: номер картки й адреса пункта виду p1 або t3.",
      };
    }
    if (source.length === 0 && items.length === 0) {
      return {
        ok: false,
        status: 400,
        error: "Потрібні номери карток: { \"numbers\": [4, 7] } або пункти { \"items\": [...] }.",
      };
    }
    if (source.length > COMMIT_NUMBERS_LIMIT) {
      return {
        ok: false,
        status: 400,
        error: `Забагато номерів (${source.length}). За раз беру не більше ${COMMIT_NUMBERS_LIMIT}.`,
      };
    }
    const numbers: number[] = [];
    for (const value of source) {
      const number = toCardNumber(value);
      if (number === null) {
        return {
          ok: false,
          status: 400,
          error: "Номер картки — ціле число більше нуля: { \"numbers\": [4, 7] }.",
        };
      }
      // Дублі в одному коміті («REQ-4 і ще раз REQ-4») — не помилка, просто шум.
      if (!numbers.includes(number)) numbers.push(number);
    }

    const sha = typeof body.sha === "string" ? body.sha.trim().toLowerCase() : "";
    if (!SHA_PATTERN.test(sha)) {
      return {
        ok: false,
        status: 400,
        error: sha
          ? `«${sha}» не схоже на sha коміта: потрібні 7–40 шістнадцяткових символів.`
          : "Немає поля sha — без нього фіксувати нічого.",
      };
    }

    return { ok: true, action: "commit", numbers, items, sha };
  }

  if (action === "move") {
    const rawNumber = toCardNumber(body.number);
    if (rawNumber === null) {
      return { ok: false, status: 400, error: "Потрібен номер картки: { \"number\": 3 }." };
    }
    const status = typeof body.status === "string" ? body.status.trim() : "";
    if (!isMovableStatus(status)) {
      return {
        ok: false,
        status: 400,
        error: status
          ? `Статус «${status}» з телефона не ставиться. ${movableStatusHint()}`
          : `Немає поля status. ${movableStatusHint()}`,
      };
    }
    return { ok: true, action: "move", number: rawNumber, status };
  }

  if (action === "checklist") {
    const rawNumber = toCardNumber(body.number);
    if (rawNumber === null) {
      return { ok: false, status: 400, error: "Потрібен номер картки: { \"number\": 175 }." };
    }
    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (!text) {
      return { ok: false, status: 400, error: "Немає поля text — нічого дописувати." };
    }
    if (text.length > CHECKLIST_TEXT_MAX) {
      return {
        ok: false,
        status: 400,
        error: `Пункт довший за ${CHECKLIST_TEXT_MAX} символів. Якщо думка не влазить у рядок — це не дрібниця, а окрема картка.`,
      };
    }
    return { ok: true, action: "checklist", number: rawNumber, text };
  }

  if (action === "update") {
    const rawNumber = toCardNumber(body.number);
    if (rawNumber === null) {
      return { ok: false, status: 400, error: "Потрібен номер картки: { \"number\": 3 }." };
    }

    // Статус має власну дію з власними правилами: «Готово локально» й «Викочено»
    // ставлять факти (коміт і деплой), і пролізти до них через update не можна.
    if (body.status !== undefined) {
      return {
        ok: false,
        status: 400,
        error: `Статус через update не міняється — для цього є дія move. ${movableStatusHint()}`,
      };
    }

    const patch: BoardCardPatch = {};

    if (body.title !== undefined) {
      const title = typeof body.title === "string" ? body.title.trim() : "";
      if (!title) return { ok: false, status: 400, error: "Тема картки не може бути порожньою." };
      if (title.length > TITLE_MAX_LENGTH) {
        return {
          ok: false,
          status: 400,
          error: `Тема довша за ${TITLE_MAX_LENGTH} символів — на дошці її ніхто не прочитає.`,
        };
      }
      patch.title = title;
    }

    // Порожній опис дозволений: іноді картку саме й треба спорожнити.
    if (body.body !== undefined) {
      if (typeof body.body !== "string") {
        return { ok: false, status: 400, error: "Опис має бути рядком." };
      }
      patch.body = body.body.trim();
    }

    if (body.kind !== undefined) {
      const kind = typeof body.kind === "string" ? body.kind.trim() : "";
      if (!(DRAFT_KINDS as readonly string[]).includes(kind)) {
        return {
          ok: false,
          status: 400,
          error: `Тип «${kind}» не існує. Дозволені: ${DRAFT_KINDS.join(", ")}.`,
        };
      }
      patch.kind = kind as DevRequestKind;
    }

    if (body.priority !== undefined) {
      const priority = typeof body.priority === "string" ? body.priority.trim() : "";
      if (!(DRAFT_PRIORITIES as readonly string[]).includes(priority)) {
        return {
          ok: false,
          status: 400,
          error: `Пріоритет «${priority}» не існує. Дозволені: ${DRAFT_PRIORITIES.join(", ")}.`,
        };
      }
      patch.priority = priority as DevRequestPriority;
    }

    // null — свідоме «зняти напрямок», а не помилка виклику.
    if (body.module !== undefined) {
      if (body.module === null) patch.moduleKey = null;
      else if (typeof body.module === "string") patch.moduleKey = body.module.trim() || null;
      else return { ok: false, status: 400, error: "Напрямок — рядок або null." };
    }

    if (body.private !== undefined) {
      if (typeof body.private !== "boolean") {
        return { ok: false, status: 400, error: "Поле private — true або false." };
      }
      patch.isPrivate = body.private;
    }

    if (Object.keys(patch).length === 0) {
      return {
        ok: false,
        status: 400,
        error: "Нічого міняти: передай title, body, kind, priority, module або private.",
      };
    }

    return { ok: true, action: "update", number: rawNumber, patch };
  }

  const actions =
    "list — показати чергу, move — пересунути картку, update — змінити текст картки, checklist — дописати пункт, commit — зафіксувати коміт (кличе git-хук, не людина)";
  return {
    ok: false,
    status: 400,
    error: action ? `Невідома дія «${action}». Є п'ять: ${actions}.` : `Немає поля action. Є п'ять дій: ${actions}.`,
  };
}

/* ------------------------------- Відповіді ----------------------------- */

export type BoardCardJson = {
  number: number;
  label: string;
  title: string;
  status: BoardStatus;
  statusLabel: string;
  kind: string;
  module: string | null;
  priority: string | null;
  urgent: boolean;
  /** true — картку видно лише власнику й CEO. Показуючи її комусь, це варто знати. */
  private: boolean;
  /** true — картку взяли на сьогодні. Це відповідь на «що робимо зараз». */
  today: boolean;
};

function toCardJson(card: BoardCard): BoardCardJson {
  return {
    // Число й підпис поруч навмисно: у `message` йде «REQ-4», а в дію move
    // передають саме число, і без обох полів це джерело плутанини.
    number: card.number,
    label: card.label,
    title: card.title,
    status: card.status,
    statusLabel: STATUS_LABELS[card.status],
    kind: KIND_LABELS[card.kind],
    module: moduleKeyLabel(card.moduleKey),
    priority: card.priority ? PRIORITY_LABELS[card.priority] : null,
    urgent: card.priority === "high",
    private: card.isPrivate,
    today: isTakenToday(card),
  };
}

export type BoardListResponse = {
  ok: true;
  total: number;
  /** true — карток більше, ніж стеля вибірки. */
  hasMore: boolean;
  /**
   * Полиця «Сьогодні» — те, що людина сама взяла на день, у порядку кладення.
   * Ці ж картки лишаються у своїх колонках нижче: полиця каже «за що хвататись»,
   * колонка — «на якому це етапі», і викидати одну відповідь заради іншої немає
   * причин.
   */
  today: BoardCardJson[];
  groups: Array<{ status: BoardStatus; label: string; cards: BoardCardJson[] }>;
  url: string;
  message: string;
};

/**
 * Відповідь на «покажи чергу».
 *
 * Поля розібрані окремо (щоб їх читав код), плюс готовий `message` — рядок,
 * який Cowork показує власнику як є. Той самий контракт, що в захопленні
 * (_lib/devRequestCapture.ts): переказ моделлю був би зайвим витком.
 */
export function buildBoardListResponse(input: {
  cards: BoardCard[];
  hasMore: boolean;
  url: string;
}): BoardListResponse {
  const groups = groupBoardCards(input.cards);
  const today = todayShelfCards(input.cards);
  const total = input.cards.length;

  const lines: string[] = [];
  if (total === 0) {
    lines.push("📋 Черга запитів порожня — жодної відкритої картки.");
  } else {
    lines.push(`📋 Черга запитів — ${total}${input.hasMore ? "+" : ""} відкритих`);
    // «Сьогодні» першою: на питання «що зараз» відповідає саме вона, і читач не
    // має вишукувати ці картки очима по колонках.
    if (today.length > 0) {
      lines.push("", `🎯 Сьогодні (${today.length})`);
      for (const card of today) {
        lines.push(
          `${privacyMark(card)}${card.label} — ${card.title} · ${STATUS_LABELS[card.status]}`
        );
      }
    }
    for (const group of groups) {
      lines.push("", `${group.label} (${group.cards.length})`);
      for (const card of group.cards) {
        const meta = boardCardMeta(card);
        lines.push(
          `${todayMark(card)}${privacyMark(card)}${priorityMark(card.priority)}${card.label} — ${card.title}${
            meta ? ` · ${meta}` : ""
          }`
        );
      }
    }
    if (input.hasMore) {
      lines.push("", `Показано перші ${BOARD_LIST_LIMIT} — решта на дошці.`);
    }
  }
  lines.push("", input.url);

  return {
    ok: true,
    total,
    hasMore: input.hasMore,
    today: today.map(toCardJson),
    groups: groups.map((group) => ({
      status: group.status,
      label: group.label,
      cards: group.cards.map(toCardJson),
    })),
    url: input.url,
    message: lines.join("\n"),
  };
}

export type BoardMoveResponse = {
  ok: true;
  card: BoardCardJson;
  previousStatus: BoardStatus;
  previousStatusLabel: string;
  /** true — картка вже була в цьому стані, запис нічого не змінив. */
  unchanged: boolean;
  url: string;
  message: string;
};

export function buildBoardMoveResponse(input: {
  card: BoardCard;
  previousStatus: BoardStatus;
  url: string;
}): BoardMoveResponse {
  const { card, previousStatus } = input;
  const unchanged = previousStatus === card.status;
  const emoji = isMovableStatus(card.status) ? STATUS_EMOJI[card.status] : "•";

  const lines = unchanged
    ? [`${emoji} ${card.label} і так «${STATUS_LABELS[card.status]}» — нічого не змінив.`, card.title]
    : [
        `${emoji} ${card.label} → ${STATUS_LABELS[card.status]}`,
        card.title,
        `Було: ${STATUS_LABELS[previousStatus]}`,
      ];
  lines.push(input.url);

  return {
    ok: true,
    card: toCardJson(card),
    previousStatus,
    previousStatusLabel: STATUS_LABELS[previousStatus],
    unchanged,
    url: input.url,
    message: lines.join("\n"),
  };
}

/** Картки з таким номером у команді немає. */
export function cardNotFoundMessage(number: number): string {
  return `Картки ${formatRequestNumber(number)} немає. Перевір номер: дія list покаже, що є.`;
}

/* --------------------------------- База -------------------------------- */

// is_private тут не для фільтрації, а для позначки 🔒 — див. BoardCard.isPrivate.
const SELECT_COLUMNS =
  "number,title,body,kind,status,module_key,priority,is_private,today_at,created_at";

/**
 * Відкриті картки команди.
 *
 * Приватні НЕ фільтруємо: обидва входи в цю функцію відкриті лише керівництву
 * (токен власника в ендпоінті, гейт owner/CEO у боті) — тим самим людям, яким
 * приватні картки видно й у CRM (політика dev_requests_privileged_read).
 *
 * Беремо на один рядок більше за стелю: інакше «рівно 50» не відрізнити від
 * «50 і ще стільки ж», і про обрізаний список ніхто б не дізнався.
 */
export async function fetchOpenBoardCards(
  admin: SupabaseClient,
  teamId: string,
  limit: number = BOARD_LIST_LIMIT
): Promise<{ cards: BoardCard[]; hasMore: boolean }> {
  const { data, error } = await admin
    .schema("tosho")
    .from("dev_requests")
    .select(SELECT_COLUMNS)
    .eq("team_id", teamId)
    .in("status", OPEN_STATUSES as string[])
    .order("created_at", { ascending: false })
    .limit(limit + 1);
  if (error) throw new Error(`dev_requests: ${error.message}`);

  const rows = (data ?? []) as BoardRow[];
  const hasMore = rows.length > limit;
  const cards = rows
    .slice(0, limit)
    .map(toBoardCard)
    .filter((card): card is BoardCard => card !== null);

  /*
   * Взяте на сьогодні добираємо ОКРЕМИМ запитом і завжди.
   *
   * Основна вибірка — 50 найсвіжіших, і стара картка, яку людина сьогодні взяла
   * в роботу, у неї не потрапляє (REQ-17 заведено в травні). Полиця, з якої
   * зникає саме те, чим ти зараз зайнятий, гірша за її відсутність: вона
   * стверджує, що на сьогодні взято менше, ніж узято.
   *
   * Їх одиниці — це намір на один день, — тож ліміту тут не треба.
   */
  const { data: todayData, error: todayError } = await admin
    .schema("tosho")
    .from("dev_requests")
    .select(SELECT_COLUMNS)
    .eq("team_id", teamId)
    .in("status", OPEN_STATUSES as string[])
    .not("today_at", "is", null);
  if (todayError) throw new Error(`dev_requests today: ${todayError.message}`);

  const seen = new Set(cards.map((card) => card.number));
  for (const row of (todayData ?? []) as BoardRow[]) {
    const card = toBoardCard(row);
    if (card && !seen.has(card.number)) {
      seen.add(card.number);
      cards.push(card);
    }
  }

  return { cards: sortBoardCards(cards), hasMore };
}

/** Одна картка за людським номером. null — такої в команді немає. */
export async function fetchBoardCard(
  admin: SupabaseClient,
  teamId: string,
  number: number
): Promise<BoardCard | null> {
  const { data, error } = await admin
    .schema("tosho")
    .from("dev_requests")
    .select(SELECT_COLUMNS)
    .eq("team_id", teamId)
    .eq("number", number)
    .maybeSingle();
  if (error) throw new Error(`dev_requests: ${error.message}`);
  return data ? toBoardCard(data as BoardRow) : null;
}

/* ------------------------- Долучення до наявної ------------------------ */

/**
 * Статуси, у картки яких можна ДОЛУЧИТИ нову фразу замість нової картки.
 *
 * «Готово локально» тут свідомо немає, хоч воно й відкрите: код такої картки вже
 * написаний і чекає лише деплою. Дописане в неї не буде зроблено ніколи — воно
 * поїде в прод разом із карткою, статус стане «Викочено», і прохання зникне з
 * черги, ніколи не побувавши в роботі. Рівно так тихо загубились хвости REQ-9,
 * REQ-36 і REQ-56 (docs/DEV_REQUESTS_DESIGN.md §4.5). Для такої картки чесніша
 * нова.
 *
 * «Викочено», «Не робимо» й «Ідеї» не годяться з тієї самої причини, лише
 * очевидніше: у першу дописувати означає брехати розділу «Релізи», у другу —
 * скасовувати рішення людини, у третю — ховати прохання в списку «колись».
 */
export const MERGEABLE_STATUSES: readonly BoardStatus[] = ["triage", "queued", "in_progress"];

/**
 * Картки, які модель побачить як кандидатів на дубль.
 *
 * Стеля та сама, що й у промпті розбору (MAX_OPEN_TITLES): везти з бази більше,
 * ніж поїде в модель, немає сенсу, а два різні числа розійшлись би.
 */
export async function fetchMergeCandidates(
  admin: SupabaseClient,
  teamId: string,
  limit: number = MAX_OPEN_TITLES
): Promise<BoardCard[]> {
  const { data, error } = await admin
    .schema("tosho")
    .from("dev_requests")
    .select(SELECT_COLUMNS)
    .eq("team_id", teamId)
    .in("status", MERGEABLE_STATUSES as string[])
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`dev_requests: ${error.message}`);

  const cards = ((data ?? []) as BoardRow[])
    .map(toBoardCard)
    .filter((card): card is BoardCard => card !== null);
  return sortBoardCards(cards);
}

/**
 * Знайти серед кандидатів картку, яку назвала модель.
 *
 * Порівнюємо ПІДПИС («REQ-42»), а не номер: у промпті модель бачить саме
 * підписи, і повертає їх же. Регістр і краї не рахуються — модель то пише
 * «req-42», то додає пробіл.
 *
 * Назви картки, якої в переліку немає, тут не існує: draftDevRequest уже гасить
 * вигадані підписи, а ця функція — друга, незалежна перевірка перед тим, як
 * рішення «не заводити нову картку» набуде сили.
 */
export function findCardByLabel(cards: BoardCard[], label: string | null): BoardCard | null {
  const wanted = (label ?? "").trim().toLowerCase();
  if (!wanted) return null;
  return cards.find((card) => card.label.toLowerCase() === wanted) ?? null;
}

/**
 * Опис картки + дописане знизу.
 *
 * ЧОМУ ДОПИСУЄМО, А НЕ ЗЛИВАЄМО РОЗУМНО. Модель бачить лише НАЗВИ відкритих
 * карток, а не їхні описи, тож «переписати опис з урахуванням нового» вона
 * зробити не може — тільки вигадати. Дописаний блок із датою нічого не втрачає
 * й лишає людині рівно одну дію: причесати, якщо захочеться.
 *
 * Заголовок капсом — та сама мова, якою вже написані описи на дошці
 * («ЗАМІР 2026-08-09 — головний висновок», «ЩО ЗРОБЛЕНО»).
 */
export function buildMergedBody(currentBody: string, addition: string, on: string): string {
  const base = (currentBody ?? "").trim();
  const extra = (addition ?? "").trim();
  if (!extra) return base;

  const heading = `ДОДАНО ${on} — просили ще раз`;
  return base ? `${base}\n\n${heading}\n\n${extra}` : `${heading}\n\n${extra}`;
}

/** Дата для заголовка дописаного блоку: київський настінний день, як на дошці. */
export function formatMergeDate(now: Date): string {
  const parts = new Intl.DateTimeFormat("uk-UA", {
    timeZone: "Europe/Kiev",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("day")}.${get("month")}.${get("year")}`;
}

export type BoardMergeResult =
  | { ok: true; card: BoardCard; askedByCount: number }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "failed"; message: string };

/**
 * Долучити сказане до наявної картки замість того, щоб заводити нову.
 *
 * Піднімає лічильник «скільки разів просили» — той самий пріоритетний сигнал,
 * заради якого його й заводили (docs/DEV_REQUESTS_DESIGN.md §4.2). Станом на
 * 26.08.2026 він дорівнював одиниці у ВСІХ 168 картках, бо збільшувати його не
 * вміло жодне місце в коді.
 *
 * Читання й запис окремими викликами, без атомарного інкремента в базі: цей
 * шлях має рівно одного користувача — власника з його токеном, — і двох
 * одночасних долучень в одну картку тут не буває. Ціна гонки, якби вона
 * трапилась, — одиниця в лічильнику, а не втрачений текст.
 */
export async function mergeIntoBoardCard(
  admin: SupabaseClient,
  teamId: string,
  number: number,
  addition: string,
  on: string
): Promise<BoardMergeResult> {
  const { data: current, error: readError } = await admin
    .schema("tosho")
    .from("dev_requests")
    .select("body,asked_by_count")
    .eq("team_id", teamId)
    .eq("number", number)
    .maybeSingle();
  if (readError) return { ok: false, reason: "failed", message: readError.message };
  if (!current) return { ok: false, reason: "not_found" };

  const row = current as { body?: string | null; asked_by_count?: number | string | null };
  const asked = Number(row.asked_by_count);
  // Зіпсоване чи порожнє значення читаємо як «просили один раз»: цей запис —
  // другий, тож двійка. Нуль або NaN у лічильнику гірші за приблизну правду.
  const askedByCount = Number.isFinite(asked) && asked >= 1 ? asked + 1 : 2;

  const { data, error } = await admin
    .schema("tosho")
    .from("dev_requests")
    .update({
      body: buildMergedBody(row.body ?? "", addition, on),
      asked_by_count: askedByCount,
    })
    .eq("team_id", teamId)
    .eq("number", number)
    // Статус звіряємо ЩЕ РАЗ, уже в самому записі. Кандидатів читали до виклику
    // моделі, тобто кілька секунд тому, і за цей час картку міг закрити деплой
    // або рука людини. Умова в UPDATE перетворює цей проміжок на нуль рядків, а
    // нуль рядків викличний код читає як невдале долучення й заводить нову
    // картку — тобто найгірший наслідок гонки це зайва картка, а не абзац,
    // дописаний у щойно викочену справу.
    .in("status", MERGEABLE_STATUSES as string[])
    .select(SELECT_COLUMNS)
    .maybeSingle();

  if (error) return { ok: false, reason: "failed", message: error.message };
  const card = data ? toBoardCard(data as BoardRow) : null;
  if (!card) return { ok: false, reason: "failed", message: "долучення не повернуло рядок" };

  return { ok: true, card, askedByCount };
}

/* ---------------------------- Одна картка ------------------------------ */

export type BoardCardItem = {
  id: string;
  /** Готова адреса для коміта: `REQ-180#p1`. */
  address: string;
  text: string;
  state: string;
  closed: string | null;
  sha: string | null;
};

export type BoardCardResult =
  | { ok: true; card: BoardCard; items: BoardCardItem[] }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "failed"; message: string };

/**
 * Одна картка з пунктами та їхніми адресами.
 *
 * НАВІЩО ОКРЕМА ДІЯ, КОЛИ Є `list`. Список відповідає на «що відкрито» і
 * пунктів не показує взагалі — на п'ятдесяти картках це була б стіна. Але
 * закрити пункт комітом можна лише знаючи його адресу, а взяти її нізвідки:
 * `id` пунктів не було видно за межами CRM. Без цієї дії весь механізм
 * `REQ-180#p1` лишається теорією.
 */
export async function fetchBoardCardWithItems(
  admin: SupabaseClient,
  teamId: string,
  number: number
): Promise<BoardCardResult> {
  const { data, error } = await admin
    .schema("tosho")
    .from("dev_requests")
    .select(`${SELECT_COLUMNS},checklist`)
    .eq("team_id", teamId)
    .eq("number", number)
    .maybeSingle();

  if (error) return { ok: false, reason: "failed", message: error.message };
  if (!data) return { ok: false, reason: "not_found" };

  const card = toBoardCard(data as BoardRow);
  if (!card) return { ok: false, reason: "failed", message: "картка не читається" };

  const raw = (data as { checklist?: unknown }).checklist;
  const items: BoardCardItem[] = (Array.isArray(raw) ? (raw as Array<Record<string, unknown>>) : [])
    .map((entry, index) => {
      const id = String(entry?.id ?? "") || `p${index + 1}`;
      const text = typeof entry?.text === "string" ? entry.text.trim() : "";
      return {
        id,
        address: `${card.label}#${id}`,
        text,
        state: typeof entry?.state === "string" ? entry.state : "todo",
        closed: typeof entry?.closed === "string" ? entry.closed : null,
        sha: typeof entry?.sha === "string" ? entry.sha : null,
      };
    })
    .filter((item) => item.text !== "");

  return { ok: true, card, items };
}

export type BoardCardResponse = {
  ok: true;
  number: string;
  title: string;
  status: BoardStatus;
  statusLabel: string;
  isPapercut: boolean;
  items: BoardCardItem[];
  url: string;
  message: string;
};

export function buildBoardCardResponse(input: {
  card: BoardCard;
  items: BoardCardItem[];
  url: string;
}): BoardCardResponse {
  const { card, items } = input;
  const papercut = isPapercutCard(card);
  const open = items.filter((item) => item.state !== "done");

  const lines = [
    `${card.label} — ${card.title}`,
    papercut ? "Накопичувач дрібниць · статусу не ставимо, закриваємо пункти" : STATUS_LABELS[card.status],
  ];

  if (items.length === 0) {
    lines.push("Пунктів немає.");
  } else {
    lines.push(`Пунктів: ${items.length}, відкритих ${open.length}`);
    for (const item of items) {
      const mark = item.state === "done" ? "☑️" : "▫️";
      const trail = item.closed ? ` (${item.closed}${item.sha ? ` · ${item.sha}` : ""})` : "";
      lines.push(`${mark} ${item.address} — ${item.text}${trail}`);
    }
  }
  lines.push(input.url);

  return {
    ok: true,
    number: card.label,
    title: card.title,
    status: card.status,
    statusLabel: STATUS_LABELS[card.status],
    isPapercut: papercut,
    items,
    url: input.url,
    message: lines.join("\n"),
  };
}

export type ChecklistAppendResult =
  | { ok: true; card: BoardCard; total: number; text: string; item: string }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "closed"; status: BoardStatus }
  | { ok: false; reason: "failed"; message: string };

/**
 * Дописати пункт у чекліст картки — ззовні CRM.
 *
 * НАВІЩО. Накопичувачі дрібниць («Дрібниці: <напрям>») задумані так, що туди
 * лягає рядок замість окремої картки. Але дописати цей рядок скіл не міг:
 * `update` міняє лише текст картки, і дрібниця осідала в описі, звідки її потім
 * треба було переносити руками. Тобто найдешевший шлях знову проходив через
 * заведення картки — рівно те, від чого дрібниці й рятують.
 *
 * ЛИШЕ ДОПИСУВАННЯ, І ЛИШЕ В КІНЕЦЬ. Ні зміни, ні видалення, ні перестановки:
 * усе це робить людина в CRM, де видно контекст. Ззовні доступна одна дія, яку
 * не можна зіпсувати наосліп.
 *
 * ЗАКРИТУ КАРТКУ НЕ ЧІПАЄМО. У «Викочено» новий відкритий пункт означав би, що
 * справа насправді не доведена — а гейт релізу дивиться саме на чеклісти, і
 * дошка почала б суперечити розділу «Релізи». У «Не робимо» дописування
 * тихцем скасовувало б рішення людини.
 *
 * Ідентифікатор рахуємо від найбільшого наявного, а не від довжини списку:
 * після видалення пункту довжина повторила б уже зайнятий id.
 */
export async function appendChecklistItem(
  admin: SupabaseClient,
  teamId: string,
  number: number,
  text: string
): Promise<ChecklistAppendResult> {
  const { data: current, error: readError } = await admin
    .schema("tosho")
    .from("dev_requests")
    .select("status,checklist")
    .eq("team_id", teamId)
    .eq("number", number)
    .maybeSingle();
  if (readError) return { ok: false, reason: "failed", message: readError.message };
  if (!current) return { ok: false, reason: "not_found" };

  const row = current as { status?: string | null; checklist?: unknown };
  const status = (BOARD_STATUSES as readonly string[]).includes(row.status ?? "")
    ? (row.status as BoardStatus)
    : "triage";
  if (status === "released" || status === "wont_do") {
    return { ok: false, reason: "closed", status };
  }

  const items = Array.isArray(row.checklist) ? (row.checklist as Array<Record<string, unknown>>) : [];
  const used = items
    .map((item) => Number(String(item?.id ?? "").replace(/\D/g, "")))
    .filter((value) => Number.isFinite(value));
  const nextId = `p${(used.length > 0 ? Math.max(...used) : 0) + 1}`;

  const next = [
    ...items,
    {
      id: nextId,
      kind: "task",
      text,
      state: "todo",
      group: null,
      who: null,
      since: null,
      note: null,
      answer: null,
      // Слід коміта. Порожній тут навмисно: пункт, дописаний ззовні, ще ніхто
      // не закривав, а вигадана дата була б брехнею про факт.
      closed: null,
      sha: null,
    },
  ];

  const { data, error } = await admin
    .schema("tosho")
    .from("dev_requests")
    .update({ checklist: next })
    .eq("team_id", teamId)
    .eq("number", number)
    .select(SELECT_COLUMNS)
    .maybeSingle();

  if (error) return { ok: false, reason: "failed", message: error.message };
  const card = data ? toBoardCard(data as BoardRow) : null;
  if (!card) return { ok: false, reason: "failed", message: "дописування не повернуло рядок" };

  return { ok: true, card, total: next.length, text, item: nextId };
}

export type BoardChecklistResponse = {
  ok: true;
  number: string;
  title: string;
  total: number;
  /** Адреса щойно доданого пункта — та сама, що пишеться в коміт. */
  item: string;
  address: string;
  url: string;
  message: string;
};

/**
 * Відповідь на «допиши пункт».
 *
 * АДРЕСА В ВІДПОВІДІ — не подробиця, а те, без чого механізм мертвий. Пункт
 * закривається згадкою `REQ-180#p1` у коміті, а `id` пунктів ніде назовні не
 * було видно: дописав рядок — і взяти адресу нема звідки. Тому вона
 * повертається одразу, готовою до вставки.
 */
export function buildBoardChecklistResponse(input: {
  card: BoardCard;
  total: number;
  text: string;
  item: string;
  url: string;
}): BoardChecklistResponse {
  const { card, total, text, item } = input;
  const address = `${card.label}#${item}`;
  return {
    ok: true,
    number: card.label,
    title: card.title,
    total,
    item,
    address,
    url: input.url,
    message: [
      `➕ ${card.label} — дописав пункт`,
      card.title,
      `· ${text}`,
      `Адреса для коміта: ${address}`,
      `Разом пунктів: ${total}`,
      input.url,
    ].join("\n"),
  };
}

/** Пункт у закриту картку не дописують — пояснюємо, чому саме. */
export function checklistClosedMessage(number: number, status: BoardStatus): string {
  const label = formatRequestNumber(number);
  return status === "released"
    ? `${label} уже викочено. Новий пункт означав би, що справа не доведена, — а розділ «Релізи» каже, що доведена. Це нова картка.`
    : `${label} у «Не робимо». Дописаний пункт тихцем скасував би це рішення — поверни картку в чергу, якщо вона знову потрібна.`;
}

export type BoardMoveResult =
  | { ok: true; card: BoardCard; previousStatus: BoardStatus }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "released" }
  | { ok: false; reason: "failed"; message: string };

/**
 * Викочене руками не знімають.
 *
 * Перелік дозволених статусів захищає лише те, куди картку СТАВЛЯТЬ, — і цього
 * мало: пересунувши викочену картку в «В роботі», ми лишили б їй заповнені
 * released_at і commit_shas, і дошка почала б суперечити розділу «Релізи».
 * Тобто рівно та брехня, від якої захищає заборона ставити «Викочено» руками,
 * тільки з іншого боку.
 *
 * Якщо в проді щось не працює — це НОВА картка: реліз таки був, а поламане в
 * ньому — окремий факт зі своєю історією.
 */
export const RELEASED_IS_A_FACT_MESSAGE =
  "уже викочено — це факт деплою, і руками його не знімають. Якщо в проді щось не так, заведи нову картку.";

export function releasedCardMessage(number: number): string {
  return `${formatRequestNumber(number)} ${RELEASED_IS_A_FACT_MESSAGE}`;
}

/**
 * Пересунути картку.
 *
 * Читаємо ДО запису, щоб мати попередній стан для відповіді, і пишемо з
 * `.select()`: без нього supabase-js мовчить на нулі оновлених рядків, і
 * «нічого не оновилось» виглядало б як успіх.
 *
 * У журнал змін (тригер tosho.audit_row_change) рядок ляже без імені автора:
 * service-role не має auth.uid(). Це свідома ціна — сам факт і час переходу
 * лишаються, а хто саме натиснув, видно в чаті бота.
 */
export async function moveBoardCard(
  admin: SupabaseClient,
  teamId: string,
  number: number,
  status: MovableStatus
): Promise<BoardMoveResult> {
  const current = await fetchBoardCard(admin, teamId, number);
  if (!current) return { ok: false, reason: "not_found" };
  if (current.status === "released") return { ok: false, reason: "released" };

  const { data, error } = await admin
    .schema("tosho")
    .from("dev_requests")
    .update({ status })
    .eq("team_id", teamId)
    .eq("number", number)
    .select(SELECT_COLUMNS)
    .maybeSingle();

  if (error) return { ok: false, reason: "failed", message: error.message };
  const card = data ? toBoardCard(data as BoardRow) : null;
  if (!card) return { ok: false, reason: "failed", message: "оновлення не повернуло рядок" };

  return { ok: true, card, previousStatus: current.status };
}

export type BoardUpdateResult =
  | { ok: true; card: BoardCard; changed: string[] }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "failed"; message: string };

/**
 * Змінити текст картки ззовні CRM.
 *
 * НАВІЩО. Дошка вміла приймати нові картки й рухати статуси, а виправити те, що
 * в картці написано, можна було лише руками у вебі. На практиці це означало, що
 * опис задачі лишався таким, яким його склали на початку, — навіть коли робота
 * пішла зовсім інакше, і картка починала брехати про саму себе.
 *
 * ЧОГО ТУТ НЕМАЄ. Статусу: він має власну дію `move` з власними правилами, і
 * «Готово локально» з «Викочено» ставлять факти — коміт і деплой. Якби статус
 * можна було підсунути сюди, вся конструкція з sha втратила б сенс.
 *
 * ВИКОЧЕНУ КАРТКУ ПРАВИТИ МОЖНА — і це свідома відмінність від `move`. Спершу
 * тут стояла та сама заборона, «щоб не розійтися з розділом Релізи». Перевірка
 * показала, що обґрунтування хибне: «Релізи» будуються з ТЕМ КОМІТІВ
 * (plugins/record-release), а не з тексту картки, тож правка опису не може ні з
 * чим розійтися. Заборона ж ламала головний сценарій: опис задачі майже завжди
 * уточнюють ПІСЛЯ того, як роботу зробили й викотили.
 *
 * Статус — інша річ: він і далі лише через `move`, і `move` викочену картку не
 * чіпає. Статус описує факт деплою, а текст — намір людини.
 *
 * ІСТОРІЯ ЗМІН пишеться сама: на таблиці висить тригер trg_dev_requests_audit
 * (scripts/dev-requests-schema.sql), тож кожна правка звідси лягає в журнал
 * картки нарівні з правками з інтерфейсу.
 */
export async function updateBoardCard(
  admin: SupabaseClient,
  teamId: string,
  number: number,
  patch: BoardCardPatch
): Promise<BoardUpdateResult> {
  const current = await fetchBoardCard(admin, teamId, number);
  if (!current) return { ok: false, reason: "not_found" };

  const payload: Record<string, unknown> = {};
  const changed: string[] = [];

  if (patch.title !== undefined && patch.title !== current.title) {
    payload.title = patch.title;
    changed.push("тему");
  }
  if (patch.body !== undefined) {
    payload.body = patch.body;
    changed.push("опис");
  }
  if (patch.kind !== undefined && patch.kind !== current.kind) {
    payload.kind = patch.kind;
    changed.push("тип");
  }
  if (patch.priority !== undefined && patch.priority !== current.priority) {
    payload.priority = patch.priority;
    changed.push("пріоритет");
  }
  if (patch.moduleKey !== undefined && patch.moduleKey !== current.moduleKey) {
    payload.module_key = patch.moduleKey;
    changed.push("напрямок");
  }
  if (patch.isPrivate !== undefined && patch.isPrivate !== current.isPrivate) {
    payload.is_private = patch.isPrivate;
    changed.push(patch.isPrivate ? "закрив картку" : "відкрив картку");
  }

  // Нічого не змінилось — не пишемо в базу й не смітимо в історії змін.
  if (Object.keys(payload).length === 0) {
    return { ok: true, card: current, changed: [] };
  }

  const { data, error } = await admin
    .schema("tosho")
    .from("dev_requests")
    .update(payload)
    .eq("team_id", teamId)
    .eq("number", number)
    .select(SELECT_COLUMNS)
    .maybeSingle();

  if (error) return { ok: false, reason: "failed", message: error.message };
  const card = data ? toBoardCard(data as BoardRow) : null;
  if (!card) return { ok: false, reason: "failed", message: "оновлення не повернуло рядок" };

  return { ok: true, card, changed };
}

export type BoardUpdateResponse = {
  ok: true;
  card: ReturnType<typeof toCardJson>;
  changed: string[];
  unchanged: boolean;
  url: string;
  message: string;
};

export function buildBoardUpdateResponse(input: { card: BoardCard; changed: string[]; url: string }): BoardUpdateResponse {
  const { card, changed } = input;
  const unchanged = changed.length === 0;
  const lines = unchanged
    ? [`✏️ ${card.label} — усе вже так, нічого не змінив.`, card.title]
    : [`✏️ ${card.label} — оновив ${changed.join(", ")}`, card.title];
  lines.push(input.url);

  return {
    ok: true,
    card: toCardJson(card),
    changed,
    unchanged,
    url: input.url,
    message: lines.join("\n"),
  };
}

/* ------------------------------ Факт коміта ---------------------------- */

/**
 * ЦЕ НЕ ОБХІД ЗАБОРОНИ СТАВИТИ «Готово локально» РУКАМИ — не «полагодьте» це.
 *
 * Заборонено ставити цей статус РІШЕННЯМ ЛЮДИНИ: «я вважаю, що готово» нічим не
 * підкріплене, і дошка починає показувати бажане замість наявного. Тут статус
 * ставить ФАКТ — коміт із номером картки в темі, у якого є sha, і цей sha
 * лягає в картку поруч зі статусом. Перевірити можна за секунду: `git show`.
 *
 * Саме тому дія `commit` вимагає sha й не має параметра «статус»: покликати її
 * й попросити щось інше, ніж «Готово локально», неможливо. Той, хто захоче
 * збрехати дошці, мусить спершу зробити коміт — а тоді це вже не брехня.
 *
 * Пару замикає плагін релізів (plugins/record-release/index.mjs): він звіряє ці
 * самі sha зі складом деплою й переводить збіги у «Викочено». Обидва кінці
 * тримаються на sha, а не на словах, — див. §9 docs/DEV_REQUESTS_DESIGN.md.
 */

/** Коротший за 7 символів git і сам не показує — усе, що менше, вважаємо сміттям. */
const SHA_MIN_LENGTH = 7;

/**
 * Один і той самий коміт, записаний по-різному.
 *
 * Порівнюємо ПРЕФІКСОМ, а не дослівно: хук шле короткий sha, плагін релізів
 * ріже свої до 8 символів (scripts/lib/releaseCommits.mjs), а `git rev-parse`
 * віддає всі 40. Дослівне порівняння означало б, що картка з повним sha ніколи
 * не збіжиться зі своїм же релізом.
 */
export function shaMatches(a: string, b: string): boolean {
  const left = a.trim().toLowerCase();
  const right = b.trim().toLowerCase();
  if (left.length < SHA_MIN_LENGTH || right.length < SHA_MIN_LENGTH) return false;
  const length = Math.min(left.length, right.length);
  return left.slice(0, length) === right.slice(0, length);
}

/**
 * Статуси, з яких коміт картку НЕ зрушує.
 *
 * `released` — та сама причина, що в moveBoardCard: викочене назад не
 * відкочують. `wont_do` — рішення людини «не робимо», і коміт його не
 * скасовує; якщо на відхилену картку раптом є коміт, це привід подивитись
 * очима, а не мовчки повернути її в роботу.
 */
export const COMMIT_LOCKED_STATUSES: readonly BoardStatus[] = ["released", "wont_do"];

export type CommitOutcomeResult =
  /** Була відкрита — поїхала в «Готово локально». */
  | "moved"
  /** Уже була «Готово локально» — дописали лише sha. */
  | "already"
  /** Уже викочено: статус не чіпали. */
  | "released"
  /** «Не робимо»: статус не чіпали, але сам факт коміта підозрілий. */
  | "wont_do"
  /** Картки з таким номером у команді немає. */
  | "missing"
  /** Накопичувач дрібниць: статусу й sha не пишемо взагалі — потрібна адреса пункта. */
  | "papercut"
  /** Запис не вдався — деталі в message. */
  | "failed";

export type CommitOutcome = {
  number: number;
  label: string;
  title: string;
  result: CommitOutcomeResult;
  status: BoardStatus | null;
  previousStatus: BoardStatus | null;
  /** true — цей sha в картці вже був (повторний прогін хука, `--amend`). */
  shaKnown: boolean;
  /** Текст помилки бази для логів. Людині його не показуємо. */
  message?: string;
};

/** true — картку варто подивитись очима: коміт є, а статус його не приймає. */
export function isSuspiciousOutcome(outcome: CommitOutcome): boolean {
  return (
    outcome.result === "wont_do" || outcome.result === "released" || outcome.result === "papercut"
  );
}

const COMMIT_SELECT_COLUMNS = `${SELECT_COLUMNS},commit_shas`;

type CommitRow = BoardRow & { commit_shas?: string[] | null };

function existingShas(row: CommitRow): string[] {
  return Array.isArray(row.commit_shas)
    ? row.commit_shas.filter((value): value is string => typeof value === "string" && value.trim() !== "")
    : [];
}

/**
 * Записати факт коміта на картки.
 *
 * Читання одним запитом, запис — по картці: масив `commit_shas` у кожної свій,
 * і зібрати його однією командою не вийде. Читання-зміна-запис теоретично
 * вразливе до гонки, практично — ні: хук викликається послідовно, один коміт за
 * раз, з однієї машини.
 *
 * SHA дописуємо НАВІТЬ ТИМ КАРТКАМ, чий статус не чіпаємо: коміт — це факт, а
 * статус — рішення. Якщо картку відхилили помилково, людина поверне її на дошку
 * руками, і вже записаний sha дасть деплою перевести її у «Викочено» без
 * повторного коміта.
 */
export async function recordCommitOnCards(
  admin: SupabaseClient,
  teamId: string,
  numbers: number[],
  sha: string
): Promise<CommitOutcome[]> {
  const { data, error } = await admin
    .schema("tosho")
    .from("dev_requests")
    .select(COMMIT_SELECT_COLUMNS)
    .eq("team_id", teamId)
    .in("number", numbers);
  if (error) throw new Error(`dev_requests: ${error.message}`);

  const rows = (data ?? []) as CommitRow[];
  const outcomes: CommitOutcome[] = [];

  for (const number of numbers) {
    const row = rows.find((candidate) => Number(candidate.number) === number);
    const card = row ? toBoardCard(row) : null;
    if (!row || !card) {
      outcomes.push({
        number,
        label: formatRequestNumber(number),
        title: "",
        result: "missing",
        status: null,
        previousStatus: null,
        shaKnown: false,
      });
      continue;
    }

    /*
     * НАКОПИЧУВАЧ ДРІБНИЦЬ НЕ ПРИЙМАЄ КОМІТА ВЗАГАЛІ — ні статусу, ні sha.
     *
     * Це не суворість заради суворості, а єдина точка, де тримається вся
     * гвардія. Плагін релізів шукає картки ЗА SHA (§9): немає sha на картці —
     * немає збігу — деплой фізично не може поставити їй «Викочено». А
     * «Викочено» на накопичувачі означало б смерть цілого напряму: викочену
     * картку не зрушити (409), і разом із нею з черги зникли б усі невирішені
     * дрібниці цього напряму.
     *
     * Тому знання про префікс живе тільки тут, у TS. У `.mjs`-плагіні релізів
     * дублювати нічого не треба — і не можна, бо другий перелік розійшовся б
     * із першим мовчки.
     *
     * Робота на накопичувачі фіксується адресою пункта (`REQ-180#p1`), і sha
     * лягає на сам пункт. Тому це не «нічого не сталось», а підказка з
     * правильною адресою — див. commitOutcomeLine.
     */
    if (isPapercutCard(card)) {
      outcomes.push({
        number,
        label: card.label,
        title: card.title,
        result: "papercut",
        status: card.status,
        previousStatus: card.status,
        shaKnown: false,
      });
      continue;
    }

    const known = existingShas(row);
    const shaKnown = known.some((value) => shaMatches(value, sha));
    const locked = COMMIT_LOCKED_STATUSES.includes(card.status);
    const movesToDone = !locked && card.status !== "done_local";

    const base = {
      number,
      label: card.label,
      title: card.title,
      status: card.status,
      previousStatus: card.status,
      shaKnown,
    };

    if (shaKnown && !movesToDone) {
      // Повторний прогін по тій самій картці: писати нічого.
      outcomes.push({
        ...base,
        result: locked ? (card.status as "released" | "wont_do") : "already",
      });
      continue;
    }

    const patch: Record<string, unknown> = {};
    if (!shaKnown) patch.commit_shas = [...known, sha];
    if (movesToDone) patch.status = "done_local";

    const { data: updated, error: updateError } = await admin
      .schema("tosho")
      .from("dev_requests")
      .update(patch)
      .eq("team_id", teamId)
      .eq("number", number)
      .select(COMMIT_SELECT_COLUMNS)
      .maybeSingle();

    // `.select()` тут не для даних, а щоб побачити нуль оновлених рядків:
    // без нього supabase-js мовчить, і «нічого не записалось» виглядає успіхом.
    if (updateError || !updated) {
      outcomes.push({
        ...base,
        result: "failed",
        message: updateError?.message ?? "оновлення не повернуло рядок",
      });
      continue;
    }

    outcomes.push({
      ...base,
      status: movesToDone ? "done_local" : card.status,
      result: locked ? (card.status as "released" | "wont_do") : movesToDone ? "moved" : "already",
    });
  }

  return outcomes;
}

/* ------------------- Закривання пункта чекліста комітом ------------------ */

export type ChecklistCloseResult =
  /** Пункт закрито: стан, дата й sha записані. */
  | "closed"
  /** Пункт уже був закритий — нічого не міняли. */
  | "already"
  /** Картки з таким номером немає. */
  | "missing"
  /** Картка є, пункта з такою адресою в ній немає. */
  | "no_item"
  /** Картка у «Викочено» або «Не робимо»: чеклист закритої картки не чіпаємо. */
  | "closed_card"
  /** Запис не вдався — деталі в message. */
  | "failed";

export type ChecklistOutcome = {
  number: number;
  label: string;
  title: string;
  item: string;
  /** Текст пункта — щоб у підсумку було видно, ЩО саме закрилось. */
  text: string;
  result: ChecklistCloseResult;
  message?: string;
  /** true — цим пунктом закрився останній, і картка поїхала в «Готово локально». */
  cardMoved?: boolean;
};

/** Дата закриття пункта — київський настінний день, як усі дедлайни в CRM. */
export function kyivDay(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Kyiv",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/**
 * Закрити пункти чекліста, названі в коміті адресою `REQ-180#p1`.
 *
 * НАВІЩО ЦЕ ОКРЕМО ВІД recordCommitOnCards. Та дія відповідає на питання «що
 * сталося з КАРТКОЮ», ця — «що сталося з ПУНКТОМ». Змішати їх означало б, що
 * згадка пункта тягне за собою статус картки: для накопичувача це смерть
 * напряму, для великої задачі — передчасне «Готово локально» на першому ж
 * шматку роботи.
 *
 * ОДНОСТОРОННЬО. Коміт уміє тільки закрити. Відкрити назад може лише людина в
 * CRM: автоматика, яка скасовує рішення людини, дорожча за незручність.
 *
 * SHA ЛЯГАЄ НА ПУНКТ, а не в `commit_shas` картки. Це і є та річ, що не дає
 * деплою викотити накопичувач, — плагін релізів шукає збіг саме в
 * `commit_shas` (§9 docs/DEV_REQUESTS_DESIGN.md).
 *
 * Читання-зміна-запис по одній картці: масив `checklist` у кожної свій. Гонки
 * тут практично немає — хук викликається послідовно, один коміт за раз.
 */
export async function closeChecklistItemsOnCommit(
  admin: SupabaseClient,
  teamId: string,
  mentions: ChecklistMention[],
  sha: string,
  now: Date = new Date()
): Promise<ChecklistOutcome[]> {
  const outcomes: ChecklistOutcome[] = [];
  const day = kyivDay(now);

  // Кілька пунктів однієї картки закриваємо одним записом: інакше другий запис
  // читав би стан ДО першого й затирав його.
  const byCard = new Map<number, string[]>();
  for (const mention of mentions) {
    const list = byCard.get(mention.number) ?? [];
    list.push(mention.item);
    byCard.set(mention.number, list);
  }

  for (const [number, itemIds] of byCard) {
    const label = formatRequestNumber(number);
    const { data: current, error: readError } = await admin
      .schema("tosho")
      .from("dev_requests")
      .select("title,status,checklist")
      .eq("team_id", teamId)
      .eq("number", number)
      .maybeSingle();

    if (readError) {
      for (const item of itemIds) {
        outcomes.push({ number, label, title: "", item, text: "", result: "failed", message: readError.message });
      }
      continue;
    }
    if (!current) {
      for (const item of itemIds) {
        outcomes.push({ number, label, title: "", item, text: "", result: "missing" });
      }
      continue;
    }

    const row = current as { title?: string | null; status?: string | null; checklist?: unknown };
    const title = (row.title ?? "").trim();
    const status = (BOARD_STATUSES as readonly string[]).includes(row.status ?? "")
      ? (row.status as BoardStatus)
      : "triage";
    if (status === "released" || status === "wont_do") {
      for (const item of itemIds) {
        outcomes.push({ number, label, title, item, text: "", result: "closed_card" });
      }
      continue;
    }

    const items = Array.isArray(row.checklist) ? (row.checklist as Array<Record<string, unknown>>) : [];
    const pending: ChecklistOutcome[] = [];
    let changed = false;
    const next = items.map((entry) => ({ ...entry }));

    for (const item of itemIds) {
      const index = next.findIndex((entry) => String(entry?.id ?? "") === item);
      if (index === -1) {
        pending.push({ number, label, title, item, text: "", result: "no_item" });
        continue;
      }
      const text = typeof next[index].text === "string" ? (next[index].text as string) : "";
      if (next[index].state === "done") {
        pending.push({ number, label, title, item, text, result: "already" });
        continue;
      }
      next[index] = { ...next[index], state: "done", closed: day, sha };
      changed = true;
      pending.push({ number, label, title, item, text, result: "closed" });
    }

    if (!changed) {
      outcomes.push(...pending);
      continue;
    }

    /*
     * ЗАКРИЛИ ОСТАННІЙ ПУНКТ — КАРТКА ЇДЕ В «ГОТОВО ЛОКАЛЬНО».
     *
     * Дірка, знайдена на REQ-166 (28.08.2026): усі п'ять пунктів закрились
     * комітами, а картка лишилась «В роботі», бо голої згадки `REQ-166` у тілі
     * не було — і не мало бути, поки пункти відкриті. Виходило, що велику
     * картку неможливо закрити правильним способом: або рухаєш її передчасно
     * однією згадкою, або не рухаєш ніколи.
     *
     * Накопичувач сюди не потрапляє НІКОЛИ — та сама гвардія, що в
     * recordCommitOnCards: порожній накопичувач не зроблена задача, а прибрана
     * полиця, і «Готово локально» повело б його через деплой у «Викочено», де
     * напрям уже не дістати (409).
     *
     * «Чекає» рахуємо відкритим: пункт, що стоїть за людиною, не каже «код
     * написаний», а саме це означає «Готово локально».
     */
    // Скасований пункт («не робимо») картку не тримає — те саме правило, що в
    // CRM: спільна функція, щоб два шляхи не розійшлись.
    const stillOpen = hasOpenChecklistItems(next as Array<{ state?: string | null }>);
    const finishesCard =
      !stillOpen &&
      !isPapercutCard({ title }) &&
      (status === "triage" || status === "queued" || status === "in_progress");

    const { data: updated, error: updateError } = await admin
      .schema("tosho")
      .from("dev_requests")
      .update(finishesCard ? { checklist: next, status: "done_local" } : { checklist: next })
      .eq("team_id", teamId)
      .eq("number", number)
      .select("number")
      .maybeSingle();

    // `.select()` не для даних, а щоб побачити нуль оновлених рядків: без нього
    // supabase-js мовчить, і «нічого не записалось» виглядає успіхом.
    if (updateError || !updated) {
      const message = updateError?.message ?? "оновлення не повернуло рядок";
      outcomes.push(
        ...pending.map((outcome) =>
          outcome.result === "closed" ? { ...outcome, result: "failed" as const, message } : outcome
        )
      );
      continue;
    }

    outcomes.push(
      ...pending.map((outcome) =>
        finishesCard && outcome.result === "closed" ? { ...outcome, cardMoved: true } : outcome
      )
    );
  }

  return outcomes;
}

function checklistOutcomeLine(outcome: ChecklistOutcome): string {
  const text = outcome.text ? ` · ${outcome.text}` : "";
  const address = `${outcome.label}#${outcome.item}`;
  switch (outcome.result) {
    case "closed":
      return outcome.cardMoved
        ? `☑️ ${address} — пункт закрито${text}\n${outcome.label} → ${STATUS_LABELS.done_local}: закрито останній пункт`
        : `☑️ ${address} — пункт закрито${text}`;
    case "already":
      return `${address} і так закритий${text}`;
    case "missing":
      return `❓ ${address} — такої картки немає. Перевір номер.`;
    case "no_item":
      return `❓ ${address} — у картці «${outcome.title}» такого пункта немає. Перевір адресу.`;
    case "closed_card":
      return `⚠️ ${address} — картка вже закрита, чекліст не чіпав.`;
    case "failed":
      return `⚠️ ${address} — запис не вдався, пункт лишився як був.`;
  }
}

export type BoardCommitResponse = {
  ok: true;
  sha: string;
  /** Номери карток, що поїхали в «Готово локально». */
  moved: number[];
  /** Картки, чий статус коміт свідомо не змінив, — і чому. */
  skipped: Array<{ number: number; label: string; result: CommitOutcomeResult }>;
  outcomes: CommitOutcome[];
  /** Пункти чекліста, названі адресою `REQ-180#p1`. */
  checklist: ChecklistOutcome[];
  url: string;
  message: string;
};

function commitOutcomeLine(outcome: CommitOutcome): string {
  const title = outcome.title ? ` · ${outcome.title}` : "";
  switch (outcome.result) {
    case "moved":
      return `${outcome.label} → ${STATUS_LABELS.done_local}${title}`;
    case "already":
      return `${outcome.label} і так «${STATUS_LABELS.done_local}» — дописав коміт${title}`;
    case "released":
      return `⚠️ ${outcome.label} уже «${STATUS_LABELS.released}» — статус не чіпав. Якщо це нова робота, їй потрібна нова картка.`;
    case "wont_do":
      return `⚠️ ${outcome.label} у «${STATUS_LABELS.wont_do}» — статус не чіпав. Якщо картку таки робили, поверни її на дошку руками.`;
    case "missing":
      return `❓ ${outcome.label} — такої картки немає. Перевір номер у темі коміта.`;
    case "papercut":
      return `⚠️ ${outcome.label} — це накопичувач дрібниць, статусу йому не ставлю. Закривати треба пункт: ${outcome.label}#p1.`;
    case "failed":
      return `⚠️ ${outcome.label} — запис не вдався, картка лишилась як була.`;
  }
}

/**
 * Відповідь на «зафіксуй коміт».
 *
 * `ok: true` навіть тоді, коли частина номерів не знайшлась: коміт уже існує, і
 * подавати це як провал означало б лякати рядком помилки те, що насправді
 * спрацювало наполовину. Правда — у `message` по рядку на картку.
 */
export function buildBoardCommitResponse(input: {
  sha: string;
  outcomes: CommitOutcome[];
  checklist?: ChecklistOutcome[];
  url: string;
}): BoardCommitResponse {
  const { sha, outcomes } = input;
  const checklist = input.checklist ?? [];
  const moved = outcomes.filter((outcome) => outcome.result === "moved");
  const touched =
    outcomes.some((outcome) => outcome.result === "moved" || outcome.result === "already") ||
    checklist.some((outcome) => outcome.result === "closed");

  const lines = [
    touched ? `✅ Коміт ${sha} зафіксовано` : `⚠️ Коміт ${sha} — жодної картки не зрушив`,
    ...outcomes.map(commitOutcomeLine),
    ...checklist.map(checklistOutcomeLine),
    input.url,
  ];

  return {
    ok: true,
    sha,
    moved: moved.map((outcome) => outcome.number),
    skipped: outcomes
      .filter((outcome) => outcome.result !== "moved" && outcome.result !== "already")
      .map((outcome) => ({ number: outcome.number, label: outcome.label, result: outcome.result })),
    outcomes,
    checklist,
    url: input.url,
    message: lines.join("\n"),
  };
}
