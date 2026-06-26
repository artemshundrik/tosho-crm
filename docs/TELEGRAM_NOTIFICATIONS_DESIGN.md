# TELEGRAM_NOTIFICATIONS_DESIGN.md — персональні Telegram-сповіщення з налаштуванням

> Статус: **DRAFT на узгодження**. Складено на основі підтверджених рішень CEO (червень 2026).
> Це проєктний документ, ще НЕ реалізація. Код не пишемо, поки CEO не підтвердить бота, схему БД та етапність.
>
> Підтверджені рішення CEO:
> - **Окремий бот** (не перевикористовуємо support-бот AI-ескалацій).
> - Налаштування **і в CRM, і всередині бота** (кнопка «Налаштування») — з **синхронізацією** між ними.
>
> Поточний стан коду (факти, від яких відштовхуємось):
> - Telegram сьогодні задіяний лише в `sendTelegramEscalation()` — [netlify/functions/tosho-ai.ts:7251](../netlify/functions/tosho-ai.ts) — шле AI-ескалації в один адмін-канал через `TELEGRAM_SUPPORT_BOT_TOKEN`/`TELEGRAM_SUPPORT_CHAT_ID`. Це **не** персональні сповіщення.
> - `telegram_chat_id` користувачів ніде не зберігається. Поле `telegram` у клієнтів/лідів — лише username контакту.
> - **Вебхука бота немає.** Бот нічого не «слухає».
> - Конвеєр сповіщень уже є: pg_cron (`scripts/reminders-cron.sql`) → Netlify-функції нагадувань → `deliverNotifications()` ([netlify/functions/_notificationDelivery.ts](../netlify/functions/_notificationDelivery.ts)) → запис у `public.notifications` + web-push. **Telegram треба додати сюди як ще один канал.**
> - Персональних налаштувань за типами немає (лише localStorage звук/тости у [src/pages/NotificationsPage.tsx](../src/pages/NotificationsPage.tsx)).

---

## 1. Мета

Дати кожному співробітнику отримувати робочі сповіщення CRM у Telegram і **самостійно обирати, які саме** — двома рівнозначними способами:

- **У CRM** — сторінка налаштувань зі списком типів сповіщень × каналів.
- **У боті** — команда/кнопка «⚙️ Налаштування» з тими самими перемикачами.

Обидва інтерфейси редагують **один і той самий запис у БД**, тому зміна в одному місці миттєво відображається в іншому (синхронізація «з коробки», без окремого механізму звірки).

Не-цілі (поза скоупом цього документа): групові канали/чати команди, сповіщення клієнтам, двостороннє керування задачами з бота.

---

## 2. Принцип синхронізації (ключове рішення)

**Єдине джерело правди — таблиця `tosho.user_notification_settings`.**

```
        ┌──────────────────────────┐
 CRM ──▶│                          │◀── Бот (/settings, інлайн-кнопки)
        │ user_notification_       │
        │ settings.channel_prefs   │──▶ deliverNotifications() читає при доставці
        │ (JSONB, 1 рядок/юзера)   │
        └──────────────────────────┘
```

- CRM-UI пише `channel_prefs` через звичайний Supabase-запит (RLS: лише свій рядок).
- Бот пише `channel_prefs` через вебхук (service-role, з перевіркою що `chat_id` належить цьому юзеру).
- Жодних копій стану ні в localStorage, ні в пам'яті бота. Бот при кожному відкритті «⚙️ Налаштування» **читає актуальний стан з БД** і малює кнопки за ним.

Тобто «синхронізація» = відсутність дублювання стану. Це найнадійніший варіант.

---

## 3. Бот

