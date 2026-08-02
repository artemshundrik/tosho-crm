/**
 * Чиста логіка нитки обговорення справи: ключ нитки, розкладка стрічки на
 * дні/групи бабблів, лічильник непрочитаного, показники шапки.
 *
 * Без React і без запитів — усе перевіряється тестами (taskThread.test.ts).
 * Дизайн: docs/TASK_CHAT_DESIGN.md.
 */

export type ThreadEntryKind = "message" | "event";

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
