# Панель обговорення справи — план реалізації (фаза A)

> **Для агентних виконавців:** ОБОВ'ЯЗКОВА ПІД-НАВИЧКА — `superpowers:subagent-driven-development` (рекомендовано) або `superpowers:executing-plans`. Кроки позначені чекбоксами (`- [ ]`).

**Мета:** глобальна панель, що з будь-якої сторінки CRM відкриває одну нитку обговорення справи — розмову бабблами плюс події задачі, зі смужкою показників, згортанням днів і лічильниками непрочитаного.

**Архітектура:** повідомлення живуть у `tosho.quote_comments`, події беремо з наявних рядків `public.activity_log` (тригер не потрібен — історія вже ведеться), два джерела зливаються на читанні. Панель — `Sheet`, змонтований один раз в `AppLayout`, керований React-контекстом; дані — React Query; жива доставка — Supabase Realtime.

**Стек:** React 19 + Vite, Tailwind + shadcn/ui, Supabase (schema `tosho`), React Query, vitest.

**Джерело правди по дизайну:** [TASK_CHAT_DESIGN.md](TASK_CHAT_DESIGN.md). Макет: `scratchpad/task-chat-mockup-b.html`.

**Перевірка (конвенція репозиторію):** `npx tsc --noEmit` + `npm run lint` для фронтенду, `npm test` для чистої логіки. Preview не піднімаємо. **Не пушимо без прямої команди.**

---

## Структура файлів

| Файл | Відповідальність |
|---|---|
| `scripts/task-chat-schema.sql` | Створити: міграція — колонки, `thread_reads`, індекс, RLS, публікація realtime |
| `src/features/taskChat/threadEvents.ts` | Створити: читання подій із наявного `activity_log` (тригер НЕ потрібен) |
| `src/lib/taskThread.ts` | Створити: чиста логіка — ключ нитки, групування в дні/баббли, лічильник непрочитаного, підписи подій |
| `src/lib/taskThread.test.ts` | Створити: тести чистої логіки |
| `src/features/taskChat/queries.ts` | Створити: React Query — читання нитки, надсилання, позначка прочитання, лічильники |
| `src/features/taskChat/TaskChatProvider.tsx` | Створити: контекст `openThread` / `closeThread` |
| `src/features/taskChat/TaskChatPanel.tsx` | Створити: `Sheet`, збірка частин, прокрутка й позначка прочитання |
| `src/features/taskChat/ThreadHeader.tsx` | Створити: логотип замовника (`EntityAvatar`), чип ліда, смужка стадій |
| `src/features/taskChat/ThreadKpiStrip.tsx` | Створити: смужка показників + доріжка норми |
| `src/features/taskChat/ThreadFeed.tsx` | Створити: пігулки днів, службові події, бабли |
| `src/features/taskChat/ThreadComposer.tsx` | Створити: редактор, згадки, диктовка, режим «внутрішня» |
| `src/features/taskChat/useThreadRealtime.ts` | Створити: підписка на нитку |
| `src/layout/AppLayout.tsx` | Змінити: змонтувати провайдер + панель |
| `src/pages/DesignPage.tsx`, `QuoteDetailsPage.tsx`, `DesignTaskPage.tsx` | Змінити: кнопка відкриття + бейдж непрочитаного |

---

### Задача 1: Розвідка наявної схеми ✅ ВИКОНАНО 2026-08-02

**Файли:** нічого не змінюємо. Нижче — фактичні результати; перезапускати не треба, але команди лишено для звірки.

**Що знайшли (усе враховано в задачах 2–3):**

1. `quote_comments`: `quote_id`, `created_by`, `body`, `comment_type` — усі `not null`. Enum `tosho.quote_comment_type` = `internal | client`, усі 118 рядків — `internal`. **`internal` тут означає «не для клієнта», а не «лише фінанси»** — тому нова колонка зветься `visibility` зі значеннями `team|finance`.
2. RLS **увімкнено**, політики: `select using (is_team_member(team_id))`, `insert with check (is_team_member(team_id))`, `delete` для `super_admin|manager` або автора. Переписуємо лише `select`, зберігаючи helper.
3. **Публікація `supabase_realtime` порожня — нуль таблиць.** Крок 3 задачі 2 обов'язковий. Побічний наслідок: наявні підписки в `AppLayout` теж нічого не отримують.
4. На таблиці висить тригер `trg_quote_lock_quote_comments` → `assert_quote_lock_from_quote_id()`, що падає з `Quote is locked by another user`. Має ранній вихід при `quote_id is null`.
5. `activity_log` **уже містить історію подій**: `design_task_status` (3029), `design_output_upload` (1063), `design_task_estimate` (535), `design_task_deadline` (534), `design_task_brief_change_request` (437), `design_task_timer` (385), `design_task_assignment` (77) — із готовими заголовками українською. **Тригер не потрібен.**
6. `metadata->>'quote_id'` буває виду `standalone-<uuid>` — приведення до `uuid` кине помилку.

- [ ] **Крок 1: Витягнути поточну структуру таблиці**

```bash
set -a && source .env.backup && set +a && psql "$BACKUP_DB_URL" -c "\d+ tosho.quote_comments"
```

Очікуємо: перелік колонок із `not null`-обмеженнями. **Занотувати**, чи `quote_id` і `created_by` зараз `not null`.

- [ ] **Крок 2: Витягнути поточні RLS-політики**

```bash
set -a && source .env.backup && set +a && psql "$BACKUP_DB_URL" -c "select policyname, cmd, qual, with_check from pg_policies where schemaname='tosho' and tablename='quote_comments'"
```

Очікуємо: рядки політик або порожньо. Якщо порожньо й `relrowsecurity=false` — це окрема знахідка рівня `project_hr_tables_rls`, зафіксувати й доповісти CEO **до** продовження.

- [ ] **Крок 3: Перевірити, чи таблиця вже в публікації realtime**

```bash
set -a && source .env.backup && set +a && psql "$BACKUP_DB_URL" -c "select tablename from pg_publication_tables where pubname='supabase_realtime' and schemaname='tosho'"
```

Очікуємо: список таблиць `tosho` у публікації. Якщо `quote_comments` там немає — крок 4 задачі 2 обов'язковий.

- [ ] **Крок 4: Звірити структуру activity_log для тригера**

```bash
set -a && source .env.backup && set +a && psql "$BACKUP_DB_URL" -c "\d public.activity_log"
```

Очікуємо: наявність `id, team_id, user_id, action, entity_id, title, metadata jsonb, created_at`.

---

### Задача 2: Міграція схеми

**Файли:**
- Створити: `scripts/task-chat-schema.sql`

- [ ] **Крок 1: Написати міграцію**

