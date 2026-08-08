-- Номер картки запиту для Telegram-бота.
--
-- НАВІЩО ОКРЕМА ФУНКЦІЯ, а не наявна tosho.next_document_number:
-- та функція — security definer з ЯВНОЮ перевіркою public.is_team_member(auth.uid()),
-- а бот ходить під service_role, де auth.uid() порожній. Перевірено на проді
-- 2026-08-08, і падає воно двічі:
--
--   begin; set local role service_role;
--   select tosho.next_document_number('389719a7-…','dev_request','','');
--   → ERROR: permission denied for function next_document_number
--     (гранти: revoke from public/anon + grant execute to authenticated —
--      service_role у цьому переліку немає взагалі)
--
--   begin; grant execute … to service_role; set local role service_role;
--   select auth.uid(), public.is_team_member('389719a7-…');  → null, f
--   select tosho.next_document_number(…);  → ERROR: forbidden (42501)
--
-- Тобто самим лише грантом не обійтись: членство перевіряється через auth.uid(),
-- якого в бота немає за визначенням. Тому окрема функція з іншим гейтом —
-- ГРАНТОМ: виконати її може лише service_role, тобто лише серверний код.
-- Браузер і далі бере номер через next_document_number із перевіркою членства,
-- і жодного нового шляху обходу RLS у застосунку не з'являється.
--
-- ЧОМУ p_period ПОРОЖНІЙ (а не рік, як у рахунків): нумерація запитів наскрізна.
-- Рік у ключі означав би, що 1 січня лічильник почне з 1 і всі вставки почнуть
-- падати на unique (team_id, number) у tosho.dev_requests. Той самий коментар
-- уже стоїть у src/features/devRequests/queries.ts — це два виклики одного
-- лічильника, і розійтись їм не можна.
--
-- Ідемпотентна, безпечна до повторного запуску.
-- Застосування:
--   set -a && . ./.env.backup && set +a
--   psql "$BACKUP_DB_URL" -f scripts/dev-requests-bot-number.sql

\set ON_ERROR_STOP on

begin;

/**
 * Наступний наскрізний номер картки запиту для однієї команди.
 *
 * Атомарність — та сама, що в tosho.next_document_number: конфлікт по ключу
 * блокує рядок, тож паралельні виклики отримують РІЗНІ номери. Це не оптимізація,
 * а вимога: на номері висить unique (team_id, number).
 *
 * Гейт — грант, а не перевірка всередині: викликати може лише service_role.
 */
create or replace function tosho.next_dev_request_number(p_team_id uuid)
returns bigint
language plpgsql
security definer
set search_path = tosho, public
as $$
declare
  v_number bigint;
begin
  if p_team_id is null then
    raise exception 'team_id is required';
  end if;

  insert into tosho.document_counters as c (team_id, kind, entity_key, period, last_number)
  values (p_team_id, 'dev_request', '', '', 1)
  on conflict (team_id, kind, entity_key, period)
    do update set last_number = c.last_number + 1, updated_at = now()
  returning c.last_number into v_number;

  return v_number;
end;
$$;

comment on function tosho.next_dev_request_number(uuid) is
  'Наступний номер картки tosho.dev_requests. Тільки для service_role (Telegram-бот): auth.uid() у бота порожній, тож next_document_number йому недоступна. Браузер користується next_document_number з перевіркою членства.';

-- Гейт фічі. Порядок важливий: спершу забрати в усіх (create or replace
-- зберігає гранти попередньої версії функції), потім видати рівно одному.
revoke all on function tosho.next_dev_request_number(uuid) from public, anon, authenticated;
grant execute on function tosho.next_dev_request_number(uuid) to service_role;

commit;

notify pgrst, 'reload schema';