- Окремий бот, напр. `@ToShoCRMBot`, власний токен `TELEGRAM_BOT_TOKEN` (env Netlify, не на клієнт).
- Команди:
  - `/start <nonce>` — прив'язка акаунта (див. §4).
  - `/start` (без токена) — вітання + інструкція підключитись із CRM.
  - `/settings` або кнопка «⚙️ Налаштування» — матриця перемикачів (див. §6).
  - `/stop` — відписатись (відв'язати чат).
- Вебхук реєструється одноразово через `setWebhook` з `secret_token`. Telegram надсилає цей секрет у заголовку `X-Telegram-Bot-Api-Secret-Token` — так перевіряємо справжність запитів.

---

## 4. Прив'язка акаунта (linking)

Telegram-бот **не може написати користувачу першим** — користувач має натиснути Start. Тому:

1. У CRM (профіль) кнопка **«Підключити Telegram»** генерує одноразовий `nonce` (TTL ~15 хв, single-use), збережений із прив'язкою до `user_id` (таблиця `tosho.telegram_link_tokens` або поле в settings).
2. Відкриваємо deep-link `https://t.me/ToShoCRMBot?start=<nonce>`.
3. Користувач тисне **Start** → Telegram шле боту `/start <nonce>`.
4. **Вебхук** (`netlify/functions/telegram-webhook.ts`) приймає апдейт:
   - перевіряє `secret_token`;
   - бере `message.chat.id` (= `telegram_chat_id`) і `message.from.username`;
   - знаходить юзера за `nonce`, записує `telegram_chat_id` + `telegram_username` + `telegram_linked_at`, гасить `nonce`;
   - відповідає «✅ Telegram підключено. Налаштувати сповіщення — /settings».
5. CRM показує статус «Підключено як @username» + кнопку «Відключити».

**Відв'язка:** кнопка в CRM або `/stop` у боті → `telegram_chat_id = NULL`.

---

## 5. Схема БД (`tosho`)

```sql
-- 5.1. Налаштування сповіщень користувача (єдине джерело правди)
create table tosho.user_notification_settings (
  workspace_id        uuid not null,
  user_id             uuid not null,
  telegram_chat_id    bigint,                 -- null = Telegram не підключено
  telegram_username   text,
  telegram_linked_at  timestamptz,
  channel_prefs       jsonb not null default '{}'::jsonb,  -- матриця тип×канал (див. §6)
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
-- RLS: SELECT/UPDATE лише власного рядка (auth.uid() = user_id у межах workspace).
-- Вебхук пише service-role-клієнтом (обходить RLS), але лише після звірки nonce/chat_id.

-- 5.2. Одноразові токени прив'язки
create table tosho.telegram_link_tokens (
  nonce       text primary key,
  workspace_id uuid not null,
  user_id     uuid not null,
  expires_at  timestamptz not null,
  used_at     timestamptz
);
```

`channel_prefs` — приклад:
```json
{
  "quote_deadline":      { "telegram": true,  "push": true, "in_app": true },
  "customer_followup":   { "telegram": true,  "push": true, "in_app": true },
  "team_birthday":       { "telegram": false, "push": true, "in_app": true },
  "design_task_changes": { "telegram": true,  "push": true, "in_app": true }
}
```
Правило дефолтів: **відсутній ключ = увімкнено** (новий тип сповіщень автоматично «on», поки користувач не вимкнув). Деякі типи можемо позначити «критичними» (не вимикаються) — рішення CEO, §9.

---

## 6. Каталог типів і матриця налаштувань

Щоб користувач міг обирати «які саме», кожне сповіщення мусить нести **стабільний `type`**. Сьогодні в `public.notifications` є колонка `type`, але значення не канонізовані по всіх продюсерах — це треба впорядкувати (це найбільша «невидима» частина роботи, фаза 2).

Чернетка каталогу (фінал узгодити з CEO):

| `type` (ключ) | Опис | Джерело |
|---|---|---|
| `customer_followup` | Нагадування зв'язатись із клієнтом/лідом | `customer-lead-reminders.ts` |
| `quote_deadline` | Наближається дедлайн КП | `quote-deadline-reminders.ts` |
| `contractor` | Події по контрагентах/постачальниках | `contractor-reminders.ts` |
| `team_birthday` | Дні народження / річниці / відпустки команди | `team-events-reminders.ts` |
| `design_task_*` | Воркфлоу дизайну (правки, статуси, призначення) | DesignPage/функції |
| `quote_status` | Зміна статусу КП | Quotes |
| `mention` | Згадка/призначення на тебе | різні |

**Матриця в UI/боті:** рядки = типи, колонки = канали (`in_app`, `push`, `telegram`). Перемикач на перетині пише в `channel_prefs[type][channel]`.

---

## 7. Доставка

Розширити `deliverNotifications()` ([_notificationDelivery.ts](../netlify/functions/_notificationDelivery.ts)):

1. Як і зараз — запис у `public.notifications` + web-push (за `channel_prefs[type].push`).
2. **Нове:** для кожного отримувача, якщо `channel_prefs[type].telegram === true` **і** `telegram_chat_id != null` → виклик `sendTelegram(chat_id, text)`.
3. `sendTelegram()` — тонкий помічник над `https://api.telegram.org/bot<token>/sendMessage` (HTML-розмітка + кнопка-лінк «Відкрити в CRM» через `reply_markup`).

**Передумова:** усі продюсери сповіщень мають передавати канонічний `type`. Без цього матриця не має за що чіплятись.

---

## 8. Безпека / надійність (must-have)

- **Одноразові nonce** прив'язки: короткий TTL, single-use — інакше можливе перехоплення чужої прив'язки.
- **`secret_token`** на вебхуку — інакше будь-хто слатиме фейкові апдейти на ендпоінт.
- **RLS** на `user_notification_settings` — користувач бачить/змінює лише свій рядок; вебхук-service-role пише лише після звірки nonce↔user або chat_id↔user.
- **«Бот заблокований»**: Telegram повертає 403 → ставимо `telegram_chat_id = NULL` (тиха відв'язка), не спамимо.
- **Ліміти Telegram**: ~1 msg/sec на чат, ~30/sec глобально. Нагадування крутяться щохвилини → зберегти наявний дедуп (`notifications_user_reminder_href_unique`, `scripts/notifications-reminder-dedupe.sql`) і не дублювати в TG.
- Тільки приватні чати користувачів, не групи.
- Токен бота — лише в env Netlify.

---

## 9. Що вирішує CEO (перед стартом)

1. **Юзернейм бота** (`@ToShoCRMBot`?) і хто його створює в @BotFather (токен покласти в env).
2. **Розміщення в CRM**: прив'язка — у `/profile`; матриця — на сторінці «Сповіщення». Підтвердити.
3. **Критичні типи**: чи є сповіщення, які **не можна** вимикати (напр. дедлайни КП)? Чи все опційне?
4. **Фінальний каталог типів** (§6) — додати/прибрати.
5. **Мова/формат повідомлень** у Telegram (емодзі, кнопка «Відкрити в CRM»).

---

## 10. Етапність і приблизна оцінка

| Фаза | Обсяг | Оцінка |
|---|---|---|
| **1. Прив'язка + єдиний тумблер** | бот @BotFather; `telegram-webhook.ts` (/start + secret); таблиці `user_notification_settings`, `telegram_link_tokens` (+RLS); UI «Підключити/Відключити» в `/profile`; глобальний on/off у `deliverNotifications` + `sendTelegram()` | ~2–3 дні |
| **2. Матриця тип×канал у CRM** | канонізація `type` в усіх продюсерах; UI-матриця на «Сповіщення»; enforcement у доставці | ~2–3 дні |
| **3. Налаштування в боті + синхронізація** | `/settings` з інлайн-клавіатурою; обробка `callback_query` → запис у той самий `channel_prefs`; `/stop` | ~1–2 дні |

- Фаза 1 → «сповіщення приходять у Telegram».
- Фаза 2 → «обираю які саме» (у CRM).
- Фаза 3 → те саме всередині бота; синхронізація безкоштовна, бо джерело правди одне (§2).

---

## 11. Відкриті питання / ризики

- **Канонізація `type`** (фаза 2) зачіпає багато місць-продюсерів — основний обсяг роботи й місце для регресій. Варто зробити реєстр типів в одному модулі (`src/lib/notificationTypes.ts`) і прогнати всі продюсери через нього.
- **Реєстрація вебхука** — одноразова операція (скрипт/ops-нотатка), не забути секрет.
- **Бекап токена бота** — додати в `docs/SERVICES_ACCESS_REGISTRY.md` після створення.
- Старий support-бот **не чіпаємо** — він окремий і працює.
