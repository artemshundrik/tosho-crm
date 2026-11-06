# Заявки з Instagram: усе, крім Meta. План реалізації

> **For agentic workers:** виконується в сесії (Native) за `superpowers:executing-plans`, наприкінці незалежний рецензент на Opus. Кроки позначені `- [ ]`.

**Goal:** розділ «Заявки» працює повністю на тестових заявках: розподіл по колу, таймер, чат, передача, закриття, лід, сповіщення. Підключення Meta потім зводиться до двох місць: вебхук викликає `ingestEvent`, а транспорт отримує реалізацію `meta`.

**Architecture:** чисті правила лежать у `src/features/instagramRequests/rules.ts`, їх імпортують і клієнт, і Netlify. Усі записи йдуть через функцію `instagram-requests` (JWT + право на заявку), клієнт лише читає через RLS. Дедлайни зберігаються часом у рядку заявки, тож таймер це дешевий запит у наявному `reminders-dispatch` кожні 5 хвилин, без нового крона й без нових викликів Netlify.

**Tech Stack:** Supabase (`tosho`, RLS, Broadcast), Netlify Functions, zod, React 19, TanStack Query, vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-06-instagram-direct-requests-design.md`. Вигляд і тексти: канва, `Screen.dc.html`.

## Global Constraints

- Схема `tosho`; RLS на кожну таблицю; клієнт не пише в таблиці напряму.
- Робочий час 9:00–18:00, пн–пт, `Europe/Kiev`. Нагадування 15, передача 30 робочих хвилин; усе в налаштуваннях.
- Коло лише між менеджерами, на СЕО не переходить. Відсутні за `team_absences` (`status='approved'`), звільнені не беруть участі, «з дому» не відсутність.
- Причини закриття рівно три: «Не клієнт», «Не можемо зробити», «Передумав або зник».
- Вікно відповіді 7 днів від останнього повідомлення клієнта.
- Відповідає лише той, хто займається. СЕО й власник спершу забирають заявку, як на затвердженому макеті. Виняток: «Інше», де відповідає СЕО й власник.
- У репозиторії ні токенів, ні імен людей. Хто розглядає «Інше», задається налаштуванням.
- Без `git push`. Коміти поіменно, тема людською мовою, трейлер `Закриває: REQ-352#pN`.

## Review Focus

1. Менеджер надсилає відповідь у момент, коли таймер уже передав заявку: сервер відхиляє, клієнт не отримує дві відповіді. Тест у задачі 3.
2. Подвійний клік «Надіслати» або повторна доставка події: один запис. Ключі `client_message_id` і `external_id`. Тест у задачі 3.
3. Усі менеджери відсутні: заявка не губиться, СЕО отримує сповіщення, наступний тік пробує знову. Тест у задачі 2.
4. П'ятниця 17:55 з передачею: дедлайн понеділок 9:25, а не субота. Тест у задачі 1.
5. Менеджер читає «Інше» в обхід інтерфейсу: RLS не віддає ні заявку, ні повідомлення. Примірка ролей у задачі 2.

## Запобіжник перед запуском

`INSTAGRAM_REQUESTS_LIVE = false` у `moduleAccess.ts`: поки Meta не підключена, менеджери не бачать розділу, лише власник і СЕО. Запуск це один рядок, а не окрема робота. Тестові заявки (`is_test`) реально проходять коло, але сповіщення отримує лише той, хто їх створив, і до цифр вони не входять, поки вимкнено показ тестових.

---

### Task 1: Правила без бази

**Files:** Create `src/features/instagramRequests/rules.ts`, `rules.test.ts`.

**Produces:** `addWorkingMinutes(from: Date, minutes: number, hours: WorkHours): Date`; `workingMinutesBetween(from, to, hours): number`; `isWorkingTime(at, hours): boolean`; `pickNextManager({candidates, cursor, alreadyHad}): {userId, newRound} | null`; `replyWindowEndsAt(lastClientMessageAt): Date | null`; `canReply`, `canPass`, `canClose`, `canClaim`, `canManage` від `{userId, isOwnerOrCeo}` і заявки; `CLOSE_REASONS`; `DEFAULT_WORK_HOURS`.