```sql
-- Панель обговорення справи, фаза A. Див. docs/TASK_CHAT_DESIGN.md.
-- Safe to run multiple times.

begin;

alter table tosho.quote_comments
  add column if not exists thread_key  text,
  add column if not exists kind        text not null default 'message',
  add column if not exists visibility  text not null default 'team',
  add column if not exists source      text not null default 'crm',
  add column if not exists event_type  text,
  add column if not exists is_pinned   boolean not null default false,
  add column if not exists metadata    jsonb not null default '{}'::jsonb;

update tosho.quote_comments
set thread_key = 'quote:' || quote_id
where thread_key is null and quote_id is not null;

alter table tosho.quote_comments
  alter column thread_key set not null,
  alter column quote_id   drop not null,
  alter column created_by drop not null;

alter table tosho.quote_comments
  drop constraint if exists quote_comments_kind_check,
  add constraint quote_comments_kind_check check (kind in ('message','event')),
  drop constraint if exists quote_comments_visibility_check,
  add constraint quote_comments_visibility_check check (visibility in ('team','finance')),
  drop constraint if exists quote_comments_source_check,
  add constraint quote_comments_source_check check (source in ('crm','telegram'));

create index if not exists quote_comments_thread_idx
  on tosho.quote_comments (thread_key, created_at desc);

create table if not exists tosho.thread_reads (
  user_id      uuid not null references auth.users(id) on delete cascade,
  thread_key   text not null,
  last_read_at timestamptz not null default now(),
  primary key (user_id, thread_key)
);

alter table tosho.thread_reads enable row level security;

drop policy if exists thread_reads_own on tosho.thread_reads;
create policy thread_reads_own on tosho.thread_reads
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, update on tosho.thread_reads to authenticated;

commit;
```

- [ ] **Крок 2: Дописати гейт «внутрішніх» у RLS**

Політику `select` переписуємо на основі того, що побачили в задачі 1, крок 2 — **зберігши наявну умову за `team_id`** і додавши гейт видимості. Додати в кінець того самого файлу, підставивши реальну назву політики:

Наявна політика (знято з проду в задачі 1): `for select using (is_team_member(team_id))`. Зберігаємо **той самий helper** — він тримає гейт заблокованих користувачів (`project_access_lockout`) — і лише додаємо видимість. Підміна на сирий `exists` по `public.team_members` цей гейт обійшла б.

```sql
begin;

drop policy if exists quote_comments_select on tosho.quote_comments;
create policy quote_comments_select on tosho.quote_comments
  for select using (
    is_team_member(team_id)
    and (visibility = 'team' or tosho.has_finance_access(team_id))
  );

commit;
```

- [ ] **Крок 3: Додати таблицю в публікацію realtime**

```sql
alter publication supabase_realtime add table tosho.quote_comments;
```

Виконувати **лише** якщо задача 1 крок 3 показала, що таблиці там немає (інакше буде помилка «already member»).

- [ ] **Крок 4: Застосувати на prod**

```bash
set -a && source .env.backup && set +a && psql "$BACKUP_DB_URL" -f scripts/task-chat-schema.sql
```

Очікуємо: `BEGIN … COMMIT` без помилок.

- [ ] **Крок 5: Довести, що міграція лягла**

```bash
set -a && source .env.backup && set +a && psql "$BACKUP_DB_URL" -c "select count(*) filter (where thread_key is null) as null_keys, count(*) as total from tosho.quote_comments"
```

Очікуємо: `null_keys = 0`.

- [ ] **Крок 6: Коміт**

```bash
git add scripts/task-chat-schema.sql
git commit -m "feat(chat): міграція нитки обговорення справи"
```

---

### Задача 3: Джерело подій — наявний activity_log

> **Ревізовано після розвідки.** Тригер писати **не треба**: історія вже ведеться окремими рядками `activity_log` із готовими українськими заголовками (див. §2 і §5 дизайн-документа). Ця задача — про читання, не про DDL.

**Файли:**
- Створити: `src/features/taskChat/threadEvents.ts`

- [ ] **Крок 1: Білий список подій**

```ts
/** Дії activity_log, які показуємо в нитці. Заголовок беремо з title — він уже українською. */
export const THREAD_EVENT_ACTIONS = [
  "design_task_status",
  "design_task_deadline",
  "design_task_assignment",
  "design_task_estimate",
  "design_task_brief_change_request",
  "design_output_upload",
  "design_task_attachment",
] as const;
```

- [ ] **Крок 2: Запит подій нитки**

`quote_id` у метаданих буває виду `standalone-<uuid>`, тож порівнюємо як **текст, без приведення до uuid**.

```ts
import { supabase } from "@/lib/supabaseClient";
import type { ThreadEntry } from "@/lib/taskThread";
import { THREAD_EVENT_ACTIONS } from "./threadEvents";

export async function fetchThreadEvents(quoteRef: string, teamId: string): Promise<ThreadEntry[]> {
  const { data, error } = await supabase
    .from("activity_log")
    .select("id,action,title,created_at,user_id,metadata")
    .eq("team_id", teamId)
    .in("action", [...THREAD_EVENT_ACTIONS])
    .eq("metadata->>quote_id", quoteRef)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;

  return ((data as Array<{
    id: string; action: string; title: string | null; created_at: string;
    user_id: string | null; metadata: Record<string, unknown> | null;
  }> | null) ?? []).map((row) => ({
    id: `event-${row.id}`,
    kind: "event" as const,
    body: row.title ?? row.action,
    createdAt: row.created_at,
    createdBy: row.user_id,
    visibility: "team" as const,
    source: "crm" as const,
    eventType: row.action,
    isPinned: false,
    metadata: row.metadata ?? {},
  }));
}
```

- [ ] **Крок 3: Злити два джерела**

У `useThreadEntries` (задача 5) виконати обидва запити паралельно й повернути єдиний масив — `buildThreadBlocks` уже сортує за часом:

```ts
const [messages, events] = await Promise.all([fetchThreadMessages(threadKey), fetchThreadEvents(quoteRef, teamId)]);
return [...messages, ...events];
```

- [ ] **Крок 4: Перевірити на реальних даних**

```bash
set -a && source .env.backup && set +a && psql "$BACKUP_DB_URL" -c "select action, title, created_at from public.activity_log where action = any(array['design_task_status','design_task_brief_change_request']) order by created_at desc limit 5"
```

Очікуємо: рядки на кшталт `Статус: В роботі → Дизайн готовий` і `Додано правку до ТЗ`.

- [ ] **Крок 5: Коміт**

```bash
git add src/features/taskChat/threadEvents.ts
git commit -m "feat(chat): події нитки з наявного activity_log"
```

---

### Задача 4: Чиста логіка нитки

**Файли:**
- Створити: `src/lib/taskThread.ts`
- Створити: `src/lib/taskThread.test.ts`

