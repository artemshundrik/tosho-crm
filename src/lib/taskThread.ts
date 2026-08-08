/**
 * Чиста логіка нитки обговорення справи: ключ нитки, розкладка стрічки на
 * дні/групи бабблів, лічильник непрочитаного, показники шапки.
 *
 * Без React і без запитів — усе перевіряється тестами (taskThread.test.ts).
 * Дизайн: docs/TASK_CHAT_DESIGN.md.
 */

export type ThreadEntryKind = "message" | "event";

/** Файл, показаний у бабблі. Живе в тому ж сховищі, що й вкладення задачі. */
export type ThreadAttachment = {
  fileName: string;
  fileSize: number | null;
  mimeType: string | null;
  bucket: string;
  path: string;
};

export type ThreadEntry = {
  id: string;
  kind: ThreadEntryKind;
  body: string;
  createdAt: string;
  createdBy: string | null;
  /** team — усій команді; finance — лише тим, хто має доступ до Фінансів. */
  visibility: "team" | "finance";
  source: "crm" | "telegram";
  /** Для kind="event" — action із activity_log. */
  eventType: string | null;
  isPinned: boolean;
  /** id повідомлення, на яке це є відповіддю. */
  replyTo?: string | null;
  /** Видалене лишається в стрічці позначкою — інакше відповіді на нього висять самі. */
  deletedAt?: string | null;
  attachments?: ThreadAttachment[];
  pending?: boolean;
  failed?: boolean;
};

export type ThreadBlock =
  | { type: "day"; key: string; label: string; count: number }
  | { type: "service"; entry: ThreadEntry }
  | { type: "group"; authorId: string | null; own: boolean; entries: ThreadEntry[] };

/**
 * Прорахунок, його дизайн-задача і його замовлення дають ОДНУ нитку.
 * quote_id у метаданих задач буває виду `standalone-<uuid>`, тому працюємо
 * з текстом і нічого не приводимо до uuid.
 */
export function threadKeyForQuote(quoteRef: string): string {
  return `quote:${quoteRef}`;
}

/** Ручне замовлення без прорахунку — власна нитка. */
export function threadKeyForOrder(orderId: string): string {
  return `order:${orderId}`;
}

/**
 * Навмисно ЛАГІДНА перевірка: лише форма uuid, без вимог до версії й варіанта.
 * Сувора RFC-перевірка тут була б іншою поведінкою, а колонка quote_id приймає
 * будь-який uuid, який реально лежить у tosho.quotes.
 */
const QUOTE_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * FK на tosho.quotes: у колонку quote_id можна класти лише справжній uuid.
 * У самостійних задач quote_id має вигляд `standalone-<uuid>` — для них
 * повертаємо null, і нитку тримає сам thread_key.
 */
export function quoteIdFromRef(quoteRef: string): string | null {
  return QUOTE_UUID_RE.test(quoteRef) ? quoteRef : null;
}

/** Посилання на прорахунок із ключа нитки, або null для замовлень без нього. */
export function quoteRefFromThreadKey(threadKey: string): string | null {
  return threadKey.startsWith("quote:") ? threadKey.slice("quote:".length) : null;
}

/** Ключ дня в МІСЦЕВОМУ часі: групувати за UTC — значить розрізати вечір навпіл. */
function dayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

function dayLabel(iso: string, now: Date): string {
  const key = dayKey(new Date(iso));
  if (key === dayKey(now)) return "Сьогодні";
  if (key === dayKey(new Date(now.getTime() - 86_400_000))) return "Учора";
  return new Date(iso).toLocaleDateString("uk-UA", { day: "numeric", month: "long" });
}

/** «Сьогодні» / «Учора» / «31 лип.» — коротко, щоб влізло в одну колонку дайджесту. */
function shortDayLabel(iso: string, now: Date): string {
  const key = dayKey(new Date(iso));
  if (key === dayKey(now)) return "Сьогодні";
  if (key === dayKey(new Date(now.getTime() - 86_400_000))) return "Учора";
  return new Date(iso).toLocaleDateString("uk-UA", { day: "numeric", month: "short" });
}