- [ ] Тести: пт 17:55 +30 = пн 9:25; субота 12:00 +30 = пн 9:30; ніч 22:10 +30 = наступний день 9:30; перехід на літній час не зсуває 9:00; між 17:50 і наступними 9:10 рівно 20 хвилин. Коло: після курсора, пропускає тих, у кого заявка вже була; усі вже мали, тоді `newRound`; один менеджер; порожній список дає `null`; курсор на звільненому не ламає порядок.
- [ ] Реалізувати, тести зелені, коміт із задачею 2.

### Task 2: База, RLS, модуль

**Files:** Create `scripts/instagram-requests-schema.sql`. Modify `src/lib/moduleAccess.ts`, `src/lib/database.types.ts`, `docs/DB_MAP.md`; виправити в описі автовідповідь і вкладки.

**Таблиці:**
- `instagram_settings` (`team_id` pk, `reminder_minutes` 15, `handover_minutes` 30, `work_start_hour` 9, `work_end_hour` 18, `auto_reply_text`, `other_reviewer_user_id`, `round_excluded_user_ids uuid[]`, `round_cursor_user_id`).
- `instagram_requests` (`team_id`, `external_user_id`, unique разом; `handle`, `display_name`, `avatar_url`, `kind` ad|other, `status` new|in_progress|lead|closed|other_archived, `assigned_user_id`, `assigned_at`, `reminder_due_at`, `handover_due_at`, `reminded_at`, `round`, `is_overdue`, `first_response_at`, `first_response_minutes`, `first_response_by`, `close_reason`, `closed_at`, `closed_by`, `lead_id`, `customer_id`, `company_name`, `contact`, `ad_id`, `ad_title`, `last_client_message_at`, `last_message_at`, `last_message_preview`, `last_message_from`, `awaiting_reply`, `is_test`, `created_by`).
- `instagram_messages` (`request_id` cascade, `direction` in|out, `source` client|crm|ig_app|auto_reply, `body`, `attachments jsonb`, `external_id` unique, `client_message_id` unique, `sender_user_id`, `send_status` pending|sent|failed, `send_error`).
- `instagram_request_events` (`request_id` cascade, `kind`, `from_user_id`, `to_user_id`, `actor_user_id`, `note`, `meta jsonb`).

**RLS:** лише `select` для `authenticated`, запис лише service role. `tosho.can_read_instagram_requests(kind)`: член команди + (власник, СЕО або менеджер для `ad`; лише власник і СЕО для `other`). Security definer, як `is_owner_or_seo`. Тригер Broadcast `changed` у `tosho:<team>:instagram-requests`, порожнє тіло.

- [ ] Написати SQL, `npm run db:apply scripts/instagram-requests-schema.sql`, `npm run check:db-guards`.
- [ ] Агент `rls-verifier`: менеджер, дизайнер, СЕО, власник, анонім на всіх таблицях. Очікується: дизайнер нічого, менеджер без `other`, запис лише service role.
- [ ] Модуль `instagram_requests` у реєстрі з `restrictedTo` і запобіжником.
- [ ] Коміт. `Закриває: REQ-352#p3`.

### Task 3: Серверний рушій

**Files:** Create `netlify/functions/_lib/instagramTransport.ts`, `_lib/instagramRequests.ts`, `_lib/instagramRequests.test.ts`, `instagram-requests.ts`, `instagram-requests-timer.ts`. Modify `reminders-dispatch.ts`, `_notificationCategories.ts`, `src/lib/notificationCategories.ts`.

**Interfaces:**
- `InstagramTransport.send({recipientId, text, isTest}) -> {ok: true, externalId} | {ok: false, error, authFailed?}`. Варіант `test` імітує успіх (текст із `!fail` дає помилку). Реальна заявка без підключеної Meta отримує чесну помилку «Instagram ще не підключено».
- `ingestEvent(admin, teamId, NormalizedEvent) -> {requestId, created}`. `NormalizedEvent`: `{externalUserId, handle, displayName, avatarUrl, kind, externalMessageId, text, attachments, direction, ad, at, isTest, createdBy}`. Ідемпотентно за `externalMessageId`.
- Дії функції (zod, JWT, право): `reply`, `retry`, `pass`, `claim`, `close`, `reopen`, `set_contact`, `link_party`, `convert_other`, `archive_other`, `delete`, `get_settings`, `save_settings`, `create_test`, `test_client_message`, `test_app_reply`.

