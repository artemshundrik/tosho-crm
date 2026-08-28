import { escapeTelegramHtml, type InlineKeyboard, type InlineKeyboardButton } from "../_telegram";
import {
  boardCardMeta,
  groupBoardCards,
  isMovableStatus,
  MOVABLE_STATUSES,
  priorityMark,
  privacyMark,
  releasedCardMessage,
  sortBoardCards,
  STATUS_EMOJI,
  STATUS_LABELS,
  todayShelfCards,
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
 * Хто бачить чергу: власник або CEO.
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

/**
 * Стеля теми в повідомленні — уже ПІСЛЯ екранування.
 *
 * Ліміт Telegram — 4096 знаків на повідомлення, і перевищення означає не
 * обрізаний текст, а мовчазну відмову: sendMessage поверне помилку, людина
 * набере «/черга» й не отримає нічого. Тема в базі не обмежена ніяк (поле text,
 * форма створення без maxLength), тож вісім карток із довгими темами кладуть
 * список без жодного зловмисника.
 *
 * Рахуємо саме екрановану довжину: «&» перетворюється на «&amp;», тобто
 * полотно з амперсандів роздувається вп'ятеро, і ліміт по сирому тексту тут не
 * захищає.
 */
export const QUEUE_TITLE_CHARS = 200;

/** Те саме для опису: 700 знаків самих «&» дали б 3500 після екранування. */
const QUEUE_BODY_ESCAPED_CHARS = 1200;

/**
 * Екранування з межею по РЕЗУЛЬТАТУ.
 *
 * Ріжемо сирий рядок і щоразу міряємо екранований: різати вже екранований було
 * б небезпечно — зріз посеред «&amp;» лишає голий «&», на якому розбір HTML у
 * Telegram може впасти цілком. Цикл обмежений max ітерацій, кожна на короткому
 * рядку.
 */
export function escapeClamped(raw: string | null | undefined, maxEscaped: number): string {
  const text = (raw ?? "").trim();
  const escaped = escapeTelegramHtml(text);
  if (escaped.length <= maxEscaped) return escaped;

  let cut = Math.min(text.length, maxEscaped);
  while (cut > 0 && escapeTelegramHtml(text.slice(0, cut)).length > maxEscaped - 1) cut -= 1;
  return `${escapeTelegramHtml(text.slice(0, cut).trimEnd())}…`;
}

export const QUEUE_FORBIDDEN_MESSAGE =
  "Черга запитів — для керівництва: у ній видно й приватні картки.\n\nЩоб завести задачу, перешли мені повідомлення або напиши /задача — це доступно всім.";

/** Toast має ліміт ~200 знаків і показується поверх екрана — тут коротко. */
export const QUEUE_FORBIDDEN_TOAST = "Черга доступна лише керівництву";

export const QUEUE_CARD_GONE_TOAST = "Картки вже немає";

/** Спроба зняти «Викочено». Toast короткий, повний текст — у самій картці. */
export const QUEUE_RELEASED_TOAST = "Викочене не знімають — заведи нову картку";

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
 *
 * ВЗЯТЕ НА СЬОГОДНІ ЙДЕ ПЕРШИМ І ЦІЛКОМ — і не займає місць у стелі решти.
 * Полиця «Сьогодні» відповідає на «за що хвататись зараз», а стеля в вісім
 * рядків рахує найсвіжіші картки: без цього те, чим людина зайнята сьогодні,
 * могло взагалі не потрапити на екран. На відміну від ендпоінта, у колонках
 * нижче ці картки НЕ повторюємо: там рядок коштує половину екрана телефона.
 */
export function queueListScreen(input: { cards: BoardCard[]; hasMore?: boolean }): QueueScreen {
  const sorted = sortBoardCards(input.cards);
  const today = todayShelfCards(sorted);
  const takenToday = new Set(today.map((card) => card.number));
  const others = sorted.filter((card) => !takenToday.has(card.number));
  // Стеля рахує ЛИШЕ решту: полиця з чотирьох справ не має з'їдати половину
  // списку доступного — інакше, набравши день, ти перестаєш бачити чергу.
  const shownOthers = others.slice(0, QUEUE_LIST_MAX);
  const shown = [...today, ...shownOthers];
  const rest = others.length - shownOthers.length;
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
  if (today.length > 0) {
    lines.push("", `🎯 <b>Сьогодні</b>`);
    for (const card of today) {
      lines.push(
        `${privacyMark(card)}${escapeTelegramHtml(card.label)} · ` +
          escapeClamped(card.title, QUEUE_TITLE_CHARS) +
          ` — <i>${escapeTelegramHtml(STATUS_LABELS[card.status])}</i>`
      );
    }
  }
  for (const group of groupBoardCards(shownOthers)) {
    lines.push("", `<b>${escapeTelegramHtml(group.label)}</b>`);
    for (const card of group.cards) {
      const kindMeta = boardCardMeta(card);
      lines.push(
        `${privacyMark(card)}${priorityMark(card.priority)}${escapeTelegramHtml(card.label)} · ` +
          escapeClamped(card.title, QUEUE_TITLE_CHARS) +
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
  // «В ідеї», а не «Ідеї»: сусіди — дієслова («в роботу», «у чергу»), і одинокий
  // іменник читався б як назва розділу, а не як дія над цією карткою.
  someday: "В ідеї",
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
    `${privacyMark(card)}${priorityMark(card.priority)}<b>${escapeTelegramHtml(
      card.label
    )}</b> · <i>${escapeTelegramHtml(STATUS_LABELS[card.status])}</i>`,
    "",
    `<b>${escapeClamped(card.title, QUEUE_TITLE_CHARS)}</b>`,
  ];
  if (body.text) {
    const escapedBody = escapeClamped(body.text, QUEUE_BODY_ESCAPED_CHARS);
    lines.push("", escapedBody);
    if (body.truncated || escapedBody.endsWith("…")) {
      lines.push("", "<i>Опис обрізано — повністю на дошці.</i>");
    }
  }
  if (meta) lines.push("", escapeTelegramHtml(meta));

  // Викочену картку руками не знімають — це факт деплою (див.
  // moveBoardCard). Кнопок дій у неї немає взагалі, і про це сказано прямо:
  // мовчазно порожній ряд читався б як «щось відвалилось».
  const released = card.status === "released";
  if (released) lines.push("", `<i>${escapeTelegramHtml(releasedCardMessage(card.number))}</i>`);

  const actions: InlineKeyboardButton[] = released
    ? []
    : MOVABLE_STATUSES.filter((status) => status !== card.status).map((status) => ({
        text: `${STATUS_EMOJI[status]} ${MOVE_LABELS[status]}`,
        callback_data: queueMoveCallback(card.number, status),
      }));

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
