# Запити на доробку CRM — фаза 1 (частини А і Б)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Зробити безпечним додавання Telegram-бота в робочу групу й дати Артему та CEO працюючу дошку запитів `/dev-requests`, де картку можна завести руками.

**Architecture:** Частина А чинить Telegram-вебхук так, щоб груповий чат не отримував нічого й не псував персональних зв'язок, і вводить `telegram_user_id` як справжній ключ людини (сьогодні ключ — `chat_id`, який у групі не збігається з `from.id`). Частина Б додає таблицю `tosho.dev_requests` із власною нумерацією поверх наявного `document_counters`, RLS із приватними картками для owner/CEO, і сторінку-канбан за патерном `/releases` (гейт у сторінці, без ключа модуля — `hasModuleAccess` вважає незаписаний ключ дозволеним).

**Tech Stack:** TypeScript, Netlify Functions, Supabase (схема `tosho`), React + React Query, Tailwind v4, vitest.

**Спека:** [docs/DEV_REQUESTS_DESIGN.md](../../DEV_REQUESTS_DESIGN.md). Тріаж (частина В — бот сам заводить картки з повідомлень) — окремий план, цей його не покриває.

---

## Порядок виконання — Telegram відкладено

Рішення Артема 2026-08-08: **починаємо з дошки й голосу, без Telegram.** Спершу переконуємось, що працює найпростіший шлях — «сказав уголос → з'явилась охайна картка» — і лише потім підключаємо чат.

**Робимо зараз, у цьому порядку:**

| # | Задача | Навіщо |
|---|---|---|
| 6 | Таблиця, приватність, нумерація | фундамент |
| 7 | Регенерація типів | без неї не компілюється |
| 8 | Типи й мапер картки | |
| 9 | Шар запитів до бази | |
| 10 | Дошка | |
| 11 | Вікно «Новий запит» | |
| **15** | **Функція розбору надиктованого** | «агент розуміє, робить назву й опис» |
| **16** | **Диктування у вікні** | |
| 12 | Сторінка з гейтом і тулбаром | |
| 13 | Маршрут і сайдбар | |
| 14 | Обговорення в картці | |

**Відкладено (Tasks 1–5, частина А).** Готові до виконання, але не зараз: тип апдейта, мовчання в групі, `telegram_user_id`, резолвер за `from.id`, відповідь у нитку. Поки їх не зроблено, **бота в групу додавати не можна** — він відповідатиме «Акаунт не підключено» на кожне повідомлення.

**Поза цим планом:** тріаж повідомлень моделлю (фаза 1В), зв'язок із релізом через sha (фаза 2), спека-режим (фаза 3).

## Як картка рухається по дошці

Автоматичного переходу на створенні **немає навмисно**. Картка з дошки народжується одразу в `У черзі`: людина, яка її завела, вже вирішила, що це робимо. Далі:

- `В роботі` — ставить той, хто взявся. Коли за задачу беруся я, картку рухаю сам.
- `Готово локально` — за фактом коміта.
- `Викочено` — за фактом деплою (фаза 2, звірка sha).

Статус має відображати те, що **сталося**, а не намір. Автоперехід на створенні зробив би дошку красивою й брехливою.

---

## File Structure

**Створюємо:**

| Файл | Відповідальність |
|---|---|
| `netlify/functions/_lib/telegramUpdate.ts` | Чистий розбір апдейта: тип чату, команда без `@botname`. Без мережі й БД — тому покривається тестами повністю. |
| `netlify/functions/_lib/telegramUpdate.test.ts` | Тести до нього. |
| `scripts/telegram-group-identity.sql` | `telegram_user_id` + бекфіл + унікальний індекс. |
| `scripts/dev-requests-schema.sql` | `tosho.is_owner_or_seo()`, таблиця `dev_requests`, RLS, гранти, аудит-тригер, розширення лічильника. |
| `src/features/devRequests/types.ts` | Статуси, типи рядка й картки, мапер snake_case → camelCase. |
| `src/features/devRequests/queries.ts` | React Query: ключі, читання дошки, мутації створення й зміни статусу. |
| `src/features/devRequests/DevRequestBoard.tsx` | Канбан: колонки, DnD, картка. |
| `src/features/devRequests/NewDevRequestDialog.tsx` | Вікно «Новий запит». |
| `src/pages/DevRequestsPage.tsx` | Сторінка: гейт owner/CEO, тулбар, монтування дошки. |

**Змінюємо:**

| Файл | Що саме |
|---|---|
| `netlify/functions/_telegram.ts` | `reply_to_message_id` у `SendOptions`. |
| `netlify/functions/telegram-webhook.ts` | Тип апдейта; ранній вихід для не-приватних чатів; `parseCommand`; запис `telegram_user_id`; резолвер за `from.id`. |
| `src/lib/database.types.ts` | Регенерація після міграції. |
| `src/App.tsx` | Роут `/dev-requests`. |
| `src/layout/AppLayout.tsx` | `ROUTES`, пункт сайдбару, гілка видимості у фільтрі меню, заголовок сторінки. |

---

# ЧАСТИНА А — безпечна група й ідентифікація · ВІДКЛАДЕНО

> **Не виконувати в цьому раунді.** Артем вирішив спершу перевірити дошку й голос. Задачі 1–5 залишені готовими до роботи — повернемось до них, коли дошка заживе.
>
> Поки їх не зроблено, бота в робочу групу додавати **не можна**.

Після частини А бота можна додавати в групу: він там мовчатиме. Це самостійна цінність — сьогодні додавання бота в групу викликало б спам і зіпсовані зв'язки.

---

### Task 1: Чистий розбір Telegram-апдейта

**Files:**
- Create: `netlify/functions/_lib/telegramUpdate.ts`
- Test: `netlify/functions/_lib/telegramUpdate.test.ts`

- [ ] **Step 1: Написати падаючий тест**

Створити `netlify/functions/_lib/telegramUpdate.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { chatTypeOf, isPrivateChat, parseCommand } from "./telegramUpdate";

describe("тип чату", () => {
  it("розпізнає приватний і групові", () => {
    expect(chatTypeOf("private")).toBe("private");
    expect(chatTypeOf("group")).toBe("group");
    expect(chatTypeOf("supergroup")).toBe("supergroup");
    expect(chatTypeOf("channel")).toBe("channel");
  });

  it("невідоме й порожнє — unknown", () => {
    expect(chatTypeOf(undefined)).toBe("unknown");
    expect(chatTypeOf(null)).toBe("unknown");
    expect(chatTypeOf("")).toBe("unknown");
    expect(chatTypeOf("щось нове")).toBe("unknown");
  });

  // Найважливіший тест файлу: якщо тип невідомий, вважаємо чат НЕ приватним.
  // Помилка в цей бік = бот промовчав; у зворотний = персональна відповідь
  // (налаштування, дані по задачах) полетіла в загальний чат на 17 людей.
  it("невідомий тип НЕ вважається приватним", () => {
    expect(isPrivateChat(undefined)).toBe(false);
    expect(isPrivateChat("supergroup")).toBe(false);
    expect(isPrivateChat("private")).toBe(true);
  });
});

describe("розбір команди", () => {
  it("команда з аргументом", () => {
    expect(parseCommand("/start abc123", "ToShoCRM_bot")).toEqual({
      command: "/start",
      arg: "abc123",
    });
  });

  it("команда без аргументу", () => {
    expect(parseCommand("/menu", "ToShoCRM_bot")).toEqual({ command: "/menu", arg: null });
  });

  // У групі Telegram дописує @ім'я_бота — наявний парсер через це не бачив
  // жодної команди.
  it("зрізає @botname, регістр не має значення", () => {
    expect(parseCommand("/away@ToShoCRM_bot", "ToShoCRM_bot")).toEqual({
      command: "/away",
      arg: null,
    });
    expect(parseCommand("/away@toshocrm_bot дод", "ToShoCRM_bot")).toEqual({
      command: "/away",
      arg: "дод",
    });
  });

  it("команда, адресована іншому боту, — не наша", () => {
    expect(parseCommand("/away@OtherBot", "ToShoCRM_bot")).toEqual({
      command: null,
      arg: null,
    });
  });

  it("без налаштованого імені бота зрізає будь-який суфікс", () => {
    expect(parseCommand("/away@OtherBot", "")).toEqual({ command: "/away", arg: null });
  });

  it("звичайний текст командою не є", () => {
    expect(parseCommand("не працює кнопка", "ToShoCRM_bot")).toEqual({
      command: null,
      arg: null,
    });
    expect(parseCommand("", "ToShoCRM_bot")).toEqual({ command: null, arg: null });
    expect(parseCommand(undefined, "ToShoCRM_bot")).toEqual({ command: null, arg: null });
  });

  it("команду приводить до нижнього регістру, аргумент лишає як є", () => {
    expect(parseCommand("/START Abc123", "ToShoCRM_bot")).toEqual({
      command: "/start",
      arg: "Abc123",
    });
  });
});
```

- [ ] **Step 2: Запустити тест і переконатись, що падає**

```bash
npx vitest run netlify/functions/_lib/telegramUpdate.test.ts
```

Очікується: FAIL, `Failed to resolve import "./telegramUpdate"`.

- [ ] **Step 3: Написати модуль**

Створити `netlify/functions/_lib/telegramUpdate.ts`:

