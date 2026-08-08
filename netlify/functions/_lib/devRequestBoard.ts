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

export const BOARD_STATUSES = [
  "triage",
  "queued",
  "in_progress",
  "done_local",
  "released",
  "wont_do",
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
};

/**
 * Що вважається відкритим: усе, крім «Викочено» і «Не робимо».
 *
 * Обидва виключені — це тупики, а не етапи: викочене поїхало в проді, «не
 * робимо» закрите свідомо. Тримати їх у черзі означало б, що список росте
 * назавжди й ним перестають користуватись.
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
 * Рівно ті три, які ставить людина: взяти в роботу, повернути в чергу,
 * відмовитись. «Готово локально» і «Викочено» ставлять ФАКТИ — коміт і деплой
 * (див. розділ «Релізи»), — і рука людини тут зробила б дошку брехливою:
 * «викочено» без деплою означає, що в проді цього немає, а звіт керівництву
 * скаже, що є. Не додавайте їх у кнопки.
 */
export const MOVABLE_STATUSES = ["in_progress", "queued", "wont_do"] as const;

export type MovableStatus = (typeof MOVABLE_STATUSES)[number];

export function isMovableStatus(value: unknown): value is MovableStatus {
  return typeof value === "string" && (MOVABLE_STATUSES as readonly string[]).includes(value);
}

/** Значок стану — щоб рядок читався оком, а не вичитувався. */
export const STATUS_EMOJI: Record<MovableStatus, string> = {
  in_progress: "▶️",
  queued: "⏸",
  wont_do: "✖️",
};

/** Куди веде посилання «відкрити в CRM». */
export const BOARD_PATH = "/dev-requests";

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
    createdAt: (row.created_at ?? "").trim(),
  };
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
 */
export function boardCardMeta(card: BoardCard): string {
  return [
    KIND_LABELS[card.kind],
    moduleKeyLabel(card.moduleKey),
    card.priority ? PRIORITY_LABELS[card.priority] : null,
  ]
    .map((part) => (part ?? "").trim())
    .filter(Boolean)
    .join(" · ");
}

/* ------------------------------ Тіло запиту ---------------------------- */

export type BoardRequest =
  | { ok: true; action: "list" }
  | { ok: true; action: "move"; number: number; status: MovableStatus }
  | { ok: false; status: number; error: string };

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

  const body = payload as { action?: unknown; number?: unknown; status?: unknown };
  const action = typeof body.action === "string" ? body.action.trim().toLowerCase() : "";

  if (action === "list") return { ok: true, action: "list" };

  if (action === "move") {
    const rawNumber = typeof body.number === "string" ? Number(body.number.trim()) : body.number;
    if (typeof rawNumber !== "number" || !Number.isInteger(rawNumber) || rawNumber <= 0) {
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

  return {
    ok: false,
    status: 400,
    error: action
      ? `Невідома дія «${action}». Є дві: list — показати чергу, move — пересунути картку.`
      : "Немає поля action. Є дві дії: list — показати чергу, move — пересунути картку.",
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
        lines.push(`${priorityMark(card.priority)}${card.label} — ${card.title}${meta ? ` · ${meta}` : ""}`);
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

const SELECT_COLUMNS = "number,title,body,kind,status,module_key,priority,created_at";

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
  | { ok: false; reason: "failed"; message: string };

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
