import { escapeTelegramHtml, type InlineKeyboard, type InlineKeyboardButton } from "../_telegram";
import {
  boardCardMeta,
  groupBoardCards,
  isMovableStatus,
  MOVABLE_STATUSES,
  priorityMark,
  sortBoardCards,
  STATUS_EMOJI,
  STATUS_LABELS,
  type BoardCard,
  type MovableStatus,
} from "./devRequestBoard";

/**
 * Черга запитів у Telegram: команда, екрани й розбір натискань.
 *
 * Патерн той самий, що у флоу відсутностей (_absenceBotFlow.ts): стан їде в
 * callback_data, а кожен крок РЕДАГУЄ те саме повідомлення. Список → картка →
 * зміна статусу відбуваються в одному бульбашці замість стрічки з десяти
 * повідомлень, яку потім гортати.
 *
 * Тут немає ні мережі, ні бази, ні перевірки прав — саме тому це та частина
 * гілки, яку можна накрити тестами. Права перевіряє вебхук, і робить це на
 * КОЖНОМУ кроці: кнопку можна переслати іншій людині, і натиснути її здатен
 * будь-хто (той самий урок, що з handleAbsenceDecisionCallback).
 */

/**
 * Команди, що відкривають чергу.
 *
 * «/черга» — основна, нею користуються. «/queue» — той самий вхід латиницею, і
 * саме він потрапляє в setMyCommands: Bot API приймає в списку команд лише
 * [a-z0-9_], тож кирилицю там зареєструвати не можна в принципі. На роботу це
 * не впливає — незнайому команду Telegram усе одно доставляє звичайним текстом.
 */
export const QUEUE_COMMANDS = ["/черга", "/queue"] as const;

export function isQueueCommand(command: string | null | undefined): boolean {
  return typeof command === "string" && (QUEUE_COMMANDS as readonly string[]).includes(command);
}

/**
 * Хто бачить чергу: власник або SEO.
 *
 * Дзеркало предиката tosho.is_owner_or_seo() з бази — того самого, на якому
 * стоїть політика читання приватних карток (scripts/dev-requests-schema.sql).
 * Дзеркало, а не виклик: бот ходить під service-role і RLS ОБХОДИТЬ, тож у базі
 * цей предикат для нього просто не спрацьовує. Тобто перевірка тут — єдиний
 * захист черги, і без неї будь-хто з підключеним ботом бачив би приватні картки.
 *
 * Окремо від resolveAccessLevel(_lib/assistantAccess.ts), хоч «full» там
 * означає те саме: та шкала описує обсяг ВІДПОВІДЕЙ асистента й може зрости
 * (додасться роль — і черга відкриється мовчки). Гейт черги має мінятись лише
 * свідомо.
 */
export function isOwnerOrSeo(role: { accessRole: string | null; jobRole: string | null }): boolean {
  const access = (role.accessRole ?? "").trim().toLowerCase();
  const job = (role.jobRole ?? "").trim().toLowerCase();
  return access === "owner" || job === "seo";
}

/** Скільки карток показуємо списком. Далі клавіатура перестає читатись із телефона. */
export const QUEUE_LIST_MAX = 8;

/** Кнопок із номерами в ряд. */
const NUMBERS_PER_ROW = 4;

/** Скільки знаків опису лізе в екран картки, поки його ще читають. */
export const QUEUE_BODY_CHARS = 700;

export const QUEUE_FORBIDDEN_MESSAGE =
  "Черга запитів — для керівництва: у ній видно й приватні картки.\n\nЩоб завести задачу, перешли мені повідомлення або напиши /задача — це доступно всім.";

/** Toast має ліміт ~200 знаків і показується поверх екрана — тут коротко. */
export const QUEUE_FORBIDDEN_TOAST = "Черга доступна лише керівництву";

export const QUEUE_CARD_GONE_TOAST = "Картки вже немає";