- [ ] **Крок 1: Написати падаючі тести**

```ts
import { describe, expect, it } from "vitest";
import { buildThreadBlocks, countUnread, threadKeyForQuote, threadKeyForOrder } from "./taskThread";
import type { ThreadEntry } from "./taskThread";

const entry = (over: Partial<ThreadEntry> & { id: string; createdAt: string }): ThreadEntry => ({
  kind: "message",
  body: "текст",
  createdBy: "u1",
  visibility: "team",
  source: "crm",
  eventType: null,
  isPinned: false,
  metadata: {},
  ...over,
});

describe("ключ нитки", () => {
  it("прорахунок і його замовлення дають ту саму нитку", () => {
    expect(threadKeyForQuote("q1")).toBe("quote:q1");
  });
  it("ручне замовлення без прорахунку має власний ключ", () => {
    expect(threadKeyForOrder("o1")).toBe("order:o1");
  });
});

describe("групування стрічки", () => {
  const now = new Date("2026-08-02T12:00:00Z");

  it("два повідомлення одного автора підряд — одна група", () => {
    const blocks = buildThreadBlocks(
      [
        entry({ id: "a", createdAt: "2026-08-02T09:00:00Z" }),
        entry({ id: "b", createdAt: "2026-08-02T09:02:00Z" }),
      ],
      { userId: "u2", now }
    );
    const groups = blocks.filter((b) => b.type === "group");
    expect(groups).toHaveLength(1);
    expect(groups[0].entries.map((e) => e.id)).toEqual(["a", "b"]);
  });

  it("подія розриває групу", () => {
    const blocks = buildThreadBlocks(
      [
        entry({ id: "a", createdAt: "2026-08-02T09:00:00Z" }),
        entry({ id: "e", createdAt: "2026-08-02T09:01:00Z", kind: "event", eventType: "status" }),
        entry({ id: "b", createdAt: "2026-08-02T09:02:00Z" }),
      ],
      { userId: "u2", now }
    );
    expect(blocks.map((b) => b.type)).toEqual(["day", "group", "service", "group"]);
  });

  it("свої повідомлення позначені own", () => {
    const blocks = buildThreadBlocks([entry({ id: "a", createdAt: "2026-08-02T09:00:00Z" })], {
      userId: "u1",
      now,
    });
    const group = blocks.find((b) => b.type === "group");
    expect(group?.own).toBe(true);
  });

  it("різні дні розділені пігулками", () => {
    const blocks = buildThreadBlocks(
      [
        entry({ id: "a", createdAt: "2026-08-01T09:00:00Z" }),
        entry({ id: "b", createdAt: "2026-08-02T09:00:00Z" }),
      ],
      { userId: "u2", now }
    );
    expect(blocks.filter((b) => b.type === "day")).toHaveLength(2);
  });
});

describe("лічильник непрочитаного", () => {
  it("рахує лише чужі повідомлення після позначки", () => {
    const entries = [
      entry({ id: "a", createdAt: "2026-08-02T09:00:00Z", createdBy: "u2" }),
      entry({ id: "b", createdAt: "2026-08-02T10:00:00Z", createdBy: "u1" }),
      entry({ id: "c", createdAt: "2026-08-02T11:00:00Z", createdBy: "u2" }),
    ];
    expect(countUnread(entries, "2026-08-02T09:30:00Z", "u1")).toBe(1);
  });

  it("без позначки все чуже вважається непрочитаним", () => {
    const entries = [entry({ id: "a", createdAt: "2026-08-02T09:00:00Z", createdBy: "u2" })];
    expect(countUnread(entries, null, "u1")).toBe(1);
  });
});
```

- [ ] **Крок 2: Переконатись, що тести падають**

Запустити: `npx vitest run src/lib/taskThread.test.ts`
Очікуємо: FAIL — `Failed to resolve import "./taskThread"`.

- [ ] **Крок 3: Написати модуль**

```ts
/**
 * Чиста логіка нитки обговорення справи: ключ нитки, розкладка стрічки,
 * лічильник непрочитаного. Без React і без запитів — усе тестується.
 */

export type ThreadEntryKind = "message" | "event";

export type ThreadEntry = {
  id: string;
  kind: ThreadEntryKind;
  body: string;
  createdAt: string;
  createdBy: string | null;
  visibility: "team" | "internal";
  source: "crm" | "telegram";
  eventType: string | null;
  isPinned: boolean;
  metadata: Record<string, unknown>;
};

export type ThreadBlock =
  | { type: "day"; key: string; label: string; count: number }
  | { type: "service"; entry: ThreadEntry }
  | { type: "group"; authorId: string | null; own: boolean; entries: ThreadEntry[] };

export function threadKeyForQuote(quoteId: string): string {
  return `quote:${quoteId}`;
}

export function threadKeyForOrder(orderId: string): string {
  return `order:${orderId}`;
}

/** Ключ дня в місцевому часі — саме за ним і групуємо, не за UTC. */
function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function dayLabel(iso: string, now: Date): string {
  const key = dayKey(iso);
  const today = dayKey(now.toISOString());
  const yesterday = dayKey(new Date(now.getTime() - 86_400_000).toISOString());
  if (key === today) return "Сьогодні";
  if (key === yesterday) return "Учора";
  return new Date(iso).toLocaleDateString("uk-UA", { day: "numeric", month: "long" });
}

/** Скільки повідомлення може «прилипати» до попереднього в одну групу. */
const GROUP_WINDOW_MS = 5 * 60 * 1000;

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
    const key = dayKey(item.createdAt);
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
      // ВАЖЛИВО: справжній користувач, не viewUserId — інакше в режимі
      // «очима співробітника» стрічка віддзеркалиться (project_view_as_mode).
      own: Boolean(options.userId) && item.createdBy === options.userId,
      entries: [item],
    };
    blocks.push(group);
  }

  return blocks;
}

export function countUnread(
  entries: ThreadEntry[],
  lastReadAt: string | null,
  userId: string | null
): number {
  return entries.filter((item) => {
    if (item.createdBy && item.createdBy === userId) return false;
    if (!lastReadAt) return true;
    return item.createdAt > lastReadAt;
  }).length;
}
```

- [ ] **Крок 4: Переконатись, що тести проходять**

Запустити: `npx vitest run src/lib/taskThread.test.ts`
Очікуємо: PASS, 7 тестів.

- [ ] **Крок 5: Коміт**

```bash
git add src/lib/taskThread.ts src/lib/taskThread.test.ts
git commit -m "feat(chat): чиста логіка нитки — ключ, групування, непрочитане"
```

---

### Задача 5: Шар запитів

**Файли:**
- Створити: `src/features/taskChat/queries.ts`