```ts
/**
 * Чистий розбір вхідного апдейта Telegram.
 *
 * Винесено окремо з однієї причини: у telegram-webhook.ts усе, що тут
 * вирішується, раніше вирішувалось неявно й помилково. Тип чату не
 * перевірявся взагалі (тобто груповий апдейт оброблявся як приватний), а
 * команда бралась як text.split(/\s+/)[0] — у групі Telegram дописує
 * @ім'я_бота, і жодна команда не збігалась.
 *
 * Модуль без мережі й БД, тому покритий тестами повністю.
 */

export type TelegramChatType = "private" | "group" | "supergroup" | "channel" | "unknown";

const KNOWN_CHAT_TYPES: TelegramChatType[] = ["private", "group", "supergroup", "channel"];

export function chatTypeOf(raw: string | null | undefined): TelegramChatType {
  const value = (raw ?? "").trim().toLowerCase();
  return (KNOWN_CHAT_TYPES as string[]).includes(value) ? (value as TelegramChatType) : "unknown";
}

/**
 * Fail-closed: невідомий тип вважаємо НЕ приватним.
 *
 * Ціна помилки несиметрична. Промовчати в приватному чаті — незручність;
 * відповісти персональним у груповий — злити налаштування або робочі дані
 * усій команді.
 */
export function isPrivateChat(raw: string | null | undefined): boolean {
  return chatTypeOf(raw) === "private";
}

export type ParsedCommand = {
  /** Нижній регістр, із косою: "/start". null — це не команда або команда чужого бота. */
  command: string | null;
  /** Усе після першого пробілу, обрізане. null, якщо порожнє. */
  arg: string | null;
};

const NOT_A_COMMAND: ParsedCommand = { command: null, arg: null };

/**
 * @param botUsername ім'я нашого бота без «@». Порожнє — зрізаємо будь-який
 *   суфікс і не перевіряємо адресата (у приватному чаті чужих ботів немає).
 */
export function parseCommand(
  text: string | null | undefined,
  botUsername: string | null | undefined
): ParsedCommand {
  const trimmed = (text ?? "").trim();
  if (!trimmed.startsWith("/")) return NOT_A_COMMAND;

  const spaceAt = trimmed.search(/\s/);
  const head = spaceAt === -1 ? trimmed : trimmed.slice(0, spaceAt);
  const rest = spaceAt === -1 ? "" : trimmed.slice(spaceAt).trim();

  const atAt = head.indexOf("@");
  let command = head;
  if (atAt !== -1) {
    const addressee = head.slice(atAt + 1);
    const expected = (botUsername ?? "").trim();
    if (expected && addressee.toLowerCase() !== expected.toLowerCase()) {
      return NOT_A_COMMAND; // команда іншому боту в тій самій групі
    }
    command = head.slice(0, atAt);
  }

  if (command.length < 2) return NOT_A_COMMAND;
  return { command: command.toLowerCase(), arg: rest.length > 0 ? rest : null };
}
```

- [ ] **Step 4: Запустити тест і переконатись, що проходить**

```bash
npx vitest run netlify/functions/_lib/telegramUpdate.test.ts
```

Очікується: PASS, 9 тестів.

- [ ] **Step 5: Коміт**

```bash
git add netlify/functions/_lib/telegramUpdate.ts netlify/functions/_lib/telegramUpdate.test.ts
git commit -m "feat(telegram): бот навчився відрізняти груповий чат від особистого"
```

---

### Task 2: Бот мовчить у групі й більше не псує зв'язок

**Files:**
- Modify: `netlify/functions/telegram-webhook.ts` (тип апдейта ~48-59, `handleMessage` ~152-157)

- [ ] **Step 1: Розширити тип апдейта**

У `netlify/functions/telegram-webhook.ts` замінити блок `type TelegramUpdate = {...}` (рядки 48-59) на:

```ts
type TelegramUpdate = {
  message?: {
    message_id?: number;
    text?: string;
    /** type обов'язковий для рішення «приватний чи ні» — див. _lib/telegramUpdate. */
    chat?: { id?: number; type?: string };
    /** from.id — справжній ключ людини. chat.id дорівнює йому лише в приватному чаті. */
    from?: { id?: number; username?: string };
    reply_to_message?: { message_id?: number };
  };
  callback_query?: {
    id: string;
    data?: string;
    message?: { message_id?: number; chat?: { id?: number } };
  };
};
```

- [ ] **Step 2: Додати імпорт**

Поруч із наявними імпортами `_lib` додати:

```ts
import { isPrivateChat, parseCommand } from "./_lib/telegramUpdate";
```

- [ ] **Step 3: Ранній вихід для не-приватних чатів і новий розбір команди**

У `handleMessage` замінити рядки 152-158 (від `const chatId` до `const username`) на:

```ts
async function handleMessage(adminClient: AdminClient, message: NonNullable<TelegramUpdate["message"]>) {
  const chatId = message.chat?.id;
  const text = message.text?.trim();
  if (!chatId || !text) return;

  /**
   * Груповий чат ЦЯ функція не обслуговує — мовчимо повністю.
   *
   * Без цієї перевірки бот відповідав «Акаунт не підключено» на кожне
   * повідомлення в групі (17 людей), а «/start <nonce>» у групі записував id
   * групи як особистий чат людини — після чого її персональні сповіщення
   * летіли в загальний чат.
   *
   * Гілка тріажу групи стане ПЕРЕД цим виходом (окремий план, фаза 1В).
   */
  if (!isPrivateChat(message.chat?.type)) return;

  const { command, arg } = parseCommand(text, process.env.TELEGRAM_BOT_USERNAME);
  const username = message.from?.username ?? null;
  const nowIso = new Date().toISOString();
```

- [ ] **Step 4: Перевірити, що решта функції сумісна**

Далі по тілу `handleMessage` порівняння виду `command === "/start"` лишаються без змін — `parseCommand` повертає нижній регістр із косою, як і старий `split`. Різниця лише в тому, що для не-команд `command` тепер `null`, а не перше слово тексту; гілка вільного тексту (`handleAssistantQuestion`) спрацьовує в `else`, тож поведінка та сама.

Перевірити типи:

```bash
npm run typecheck:functions
```

Очікується: без помилок (порожній вивід).

- [ ] **Step 5: Лінт і повна перевірка типів**

```bash
npx tsc --noEmit && npm run lint
```

Очікується: обидві команди завершуються без помилок.

- [ ] **Step 6: Коміт**

```bash
git add netlify/functions/telegram-webhook.ts
git commit -m "fix(telegram): у спільних чатах бот більше не відповідає й не плутає особисті налаштування"
```

---

### Task 3: `telegram_user_id` як справжній ключ людини

**Files:**
- Create: `scripts/telegram-group-identity.sql`

- [ ] **Step 1: Написати міграцію**

Створити `scripts/telegram-group-identity.sql`:

```sql
-- Ключ людини в Telegram: from.id, а не chat_id.
--
-- Досі зв'язка трималась виключно на telegram_chat_id, і це працювало
-- випадково: у ПРИВАТНОМУ чаті chat.id чисельно дорівнює id користувача.
-- У групі це різні числа, тож пошук за chat_id не знаходить нікого.
--
-- Бекфіл коректний саме тому: всі наявні рядки створені з приватних чатів
-- (лінкування можливе лише звідти), отже telegram_chat_id там і є from.id.
--
-- Ідемпотентна, безпечна до повторного запуску.
-- Застосування: psql "$BACKUP_DB_URL" -f scripts/telegram-group-identity.sql

\set ON_ERROR_STOP on

begin;

alter table tosho.user_notification_settings
  add column if not exists telegram_user_id bigint;

comment on column tosho.user_notification_settings.telegram_user_id is
  'id користувача в Telegram (from.id). У приватному чаті збігається з telegram_chat_id, у групі — ні. Саме за ним резолвимо автора повідомлення.';

update tosho.user_notification_settings
   set telegram_user_id = telegram_chat_id
 where telegram_user_id is null
   and telegram_chat_id is not null;

-- Один Telegram-акаунт = один співробітник. Частковий індекс, бо в
-- більшості рядків колонка порожня (людина бота не підключала).
create unique index if not exists user_notification_settings_telegram_user_id_key
  on tosho.user_notification_settings (telegram_user_id)
  where telegram_user_id is not null;

commit;

notify pgrst, 'reload schema';
```

- [ ] **Step 2: Застосувати на прод**

```bash
set -a && . ./.env.backup && set +a && psql "$BACKUP_DB_URL" -f scripts/telegram-group-identity.sql
```

Очікується: `ALTER TABLE`, `COMMENT`, `UPDATE 7`, `CREATE INDEX`, `COMMIT`, `NOTIFY`.

- [ ] **Step 3: Довести, що бекфіл справді відпрацював**

```bash
set -a && . ./.env.backup && set +a && psql "$BACKUP_DB_URL" -t -A -c "select count(*) filter (where telegram_user_id is not null) as with_user_id, count(*) filter (where telegram_chat_id is not null) as linked, count(*) filter (where telegram_chat_id is not null and telegram_user_id is distinct from telegram_chat_id) as mismatched from tosho.user_notification_settings;"
```

Очікується: `7|7|0` — стільки ж рядків із `telegram_user_id`, скільки підключених, і жодного розходження.

- [ ] **Step 4: Коміт**

```bash
git add scripts/telegram-group-identity.sql
git commit -m "feat(telegram): бот запам'ятовує саму людину, а не її особистий чат"
```

---

### Task 4: Записувати `telegram_user_id` при підключенні

**Files:**
- Modify: `netlify/functions/telegram-webhook.ts` (`loadSettingsByChat` ~100-108, upsert у `/start` ~200-213)