export const QUEUE_FAILED_TOAST = "Не вдалось — спробуй ще раз";

export const QUEUE_UNKNOWN_TOAST = "Невідома дія";

/* ---------------------------- callback_data ---------------------------- */

/**
 * Префікс гілки. Ліміт Telegram — 64 БАЙТИ на callback_data, тож усередині
 * лише короткий номер картки й статус; uuid сюди не кладемо навіть подумки
 * (36 байтів самого лише ідентифікатора).
 */
const PREFIX = "dq";

export function queueListCallback(): string {
  return `${PREFIX}:l`;
}

export function queueCardCallback(number: number): string {
  return `${PREFIX}:c:${number}`;
}

export function queueMoveCallback(number: number, status: MovableStatus): string {
  return `${PREFIX}:m:${number}:${status}`;
}

export type QueueCallback =
  | { kind: "list" }
  | { kind: "card"; number: number }
  | { kind: "move"; number: number; status: MovableStatus };

/**
 * Розбір натискання. null — дані не наші або биті: показуємо «невідома дія»
 * замість того, щоб гадати. Статус звіряється з тим самим переліком, що й у
 * ендпоінта: «released» із підробленої кнопки сюди не пройде.
 */
export function parseQueueCallback(data: string | null | undefined): QueueCallback | null {
  if (typeof data !== "string") return null;
  const parts = data.split(":");
  if (parts[0] !== PREFIX) return null;

  if (parts[1] === "l") return { kind: "list" };

  const number = Number(parts[2]);
  if (!Number.isInteger(number) || number <= 0) return null;

  if (parts[1] === "c") return { kind: "card", number };
  if (parts[1] === "m" && isMovableStatus(parts[3])) {
    return { kind: "move", number, status: parts[3] };
  }
  return null;
}

/* -------------------------------- Екрани ------------------------------- */

export type QueueScreen = { text: string; keyboard: InlineKeyboard };

/**
 * Список відкритих карток.
 *
 * Групуємо за колонками дошки, як і у відповіді ендпоінта: людина, яка вранці
 * дивилась дошку, має побачити ту саму картину. Показуємо не більше
 * QUEUE_LIST_MAX — решта згадана рядком, щоб не було відчуття, що черга саме
 * така коротка.
 */
export function queueListScreen(input: { cards: BoardCard[]; hasMore?: boolean }): QueueScreen {
  const sorted = sortBoardCards(input.cards);
  const shown = sorted.slice(0, QUEUE_LIST_MAX);
  const rest = sorted.length - shown.length;
  const total = `${sorted.length}${input.hasMore ? "+" : ""}`;

  if (sorted.length === 0) {
    return {
      text: [
        "📋 <b>Черга запитів</b>",
        "",
        "Порожньо — жодної відкритої картки.",
        "Нова з'явиться, щойно хтось перешле повідомлення або напише /задача.",
      ].join("\n"),
      keyboard: [],
    };
  }

  const lines = [`📋 <b>Черга запитів</b> · ${total} відкритих`];
  for (const group of groupBoardCards(shown)) {
    lines.push("", `<b>${escapeTelegramHtml(group.label)}</b>`);
    for (const card of group.cards) {
      const kindMeta = boardCardMeta(card);
      lines.push(
        `${priorityMark(card.priority)}${escapeTelegramHtml(card.label)} · ${escapeTelegramHtml(card.title)}` +
          (kindMeta ? ` — <i>${escapeTelegramHtml(kindMeta)}</i>` : "")
      );
    }
  }
  if (rest > 0 || input.hasMore) {
    lines.push("", `…і ще ${rest}${input.hasMore ? "+" : ""} — решта на дошці.`);
  }
  lines.push("", "Тисни номер, щоб відкрити картку.");

  // Кнопки — ЛИШЕ номери. По три кнопки дій під кожною карткою перетворили б
  // клавіатуру на простирадло, у якому не влучиш пальцем.
  const keyboard: InlineKeyboard = [];
  for (let i = 0; i < shown.length; i += NUMBERS_PER_ROW) {
    keyboard.push(
      shown.slice(i, i + NUMBERS_PER_ROW).map((card) => ({
        text: card.label,
        callback_data: queueCardCallback(card.number),
      }))
    );
  }

  return { text: lines.join("\n"), keyboard };
}