- [ ] **Крок 1: Написати модуль**

```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import type { ThreadEntry } from "@/lib/taskThread";

const SELECT =
  "id,body,created_at,created_by,kind,visibility,source,event_type,is_pinned,metadata";

type Row = {
  id: string;
  body: string | null;
  created_at: string;
  created_by: string | null;
  kind: string;
  visibility: string;
  source: string;
  event_type: string | null;
  is_pinned: boolean;
  metadata: Record<string, unknown> | null;
};

const toEntry = (row: Row): ThreadEntry => ({
  id: row.id,
  kind: row.kind === "event" ? "event" : "message",
  body: row.body ?? "",
  createdAt: row.created_at,
  createdBy: row.created_by,
  visibility: row.visibility === "internal" ? "internal" : "team",
  source: row.source === "telegram" ? "telegram" : "crm",
  eventType: row.event_type,
  isPinned: row.is_pinned,
  metadata: row.metadata ?? {},
});

export const threadKeys = {
  entries: (threadKey: string) => ["taskThread", threadKey] as const,
  read: (threadKey: string) => ["taskThreadRead", threadKey] as const,
};

export function useThreadEntries(threadKey: string | null) {
  return useQuery({
    queryKey: threadKeys.entries(threadKey ?? "none"),
    enabled: Boolean(threadKey),
    refetchOnMount: "always",
    queryFn: async (): Promise<ThreadEntry[]> => {
      const { data, error } = await supabase
        .schema("tosho")
        .from("quote_comments")
        .select(SELECT)
        .eq("thread_key", threadKey!)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return ((data as Row[] | null) ?? []).map(toEntry);
    },
  });
}

export function useThreadRead(threadKey: string | null, userId: string | null) {
  return useQuery({
    queryKey: threadKeys.read(threadKey ?? "none"),
    enabled: Boolean(threadKey && userId),
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await supabase
        .schema("tosho")
        .from("thread_reads")
        .select("last_read_at")
        .eq("thread_key", threadKey!)
        .eq("user_id", userId!)
        .maybeSingle();
      if (error) throw error;
      return (data as { last_read_at: string } | null)?.last_read_at ?? null;
    },
  });
}

export function useSendThreadMessage(threadKey: string | null) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      body: string;
      teamId: string;
      quoteId: string | null;
      userId: string;
      visibility: "team" | "internal";
    }) => {
      const { data, error } = await supabase
        .schema("tosho")
        .from("quote_comments")
        .insert({
          team_id: input.teamId,
          quote_id: input.quoteId,
          thread_key: threadKey,
          body: input.body,
          created_by: input.userId,
          kind: "message",
          visibility: input.visibility,
          source: "crm",
        })
        .select(SELECT)
        .single();
      if (error) throw error;
      return toEntry(data as Row);
    },
    onSuccess: () => {
      if (threadKey) void client.invalidateQueries({ queryKey: threadKeys.entries(threadKey) });
    },
  });
}

export function useMarkThreadRead(threadKey: string | null) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase
        .schema("tosho")
        .from("thread_reads")
        .upsert(
          { user_id: userId, thread_key: threadKey, last_read_at: new Date().toISOString() },
          { onConflict: "user_id,thread_key" }
        );
      if (error) throw error;
    },
    onSuccess: () => {
      if (threadKey) void client.invalidateQueries({ queryKey: threadKeys.read(threadKey) });
    },
  });
}
```

- [ ] **Крок 2: Перевірити типи**

Запустити: `npx tsc --noEmit`
Очікуємо: без помилок.

- [ ] **Крок 3: Коміт**

```bash
git add src/features/taskChat/queries.ts
git commit -m "feat(chat): шар запитів нитки на React Query"
```

---

### Задача 6: Провайдер і порожня панель

**Файли:**
- Створити: `src/features/taskChat/TaskChatProvider.tsx`
- Створити: `src/features/taskChat/TaskChatPanel.tsx`
- Змінити: `src/layout/AppLayout.tsx`

- [ ] **Крок 1: Провайдер**

```tsx
import React from "react";
import { threadKeyForOrder, threadKeyForQuote } from "@/lib/taskThread";

export type ThreadAnchor =
  | { kind: "quote"; quoteId: string; title: string; teamId: string }
  | { kind: "order"; orderId: string; title: string; teamId: string };

type TaskChatState = {
  anchor: ThreadAnchor | null;
  threadKey: string | null;
  openThread: (anchor: ThreadAnchor) => void;
  closeThread: () => void;
};

const TaskChatContext = React.createContext<TaskChatState | null>(null);

export function TaskChatProvider({ children }: { children: React.ReactNode }) {
  const [anchor, setAnchor] = React.useState<ThreadAnchor | null>(null);

  const value = React.useMemo<TaskChatState>(
    () => ({
      anchor,
      threadKey: anchor
        ? anchor.kind === "quote"
          ? threadKeyForQuote(anchor.quoteId)
          : threadKeyForOrder(anchor.orderId)
        : null,
      openThread: setAnchor,
      closeThread: () => setAnchor(null),
    }),
    [anchor]
  );

  return <TaskChatContext.Provider value={value}>{children}</TaskChatContext.Provider>;
}

export function useTaskChat(): TaskChatState {
  const ctx = React.useContext(TaskChatContext);
  if (!ctx) throw new Error("useTaskChat має викликатись усередині TaskChatProvider");
  return ctx;
}
```

- [ ] **Крок 2: Каркас панелі**

```tsx
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useTaskChat } from "./TaskChatProvider";

export function TaskChatPanel() {
  const { anchor, closeThread } = useTaskChat();

  return (
    <Sheet open={Boolean(anchor)} onOpenChange={(open) => (open ? null : closeThread())}>
      <SheetContent side="right" className="flex w-[400px] max-w-full flex-col gap-0 p-0 sm:max-w-[400px]">
        <SheetHeader className="border-b border-border/40 p-4">
          <SheetTitle className="text-sm">{anchor?.title ?? "Обговорення"}</SheetTitle>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto" />
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Крок 3: Змонтувати в AppLayout**

Знайти місце монтування глобальних оверлеїв:

```bash
rg -n "Toaster|<Dialog|createPortal" src/layout/AppLayout.tsx | head
```

Обгорнути наявне дерево макета провайдером і поставити панель поруч із ними:

```tsx
<TaskChatProvider>
  {/* наявне дерево макета лишається без змін */}
  <TaskChatPanel />