/** Наскільки повідомлення може «прилипнути» до попереднього в одну групу. */
const GROUP_WINDOW_MS = 5 * 60 * 1000;

/**
 * Розкладка стрічки: пігулка дня → службові події → групи бабблів.
 * `own` рахується від СПРАВЖНЬОГО автора: у режимі «очима співробітника»
 * viewUserId ≠ userId, і за viewUserId стрічка віддзеркалилась би.
 */
export function buildThreadBlocks(
  entries: ThreadEntry[],
  options: { userId: string | null; now: Date }
): ThreadBlock[] {
  const sorted = [...entries].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const blocks: ThreadBlock[] = [];
  let currentDay: string | null = null;
  let dayBlock: Extract<ThreadBlock, { type: "day" }> | null = null;
  let group: Extract<ThreadBlock, { type: "group" }> | null = null;

  for (const item of sorted) {
    const key = dayKey(new Date(item.createdAt));
    if (key !== currentDay) {
      currentDay = key;
      group = null;
      dayBlock = { type: "day", key, label: dayLabel(item.createdAt, options.now), count: 0 };
      blocks.push(dayBlock);
    }
    if (dayBlock) dayBlock.count += 1;

    if (item.kind === "event") {
      group = null;
      blocks.push({ type: "service", entry: item });
      continue;
    }

    const last = group?.entries[group.entries.length - 1];
    const fits =
      group &&
      last &&
      group.authorId === item.createdBy &&
      last.visibility === item.visibility &&
      new Date(item.createdAt).getTime() - new Date(last.createdAt).getTime() <= GROUP_WINDOW_MS;

    if (fits && group) {
      group.entries.push(item);
      continue;
    }

    group = {
      type: "group",
      authorId: item.createdBy,
      own: Boolean(options.userId) && item.createdBy === options.userId,
      entries: [item],
    };
    blocks.push(group);
  }

  return blocks;
}

/** Непрочитане — лише чужі повідомлення після позначки. Події не рахуємо. */
export function countUnread(
  entries: ThreadEntry[],
  lastReadAt: string | null,
  userId: string | null
): number {
  return entries.filter((item) => {
    if (item.kind !== "message") return false;
    if (item.createdBy && item.createdBy === userId) return false;
    if (!lastReadAt) return true;
    return item.createdAt > lastReadAt;
  }).length;
}

export type ThreadDayDigest = {
  key: string;
  label: string;
  /** Скільки сирих подій згорнуто в цей рядок. */
  count: number;
  /** «2 правки · дедлайн зсунуто · 2 візуали» */
  summary: string;
  marks: Array<"rev" | "vis" | "dl">;
  entries: ThreadEntry[];
};

const plural = (n: number, one: string, few: string, many: string) => {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
};

/**
 * Згортка подій у рядок на день.
 *
 * Навіщо: у важкій задачі буває 75 подій за 18 днів (перевірено на проді,
 * «Візуал футболки Теплекс»). Сирим списком це стіна однакових рядків, у якій
 * нічого не видно. Дайджест дає 18 рядків, де історія читається з першого
 * погляду: те саме коло «правка · дедлайн · візуал», повторене дванадцять разів.
 */