export type ClampedBody = { text: string; truncated: boolean };

/**
 * Опис під екран телефона.
 *
 * Ріжемо по межі речення, а якщо її поблизу немає — по межі слова: обрив
 * посеред слова читається як поламаний текст, а не як «далі є ще». Поріг 60%
 * не дає піти в інший бік і показати огризок замість опису.
 */
export function clampCardBody(raw: string | null | undefined, max: number = QUEUE_BODY_CHARS): ClampedBody {
  const body = (raw ?? "").trim();
  if (body.length <= max) return { text: body, truncated: false };

  const head = body.slice(0, max);
  const floor = max * 0.6;
  const sentence = Math.max(
    head.lastIndexOf(". "),
    head.lastIndexOf("! "),
    head.lastIndexOf("? "),
    head.lastIndexOf("\n")
  );
  if (sentence >= floor) return { text: head.slice(0, sentence + 1).trim(), truncated: true };

  const space = head.lastIndexOf(" ");
  const cut = space >= floor ? head.slice(0, space) : head;
  return { text: `${cut.trim()}…`, truncated: true };
}

/** Підписи дій. Дієслово + куди — щоб не гадати, що робить кнопка. */
const MOVE_LABELS: Record<MovableStatus, string> = {
  in_progress: "В роботу",
  queued: "У чергу",
  wont_do: "Не робимо",
};

/**
 * Картка з кнопками дій.
 *
 * Кнопки поточного стану немає: «В роботу» під карткою, яка вже в роботі, —
 * це або нічого не робить, або читається як «щось пішло не так».
 */
export function queueCardScreen(card: BoardCard, boardUrl: string): QueueScreen {
  const body = clampCardBody(card.body);
  const meta = boardCardMeta(card);

  const lines = [
    `${priorityMark(card.priority)}<b>${escapeTelegramHtml(card.label)}</b> · <i>${escapeTelegramHtml(
      STATUS_LABELS[card.status]
    )}</i>`,
    "",
    `<b>${escapeTelegramHtml(card.title)}</b>`,
  ];
  if (body.text) {
    lines.push("", escapeTelegramHtml(body.text));
    if (body.truncated) lines.push("", "<i>Опис обрізано — повністю на дошці.</i>");
  }
  if (meta) lines.push("", escapeTelegramHtml(meta));

  const actions: InlineKeyboardButton[] = MOVABLE_STATUSES.filter((status) => status !== card.status).map(
    (status) => ({
      text: `${STATUS_EMOJI[status]} ${MOVE_LABELS[status]}`,
      callback_data: queueMoveCallback(card.number, status),
    })
  );

  const keyboard: InlineKeyboard = [];
  for (let i = 0; i < actions.length; i += 2) keyboard.push(actions.slice(i, i + 2));
  keyboard.push([
    { text: "← Назад", callback_data: queueListCallback() },
    { text: "Відкрити в CRM", url: boardUrl },
  ]);

  return { text: lines.join("\n"), keyboard };
}

/** Toast після зміни статусу: коротко й по факту. */
export function moveToast(status: MovableStatus): string {
  return `${STATUS_EMOJI[status]} ${STATUS_LABELS[status]}`;
}

/** Картка зникла між показом списку й натисканням (наприклад, її видалили). */
export function queueCardGoneScreen(number: number): QueueScreen {
  return {
    text: `Картки REQ-${number} вже немає — схоже, її видалили з дошки.`,
    keyboard: [[{ text: "← До черги", callback_data: queueListCallback() }]],
  };
}