**Поведінка:** новий клієнт + `ad` призначається по колу; поза робочим часом автовідповідь один раз на робочу паузу. Повідомлення в закритій повертає заявку тому самому менеджеру, якщо він ще доступний, інакше наступному. Перша відповідь (CRM або застосунок) зупиняє таймер. `other` нікому не призначається, сповіщає розглядача. Тік: нагадує за `reminder_due_at`, передає за `handover_due_at`, повторює призначення заявок без менеджера. Передача пише подію, сповіщає нового й попереднього.

- [ ] Тести зі збірним клієнтом: відповідь від колишнього відповідального дає 409 з іменем нового; повтор `client_message_id` не надсилає вдруге; повтор `externalMessageId` не дублює; помилка транспорту лишає `failed`, таймер іде далі; перша відповідь рахує робочі хвилини; порожній список менеджерів дає заявку без менеджера й сповіщення СЕО; тестова заявка сповіщає лише автора; закриття без дозволеної причини 400; чужий закрити не може 403.
- [ ] Реалізувати, зелено, агент `function-reviewer`.
- [ ] Коміт. `Закриває: REQ-352#p6, REQ-352#p7`.

### Task 4: Розділ

**Files:** Create `src/pages/InstagramRequestsPage.tsx` і `src/features/instagramRequests/`: `queries.ts`, `useRequestsRealtime.ts`, `presentation.ts` (+тест: статус, тон, банер, рядок таймера), `RequestsList.tsx`, `Conversation.tsx`, `RequestSide.tsx`, `TeamTable.tsx`, `PassDialog.tsx`, `CloseDialog.tsx`, `SettingsDialog.tsx`. Modify маршрути за чеклістом `AGENTS.md`: `App.tsx`, `routePreload.ts`, `AppLayout.tsx`, `CommandPalette.tsx`, `TabBar.tsx`, `pageSurfaces.ts`.

Маршрут `/requests` і `/requests/:id`. Менеджер: перемикач «Мої/Усі», вкладки «Активні», «Стали лідом», «Закриті», список, розмова, бічна панель. Власник і СЕО: таблиця з числами й фільтром за менеджером, клік відкриває розмову, плюс вкладка «Інше». Телефон: список, далі розмова на весь екран. Усі 15 станів `Screen.dc.html` мають свої банери. Аватари лише канонічним набором, значки Phosphor, вікна на наявному `Dialog`.

- [ ] Тест `presentation` на всі стани.
- [ ] Реалізувати, `npm run check:fast`.
- [ ] Коміт. `Закриває: REQ-352#p5`.

### Task 5: Лід

**Files:** Modify `useLeadEditor.ts` (необов'язкове `prefill` у відкритті нового ліда), `RequestSide.tsx`.

«Створити ліда» відкриває наявну форму із заповненими назвою, контактом, джерелом і відповідальним, вимоги не послаблюємо. Після збереження `link_party`. «Прив'язати до наявної» через `CustomerLeadPicker`.

- [ ] Тест заповнення форми з заявки: телефон і Telegram лягають у правильні поля.
- [ ] Реалізувати.
- [ ] Коміт. `Закриває: REQ-352#p8`.

### Task 6: Перевірка живцем

- [ ] `dev-netlify`, тестові заявки: нова, відповідь, передача, закриття, повернення, лід, «Інше», застосунок, збій, вузький екран. Кадри в звіт.
- [ ] Тимчасово зсунути дедлайн тестової заявки й викликати тік: нагадування, передача, друге коло.
- [ ] Прибрати тестові дані.
- [ ] `npm run check`, `npm test`, `/security-review`, рецензент на Opus. Звіт «накопичено N комітів».

## Зміни під час реалізації (06.11.2026)

- Лід створюється прямо з правої панелі заявки (`createLead.ts`), далі відкривається нова панель ліда. Старе вікно в заявках не використовується.
- Таймер лежить у `_lib/instagramTimer.ts`, логіка покрита тестами чистих планувальників, статусу `other_archived` немає.
- Завдання вебхука: писати `pending` до надсилання й зіставляти копію `is_echo` за заявкою й текстом, бо копія може випередити збереження `external_id`; обробити унікальність у `insertMessage`; не повертати сирий текст Meta з `sendToMeta`; копіювати вкладення до себе до запису.
- Запуск: `PersonProfilePage` зберігає весь набір доступів, тож поки запобіжник вимкнено, може заморозитись `instagram_requests: false`. На запуску прибрати цей ключ SQL-ом і врахувати модуль у колі.
