-- Прибрати стару колонку `tosho.contractors.phone`.
--
-- ЗАПУСКАТИ ЛИШЕ ПІСЛЯ ПЕРЕВІРКИ КАРТОК У CRM.
--
-- Why: телефони переїхали в масив `phones[]` (scripts/contractor-standard-fields.sql
-- + нормалізація), і `phone` стоїть порожня в усіх записах. Порожня колонка не
-- просто зайва — вона встигла нашкодити: у формі жила евристика «якщо в контакті
-- є цифри, а в телефоні немає — поля переплутані, міняємо місцями». Доки в
-- `phone` були дані, вона рятувала; коли колонку очистили, умова стала завжди
-- істинною, і збереження картки «Голден Арт» («1.Шевчук Андрій, 2.Сергій»)
-- затирало контактну особу. Евристику вже прибрано з коду; колонка — останній
-- слід цієї історії.
--
-- Перед запуском переконано, що:
--   1. фронт більше не читає `phone` — `CONTRACTOR_COLUMNS` у
--      src/pages/ContractorsPage.tsx її не запитує;
--   2. netlify/functions/contractor-reminders.ts вибирає лише
--      id,team_id,kind,name,services,reminder_at,reminder_repeat,reminder_comment;
--   3. жодна функція чи в'юха в базі на `contractors` не посилається;
--   4. єдине непорожнє значення дублюється в `phones[]` — див. запит нижче.
--
-- Станом на 07.08.2026 непорожній рядок був один: ТОВ «РВК СЬОМЕ НЕБО»,
-- `phone = +380502362571`, і той самий номер уже лежить у `phones` масивом.
-- Тобто колонка не тримає жодного унікального значення.

-- Контроль: має бути 0 рядків. Кожен рядок тут — номер, якого НЕМАЄ в `phones[]`,
-- тобто те, що дроп справді втратить. Якщо не порожньо — СПОЧАТКУ перенести.
select id, name, phone, phones
from tosho.contractors
where coalesce(btrim(phone), '') <> ''
  and not (btrim(phone) = any (phones));

-- Страховка: знімок того, що видаляємо, лишається в базі до наступного
-- прибирання. Дешевше за відновлення з бекапу, якщо десь таки щось було.
create table if not exists tosho._contractors_phone_backup as
select id, name, phone, now() as snapshot_at
from tosho.contractors
where coalesce(btrim(phone), '') <> '';

alter table tosho.contractors drop column if exists phone;

-- Перевірка:
--   \d tosho.contractors
--   select count(*) from tosho._contractors_phone_backup;