- [ ] **Step 1: Додати резолвер за id людини**

Одразу після `loadSettingsByChat` (після рядка 108) додати:

```ts
/**
 * Резолв людини за from.id. Використовується там, де chat.id людині не
 * належить — тобто в груповому чаті (фаза 1В). У приватному дає той самий
 * результат, що й loadSettingsByChat.
 */
async function loadSettingsByTelegramUser(
  adminClient: AdminClient,
  telegramUserId: number
): Promise<SettingsRow | null> {
  const { data } = await adminClient
    .schema("tosho")
    .from("user_notification_settings")
    .select("user_id,telegram_enabled,channel_prefs")
    .eq("telegram_user_id", telegramUserId)
    .maybeSingle();
  return (data as SettingsRow | null) ?? null;
}
```

- [ ] **Step 2: Писати колонку при підключенні**

В `handleMessage`, у гілці `/start` із нонсом, у виклику `.upsert({...})` (рядки 203-213) додати поле `telegram_user_id` після `telegram_chat_id`:

```ts
      .upsert(
        {
          user_id: tokenRow.user_id,
          telegram_chat_id: chatId,
          // Сюди дійшли лише з приватного чату (перевірка на початку
          // handleMessage), тож from.id і chat.id тут збігаються — але
          // записуємо саме from.id, бо він і є ключем людини.
          telegram_user_id: message.from?.id ?? chatId,
          telegram_username: username,
          telegram_linked_at: nowIso,
          telegram_enabled: true,
          updated_at: nowIso,
        },
        { onConflict: "user_id" }
      );
```

- [ ] **Step 3: Приглушити попередження про невикористаний резолвер**

`loadSettingsByTelegramUser` знадобиться у фазі 1В. Щоб лінт не лаявся на невикористану функцію зараз, додати її в експорт для тестів наприкінці файлу, поруч із `handler`:

```ts
/** Експортується для фази 1В (тріаж групи) — там резолв іде саме за from.id. */
export const __internal = { loadSettingsByTelegramUser };
```

- [ ] **Step 4: Перевірити типи й лінт**

```bash
npx tsc --noEmit && npm run lint && npm run typecheck:functions
```

Очікується: усі три без помилок.

- [ ] **Step 5: Коміт**

```bash
git add netlify/functions/telegram-webhook.ts
git commit -m "feat(telegram): підключення бота зберігає саму людину, а не лише її чат"
```

---

### Task 5: Відповідь у нитку повідомлення

**Files:**
- Modify: `netlify/functions/_telegram.ts:62-80`

- [ ] **Step 1: Розширити опції відправки**

У `netlify/functions/_telegram.ts` замінити `type SendOptions` і тіло `sendTelegramMessage` (рядки 62-80) на:

```ts
type SendOptions = {
  parseMode?: "HTML";
  replyMarkup?: ReplyMarkup;
  disablePreview?: boolean;
  /**
   * Відповідь на конкретне повідомлення. У групі це єдиний спосіб не
   * перетворити чат на простирадло: питання й відповіді збираються в нитку
   * під вихідним повідомленням, а не сиплються окремими рядками.
   */
  replyToMessageId?: number;
};

export async function sendTelegramMessage(
  chatId: number | string,
  text: string,
  options?: SendOptions
): Promise<TelegramApiResult> {
  return callTelegram("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: options?.parseMode,
    disable_web_page_preview: options?.disablePreview ?? true,
    reply_markup: options?.replyMarkup,
    // allow_sending_without_reply: вихідне повідомлення могли видалити, і тоді
    // Telegram інакше відхилив би відповідь цілком.
    ...(options?.replyToMessageId
      ? {
          reply_parameters: {
            message_id: options.replyToMessageId,
            allow_sending_without_reply: true,
          },
        }
      : {}),
  });
}
```

- [ ] **Step 2: Перевірити типи й лінт**

```bash
npx tsc --noEmit && npm run lint && npm run typecheck:functions
```

Очікується: без помилок.

- [ ] **Step 3: Коміт**

```bash
git add netlify/functions/_telegram.ts
git commit -m "feat(telegram): бот уміє відповідати в нитку повідомлення"
```

---

# ЧАСТИНА Б — картки й дошка

---

### Task 6: Таблиця запитів, приватність, нумерація

**Files:**
- Create: `scripts/dev-requests-schema.sql`

- [ ] **Step 1: Написати міграцію**

Створити `scripts/dev-requests-schema.sql`:

```sql
-- Запити на доробку CRM: те, що просить команда, і те, що ми самі вирішили
-- зробити. Дизайн: docs/DEV_REQUESTS_DESIGN.md
--
-- НАВІЩО ОКРЕМО ВІД tosho.support_requests: та таблиця обслуговує AI-асистента
-- (режими ask/fix/route/resolve), її статуси не мають ні «Готово локально», ні
-- «Викочено», вона зрощена з netlify/functions/tosho-ai.ts, і в ній лежать 93
-- чужі картки, з яких 61 мертва. Змішувати з живою чергою розробки не можна.
--
-- Ідемпотентна, безпечна до повторного запуску.
-- Застосування: psql "$BACKUP_DB_URL" -f scripts/dev-requests-schema.sql

\set ON_ERROR_STOP on

begin;

-- Спільний предикат «власник або CEO».
--
-- Де-факто цю роль уже грає tosho.can_read_all_feature_adoption() — її навіть
-- переюзали в product-updates-schema.sql. Але назва бреше про призначення,
-- тому заводимо чесний аліас і надалі беремо його.
--
-- SECURITY DEFINER, а не звернення до memberships_view прямо в політиці:
-- політики зливаються через OR, і помилка прав усередині однієї валить увесь
-- запит (пастка описана в scripts/feature-adoption-schema.sql:31-35).
create or replace function tosho.is_owner_or_seo()
returns boolean
language sql
stable
security definer
set search_path to 'tosho', 'public'
set row_security to 'off'
as $$
  select exists (
    select 1
    from tosho.memberships m
    where m.user_id = auth.uid()
      and (m.role::text = 'owner' or m.job_role::text = 'seo')
  )
  and not tosho.is_user_blocked(auth.uid());
$$;

revoke all on function tosho.is_owner_or_seo() from public, anon;
grant execute on function tosho.is_owner_or_seo() to authenticated;

create table if not exists tosho.dev_requests (
  id             uuid        primary key default gen_random_uuid(),
  /** Людський номер. У базі лише число; «REQ-42» збирає застосунок. */
  number         bigint      not null,
  /** RLS-ключ. */
  team_id        uuid        not null,
  /**
   * Не для політик. Тригер tosho.audit_row_change читає обидві колонки
   * генерично, а RPC tosho.get_audit_log приймає p_workspace_id — без цієї
   * колонки історія картки писалась би, але була б нечитабельною.
   */
  workspace_id   uuid,
  title          text        not null,
  body           text,
  kind           text        not null default 'friction',
  status         text        not null default 'triage',
  /** Приватна картка: видно лише власнику й CEO. */
  is_private     boolean     not null default false,
  /** Автор у CRM. null — автор написав із Telegram і бота ще не підключив. */
  author_user_id uuid,
  tg_user_id     bigint,
  tg_username    text,
  tg_chat_id     bigint,
  tg_message_id  bigint,
  /** Скільки людей просили те саме. Пріоритетний сигнал. */
  asked_by_count integer     not null default 1,
  /** Припущення, за якими рухаємось, поки ніхто не заперечив. */
  assumptions    jsonb       not null default '[]'::jsonb,
  /** SHA комітів цієї справи. Заповнюється у фазі 2. */
  commit_shas    text[]      not null default '{}',
  released_at    timestamptz,
  created_by     uuid,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint dev_requests_kind_check
    check (kind in ('bug', 'friction', 'feature')),
  constraint dev_requests_status_check
    check (status in ('triage', 'queued', 'in_progress', 'done_local', 'released', 'wont_do')),
  constraint dev_requests_number_unique unique (team_id, number)
);

comment on table tosho.dev_requests is
  'Запити на доробку CRM: з робочого чату, з дошки або заднім числом із релізу. Дизайн — docs/DEV_REQUESTS_DESIGN.md';

-- Дублікати від ретраїв Telegram: вебхук не має ідемпотентності по update_id,
-- тож захищаємось на рівні даних — одне повідомлення = максимум одна картка.
create unique index if not exists dev_requests_tg_message_key
  on tosho.dev_requests (tg_chat_id, tg_message_id)
  where tg_message_id is not null;

create index if not exists dev_requests_board_idx
  on tosho.dev_requests (team_id, status, created_at desc);

-- updated_at тримає БД, а не фронт.
create or replace function tosho.touch_dev_requests_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_dev_requests_touch on tosho.dev_requests;
create trigger trg_dev_requests_touch
  before update on tosho.dev_requests
  for each row execute function tosho.touch_dev_requests_updated_at();

-- Історія змін полів — наявний генеричний аудит, свого логу не заводимо.
drop trigger if exists trg_dev_requests_audit on tosho.dev_requests;
create trigger trg_dev_requests_audit
  after insert or update or delete on tosho.dev_requests
  for each row execute function tosho.audit_row_change('dev_request');

alter table tosho.dev_requests enable row level security;

-- Дві політики через OR замість однієї з OR всередині: так помилка в одній
-- гілці не валить іншу.
drop policy if exists dev_requests_team_read on tosho.dev_requests;
create policy dev_requests_team_read on tosho.dev_requests
  for select using (not is_private and public.is_team_member(team_id));

drop policy if exists dev_requests_privileged_read on tosho.dev_requests;
create policy dev_requests_privileged_read on tosho.dev_requests
  for select using (tosho.is_owner_or_seo());

-- Заводити картку може будь-хто зі своєї команди; приватну — лише owner/CEO.
drop policy if exists dev_requests_insert on tosho.dev_requests;
create policy dev_requests_insert on tosho.dev_requests
  for insert with check (
    public.is_team_member(team_id)
    and (not is_private or tosho.is_owner_or_seo())
  );

-- Рухати картку по дошці — лише owner/CEO: це рішення про чергу робіт.
drop policy if exists dev_requests_update on tosho.dev_requests;
create policy dev_requests_update on tosho.dev_requests
  for update using (tosho.is_owner_or_seo())
  with check (tosho.is_owner_or_seo());

revoke all on tosho.dev_requests from anon;
grant select, insert, update on tosho.dev_requests to authenticated;

-- Нумерація: переюзуємо наявний атомарний лічильник, лише розширюємо перелік
-- видів. Своєї таблиці лічильників не заводимо.
alter table tosho.document_counters
  drop constraint if exists document_counters_kind_check;
alter table tosho.document_counters
  add constraint document_counters_kind_check
  check (kind in ('invoice', 'dev_request'));

commit;

notify pgrst, 'reload schema';
```

