/**
 * Кому і куди дзвонити про нове повідомлення в обговоренні справи.
 *
 * Нитка одна на справу (`quote:<ref>`): її показують і сторінка прорахунку, і
 * сторінка дизайн-задачі. Перша редакція розсилки шукала отримувачів лише в
 * дизайн-задачі, тож нитка прорахунку без задачі мовчала зовсім: сервер
 * відповідав 403, і сповіщення не діставалось нікому. А саме там іде розмова
 * менеджера з проджектом про розрахунок — за два тижні до 24.09.2026 це 15 з
 * 19 повідомлень обговорень, і жодне нікого не сповістило. 22.09 так пропав
 * коментар проджекта в TS-0926-0041: менеджерка дізналась про нього випадково.
 *
 * Правило:
 * - менеджер і автор прорахунку, менеджер задачі та всі, хто вже писав у
 *   нитці, отримують посилання на ПРОРАХУНОК — там їхня робота;
 * - дизайнер (виконавець чи співвиконавець задачі) — на СВОЮ задачу:
 *   сторінку прорахунку він може й не відкривати;
 * - прорахунку немає (самостійна задача) — усім на задачу, як і раніше;
 * - автор сам собі не дзвонить; одна людина в кількох ролях — одне сповіщення.
 *
 * Чиста логіка без бази — перевіряється тестами (threadNotifications.test.ts).
 */

export type ThreadQuote = {
  id: string;
  number: string | null;
  assignedTo: string | null;
  createdBy: string | null;
};

export type ThreadTask = {
  id: string;
  title: string;
  assigneeUserId: string | null;
  managerUserId: string | null;
  collaboratorUserIds: string[];
};

export type ThreadTarget = {
  userId: string;
  link: { kind: "quote"; quote: ThreadQuote } | { kind: "design"; task: ThreadTask };
};

export type ThreadNotificationRow = {
  user_id: string;
  title: string;
  body: string;
  href: string;
  type: "info";
};

const MAX_BODY = 220;

function cleanId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const id = value.trim();
  return id || null;
}

/** Рядок `activity_log` дизайн-задачі → учасники задачі. */
export function toThreadTask(row: {
  id: string;
  title?: string | null;
  metadata?: Record<string, unknown> | null;
}): ThreadTask {
  const metadata = row.metadata ?? {};
  const collaborators = Array.isArray(metadata.collaborator_user_ids) ? metadata.collaborator_user_ids : [];
  return {
    id: row.id,
    title: (row.title ?? "").trim() || "дизайн-задача",
    assigneeUserId: cleanId(metadata.assignee_user_id),
    managerUserId: cleanId(metadata.manager_user_id),
    collaboratorUserIds: collaborators.map(cleanId).filter((id): id is string => Boolean(id)),
  };
}

/**
 * @param tasks задачі нитки, НАЙНОВІША ПЕРШОЮ — вона стає посиланням для тих,
 *   кому прорахунку не показати.
 */
export function planThreadRecipients(input: {
  authorId: string;
  quote: ThreadQuote | null;
  tasks: ThreadTask[];
  participantIds: string[];
}): ThreadTarget[] {
  const { authorId, quote, tasks, participantIds } = input;
  const newestTask = tasks[0] ?? null;
  if (!quote && !newestTask) return [];

  const targets = new Map<string, ThreadTarget>();
  const add = (rawId: string | null, link: ThreadTarget["link"]) => {
    const userId = cleanId(rawId);
    if (!userId || userId === authorId || targets.has(userId)) return;
    targets.set(userId, { userId, link });
  };
  // Хто працює з прорахунком — туди й посилання; без прорахунку — на задачу.
  const homeLink: ThreadTarget["link"] = quote
    ? { kind: "quote", quote }
    : { kind: "design", task: newestTask as ThreadTask };

  // Порядок важливий: перша роль людини визначає посилання.
  if (quote) {
    add(quote.assignedTo, homeLink);
    add(quote.createdBy, homeLink);
  }
  for (const task of tasks) {
    add(task.assigneeUserId, { kind: "design", task });
    for (const collaborator of task.collaboratorUserIds) add(collaborator, { kind: "design", task });
  }
  for (const task of tasks) add(task.managerUserId, homeLink);
  for (const participant of participantIds) add(participant, homeLink);

  return [...targets.values()];
}