</TaskChatProvider>
```

- [ ] **Крок 4: Перевірити**

Запустити: `npx tsc --noEmit && npm run lint`
Очікуємо: без помилок.

- [ ] **Крок 5: Коміт**

```bash
git add src/features/taskChat/TaskChatProvider.tsx src/features/taskChat/TaskChatPanel.tsx src/layout/AppLayout.tsx
git commit -m "feat(chat): провайдер і каркас панелі в AppLayout"
```

---

### Задача 7: Шапка панелі

**Файли:**
- Створити: `src/features/taskChat/ThreadHeader.tsx`
- Змінити: `src/features/taskChat/TaskChatPanel.tsx`

- [ ] **Крок 1: Компонент шапки**

Логотип замовника — **канонічний `EntityAvatar`** (`src/components/app/avatar-kit.tsx:393`), він сам падає на кольорові ініціали, якщо `logo_url` порожній або не завантажився. Власного `<img>` не пишемо.

```tsx
import { EntityAvatar } from "@/components/app/avatar-kit";
import { Button } from "@/components/ui/button";
import { ExternalLink, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type ThreadStage = { key: "quote" | "design" | "order"; label: string; state: "done" | "now" | "todo"; href: string | null };

type Props = {
  party: { name: string; logoUrl: string | null; kind: "customer" | "lead" } | null;
  title: string;
  number: string | null;
  stages: ThreadStage[];
  onOpenPage: () => void;
  onClose: () => void;
};

export function ThreadHeader({ party, title, number, stages, onOpenPage, onClose }: Props) {
  return (
    <div className="flex flex-col gap-2.5 p-3">
      <div className="flex items-start gap-2.5">
        <EntityAvatar
          src={party?.logoUrl ?? null}
          name={party?.name ?? "Замовник"}
          size={34}
          className="rounded-lg"
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="flex items-center gap-1.5 text-2xs text-muted-foreground">
            <span className="truncate font-medium text-foreground/80">{party?.name ?? "Без замовника"}</span>
            {party?.kind === "lead" ? (
              <span className="rounded-full border border-warning-soft-border bg-warning-soft px-1.5 text-3xs font-semibold text-warning-foreground">
                Лід
              </span>
            ) : null}
            {number ? <span className="tabular-nums">· {number}</span> : null}
          </span>
          <span className="truncate text-sm font-semibold tracking-tight">{title}</span>
        </div>
        <div className="flex shrink-0 gap-1">
          <Button type="button" variant="outline" size="sm" className="h-7 w-7 p-0" aria-label="Відкрити сторінку справи" onClick={onOpenPage}>
            <ExternalLink className="h-3.5 w-3.5" />
          </Button>
          <Button type="button" variant="outline" size="sm" className="h-7 w-7 p-0" aria-label="Закрити панель" onClick={onClose}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {stages.length > 1 ? (
        <div className="flex gap-1">
          {stages.map((stage) => (
            <span
              key={stage.key}
              className={cn(
                "flex-1 rounded-md border px-2 py-1 text-center text-3xs",
                stage.state === "done" && "border-success-soft-border bg-success-soft text-success-foreground",
                stage.state === "now" && "border-primary/40 bg-primary/10 font-semibold text-primary",
                stage.state === "todo" && "border-border/60 text-muted-foreground opacity-60"
              )}
            >
              {stage.label}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Крок 2: Дані замовника**

Брати з наявного `partyHoverInfo.ts` (`src/lib/partyHoverInfo.ts`) — він уже вміє і замовника, і ліда, кешує відповідь у модулі й нормалізує посилання на логотип через `normalizeCustomerLogoUrl`. Нічого нового не пишемо.

- [ ] **Крок 3: Стадії**

`quote` — `done`, якщо прорахунок існує; `design` — `now`, якщо є дизайн-задача в роботі; `order` — `todo`, поки замовлення не створено. Для ручного замовлення (`anchor.kind === "order"`) масив із одного елемента — смужка не вигадує етапів, яких не було, і за умовою `stages.length > 1` просто не рендериться.

- [ ] **Крок 4: Замінити стандартну шапку Sheet**

У `TaskChatPanel.tsx` прибрати `SheetHeader`/`SheetTitle` із задачі 6 і поставити `<ThreadHeader …/>`. Щоб не втратити доступність, лишити прихований заголовок для зчитувачів екрана:

```tsx
<SheetTitle className="sr-only">Обговорення справи: {anchor?.title}</SheetTitle>
```

- [ ] **Крок 5: Перевірити й закомітити**

```bash
npx tsc --noEmit && npm run lint
git add src/features/taskChat/ThreadHeader.tsx src/features/taskChat/TaskChatPanel.tsx
git commit -m "feat(chat): шапка панелі з логотипом замовника і стадіями справи"
```

---

### Задача 8: Стрічка бабблів

**Файли:**
- Створити: `src/features/taskChat/ThreadFeed.tsx`
- Змінити: `src/features/taskChat/TaskChatPanel.tsx`

- [ ] **Крок 1: Компонент стрічки**

Розкладка точно за макетом `scratchpad/task-chat-mockup-b.html`: пігулка дня по центру, службові події пігулкою, бабли — свої праворуч брендовим тлом, чужі ліворуч на `bg-muted`, хвостик лише в останнього баббла групи, час усередині баббла.

```tsx
import { cn } from "@/lib/utils";
import { buildThreadBlocks, type ThreadEntry } from "@/lib/taskThread";
import { AvatarBase } from "@/components/app/avatar-kit";

type Props = {
  entries: ThreadEntry[];
  userId: string | null;
  /** Ім'я учасника — як getMemberLabel у DesignPage.tsx:1150. */
  memberName: (userId: string | null) => string;
  /** Посилання на аватарку — як getMemberAvatar у DesignPage.tsx:1155. */
  memberAvatar: (userId: string | null) => string | null;
};

const timeOf = (iso: string) =>
  new Date(iso).toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" });

const EVENT_LABEL: Record<string, (entry: ThreadEntry) => string> = {
  status: (e) => `Статус: ${e.body}`,
  assignee: () => "Змінено виконавця",
  deadline: (e) => `Дедлайн: ${e.body}`,
  revision: (e) => `Додано правку №${e.body}`,
};

export function ThreadFeed({ entries, userId, memberName, memberAvatar }: Props) {
  const blocks = buildThreadBlocks(entries, { userId, now: new Date() });

  return (
    <div className="flex flex-col gap-2.5 px-2.5 py-3">
      {blocks.map((block, index) => {
        if (block.type === "day") {
          return (
            <div key={`day-${block.key}`} className="sticky top-1 z-10 self-center">
              <span className="rounded-full border border-border/40 bg-muted px-2.5 py-0.5 text-2xs font-semibold text-muted-foreground">
                {block.label} <span className="font-normal opacity-75">· {block.count}</span>
              </span>
            </div>
          );
        }

        if (block.type === "service") {
          const label = EVENT_LABEL[block.entry.eventType ?? ""]?.(block.entry) ?? block.entry.body;
          return (
            <div
              key={block.entry.id}
              className="self-center rounded-full border border-border/40 bg-muted px-2.5 py-0.5 text-2xs text-muted-foreground"
            >
              {label} <span className="tabular-nums opacity-70">{timeOf(block.entry.createdAt)}</span>
            </div>
          );
        }

        return (
          <div key={`group-${index}`} className="flex flex-col gap-0.5">
            {block.entries.map((entry, position) => {
              const isLast = position === block.entries.length - 1;
              const internal = entry.visibility === "internal";
              return (
                <div
                  key={entry.id}
                  className={cn("flex items-end gap-1.5", block.own && "flex-row-reverse")}
                >
                  {block.own ? null : isLast ? (
                    <AvatarBase
                      size={24}
                      src={memberAvatar(block.authorId)}
                      name={memberName(block.authorId)}
                      className="shrink-0"
                    />
                  ) : (
                    <span className="w-6 shrink-0" />
                  )}
                  <div
                    className={cn(
                      "max-w-[80%] rounded-2xl px-2.5 py-1.5 text-xs leading-snug",
                      internal
                        ? "border border-warning-soft-border bg-warning-soft text-foreground"
                        : block.own
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-foreground",
                      isLast && (block.own ? "rounded-br-sm" : "rounded-bl-sm")
                    )}
                  >
                    {!block.own && position === 0 ? (
                      <span className="mb-0.5 block text-2xs font-semibold text-primary">
                        {memberName(block.authorId)}
                      </span>
                    ) : null}
                    <span
                      className={cn(
                        "float-right ml-2 mt-1.5 text-3xs tabular-nums",
                        block.own && !internal ? "text-primary-foreground/80" : "text-muted-foreground"
                      )}
                    >
                      {timeOf(entry.createdAt)}
                    </span>
                    {entry.body}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Крок 2: Підключити в панель**

У `TaskChatPanel.tsx` замінити порожній `<div className="min-h-0 flex-1 overflow-y-auto" />` на:

```tsx
<div className="min-h-0 flex-1 overflow-y-auto">
  {entriesQuery.isLoading ? <ThreadSkeleton /> : (
    <ThreadFeed entries={entriesQuery.data ?? []} userId={userId} memberName={memberName} />
  )}
</div>
```

де `entriesQuery = useThreadEntries(threadKey)`, `userId` з `useAuth()`, а `memberName` — з наявного кешу директорії учасників (`project_member_directory_cache`; імена брати з `team_member_profiles`, бо `memberships_view.full_name` порожній).

- [ ] **Крок 3: Скелет завантаження**

Додати в `ThreadFeed.tsx`:

```tsx
export function ThreadSkeleton() {
  return (
    <div className="flex flex-col gap-3 px-2.5 py-3">
      {[0, 1, 2].map((row) => (
        <div key={row} className="flex items-end gap-1.5">
          <div className="h-6 w-6 shrink-0 animate-pulse rounded-full bg-muted" />
          <div className="h-10 w-3/5 animate-pulse rounded-2xl bg-muted" />
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Крок 4: Перевірити**

Запустити: `npx tsc --noEmit && npm run lint`
Очікуємо: без помилок.

- [ ] **Крок 5: Коміт**

```bash
git add src/features/taskChat/ThreadFeed.tsx src/features/taskChat/TaskChatPanel.tsx
git commit -m "feat(chat): стрічка бабблів із подіями і пігулками днів"
```

---

### Задача 9: Композер

**Файли:**
- Створити: `src/features/taskChat/ThreadComposer.tsx`
- Змінити: `src/features/taskChat/TaskChatPanel.tsx`

- [ ] **Крок 1: Компонент**

Поля: текст, кнопка диктовки (переюзати наявний хук диктовки з ТЗ дизайн-задачі), перемикач «Внутрішня» — **показувати лише тим, у кого є доступ до модуля `finance`** (`hasModuleAccess(ctx, "finance")` з `src/lib/moduleAccess.ts`), кнопка «Надіслати».

```tsx
import React from "react";
import { Button } from "@/components/ui/button";
import { Lock, Mic, Send } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  canWriteInternal: boolean;
  sending: boolean;
  onSend: (body: string, visibility: "team" | "internal") => void;
};

export function ThreadComposer({ canWriteInternal, sending, onSend }: Props) {
  const [body, setBody] = React.useState("");
  const [internal, setInternal] = React.useState(false);

  const submit = () => {
    const text = body.trim();
    if (!text || sending) return;
    onSend(text, internal ? "internal" : "team");
    setBody("");
  };

  return (
    <div
      className={cn(
        "m-2.5 flex flex-col gap-2 rounded-xl border border-border/60 p-2",
        internal ? "border-warning-soft-border bg-warning-soft" : "bg-card"
      )}
    >
      <textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) submit();
        }}
        rows={2}
        placeholder="Написати або продиктувати…"
        className="resize-none bg-transparent text-xs outline-none placeholder:text-muted-foreground"
      />
      <div className="flex items-center gap-1.5">
        <Button type="button" variant="outline" size="sm" className="h-8 w-8 p-0" aria-label="Продиктувати голосом">
          <Mic className="h-3.5 w-3.5" />
        </Button>
        {canWriteInternal ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-pressed={internal}
            onClick={() => setInternal((value) => !value)}
            className="h-8 gap-1.5 text-2xs"
          >
            <Lock className="h-3.5 w-3.5" /> Внутрішня
          </Button>
        ) : null}
        <span className="flex-1" />
        <Button type="button" size="sm" className="h-8 gap-1.5 text-2xs" disabled={sending} onClick={submit}>
          <Send className="h-3.5 w-3.5" /> Надіслати
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Крок 2: Підключити надсилання**

У `TaskChatPanel.tsx` під стрічкою:

```tsx
<ThreadComposer
  canWriteInternal={canWriteInternal}
  sending={sendMutation.isPending}
  onSend={(body, visibility) =>
    sendMutation.mutate({ body, visibility, teamId, quoteId, userId })
  }
/>
```

- [ ] **Крок 3: Сповістити згаданих**

Після успішного надсилання викликати наявну функцію — вона вже вміє розбирати `@імена` і слати сповіщення, писати цю логіку заново не треба:

```ts
await fetch("/.netlify/functions/quote-comments", {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
  body: JSON.stringify({ mode: "notify_mentions", quoteId, body }),
});
```

- [ ] **Крок 4: Перевірити**

Запустити: `npx tsc --noEmit && npm run lint`

- [ ] **Крок 5: Коміт**

```bash
git add src/features/taskChat/ThreadComposer.tsx src/features/taskChat/TaskChatPanel.tsx
git commit -m "feat(chat): композер із режимом внутрішньої нотатки"
```

---

### Задача 10: Поведінка стрічки

Без цього панель поводиться дратівливо, і люди перестають нею користуватись. Див. §10 дизайн-документа.

**Файли:**
- Змінити: `src/features/taskChat/ThreadFeed.tsx`, `src/features/taskChat/TaskChatPanel.tsx`

- [ ] **Крок 1: Докручувати лише знизу**

Нове повідомлення зсуває стрічку тільки якщо користувач уже внизу; інакше показуємо кнопку.

```tsx
const scrollRef = React.useRef<HTMLDivElement>(null);
const [atBottom, setAtBottom] = React.useState(true);

const onScroll = () => {
  const node = scrollRef.current;
  if (!node) return;
  setAtBottom(node.scrollHeight - node.scrollTop - node.clientHeight < 40);
};

React.useEffect(() => {
  if (!atBottom) return;
  scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
}, [entries.length, atBottom]);
```

- [ ] **Крок 2: Кнопка «N нових»**

```tsx
{!atBottom && unread > 0 ? (
  <button
    type="button"
    onClick={() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })}
    className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-2xs font-semibold text-primary-foreground shadow-[var(--shadow-menu)]"
  >
    <ChevronDown className="mr-1 inline h-3 w-3" />
    {unread} нових
  </button>
) : null}
```

- [ ] **Крок 3: Оптимістичне надсилання**

Повідомлення з'являється миттєво блідим; помилка не ковтає текст. У `useSendThreadMessage` додати `onMutate`, що кладе тимчасовий запис у кеш, і `onError`, що позначає його як невдалий:

```ts
onMutate: async (input) => {
  if (!threadKey) return;
  await client.cancelQueries({ queryKey: threadKeys.entries(threadKey) });
  const previous = client.getQueryData<ThreadEntry[]>(threadKeys.entries(threadKey));
  const optimistic: ThreadEntry = {
    id: `optimistic-${input.body.length}-${previous?.length ?? 0}`,
    kind: "message",
    body: input.body,
    createdAt: new Date().toISOString(),
    createdBy: input.userId,
    visibility: input.visibility,
    source: "crm",
    eventType: null,
    isPinned: false,
    metadata: { pending: true },
  };
  client.setQueryData<ThreadEntry[]>(threadKeys.entries(threadKey), [optimistic, ...(previous ?? [])]);
  return { previous };
},
onError: (_error, _input, context) => {
  if (threadKey && context?.previous) {
    client.setQueryData(threadKeys.entries(threadKey), context.previous);
  }
},
```

У `ThreadFeed` баббл із `metadata.pending` малюємо з `opacity-60`, а під ним — рядок помилки з кнопкою «Повторити».

- [ ] **Крок 4: Порожній стан і стан без доступу**

```tsx
{entries.length === 0 ? (
  <div className="flex flex-col items-center gap-1.5 px-5 py-8 text-center">
    <div className="grid h-9 w-9 place-items-center rounded-xl border border-border/60 bg-muted text-muted-foreground">
      <MessageSquare className="h-4 w-4" />
    </div>
    <span className="text-sm font-semibold">Тут поки тихо</span>
    <span className="max-w-[32ch] text-xs text-muted-foreground">
      Напишіть перше повідомлення — його побачить уся команда по цій справі.
    </span>
  </div>
) : null}
```

Якщо запит повернув помилку доступу — той самий блок із текстом «Обговорення недоступне. Ця справа не у вашому доступі.» і без композера.

- [ ] **Крок 5: Перевірити й закомітити**

```bash
npx tsc --noEmit && npm run lint
git add src/features/taskChat
git commit -m "feat(chat): прокрутка, оптимістичне надсилання, порожні стани"
```

---

### Задача 11: Смужка показників

**Файли:**
- Створити: `src/features/taskChat/ThreadKpiStrip.tsx`
- Змінити: `src/features/taskChat/TaskChatPanel.tsx`

- [ ] **Крок 1: Компонент**

Три комірки волосяною сіткою (`gap-px` на `bg-border/50`, комірки `bg-card`) — точно як KPI-смужка в `DesignersDashboard.tsx`. Доріжка норми — шари: `bg-chart-1` поточне, `opacity-30` минуле, пунктирна норма, `bg-success-solid` перевищення.

```tsx
import { cn } from "@/lib/utils";

type Cell = { label: string; value: string; unit?: string; hint?: string; tone?: "good" | "bad" | "flat" };

export function ThreadKpiStrip({ cells }: { cells: Cell[] }) {
  return (
    <div className="grid grid-cols-3 gap-px border-y border-border/40 bg-border/40">
      {cells.map((cell) => (
        <div key={cell.label} className="flex flex-col gap-1 bg-card p-3">
          <span className="text-2xs font-medium text-muted-foreground">{cell.label}</span>
          <span className="text-lg font-bold leading-none tracking-tight tabular-nums">
            {cell.value}
            {cell.unit ? <span className="ml-1 text-2xs font-medium text-muted-foreground">{cell.unit}</span> : null}
          </span>
          {cell.hint ? (
            <span
              className={cn(
                "inline-flex w-fit rounded-full border px-1.5 text-3xs font-semibold",
                cell.tone === "bad" && "border-danger-soft-border bg-danger-soft text-danger-foreground",
                cell.tone === "good" && "border-success-soft-border bg-success-soft text-success-foreground",
                (!cell.tone || cell.tone === "flat") && "border-border/60 bg-muted text-muted-foreground"
              )}
            >
              {cell.hint}
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Крок 2: Порахувати показники**

Додати в `src/lib/taskThread.ts` (і тест до нього тим самим прийомом, що в задачі 4 — функція чиста, `now` передається):

```ts
export type DesignTaskFacts = {
  revisions: number;
  revisionNorm: number;
  assignedAt: string | null;
  deadline: string | null;
};

const DAY_MS = 86_400_000;

export function designTaskKpiCells(facts: DesignTaskFacts, now: Date) {
  const daysInWork = facts.assignedAt
    ? Math.max(0, Math.floor((now.getTime() - new Date(facts.assignedAt).getTime()) / DAY_MS))
    : null;
  const daysLeft = facts.deadline
    ? Math.ceil((new Date(facts.deadline).getTime() - now.getTime()) / DAY_MS)
    : null;

  return [
    {
      label: "Правки",
      value: String(facts.revisions),
      unit: `з ~${facts.revisionNorm}`,
      hint: facts.revisions > facts.revisionNorm ? `+${facts.revisions - facts.revisionNorm}` : undefined,
      tone: facts.revisions > facts.revisionNorm ? ("bad" as const) : ("flat" as const),
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
      tone: daysLeft !== null && daysLeft < 0 ? ("bad" as const) : ("flat" as const),
    },
  ];
}
```

Для ліда — окрема функція з тими самими типами комірок: днів без відповіді, кількість прорахунків, кількість повідомлень.

- [ ] **Крок 3: Перевірити й закомітити**

```bash
npx tsc --noEmit && npm run lint
git add src/features/taskChat/ThreadKpiStrip.tsx src/features/taskChat/TaskChatPanel.tsx
git commit -m "feat(chat): смужка показників справи"
```

---

### Задача 12: Realtime і позначка прочитання

**Файли:**
- Створити: `src/features/taskChat/useThreadRealtime.ts`
- Змінити: `src/features/taskChat/TaskChatPanel.tsx`

- [ ] **Крок 1: Хук підписки**

```ts
import React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import { threadKeys } from "./queries";

export function useThreadRealtime(threadKey: string | null, disabled: boolean) {
  const client = useQueryClient();
  React.useEffect(() => {
    if (!threadKey || disabled) return;
    const channel = supabase
      .channel(`thread:${threadKey}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "tosho", table: "quote_comments", filter: `thread_key=eq.${threadKey}` },
        () => void client.invalidateQueries({ queryKey: threadKeys.entries(threadKey) })
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [client, disabled, threadKey]);
}
```

> Якщо повідомлення не прилітають — перша підозра не код, а публікація: див. задачу 2 крок 3. Підписка на таблицю поза публікацією мовчить без помилки.

- [ ] **Крок 2: Позначка прочитання**

У панелі: таймер на 3 секунди після відкриття плюс виклик при закритті. Не позначати в мить відкриття — інакше «заглянув на секунду» гасить лічильник.

```tsx
React.useEffect(() => {
  if (!threadKey || !userId) return;
  const timer = window.setTimeout(() => markRead.mutate(userId), 3000);
  return () => {
    window.clearTimeout(timer);
    markRead.mutate(userId);
  };
}, [threadKey, userId]);
```

- [ ] **Крок 3: Перевірити й закомітити**

```bash
npx tsc --noEmit && npm run lint
git add src/features/taskChat/useThreadRealtime.ts src/features/taskChat/TaskChatPanel.tsx
git commit -m "feat(chat): realtime нитки і позначка прочитання"
```

---

### Задача 13: Точки входу і лічильники

**Файли:**
- Змінити: `src/pages/DesignPage.tsx` (картка канбану), `src/pages/DesignTaskPage.tsx`, `src/pages/QuoteDetailsPage.tsx`

- [ ] **Крок 1: Кнопка на картці канбану**

На картці дизайн-задачі додати кнопку з іконкою `MessageSquare` і лічильником; клік викликає `openThread({ kind: "quote", quoteId, title, teamId })` і **не** відкриває картку (`event.stopPropagation()`).

```tsx
<button
  type="button"
  aria-label="Відкрити обговорення"
  onClick={(event) => {
    event.stopPropagation();
    openThread({ kind: "quote", quoteId, title, teamId });
  }}
  className={cn(
    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-3xs font-semibold tabular-nums",
    unread > 0 ? "bg-primary text-primary-foreground" : "border border-border/60 text-muted-foreground"
  )}
>
  <MessageSquare className="h-3 w-3" /> {total}
</button>
```

- [ ] **Крок 2: Лічильники одним запитом на дошку**

Не тягнути нитку на кожну картку. Один запит на видимі ключі ниток:

```ts
const { data } = await supabase
  .schema("tosho")
  .from("quote_comments")
  .select("thread_key,created_at,created_by")
  .in("thread_key", threadKeys)
  .eq("kind", "message");
```

далі звести через `countUnread` із задачі 4, узявши позначки з `thread_reads` тим самим прийомом `in`.

- [ ] **Крок 3: Кнопки на сторінках прорахунку й дизайн-задачі**

Додати ту саму кнопку в шапку обох сторінок через `usePageHeaderActions` (конвенція `project_toolbar_unification`).

- [ ] **Крок 4: Перевірити й закомітити**

```bash
npx tsc --noEmit && npm run lint
git add src/pages/DesignPage.tsx src/pages/DesignTaskPage.tsx src/pages/QuoteDetailsPage.tsx
git commit -m "feat(chat): точки входу в обговорення і лічильники непрочитаного"
```

---

### Задача 14: Закріплене ТЗ

**Файли:**
- Змінити: `src/features/taskChat/TaskChatPanel.tsx`, `src/features/taskChat/ThreadFeed.tsx`

- [ ] **Крок 1: Показати закріплене**

Над стрічкою — смужка з останнім записом, де `is_pinned = true`:

```tsx
const pinned = entries.filter((entry) => entry.isPinned).at(-1);
```

Верстка — за макетом: `rounded-xl border border-border/40 bg-muted p-2.5`, іконка `Pin`, заголовок «Технічне завдання» у `text-3xs uppercase tracking-wide text-muted-foreground`.

- [ ] **Крок 2: Дія «закріпити»**

У меню повідомлення (для тих, хто має доступ до модуля `design` або `finance`) — перемикач `is_pinned`; при закріпленні нового старе знімати:

```ts
await supabase.schema("tosho").from("quote_comments").update({ is_pinned: false }).eq("thread_key", threadKey).eq("is_pinned", true);
await supabase.schema("tosho").from("quote_comments").update({ is_pinned: true }).eq("id", entryId);
```

- [ ] **Крок 3: Перевірити й закомітити**

```bash
npx tsc --noEmit && npm run lint
git add src/features/taskChat
git commit -m "feat(chat): закріплене ТЗ у шапці стрічки"
```

---

### Задача 15: Підсумкова перевірка

- [ ] **Крок 1: Уся перевірка разом**

```bash
npx tsc --noEmit && npm run lint && npm test
```

Очікуємо: типи чисті, лінт чистий, тести зелені.

- [ ] **Крок 2: Довести доступи на реальних даних**

Під акаунтом **без** доступу до Фінансів переконатись, що внутрішня нотатка не повертається. Симуляція користувача через `set_config` (прийом із `feedback_verify_with_evidence`):

```bash
set -a && source .env.backup && set +a && psql "$BACKUP_DB_URL" -c "
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','<uuid-без-фінансів>')::text, true);
select count(*) from tosho.quote_comments where visibility='internal';"
```

Очікуємо: `0`.

- [ ] **Крок 3: Звіт CEO**

Скласти перелік накопичених комітів і **зупинитись**. Не пушити: пуш = деплой ≈15 кредитів, потрібна пряма команда (`docs/DEPLOY_POLICY.md`).

---

## Що навмисно поза фазою A

Вкладення й голосові прямо з панелі (лише посилання), редагування й видалення повідомлень, реакції, відповіді на конкретне повідомлення, пошук по нитці, згортання довгих повідомлень, будь-що з Telegram (фази B–E), док-колонка як альтернатива шторці.