export function buildDayDigests(events: ThreadEntry[], now: Date): ThreadDayDigest[] {
  const byDay = new Map<string, ThreadEntry[]>();

  for (const event of events) {
    if (event.kind !== "event") continue;
    const key = dayKey(new Date(event.createdAt));
    const bucket = byDay.get(key);
    if (bucket) bucket.push(event);
    else byDay.set(key, [event]);
  }

  const digests: ThreadDayDigest[] = [];

  for (const [key, dayEvents] of byDay) {
    const sorted = [...dayEvents].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const count = (type: string) => sorted.filter((item) => item.eventType === type).length;

    const revisions = count("design_task_brief_change_request");
    const deadlines = count("design_task_deadline");
    const visuals = count("design_output_upload");
    const timers = count("design_task_timer");
    const estimates = count("design_task_estimate");

    const parts: string[] = [];
    if (revisions > 0) parts.push(`${revisions} ${plural(revisions, "правка", "правки", "правок")}`);
    if (deadlines > 0) parts.push(deadlines > 1 ? `дедлайн зсунуто ×${deadlines}` : "дедлайн зсунуто");
    if (visuals > 0) parts.push(`${visuals} ${plural(visuals, "візуал", "візуали", "візуалів")}`);
    if (timers > 0) parts.push(`${timers} ${plural(timers, "сесія", "сесії", "сесій")}`);
    if (estimates > 0) parts.push("оцінено");

    // Якщо за день були самі лише зміни статусу — показуємо останню, інакше
    // рядок був би порожній і день виглядав би поламаним.
    const summary = parts.length > 0 ? parts.join(" · ") : (sorted[sorted.length - 1]?.body ?? "");

    const marks: ThreadDayDigest["marks"] = [
      ...Array.from({ length: Math.min(revisions, 3) }, () => "rev" as const),
      ...Array.from({ length: Math.min(deadlines, 2) }, () => "dl" as const),
      ...Array.from({ length: Math.min(visuals, 3) }, () => "vis" as const),
    ];

    digests.push({
      key,
      // Коротка форма («31 лип.»), бо в колонці 48 px «31 липня» рветься на два рядки.
      label: shortDayLabel(sorted[0].createdAt, now),
      count: sorted.length,
      summary,
      marks,
      entries: sorted,
    });
  }

  // Найновіші дні зверху — читають зазвичай саме їх.
  return digests.sort((a, b) => (a.entries[0].createdAt < b.entries[0].createdAt ? 1 : -1));
}

export type KpiCell = {
  label: string;
  value: string;
  unit?: string;
  hint?: string;
  tone?: "good" | "bad" | "flat";
  /** Доріжка «зроблено проти норми», 0..1 частками ширини. */
  track?: { done: number; norm: number; previous: number | null };
};

export type DesignTaskFacts = {
  revisions: number;
  revisionNorm: number;
  previousRevisions: number | null;
  assignedAt: string | null;
  deadline: string | null;
};

const DAY_MS = 86_400_000;

const dayDiff = (from: number, to: number) => (to - from) / DAY_MS;

/** Показники дизайн-задачі: правки проти норми, дні в роботі, дні до дедлайну. */
export function designTaskKpi(facts: DesignTaskFacts, now: Date): KpiCell[] {
  const overNorm = facts.revisions > facts.revisionNorm;
  const daysInWork = facts.assignedAt
    ? Math.max(0, Math.floor(dayDiff(new Date(facts.assignedAt).getTime(), now.getTime())))
    : null;
  const daysLeft = facts.deadline
    ? Math.ceil(dayDiff(now.getTime(), new Date(facts.deadline).getTime()))
    : null;

  return [
    {
      label: "Правки",
      value: String(facts.revisions),
      unit: `з ~${facts.revisionNorm}`,
      hint: overNorm ? `+${facts.revisions - facts.revisionNorm}` : undefined,
      tone: overNorm ? "bad" : "flat",
      track: {
        done: facts.revisions,
        norm: facts.revisionNorm,
        previous: facts.previousRevisions,
      },
    },
    {
      label: "У роботі",
      value: daysInWork === null ? "—" : String(daysInWork),
      unit: daysInWork === null ? undefined : "дн.",
    },
    {
      label: "Дедлайн",
      value: daysLeft === null ? "—" : String(daysLeft),
      unit: daysLeft === null ? undefined : "дн.",
      hint: daysLeft !== null && daysLeft < 0 ? "прострочено" : undefined,
      tone: daysLeft !== null && daysLeft < 0 ? "bad" : "flat",
    },
  ];
}
