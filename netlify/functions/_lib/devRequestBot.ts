import { moduleKeyLabel } from "../../../src/lib/projectMap";
import { escapeTelegramHtml } from "../_telegram";
import type { DevRequestKind, DevRequestPriority } from "./devRequestDraft";

/**
 * Чиста частина гілки «завести задачу з Telegram»: які команди її вмикають,
 * що лягає в тіло картки й що бот пише у відповідь.
 *
 * Тут немає ні мережі, ні бази — саме тому це єдина частина гілки, яку можна
 * перевірити тестами: живцем бот не тестується.
 */

/**
 * Команди, що заводять картку.
 *
 * «/задача» — основна: нею користуються люди. «/task» — той самий вхід
 * латиницею, і саме він єдиний потрапляє в setMyCommands: Bot API приймає в
 * списку команд лише [a-z0-9_], тож кирилицю там зареєструвати не можна в
 * принципі (спроба валить увесь виклик). На роботу це не впливає — незнайому
 * команду Telegram усе одно доставляє звичайним текстом.
 */
export const TASK_COMMANDS = ["/задача", "/task"] as const;

export function isTaskCommand(command: string | null | undefined): boolean {
  return typeof command === "string" && (TASK_COMMANDS as readonly string[]).includes(command);
}

/**
 * Людські підписи типу й пріоритету.
 *
 * Експортовані, бо їх читає не лише бот: той самий рядок «тип · напрямок ·
 * пріоритет» показує і відповідь ендпоінта захоплення (_lib/devRequestCapture.ts).
 * Третя копія цих словників розійшлась би з дошкою на першій же правці.
 */
export const KIND_LABELS: Record<DevRequestKind, string> = {
  bug: "Не працює",
  friction: "Незручно",
  feature: "Нова можливість",
};

export const PRIORITY_LABELS: Record<DevRequestPriority, string> = {
  low: "Не горить",
  normal: "Звичайний",
  high: "Терміново",
};

export type DevRequestMetaInput = {
  kind: DevRequestKind;
  /** Ключ напрямку. Невідомий чи порожній — рядок просто коротший. */
  moduleKey: string | null;
  priority: DevRequestPriority;
};

/**
 * Рядок «Не працює · Прорахунки · Терміново».
 *
 * Порожні частини випадають разом із роздільником: невідомий напрямок має
 * робити рядок коротшим, а не додавати «null» чи «· ·».
 */
export function buildDevRequestMeta(input: DevRequestMetaInput): string {
  return [KIND_LABELS[input.kind], moduleKeyLabel(input.moduleKey), PRIORITY_LABELS[input.priority]]
    .map((part) => (part ?? "").trim())
    .filter(Boolean)
    .join(" · ");
}

/** Людський підпис «REQ-42». Той самий формат, що на дошці. */
export function formatRequestNumber(number: number): string {
  return `REQ-${number}`;
}

export type DevRequestBodyInput = {
  /** Опис від розбору. Може бути порожнім — модель не вигадує того, чого не сказали. */
  body: string;
  /** Картка з пересланого повідомлення: слід джерела має лишитись у тілі. */
  forwarded: boolean;
  /** Хто написав вихідне повідомлення. null — Telegram джерело приховав. */
  forwardedFrom?: string | null;
};

/**
 * Тіло картки.
 *
 * Для пересланого дописуємо, чиї це слова. Без цього рядка головний сценарій
 * («переслати боту чуже повідомлення») втрачає рівно те, заради чого його
 * пересилали: авторство. Ім'я в модель не йде — інакше воно полізло б у назву.
 */
export function buildDevRequestBody(input: DevRequestBodyInput): string {
  const body = (input.body ?? "").trim();
  if (!input.forwarded) return body;

  const from = (input.forwardedFrom ?? "").trim();
  const attribution = from ? `Переслано з Telegram, автор — ${from}.` : "Переслано з Telegram.";
  return body ? `${body}\n\n${attribution}` : attribution;
}