- [ ] **Step 2: Застосувати на прод**

```bash
set -a && . ./.env.backup && set +a && psql "$BACKUP_DB_URL" -f scripts/dev-requests-schema.sql
```

Очікується: серія `CREATE FUNCTION` / `CREATE TABLE` / `CREATE INDEX` / `CREATE POLICY`, далі `COMMIT` і `NOTIFY`.

- [ ] **Step 3: Довести, що анонім не читає нічого**

```bash
set -a && . ./.env.backup && set +a && psql "$BACKUP_DB_URL" -c "set role anon; select count(*) from tosho.dev_requests;"
```

Очікується: `ERROR: permission denied for table dev_requests`. Якщо повернувся `0` — грант анону лишився, зупинитись і виправити.

- [ ] **Step 4: Дістати ідентифікатори для перевірки**

```bash
set -a && . ./.env.backup && set +a && psql "$BACKUP_DB_URL" -t -A -F' | ' -c "
select 'TEAM_ID', team_id::text from public.team_members limit 1
union all
select 'MANAGER_UUID', mv.user_id::text
from tosho.memberships_view mv
join tosho.team_member_profiles p on p.user_id = mv.user_id
where mv.job_role::text = 'manager' and p.employment_status = 'active'
limit 1;"
```

Записати обидва значення — вони підставляються в наступний крок. Фільтр `employment_status = 'active'` тут не косметика: серед менеджерів є звільнені, і перевірка від імені звільненого нічого не доводить, бо його ріже `is_user_blocked` у кожному гейті.

- [ ] **Step 5: Довести, що приватну картку не бачить звичайний співробітник**

Підставити значення з попереднього кроку:

```bash
set -a && . ./.env.backup && set +a && psql "$BACKUP_DB_URL" <<'SQL'
begin;
insert into tosho.dev_requests (number, team_id, title, is_private)
values (999001, '<TEAM_ID>', 'публічна перевірка', false),
       (999002, '<TEAM_ID>', 'приватна перевірка', true);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"<MANAGER_UUID>","role":"authenticated"}', true);
select number, title from tosho.dev_requests where number in (999001, 999002) order by number;
rollback;
SQL
```

Очікується: рівно один рядок — `999001 | публічна перевірка`. Якщо видно обидва — політика приватності не працює, зупинитись.

- [ ] **Step 6: Коміт**

```bash
git add scripts/dev-requests-schema.sql
git commit -m "feat(запити): сховище запитів на доробку з приватними картками для керівництва"
```

---

### Task 7: Регенерувати типи бази

**Files:**
- Modify: `src/lib/database.types.ts`

- [ ] **Step 1: Згенерувати**

```bash
npm i --no-save @supabase/postgres-meta && node scripts/gen-db-types.mjs
```

- [ ] **Step 2: Перевірити, що таблиця з'явилась**

```bash
grep -c "dev_requests" src/lib/database.types.ts
```

Очікується: число більше нуля (Row/Insert/Update-блоки).

- [ ] **Step 3: Перевірити типи**

```bash
npx tsc --noEmit
```

Очікується: без помилок.

- [ ] **Step 4: Коміт**

```bash
git add src/lib/database.types.ts
git commit -m "chore(типи): перегенеровано типи бази під запити на доробку"
```

---

### Task 8: Типи й мапер картки

**Files:**
- Create: `src/features/devRequests/types.ts`
- Test: `src/features/devRequests/types.test.ts`

- [ ] **Step 1: Написати падаючий тест**

Створити `src/features/devRequests/types.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { BOARD_COLUMNS, formatRequestNumber, toDevRequest } from "./types";

describe("номер запиту", () => {
  it("збирається застосунком, а не базою", () => {
    expect(formatRequestNumber(42)).toBe("REQ-42");
    expect(formatRequestNumber(1)).toBe("REQ-1");
  });
});

describe("мапер рядка", () => {
  it("переводить snake_case у camelCase і підставляє порожні значення", () => {
    const row = {
      id: "11111111-1111-1111-1111-111111111111",
      number: 7,
      team_id: "22222222-2222-2222-2222-222222222222",
      title: "Кнопка не відкриває картку",
      body: null,
      kind: "bug",
      status: "queued",
      is_private: false,
      author_user_id: null,
      tg_username: "vasya",
      asked_by_count: 3,
      created_at: "2026-08-08T10:00:00Z",
    };

    expect(toDevRequest(row)).toEqual({
      id: "11111111-1111-1111-1111-111111111111",
      number: 7,
      label: "REQ-7",
      teamId: "22222222-2222-2222-2222-222222222222",
      title: "Кнопка не відкриває картку",
      body: "",
      kind: "bug",
      status: "queued",
      isPrivate: false,
      authorUserId: null,
      tgUsername: "vasya",
      askedByCount: 3,
      createdAt: "2026-08-08T10:00:00Z",
    });
  });

  it("невідомий статус із бази не ламає дошку, а їде в перший стовпчик", () => {
    const row = {
      id: "3",
      number: 1,
      team_id: "t",
      title: "щось",
      body: null,
      kind: "friction",
      status: "щось_нове",
      is_private: false,
      author_user_id: null,
      tg_username: null,
      asked_by_count: 1,
      created_at: "2026-08-08T10:00:00Z",
    };
    expect(toDevRequest(row).status).toBe("triage");
  });
});

describe("колонки дошки", () => {
  it("порядок від входу до викоченого, «не робимо» окремо", () => {
    expect(BOARD_COLUMNS.map((c) => c.status)).toEqual([
      "triage",
      "queued",
      "in_progress",
      "done_local",
      "released",
    ]);
  });
});
```

- [ ] **Step 2: Запустити тест і переконатись, що падає**

```bash
npx vitest run src/features/devRequests/types.test.ts
```

Очікується: FAIL, `Failed to resolve import "./types"`.

- [ ] **Step 3: Написати модуль**

Створити `src/features/devRequests/types.ts`:

```ts
import type { ComponentType } from "react";
import { Hammer, HelpCircle, ListTodo, PackageCheck, Rocket } from "lucide-react";

export const REQUEST_STATUSES = [
  "triage",
  "queued",
  "in_progress",
  "done_local",
  "released",
  "wont_do",
] as const;

export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const REQUEST_KINDS = ["bug", "friction", "feature"] as const;
export type RequestKind = (typeof REQUEST_KINDS)[number];

export type DevRequest = {
  id: string;
  number: number;
  /** Готовий підпис «REQ-42» — щоб не збирати його в кожному компоненті. */
  label: string;
  teamId: string;
  title: string;
  body: string;
  kind: RequestKind;
  status: RequestStatus;
  isPrivate: boolean;
  authorUserId: string | null;
  tgUsername: string | null;
  askedByCount: number;
  createdAt: string;
};

/**
 * «Не робимо» на дошці окремою колонкою не стоїть: це тупик, а не етап.
 * Показуємо його окремим фільтром, щоб дошка лишалась про роботу в польоті.
 *
 * Форма запису підігнана під наявний KanbanColumnHeader — він приймає рівно
 * { icon, toneClassName, label, count } і поля «підказка» не має.
 */
export const BOARD_COLUMNS: Array<{
  status: RequestStatus;
  label: string;
  icon: ComponentType<{ className?: string }>;
  toneClassName?: string;
}> = [
  { status: "triage", label: "Треба уточнити", icon: HelpCircle, toneClassName: "tone-text-amber" },
  { status: "queued", label: "У черзі", icon: ListTodo },
  { status: "in_progress", label: "В роботі", icon: Hammer, toneClassName: "tone-text-blue" },
  { status: "done_local", label: "Готово локально", icon: PackageCheck, toneClassName: "tone-text-violet" },
  { status: "released", label: "Викочено", icon: Rocket, toneClassName: "tone-text-emerald" },
];

export const KIND_LABELS: Record<RequestKind, string> = {
  bug: "Не працює",
  friction: "Незручно",
  feature: "Нова можливість",
};

export function formatRequestNumber(number: number): string {
  return `REQ-${number}`;
}

type DevRequestRow = {
  id: string;
  number: number;
  team_id: string;
  title: string;
  body: string | null;
  kind: string;
  status: string;
  is_private: boolean;
  author_user_id: string | null;
  tg_username: string | null;
  asked_by_count: number;
  created_at: string;
};

function asStatus(raw: string): RequestStatus {
  return (REQUEST_STATUSES as readonly string[]).includes(raw)
    ? (raw as RequestStatus)
    : "triage";
}

function asKind(raw: string): RequestKind {
  return (REQUEST_KINDS as readonly string[]).includes(raw) ? (raw as RequestKind) : "friction";
}

export function toDevRequest(row: DevRequestRow): DevRequest {
  return {
    id: row.id,
    number: row.number,
    label: formatRequestNumber(row.number),
    teamId: row.team_id,
    title: row.title,
    body: row.body ?? "",
    kind: asKind(row.kind),
    status: asStatus(row.status),
    isPrivate: row.is_private,
    authorUserId: row.author_user_id,
    tgUsername: row.tg_username,
    askedByCount: row.asked_by_count,
    createdAt: row.created_at,
  };
}
```