/** Скільки після запису повідомлення по ньому ще можна розіслати сповіщення. */
export const FRESH_MESSAGE_WINDOW_MS = 10 * 60_000;

/** Допуск на розбіжність годинників: «з майбутнього» довше цього — підробка. */
const CLOCK_SKEW_MS = 60_000;

export type ThreadMessageRow = {
  created_by?: string | null;
  kind?: string | null;
  body?: string | null;
  created_at?: string | null;
  visibility?: string | null;
  deleted_at?: string | null;
};

/**
 * Чи автор справді щойно написав у нитку саме цей текст — для всієї команди.
 *
 * Клієнт шле текст окремим запитом після запису повідомлення, і без цієї
 * перевірки вхід розсилав би будь-що будь-кому зі справи — від імені автора й
 * з довірою, яку має сповіщення CRM. Перевіряємо на свіжих рядках нитки, які
 * функція й так читає заради учасників: зайвого запиту це не коштує.
 *
 * Лише `visibility = team`: «внутрішнє» повідомлення бачать тільки ті, хто
 * має доступ до Фінансів, а сповіщення пішло б усім учасникам справи — у
 * push і Telegram. Видалене не розсилаємо; дата з майбутнього (created_at
 * клієнт може поставити сам) тримала б повідомлення «свіжим» вічно.
 */
export function hasFreshOwnMessage(
  rows: ThreadMessageRow[],
  options: { authorId: string; text: string; now: number }
): boolean {
  return rows.some((row) => {
    if (row.created_by !== options.authorId || row.kind !== "message") return false;
    if (row.visibility !== "team" || row.deleted_at) return false;
    if ((row.body ?? "").trim() !== options.text) return false;
    const at = Date.parse(row.created_at ?? "");
    if (!Number.isFinite(at)) return false;
    return options.now - at <= FRESH_MESSAGE_WINDOW_MS && at - options.now <= CLOCK_SKEW_MS;
  });
}

function trimBody(text: string): string {
  return text.length > MAX_BODY ? `${text.slice(0, MAX_BODY - 3)}...` : text;
}

/**
 * Рядки для `deliverNotifications`, розкладені за категорією: прорахунок іде
 * як «Коментарі у прорахунках», задача — як «Дизайн-задачі». Людина вимикає
 * канали по категоріях, і коментар до прорахунку не має питати дозволу в
 * дизайнерської.
 */
export function buildThreadNotificationRows(
  targets: ThreadTarget[],
  options: { actorLabel: string; text: string }
): { quote: ThreadNotificationRow[]; design: ThreadNotificationRow[] } {
  const body = trimBody(options.text);
  const quoteRows: ThreadNotificationRow[] = [];
  const designRows: ThreadNotificationRow[] = [];

  for (const target of targets) {
    if (target.link.kind === "quote") {
      const { quote } = target.link;
      const label = quote.number ? `#${quote.number}` : quote.id;
      quoteRows.push({
        user_id: target.userId,
        title: `${options.actorLabel} написав(ла) в обговоренні прорахунку`,
        body: `Прорахунок ${label}: ${body}`,
        href: `/orders/estimates/${quote.id}`,
        type: "info",
      });
      continue;
    }
    const { task } = target.link;
    designRows.push({
      user_id: target.userId,
      title: `${options.actorLabel} написав(ла) в чаті задачі`,
      body: `${task.title}: ${body}`,
      // Префікс «/design/» — це ще й те, за чим notify-users розпізнає
      // дизайн-категорію, тож він тут не лише для переходу.
      href: `/design/${task.id}`,
      type: "info",
    });
  }

  return { quote: quoteRows, design: designRows };
}
