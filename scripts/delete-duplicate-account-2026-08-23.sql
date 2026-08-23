-- Видалення дубльованого акаунта «Олена Науменко» (REQ немає — рішення Артема 23.08.2026).
--
-- ЧОМУ ЦЕ ДУБЛІКАТ. У людини дві картки, заведені з різницею в добу:
--   c8bdb2a4… lenanaumenko8@gmail.com · картка 02.03 · вхід востаннє 05.03 · БЕЗ РОЛІ
--   27f9f38f… naumenko@tosho.agency   · картка 03.03 · вхід востаннє 06.04 · designer  <- справжня
-- Друга — робоча пошта, є посада, людина нею користується. Перша так і лишилась
-- без ролі, через що зникала зі списків (наприклад, з адопції Telegram) і мозолила очі.
--
-- ЩО НА НЕЇ ПОСИЛАЄТЬСЯ (заміряно перед видаленням, скан 78 колонок із user_id
-- у схемах tosho й public): 11 сповіщень, 9 рядків журналу активності, 3 в архіві
-- журналу, 1 присутність, картка співробітника і профіль. Жодного прорахунку,
-- замовлення, дизайн-задачі чи коментаря — за три дні в березні людина нічого
-- не встигла зробити. Тому видалення нічого не осиротить.
--
-- ЧОМУ ПОІМЕННО, А НЕ КАСКАДОМ. Зовнішній ключ на auth.users має ЛИШЕ
-- tosho.user_profiles. Решта таблиць тримає user_id без ключа, тож видалення
-- акаунта лишило б їх сиротами — саме тому кожна вказана окремо.
--
-- Знімок усього, що піде: backups/duplicate-naumenko-2026-08-23.json

begin;

delete from public.notifications          where user_id = 'c8bdb2a4-3503-485b-9a2a-eb1b5ccc0578';
delete from public.activity_log           where user_id = 'c8bdb2a4-3503-485b-9a2a-eb1b5ccc0578';
delete from tosho.activity_log_archive    where user_id = 'c8bdb2a4-3503-485b-9a2a-eb1b5ccc0578';
delete from public.user_presence          where user_id = 'c8bdb2a4-3503-485b-9a2a-eb1b5ccc0578';
delete from tosho.team_member_profiles    where user_id = 'c8bdb2a4-3503-485b-9a2a-eb1b5ccc0578';

-- Профіль піде каскадом разом з акаунтом, як і сесії та ідентичності в auth.
delete from auth.users                    where id = 'c8bdb2a4-3503-485b-9a2a-eb1b5ccc0578';

-- Звірка: має лишитись рівно одна Науменко — designer із робочою поштою.
select trim(coalesce(first_name,'')||' '||coalesce(last_name,'')) as лишилась,
       (select email from auth.users u where u.id = p.user_id) as пошта
from tosho.team_member_profiles p
where p.last_name ilike '%наумен%';

commit;