- [ ] **Step 4: Запустити тест і переконатись, що проходить**

```bash
npx vitest run src/features/devRequests/types.test.ts
```

Очікується: PASS, 4 тести.

- [ ] **Step 5: Коміт**

```bash
git add src/features/devRequests/types.ts src/features/devRequests/types.test.ts
git commit -m "feat(запити): опис картки запиту й колонок дошки"
```

---

### Task 9: Шар запитів до бази

**Files:**
- Create: `src/features/devRequests/queries.ts`

- [ ] **Step 1: Написати модуль**

Створити `src/features/devRequests/queries.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import { resolveWorkspaceId } from "@/lib/workspace";
import { toDevRequest, type DevRequest, type RequestKind, type RequestStatus } from "./types";

const SELECT_COLUMNS =
  "id,number,team_id,title,body,kind,status,is_private,author_user_id,tg_username,asked_by_count,created_at";

export const devRequestKeys = {
  /** teamId у ключі обов'язково — інакше кеш протікає між тенантами. */
  board: (teamId: string | null) => ["devRequests", teamId, "board"] as const,
};

/**
 * refetchOnMount: "always" — дошку рухають кілька людей і мутації розкидані,
 * тож staleTime тут дав би стару картину після повернення на вкладку.
 */
export function useDevRequestBoard(teamId: string | null) {
  return useQuery({
    queryKey: devRequestKeys.board(teamId),
    enabled: Boolean(teamId),
    refetchOnMount: "always",
    queryFn: async (): Promise<DevRequest[]> => {
      const { data, error } = await supabase
        .schema("tosho")
        .from("dev_requests")
        .select(SELECT_COLUMNS)
        .eq("team_id", teamId as string)
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return (data ?? []).map((row) => toDevRequest(row as never));
    },
  });
}

export type CreateDevRequestInput = {
  teamId: string;
  title: string;
  body: string;
  kind: RequestKind;
  isPrivate: boolean;
  authorUserId: string;
};

export function useCreateDevRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateDevRequestInput): Promise<DevRequest> => {
      // Номер видає той самий атомарний лічильник, що й рахунки: паралельні
      // виклики блокують рядок і отримують різні номери.
      const { data: nextNumber, error: numberError } = await supabase
        .schema("tosho")
        .rpc("next_document_number", {
          p_team_id: input.teamId,
          p_kind: "dev_request",
          p_entity_key: "",
          p_period: "",
        });
      if (numberError) throw numberError;

      // workspace_id не в політиках — він потрібен лише щоб історія картки
      // читалась через tosho.get_audit_log(p_workspace_id). Резолвимо тут, бо
      // useAuth() його не віддає: у контексті є teamId, а це різні поняття.
      const workspaceId = await resolveWorkspaceId(input.authorUserId);

      const { data, error } = await supabase
        .schema("tosho")
        .from("dev_requests")
        .insert({
          number: nextNumber as number,
          team_id: input.teamId,
          workspace_id: workspaceId,
          title: input.title,
          body: input.body || null,
          kind: input.kind,
          status: "queued",
          is_private: input.isPrivate,
          author_user_id: input.authorUserId,
          created_by: input.authorUserId,
        })
        .select(SELECT_COLUMNS)
        .single();
      if (error) throw error;
      return toDevRequest(data as never);
    },
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: devRequestKeys.board(created.teamId) });
    },
  });
}

export function useMoveDevRequest(teamId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: RequestStatus }) => {
      // .select() обов'язковий: заблокований RLS-ом UPDATE не кидає помилки,
      // він просто чіпає 0 рядків — без цього «не зберіглось» виглядало б
      // як успіх.
      const { data, error } = await supabase
        .schema("tosho")
        .from("dev_requests")
        .update({ status })
        .eq("id", id)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Немає прав рухати цю картку");
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: devRequestKeys.board(teamId) });
    },
  });
}
```

- [ ] **Step 2: Перевірити типи**

```bash
npx tsc --noEmit && npm run lint
```

Очікується: без помилок. Якщо `rpc("next_document_number")` не типізований — переконатись, що Task 7 виконано.

- [ ] **Step 3: Коміт**

```bash
git add src/features/devRequests/queries.ts
git commit -m "feat(запити): читання й запис карток із власною нумерацією"
```

---

### Task 10: Дошка

**Files:**
- Create: `src/features/devRequests/DevRequestBoard.tsx`

- [ ] **Step 1: Написати компонент**

Створити `src/features/devRequests/DevRequestBoard.tsx`:

```tsx
import { useCallback, useMemo, useState } from "react";
import { KanbanBoard } from "@/components/kanban/KanbanBoard";
import { KanbanCard } from "@/components/kanban/KanbanCard";
import { KanbanColumn } from "@/components/kanban/KanbanColumn";
import { KanbanColumnHeader } from "@/components/kanban/KanbanColumnHeader";
import { BOARD_COLUMNS, KIND_LABELS, type DevRequest, type RequestStatus } from "./types";
import { cn } from "@/lib/utils";

type DevRequestBoardProps = {
  requests: DevRequest[];
  onMove: (id: string, status: RequestStatus) => void;
  /** Клік по картці — відкриває обговорення збоку (Task 14). */
  onSelect: (request: DevRequest) => void;
  canMove: boolean;
};

export function DevRequestBoard({ requests, onMove, onSelect, canMove }: DevRequestBoardProps) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [hoverStatus, setHoverStatus] = useState<RequestStatus | null>(null);

  const byStatus = useMemo(() => {
    const map = new Map<RequestStatus, DevRequest[]>();
    for (const column of BOARD_COLUMNS) map.set(column.status, []);
    for (const request of requests) {
      const bucket = map.get(request.status);
      if (bucket) bucket.push(request);
    }
    return map;
  }, [requests]);

  const handleDrop = useCallback(
    (status: RequestStatus) => {
      if (draggingId) onMove(draggingId, status);
      setDraggingId(null);
      setHoverStatus(null);
    },
    [draggingId, onMove]
  );

  return (
    <KanbanBoard>
      {BOARD_COLUMNS.map((column) => {
        const items = byStatus.get(column.status) ?? [];
        return (
          <KanbanColumn
            key={column.status}
            className={cn("w-[300px] shrink-0", hoverStatus === column.status && "ring-2 ring-primary/40")}
            header={
              <KanbanColumnHeader
                icon={column.icon}
                toneClassName={column.toneClassName}
                label={column.label}
                count={items.length}
              />
            }
            onDragOver={(event) => {
              if (!canMove || !draggingId) return;
              event.preventDefault();
              setHoverStatus(column.status);
            }}
            onDragLeave={() => setHoverStatus((current) => (current === column.status ? null : current))}
            onDrop={(event) => {
              if (!canMove) return;
              event.preventDefault();
              handleDrop(column.status);
            }}
          >
            {items.map((request) => (
              <KanbanCard
                key={request.id}
                draggable={canMove}
                onClick={() => onSelect(request)}
                onDragStart={() => setDraggingId(request.id)}
                onDragEnd={() => {
                  setDraggingId(null);
                  setHoverStatus(null);
                }}
                className={cn("cursor-grab active:cursor-grabbing", draggingId === request.id && "opacity-50")}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-muted-foreground">{request.label}</span>
                  {request.isPrivate ? (
                    <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                      закрита
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-sm font-medium leading-snug">{request.title}</p>
                <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{KIND_LABELS[request.kind]}</span>
                  {request.askedByCount > 1 ? <span>· просили {request.askedByCount}</span> : null}
                  {request.tgUsername ? <span>· @{request.tgUsername}</span> : null}
                </div>
              </KanbanCard>
            ))}
            {items.length === 0 ? (
              <p className="px-1 py-6 text-center text-xs text-muted-foreground">Порожньо</p>
            ) : null}
          </KanbanColumn>
        );
      })}
    </KanbanBoard>
  );
}
```

- [ ] **Step 2: Перевірити типи й лінт**

```bash
npx tsc --noEmit && npm run lint
```

Очікується: без помилок.

- [ ] **Step 3: Коміт**

```bash
git add src/features/devRequests/DevRequestBoard.tsx
git commit -m "feat(запити): дошка з перетягуванням карток між станами"
```

---

### Task 11: Вікно «Новий запит»

**Files:**
- Create: `src/features/devRequests/NewDevRequestDialog.tsx`

- [ ] **Step 1: Написати компонент**

Створити `src/features/devRequests/NewDevRequestDialog.tsx`:

```tsx
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { KIND_LABELS, REQUEST_KINDS, type RequestKind } from "./types";

type NewDevRequestDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  saving: boolean;
  error: string | null;
  onSubmit: (input: { title: string; body: string; kind: RequestKind; isPrivate: boolean }) => void;
};

export function NewDevRequestDialog({
  open,
  onOpenChange,
  saving,
  error,
  onSubmit,
}: NewDevRequestDialogProps) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [kind, setKind] = useState<RequestKind>("friction");
  const [isPrivate, setIsPrivate] = useState(false);

  const reset = () => {
    setTitle("");
    setBody("");
    setKind("friction");
    setIsPrivate(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Новий запит</DialogTitle>
          <DialogDescription>
            Те, що треба змінити в CRM. Картка не є перепоною перед роботою — заводьте її тоді,
            коли хочете, щоб справу було видно, поки вона триває.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="dev-request-title">Суть</Label>
            <Input
              id="dev-request-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Наприклад: у прорахунку не видно, хто останній редагував"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="dev-request-body">Подробиці</Label>
            <Textarea
              id="dev-request-body"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              rows={5}
              placeholder="Що саме не так, де це видно, як має бути"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="dev-request-kind">Тип</Label>
            <Select value={kind} onValueChange={(value) => setKind(value as RequestKind)}>
              <SelectTrigger id="dev-request-kind">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REQUEST_KINDS.map((value) => (
                  <SelectItem key={value} value={value}>
                    {KIND_LABELS[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">Закрита картка</p>
              <p className="text-xs text-muted-foreground">
                Видно лише власнику й CEO. Для задумів, про які команді знати зарано.
              </p>
            </div>
            <Switch checked={isPrivate} onCheckedChange={setIsPrivate} />
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Скасувати
          </Button>
          <Button
            onClick={() => onSubmit({ title: title.trim(), body: body.trim(), kind, isPrivate })}
            disabled={saving || title.trim().length === 0}
          >
            {saving ? "Створюю…" : "Створити"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Перевірити типи й лінт**

```bash
npx tsc --noEmit && npm run lint
```

Очікується: без помилок.

- [ ] **Step 3: Коміт**

```bash
git add src/features/devRequests/NewDevRequestDialog.tsx
git commit -m "feat(запити): вікно створення запиту з позначкою закритої картки"
```

---

### Task 12: Сторінка з гейтом і тулбаром

**Files:**
- Create: `src/pages/DevRequestsPage.tsx`

- [ ] **Step 1: Написати сторінку**

Створити `src/pages/DevRequestsPage.tsx`:

```tsx
import { useCallback, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { PlusCircle } from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { usePageHeaderActions } from "@/components/app/page-header-actions";
import { UnifiedPageToolbar } from "@/components/app/headers/UnifiedPageToolbar";
import { ToolbarMeta, ToolbarSearch } from "@/components/app/headers/toolbarPrimitives";
import { DevRequestBoard } from "@/features/devRequests/DevRequestBoard";
import { NewDevRequestDialog } from "@/features/devRequests/NewDevRequestDialog";
import { useCreateDevRequest, useDevRequestBoard, useMoveDevRequest } from "@/features/devRequests/queries";
import type { DevRequest, RequestKind, RequestStatus } from "@/features/devRequests/types";

/**
 * «Запити на доробку» — окремий розділ без ключа модуля, за прецедентом
 * /releases.
 *
 * Ключ модуля тут небезпечний: hasModuleAccess вважає НЕЗАПИСАНИЙ ключ
 * дозволеним, тож у людей зі старим JSON у module_access приватний розділ
 * відкрився б сам собою. Гейт тут дублює політику RLS — сторінка лише не
 * показує того, чого база й так не віддасть.
 */
export default function DevRequestsPage() {
  // workspaceId в контексті НЕМАЄ — AuthState віддає teamId, а це різні поняття.
  // workspace_id потрібен лише при створенні картки й резолвиться в мутації.
  const { accessRole, jobRole, teamId, userId } = useAuth();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [selected, setSelected] = useState<DevRequest | null>(null);

  const canSee =
    (accessRole ?? "").trim().toLowerCase() === "owner" ||
    (jobRole ?? "").trim().toLowerCase() === "seo";

  const board = useDevRequestBoard(teamId ?? null);
  const createRequest = useCreateDevRequest();
  const moveRequest = useMoveDevRequest(teamId ?? null);

  const requests = useMemo(() => {
    const all = board.data ?? [];
    const needle = search.trim().toLowerCase();
    if (!needle) return all;
    return all.filter(
      (request) =>
        request.title.toLowerCase().includes(needle) ||
        request.label.toLowerCase().includes(needle)
    );
  }, [board.data, search]);

  const handleMove = useCallback(
    (id: string, status: RequestStatus) => {
      moveRequest.mutate({ id, status });
    },
    [moveRequest]
  );

  const handleCreate = useCallback(
    (input: { title: string; body: string; kind: RequestKind; isPrivate: boolean }) => {
      if (!teamId || !userId) {
        setCreateError("Не вдалося визначити команду.");
        return;
      }
      setCreateError(null);
      createRequest.mutate(
        { teamId, authorUserId: userId, ...input },
        {
          onSuccess: () => setDialogOpen(false),
          onError: (error) => setCreateError(error instanceof Error ? error.message : "Не вдалося створити"),
        }
      );
    },
    [createRequest, teamId, userId]
  );

  const headerActions = useMemo(
    () => (
      <UnifiedPageToolbar
        topRight={
          <Button onClick={() => setDialogOpen(true)} className="w-full gap-2 sm:w-auto">
            <PlusCircle className="h-4 w-4" />
            Новий запит
          </Button>
        }
        search={<ToolbarSearch value={search} onChange={setSearch} placeholder="Пошук за назвою або REQ-номером..." />}
        meta={
          <ToolbarMeta
            count={requests.length}
            onReset={() => setSearch("")}
            showReset={search.trim().length > 0}
            loading={board.isFetching}
          />
        }
      />
    ),
    [board.isFetching, requests.length, search]
  );

  usePageHeaderActions(headerActions, [headerActions]);

  if (!canSee) return <Navigate to="/whats-new" replace />;

  return (
    <div className="pb-8">
      {board.error ? (
        <p className="mb-4 text-sm text-destructive">Не вдалося завантажити запити.</p>
      ) : null}

      <div className="flex gap-4">
        <div className="min-w-0 flex-1">
          <DevRequestBoard
            requests={requests}
            onMove={handleMove}
            onSelect={setSelected}
            canMove={canSee}
          />
        </div>
        {/* Праву колонку з обговоренням додає Task 14 — тут поки лише вибір. */}
      </div>

      <NewDevRequestDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        saving={createRequest.isPending}
        error={createError}
        onSubmit={handleCreate}
      />
    </div>
  );
}
```

- [ ] **Step 2: Перевірити типи й лінт**

```bash
npx tsc --noEmit && npm run lint
```

Очікується: без помилок. Хук `usePageHeaderActions` має стояти ДО раннього `return` — у коді вище так і є.

- [ ] **Step 3: Коміт**

```bash
git add src/pages/DevRequestsPage.tsx
git commit -m "feat(запити): сторінка запитів на доробку для керівництва"
```

---

### Task 13: Маршрут, сайдбар і решта реєстрів

**Files:**
- Modify: `src/App.tsx`, `src/layout/AppLayout.tsx`, `src/routes/routePreload.ts`, `src/components/app/CommandPalette.tsx`, `src/components/app/TabBar.tsx`

- [ ] **Step 1: Додати лінивий імпорт і роут**

У `src/App.tsx` поруч із іншими `lazy(...)`-сторінками додати:

```tsx
const DevRequestsPage = lazy(() => import("./pages/DevRequestsPage"));
```

І поруч із роутом `releases` (див. `path="releases"`) додати:

```tsx
<Route path="dev-requests" element={<DevRequestsPage />} />
```

Без `ModuleRouteGate`: гейт живе в самій сторінці (Task 12) і в RLS.

- [ ] **Step 2: Додати маршрут у `ROUTES`**

У `src/layout/AppLayout.tsx` поруч із `releases: "/releases",` (рядок ~440) додати:

```ts
  devRequests: "/dev-requests",
```

- [ ] **Step 3: Додати пункт сайдбару БЕЗ `moduleKey`**

У `baseSidebarLinks` (рядок ~445) додати запис у групу `operations`, поруч із «Підрядниками»:

```ts
  { label: "Запити", to: ROUTES.devRequests, group: "operations", icon: Inbox },
```

Імпорт `Inbox` додати до наявного імпорту з `lucide-react`.

**`moduleKey` тут навмисно немає.** Реєстр доступів для приватного розділу — пастка: `hasModuleAccess` вважає незаписаний ключ дозволеним, тож у людей зі старим JSON пункт відкрився б сам. Видимість натомість задаємо явною гілкою фільтра — наступний крок.

- [ ] **Step 4: Показувати пункт лише власнику й CEO**

Пункт без `moduleKey` фільтр пропускає ВСІМ (`if (!link.moduleKey) return true;`, рядок ~826) — тобто без цього кроку «Запити» побачать усі 17 людей. Додати гілку одразу після перевірки `observability` (рядок ~825), за тим самим зразком:

```ts
        if (link.to === ROUTES.devRequests) {
          return permissions.isSuperAdmin || isSeoJobRole;
        }
```

І поруч із `isFinanceJobRole` (рядок ~788) додати:

```ts
  const isSeoJobRole = (jobRole ?? "").trim().toLowerCase() === "seo";
```

- [ ] **Step 5: Додати заголовок сторінки**

У `getHeaderConfig` поруч із блоком `if (pathname === ROUTES.releases)` (рядок ~678) додати:

```ts
  if (pathname === ROUTES.devRequests)
    return {
      title: "Запити на доробку",
      subtitle: "Що просить команда і що ми вирішили зробити.",
      breadcrumbLabel: "Запити",
      breadcrumbTo: ROUTES.devRequests,
      showPageHeader: false,
    };
```

- [ ] **Step 6: Звірити решту реєстрів**

```bash
grep -rn "releases" src/routes/routePreload.ts src/components/app/CommandPalette.tsx src/components/app/TabBar.tsx
```

Очікується: **порожній вивід** — `/releases` у цих трьох реєстрах не зареєстрований, і новий розділ тієї ж сім'ї теж не потребує запису. Якщо вивід не порожній, додати аналогічний запис для `dev-requests` у кожному знайденому місці.

- [ ] **Step 7: Перевірити типи, лінт і тести**

```bash
npx tsc --noEmit && npm run lint && npm run test
```

Очікується: типи й лінт без помилок, усі тести зелені.

- [ ] **Step 8: Коміт**

```bash
git add src/App.tsx src/layout/AppLayout.tsx
git commit -m "feat(запити): розділ «Запити» з'явився в меню керівництва"
```

---

### Task 14: Обговорення картки — переюз наявної панелі

**Files:**
- Modify: `src/features/taskChat/TaskThreadRail.tsx:32,48,51`, `src/features/taskChat/threadEvents.ts:12,41-62`
- Modify: `src/pages/DesignTaskPage.tsx:11812`
- Modify: `src/pages/DevRequestsPage.tsx`

- [ ] **Step 1: Прочитати поточний контракт**

```bash
sed -n '25,70p' src/features/taskChat/TaskThreadRail.tsx
sed -n '1,62p' src/features/taskChat/threadEvents.ts
```

Зафіксувати справжні імена пропсів і сигнатуру `fetchThreadEvents` перед правкою — код нижче спирається на `quoteRef` як єдиний ідентифікатор нитки.

- [ ] **Step 2: Замінити `quoteRef` на явний ключ нитки**

У `TaskThreadRail.tsx` замість пропа `quoteRef: string` ввести:

```ts
type TaskThreadRailProps = {
  /** Ключ нитки. Для дизайн-задачі — quoteRef, для запиту — `dev-request:<id>`. */
  threadKey: string;
  /**
   * Які дії з activity_log показувати в стрічці. Порожній масив — стрічка лише
   * з повідомлень, без подій сутності.
   */
  eventActions: string[];
  /** FK на прорахунок, якщо нитка справді про прорахунок. */
  quoteId?: string | null;
};
```

Усередині компонента прибрати виклик `threadKeyForQuote()` і використовувати `threadKey` напряму; `quoteId` брати з пропа замість regex-перевірки `quoteRef`.

- [ ] **Step 3: Параметризувати стрічку подій**

У `threadEvents.ts` зробити білий список дій аргументом замість константи модуля:

```ts
export async function fetchThreadEvents(
  threadKey: string,
  teamId: string,
  actions: string[]
): Promise<ThreadEntry[]> {
  if (actions.length === 0) return [];
  // далі тіло без змін, але .in("action", actions) замість THREAD_EVENT_ACTIONS
}
```

`THREAD_EVENT_ACTIONS` лишити експортованою константою — її передаватиме сторінка дизайн-задачі.

- [ ] **Step 4: Полагодити наявного споживача**

У `src/pages/DesignTaskPage.tsx` у місці монтування панелі передати нові пропси:

```tsx
<TaskThreadRail
  threadKey={threadKeyForQuote(quoteRef)}
  eventActions={THREAD_EVENT_ACTIONS}
  quoteId={quoteId}
/>
```

- [ ] **Step 5: Переконатись, що дизайн-задача не зламалась**

```bash
npx tsc --noEmit && npm run lint && npm run test
```

Очікується: без помилок, тести `src/lib/taskThread.test.ts` зелені.

- [ ] **Step 6: Коміт**

```bash
git add src/features/taskChat/TaskThreadRail.tsx src/features/taskChat/threadEvents.ts src/pages/DesignTaskPage.tsx
git commit -m "refactor(обговорення): панель розмови більше не прив'язана до прорахунку"
```

- [ ] **Step 7: Підключити панель до картки запиту**

У `src/pages/DevRequestsPage.tsx` додати імпорт поруч із рештою:

```tsx
import { TaskThreadRail } from "@/features/taskChat/TaskThreadRail";
```

І замінити рядок-заглушку `{/* Праву колонку з обговоренням додає Task 14 — тут поки лише вибір. */}` на:

```tsx
        {selected ? (
          <aside className="hidden w-[380px] shrink-0 xl:block">
            {/* eventActions={[]} навмисно: подій activity_log у запитів поки
                немає — історію полів пише аудит-тригер, і вона з'явиться
                в стрічці окремим кроком фази 2. */}
            <TaskThreadRail threadKey={`dev-request:${selected.id}`} eventActions={[]} quoteId={null} />
          </aside>
        ) : null}
```

Стан `selected` і проп `onSelect` уже на місці з Task 10 і Task 12 — доробляти їх не треба.

- [ ] **Step 8: Перевірити повністю**

```bash
npx tsc --noEmit && npm run lint && npm run test && npm run build
```

Очікується: усі чотири команди без помилок.

- [ ] **Step 9: Коміт**

```bash
git add src/pages/DevRequestsPage.tsx src/features/devRequests/DevRequestBoard.tsx
git commit -m "feat(запити): обговорення прямо в картці запиту"
```

---

### Task 15: Функція, що робить із надиктованого охайну картку

**Files:**
- Create: `netlify/functions/dev-request-draft.ts`

Диктування вже є (`useDictation` → `transcribe.ts`), і воно віддає **текст**. Ця функція перетворює усний потік на `{title, body, kind}` і заразом підказує, чи це не дубль уже відкритої картки. Окремою функцією, а не режимом `transcribe.ts`, бо той шарить `DictationContext` із трьома наявними споживачами — ризикувати ними заради нової фічі не варто.

- [ ] **Step 1: Написати функцію**

Створити `netlify/functions/dev-request-draft.ts`:

```ts
import { createClient } from "@supabase/supabase-js";
import { logAiUsage } from "./_aiUsageLog";
import { chatCostUsd } from "./_aiPricing";

/**
 * Надиктований потік → охайна картка запиту.
 *
 * Модель тут робить рівно одне: перекладає усне мовлення в назву, опис і тип.
 * Жодних рішень про пріоритет чи статус — це справа людини.
 */

type RequestBody = {
  text?: string;
  /** Назви відкритих карток — щоб модель могла підказати дубль. Не більше 50. */
  openTitles?: Array<{ id: string; label: string; title: string }>;
};

type Draft = {
  title: string;
  body: string;
  kind: "bug" | "friction" | "feature";
  duplicateOf: string | null;
};

const PROMPT = `Ти перетворюєш усний запит українського співробітника на картку задачі для CRM.

Поверни JSON:
{
  "title": "одне речення до 80 символів, з великої літери, без крапки в кінці",
  "body": "структурований опис: що не так, де саме це видно, як має бути. Абзаци через \\n\\n. Якщо чогось не сказали — не вигадуй",
  "kind": "bug | friction | feature",
  "duplicateOf": "label наявної картки або null"
}

Правила:
- Назва описує СУТЬ з погляду людини, яка користується CRM, а не спосіб реалізації.
- Прибирай слова-паразити, повтори й самовиправлення ("ну", "тобто", "ой ні, не так").
- Не додавай того, чого не було сказано. Порожній опис кращий за вигаданий.
- kind: "bug" — щось зламано; "friction" — працює, але незручно; "feature" — нового немає.
- duplicateOf став лише за очевидного збігу теми, інакше null.`;

function jsonResponse(statusCode: number, body: Record<string, unknown>) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: JSON.stringify(body),
  };
}

