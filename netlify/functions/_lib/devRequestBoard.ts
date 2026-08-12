import type { SupabaseClient } from "@supabase/supabase-js";

import { isKnownModuleKey, moduleKeyLabel } from "../../../src/lib/projectMap";
import { formatRequestNumber, KIND_LABELS, PRIORITY_LABELS } from "./devRequestBot";
import { DRAFT_KINDS, DRAFT_PRIORITIES, type DevRequestKind, type DevRequestPriority } from "./devRequestDraft";

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
 * ролі (owner/SEO), і це різні перевірки в різних місцях. Модуль лише читає й
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
   * Приватна картка: у CRM її бачать лише власник і SEO.
   *
   * Тут вона не фільтрується (обидва входи відкриті саме цим людям), але
   * позначається: той, хто збирається переслати список чи зробити скріншот, має
   * бачити, який саме рядок не для всіх — ДО того, як натисне «поділитись».
   */
  isPrivate: boolean;
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
    createdAt: (row.created_at ?? "").trim(),
  };
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

export type BoardRequest =
  | { ok: true; action: "list" }
  | { ok: true; action: "move"; number: number; status: MovableStatus }
  | { ok: true; action: "commit"; numbers: number[]; sha: string }
  | { ok: true; action: "update"; number: number; patch: BoardCardPatch }
  | { ok: false; status: number; error: string };

/** Довші теми на дошці не читаються — вони стають рядком у звіті керівництву. */
export const TITLE_MAX_LENGTH = 120;

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
    status?: unknown;
    sha?: unknown;
    title?: unknown;
    body?: unknown;
    kind?: unknown;
    priority?: unknown;
    module?: unknown;
    private?: unknown;
  };
  const action = typeof body.action === "string" ? body.action.trim().toLowerCase() : "";

  if (action === "list") return { ok: true, action: "list" };

  if (action === "commit") {
    const source = Array.isArray(body.numbers)
      ? body.numbers
      : body.numbers !== undefined
        ? [body.numbers]
        : body.number !== undefined
          ? [body.number]
          : [];
    if (source.length === 0) {
      return {
        ok: false,
        status: 400,
        error: "Потрібні номери карток: { \"numbers\": [4, 7] }.",
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

    return { ok: true, action: "commit", numbers, sha };
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
    "list — показати чергу, move — пересунути картку, update — змінити текст картки, commit — зафіксувати коміт (кличе git-хук, не людина)";
  return {
    ok: false,
    status: 400,
    error: action ? `Невідома дія «${action}». Є чотири: ${actions}.` : `Немає поля action. Є чотири дії: ${actions}.`,
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
  /** true — картку видно лише власнику й SEO. Показуючи її комусь, це варто знати. */
  private: boolean;
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
  };
}

export type BoardListResponse = {
  ok: true;
  total: number;
  /** true — карток більше, ніж стеля вибірки. */
  hasMore: boolean;
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
  const total = input.cards.length;

  const lines: string[] = [];
  if (total === 0) {
    lines.push("📋 Черга запитів порожня — жодної відкритої картки.");
  } else {
    lines.push(`📋 Черга запитів — ${total}${input.hasMore ? "+" : ""} відкритих`);
    for (const group of groups) {
      lines.push("", `${group.label} (${group.cards.length})`);
      for (const card of group.cards) {
        const meta = boardCardMeta(card);
        lines.push(
          `${privacyMark(card)}${priorityMark(card.priority)}${card.label} — ${card.title}${
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
const SELECT_COLUMNS = "number,title,body,kind,status,module_key,priority,is_private,created_at";

/**
 * Відкриті картки команди.
 *
 * Приватні НЕ фільтруємо: обидва входи в цю функцію відкриті лише керівництву
 * (токен власника в ендпоінті, гейт owner/SEO у боті) — тим самим людям, яким
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
  return outcome.result === "wont_do" || outcome.result === "released";
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

export type BoardCommitResponse = {
  ok: true;
  sha: string;
  /** Номери карток, що поїхали в «Готово локально». */
  moved: number[];
  /** Картки, чий статус коміт свідомо не змінив, — і чому. */
  skipped: Array<{ number: number; label: string; result: CommitOutcomeResult }>;
  outcomes: CommitOutcome[];
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
  url: string;
}): BoardCommitResponse {
  const { sha, outcomes } = input;
  const moved = outcomes.filter((outcome) => outcome.result === "moved");
  const touched = outcomes.some((outcome) => outcome.result === "moved" || outcome.result === "already");

  const lines = [
    touched ? `✅ Коміт ${sha} зафіксовано` : `⚠️ Коміт ${sha} — жодної картки не зрушив`,
    ...outcomes.map(commitOutcomeLine),
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
    url: input.url,
    message: lines.join("\n"),
  };
}