export type DevRequestReplyInput = {
  number: number;
  title: string;
  kind: DevRequestKind;
  /** Ключ напрямку. Невідомий чи порожній — рядок просто коротший. */
  moduleKey: string | null;
  priority: DevRequestPriority;
  /** «Схоже, це вже працює: …». Картку це не скасовує. */
  existingFeature: string | null;
};

/**
 * Відповідь у чат. parse_mode=HTML, тож усе, що прийшло від моделі чи людини,
 * проходить через екранування.
 *
 * Підказка «це вже працює» стоїть ПІСЛЯ номера й назви навмисно: картка вже
 * створена, і повідомлення не має виглядати як відмова. Впевнена неправильна
 * відповідь гірша за зайву картку.
 */
export function buildDevRequestReply(input: DevRequestReplyInput): string {
  const meta = buildDevRequestMeta(input);

  const lines = [
    `📝 <b>${escapeTelegramHtml(formatRequestNumber(input.number))}</b> — записав`,
    "",
    `<b>${escapeTelegramHtml(input.title)}</b>`,
  ];
  if (meta) lines.push(escapeTelegramHtml(meta));

  const existing = (input.existingFeature ?? "").trim();
  if (existing) {
    lines.push("", `💡 Схоже, це вже працює: ${escapeTelegramHtml(existing)}`);
  }
  return lines.join("\n");
}

/**
 * Ретрай Telegram (або повторний запуск background-функції) прилітає тим самим
 * повідомленням. Унікальний індекс (tg_chat_id, tg_message_id) його ловить, і
 * людині це не помилка, а факт.
 */
export const ALREADY_CAPTURED_MESSAGE = "Цю задачу вже записано ✅";

/**
 * Порожня «/задача» — не помилка, а незакінчена думка.
 *
 * ЧОМУ ЦЕ НЕ ІНСТРУКЦІЯ, А ЗАПИТАННЯ. Тап по «task» у меню команд Telegram
 * ВІДПРАВЛЯЄ команду одразу — дописати до неї текст клієнт не дає. Тобто
 * єдиний шлях, який лишався, — набрати «/задача …» руками цілком, а меню
 * команд ставало марним. Тепер бот відповідає цим рядком із `force_reply`:
 * Telegram сам відкриває поле вводу з наведенням на відповідь, і те, що
 * людина напише (чи надиктує) далі, приходить як reply — без жодної команди.
 *
 * Текст рядка — частина механізму, а не оформлення: вхідну відповідь ми
 * впізнаємо саме по ньому (isTaskPromptReply нижче). Міняючи його, треба
 * памʼятати, що людям у чаті лишаться старі підказки, на які теж відповідають.
 */
export const EMPTY_TASK_COMMAND_MESSAGE = "Слухаю. Що записати?";

/** Плейсхолдер у полі вводу, поки людина думає. Bot API: до 64 символів. */
export const TASK_PROMPT_PLACEHOLDER = "Опиши своїми словами, що не так";

/**
 * Чи це відповідь на наше запитання «Що записати?».
 *
 * Звіряємось із текстом, а не з id повідомлення: тримати id у базі заради
 * одного кроку діалогу — окрема таблиця й окремий обовʼязок її чистити, а
 * ціна помилки тут нульова (у найгіршому разі картка не заведеться з першого
 * разу). Стара підказка теж проходить: у чатах лишились її повідомлення, і
 * відповідь на них має працювати.
 */
const TASK_PROMPT_TEXTS = [
  EMPTY_TASK_COMMAND_MESSAGE,
  "Напиши, що саме записати:",
];

export function isTaskPromptReply(repliedText: string | null | undefined): boolean {
  const text = (repliedText ?? "").trim();
  if (!text) return false;
  return TASK_PROMPT_TEXTS.some((prompt) => text.startsWith(prompt));
}

/** Переслали голосове, фото чи стікер — картку з цього не зробити. */
export const NON_TEXT_FORWARD_MESSAGE =
  "Я читаю лише текст. Перешли текстове повідомлення або напиши /задача і опиши своїми словами.";