export const handler = async (event: {
  httpMethod?: string;
  headers?: Record<string, string | undefined>;
  body?: string | null;
}) => {
  if (event.httpMethod !== "POST") return jsonResponse(405, { error: "Method not allowed" });

  const supabaseUrl = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return jsonResponse(503, { error: "Supabase is not configured" });
  if (!apiKey) return jsonResponse(503, { error: "OPENAI_API_KEY is not configured" });

  // Той самий гейт, що й у transcribe.ts: перевіряємо користувача ДО того, як
  // витрачати кредити OpenAI.
  const authHeader = event.headers?.authorization || event.headers?.Authorization;
  const token =
    typeof authHeader === "string" && authHeader.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length)
      : null;
  if (!token) return jsonResponse(401, { error: "Missing Authorization token" });

  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData?.user) return jsonResponse(401, { error: "Unauthorized" });
  const user = userData.user;

  let body: RequestBody;
  try {
    body = JSON.parse(event.body ?? "{}") as RequestBody;
  } catch {
    return jsonResponse(400, { error: "Invalid JSON body" });
  }

  const text = (body.text ?? "").trim();
  if (text.length < 3) return jsonResponse(400, { error: "Порожній текст" });

  const known = (body.openTitles ?? []).slice(0, 50);
  const knownBlock = known.length
    ? `\n\nВідкриті картки:\n${known.map((item) => `${item.label}: ${item.title}`).join("\n")}`
    : "";

  const model = process.env.OPENAI_MODEL || "gpt-5.4";
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      reasoning: { effort: "low" },
      text: { format: { type: "json_object" } },
      input: [
        { role: "developer", content: PROMPT + knownBlock },
        { role: "user", content: [{ type: "input_text", text }] },
      ],
      max_output_tokens: 1200,
    }),
  });

  const payload = (await response.json().catch(() => null)) as {
    output?: Array<{ content?: Array<{ text?: string }> }>;
    usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number };
  } | null;

  // Логуємо до перевірки response.ok: виклик уже оплачений незалежно від того,
  // чи вдалось розібрати відповідь.
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: membershipRows } = await adminClient
    .schema("tosho")
    .from("memberships_view")
    .select("workspace_id")
    .eq("user_id", user.id)
    .limit(1);
  const workspaceId = (membershipRows as Array<{ workspace_id?: string | null }> | null)?.[0]?.workspace_id ?? null;
  const usage = payload?.usage ?? {};
  const cost = chatCostUsd(model, usage.input_tokens ?? 0, usage.output_tokens ?? 0);
  await logAiUsage(adminClient, {
    workspaceId,
    userId: user.id,
    actorName: (user.user_metadata as Record<string, unknown> | null)?.full_name as string | undefined,
    kind: "chat",
    model,
    inputTokens: usage.input_tokens ?? null,
    outputTokens: usage.output_tokens ?? null,
    totalTokens: usage.total_tokens ?? null,
    costUsd: cost.costUsd,
    metadata: { source: "dev_request_draft", text: text.slice(0, 500) },
  });

  if (!response.ok) return jsonResponse(502, { error: "Не вдалося розібрати надиктоване" });

  const raw = payload?.output?.[0]?.content?.[0]?.text ?? "";
  let draft: Draft;
  try {
    const parsed = JSON.parse(raw) as Partial<Draft>;
    draft = {
      title: (parsed.title ?? "").trim().slice(0, 120),
      body: (parsed.body ?? "").trim(),
      kind: parsed.kind === "bug" || parsed.kind === "feature" ? parsed.kind : "friction",
      duplicateOf: parsed.duplicateOf?.trim() || null,
    };
  } catch {
    // Модель повернула не JSON — краще віддати сирий текст у опис, ніж нічого:
    // людина допише назву сама, і надиктоване не пропаде.
    draft = { title: "", body: text, kind: "friction", duplicateOf: null };
  }

  if (!draft.title) draft.title = text.slice(0, 80);
  return jsonResponse(200, draft);
};
```

- [ ] **Step 2: Перевірити, що сигнатури хелперів збігаються**

```bash
grep -n "export async function logAiUsage" -A 16 netlify/functions/_aiUsageLog.ts
grep -n "export function chatCostUsd" -A 4 netlify/functions/_aiPricing.ts
```

Привести виклики до справжніх сигнатур, якщо імена полів відрізняються. Самі хелпери не міняти.

- [ ] **Step 3: Перевірити типи й лінт**

```bash
npm run typecheck:functions && npx tsc --noEmit && npm run lint && npm run check:functions
```

Очікується: без помилок. `check:functions` перевіряє, що нову функцію правильно оформлено для Netlify.

- [ ] **Step 4: Коміт**

```bash
git add netlify/functions/dev-request-draft.ts
git commit -m "feat(запити): надиктоване перетворюється на охайну назву й опис"
```

---

### Task 16: Диктування прямо у вікні «Новий запит»

**Files:**
- Modify: `src/features/devRequests/NewDevRequestDialog.tsx`

- [ ] **Step 1: Додати імпорти**

```tsx
import { Loader2, Mic, Square } from "lucide-react";
import { useDictation } from "@/lib/useDictation";
import { supabase } from "@/lib/supabaseClient";
```

- [ ] **Step 2: Розширити пропси**

Додати в `NewDevRequestDialogProps`:

```ts
  /** Відкриті картки — щоб модель підказала дубль. */
  openTitles: Array<{ id: string; label: string; title: string }>;
```

- [ ] **Step 3: Додати стан і диктування**

Усередині компонента, після наявних `useState`:

```tsx
  const [drafting, setDrafting] = useState(false);
  const [duplicateHint, setDuplicateHint] = useState<string | null>(null);

  // clean: false — прибирати «ееее» тут не треба, це зробить наступний крок
  // разом зі структуруванням. Інакше платимо за дві обробки того самого тексту.
  const dictation = useDictation({
    context: "brief",
    clean: false,
    onResult: (text) => {
      void draftFromSpeech(text);
    },
  });

  const draftFromSpeech = async (text: string) => {
    setDrafting(true);
    setDuplicateHint(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error("Сесія завершилась");

      const response = await fetch("/.netlify/functions/dev-request-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ text, openTitles }),
      });
      const draft = (await response.json()) as {
        title?: string;
        body?: string;
        kind?: RequestKind;
        duplicateOf?: string | null;
      };
      if (!response.ok) throw new Error("Не вдалося розібрати надиктоване");

      // Дописуємо, а не затираємо: людина могла щось надрукувати до диктування.
      setTitle((current) => current.trim() || (draft.title ?? ""));
      setBody((current) => (current.trim() ? `${current}\n\n${draft.body ?? ""}` : draft.body ?? ""));
      if (draft.kind) setKind(draft.kind);
      setDuplicateHint(draft.duplicateOf ?? null);
    } catch {
      // Надиктоване не губимо: кладемо сирий текст у опис, назву людина
      // допише сама.
      setBody((current) => (current.trim() ? `${current}\n\n${text}` : text));
    } finally {
      setDrafting(false);
    }
  };
```

- [ ] **Step 4: Додати кнопку й підказку в розмітку**

Одразу під `DialogDescription` вставити:

```tsx
        <div className="flex items-center gap-3 rounded-lg border border-dashed p-3">
          <Button
            type="button"
            variant={dictation.state === "recording" ? "destructive" : "secondary"}
            size="sm"
            className="gap-2"
            disabled={!dictation.isSupported || drafting || dictation.state === "transcribing"}
            onClick={() => (dictation.state === "recording" ? dictation.stop() : dictation.start())}
          >
            {dictation.state === "recording" ? (
              <>
                <Square className="h-4 w-4" /> Зупинити
              </>
            ) : (
              <>
                <Mic className="h-4 w-4" /> Розказати голосом
              </>
            )}
          </Button>
          <p className="text-xs text-muted-foreground">
            {dictation.state === "recording"
              ? "Записую… розкажіть, що не так і як має бути"
              : dictation.state === "transcribing" || drafting
                ? "Розбираю сказане…"
                : "Скажіть своїми словами — назву й опис зберу сам"}
          </p>
          {drafting || dictation.state === "transcribing" ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : null}
        </div>

        {duplicateHint ? (
          <p className="rounded-lg bg-muted p-2 text-xs text-muted-foreground">
            Схоже на вже наявну картку {duplicateHint}. Якщо це вона — краще додати коментар туди.
          </p>
        ) : null}
```

- [ ] **Step 5: Передати відкриті картки зі сторінки**

У `src/pages/DevRequestsPage.tsx` додати перед `return`:

```tsx
  const openTitles = useMemo(
    () =>
      (board.data ?? [])
        .filter((request) => request.status !== "released" && request.status !== "wont_do")
        .slice(0, 50)
        .map((request) => ({ id: request.id, label: request.label, title: request.title })),
    [board.data]
  );
```

І передати в діалог: `openTitles={openTitles}`.

- [ ] **Step 6: Перевірити типи, лінт і тести**

```bash
npx tsc --noEmit && npm run lint && npm run test
```

Очікується: без помилок, тести зелені.

- [ ] **Step 7: Коміт**

```bash
git add src/features/devRequests/NewDevRequestDialog.tsx src/pages/DevRequestsPage.tsx
git commit -m "feat(запити): запит можна просто розказати голосом"
```

---

## Фінальна перевірка перед звітом

- [ ] **Крок 1: Повний прогін**

```bash
npx tsc --noEmit && npm run lint && npm run test && npm run build
```

Очікується: усі чотири без помилок.

- [ ] **Крок 2: Довести приватність рантаймом ще раз, уже з реальними даними**

Створити на дошці одну звичайну картку й одну закриту, потім (де `<MANAGER_UUID>` — те саме значення, що дістали в Task 6, крок 4):

```bash
set -a && . ./.env.backup && set +a && psql "$BACKUP_DB_URL" <<'SQL'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"<MANAGER_UUID>","role":"authenticated"}', true);
select number, title, is_private from tosho.dev_requests order by number desc limit 5;
rollback;
SQL
```

Очікується: закритої картки в списку немає.

- [ ] **Крок 3: Звіт про пачку**

Порахувати накопичені коміти й доповісти Артему списком, **без пушу**:

```bash
git log --oneline @{u}..HEAD | cat
```

---

## Definition of Done цього раунду

- `/dev-requests` відкривається у власника й CEO, менеджера редиректить на `/whats-new`.
- **Можна натиснути «Розказати голосом», надиктувати задачу своїми словами — і отримати заповнені назву, опис і тип.** Якщо схоже на наявну картку, вікно про це попереджає.
- Якщо розбір надиктованого впав — текст не губиться, він лягає в опис як є.
- Картку можна створити з дошки, вона отримує номер `REQ-N`, її можна перетягнути між колонками.
- Закриту картку не видно нікому, крім власника й CEO — доведено запитом від імені менеджера.
- Панель обговорення працює і в дизайн-задачі (не зламали), і в картці запиту.

**Не входить у цей раунд:** Telegram (задачі 1–5). Бота в групу поки не додаємо.
