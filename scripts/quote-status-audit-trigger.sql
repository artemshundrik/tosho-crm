-- ---------------------------------------------------------------------------
-- Аудит зміни статусу прорахунку — на рівні БАЗИ, а не застосунку.
--
-- ЧОМУ ТРИГЕР, А НЕ ФІКС КОДУ. Шляхів зміни статусу виявилось щонайменше три:
--   1. tosho.set_quote_status(...) — «правильний», пише історію й decided_at;
--   2. тихий fallback у toshoApi.setStatus — при будь-якій помилці RPC робить
--      звичайний UPDATE і йде далі, наче все гаразд;
--   3. updateQuote() — узагальнений UPDATE, який приймає ще й status.
--
-- Наслідок на проді (2026-07-25): 382 записи в activity_log про зміну статусу
-- проти 2 рядків у quote_status_history і 0 заповнених decided_at на 37
-- затверджених прорахунків. Тобто роками працював обхідний шлях.
--
-- Полагодити одну гілку коду мало: завтра з'явиться четверта. Тригер ловить
-- зміну статусу незалежно від того, хто її зробив — застосунок, ручний SQL,
-- імпорт чи майбутня фіча.
--
-- Застосування: psql "$BACKUP_DB_URL" -f scripts/quote-status-audit-trigger.sql
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 0. changed_by мусить дозволяти NULL.
--
-- Колонка була NOT NULL, і це, схоже, і є першопричина всієї історії: коли
-- статус міняє не людина (службовий процес, тригер, ручний SQL), auth.uid()
-- порожній, запис аудиту валиться на констрейнті — а разом із ним падала і
-- сама RPC, бо insert стояв усередині неї. Аудит, який ламає бізнес-операцію,
-- завжди виключать із шляху; так і сталося.
--
-- Тепер NULL означає чесне «змінено системою», а не втрачений запис.
-- ---------------------------------------------------------------------------
alter table tosho.quote_status_history alter column changed_by drop not null;

-- ---------------------------------------------------------------------------
-- 1. Проставити decided_at / sent_at. BEFORE, бо змінюємо NEW.
-- ---------------------------------------------------------------------------
create or replace function tosho.quotes_status_stamp()
returns trigger
language plpgsql
as $$
begin
  if new.status is distinct from old.status then
    if new.status = 'sent' and new.sent_at is null then
      new.sent_at := now();
    end if;
    -- В енумі співіснують 'canceled' і 'cancelled'; наявна RPC знала лише
    -- перший варіант, а застосунок пише другий. Приймаємо обидва.
    if new.status in ('approved', 'rejected', 'canceled', 'cancelled') and new.decided_at is null then
      new.decided_at := now();
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists quotes_status_stamp_trg on tosho.quotes;
create trigger quotes_status_stamp_trg
  before update on tosho.quotes
  for each row
  when (old.status is distinct from new.status)
  execute function tosho.quotes_status_stamp();

-- ---------------------------------------------------------------------------
-- 2. Записати перехід в історію. AFTER, щоб не заважати самому UPDATE.
-- ---------------------------------------------------------------------------
create or replace function tosho.quotes_status_history_log()
returns trigger
language plpgsql
security definer
set search_path = tosho, public
as $$
begin
  insert into tosho.quote_status_history (team_id, quote_id, from_status, to_status, changed_by, note)
  values (
    new.team_id, new.id, old.status, new.status, auth.uid(),
    -- Нотатку передає set_quote_status через транзакційну змінну: сама вона
    -- історію більше не пише (інакше на кожну зміну через RPC був би дубль).
    nullif(current_setting('tosho.status_note', true), '')
  );
  return null;
exception
  -- Аудит не має права зламати бізнес-операцію: якщо запис не вдався,
  -- зміна статусу все одно мусить пройти.
  when others then
    raise warning 'quote status history insert failed for quote %: %', new.id, sqlerrm;
    return null;
end;
$$;

drop trigger if exists quotes_status_history_trg on tosho.quotes;
create trigger quotes_status_history_trg
  after update on tosho.quotes
  for each row
  when (old.status is distinct from new.status)
  execute function tosho.quotes_status_history_log();

-- ---------------------------------------------------------------------------
-- 3. Прибрати запис історії з самої RPC — тепер це робота тригера.
--
-- Інакше зміна через RPC давала б ДВА рядки історії. Нотатку передаємо
-- тригеру транзакційною змінною. Заразом зникає причина, через яку RPC могла
-- падати: insert із NOT NULL changed_by більше не всередині неї.
-- ---------------------------------------------------------------------------
create or replace function tosho.set_quote_status(
  p_quote_id uuid,
  p_new_status tosho.quote_status,
  p_note text default null
)
returns void
language plpgsql
as $$
declare
  v_team_id uuid;
begin
  select team_id into v_team_id from tosho.quotes where id = p_quote_id;

  if v_team_id is null then
    raise exception 'Quote not found';
  end if;

  if not public.is_team_member(v_team_id) then
    raise exception 'Not allowed';
  end if;

  -- Нотатку підхопить тригер історії в межах цієї ж транзакції.
  perform set_config('tosho.status_note', coalesce(p_note, ''), true);

  -- sent_at / decided_at проставляє BEFORE-тригер, тут лише статус.
  update tosho.quotes set status = p_new_status where id = p_quote_id;
end;
$$;

comment on function tosho.quotes_status_stamp() is
  'BEFORE UPDATE: проставляє decided_at/sent_at при зміні статусу прорахунку.';
comment on function tosho.quotes_status_history_log() is
  'AFTER UPDATE: пише перехід статусу в quote_status_history незалежно від шляху зміни.';

-- ---------------------------------------------------------------------------
-- Свідомо НЕ робимо: бекфіл decided_at для 37 наявних затверджених прорахунків.
-- Реальної дати затвердження ми не знаємо, а підставити updated_at означало б
-- вигадати бізнес-дані. Хай лишаються NULL — дайджест має запасні джерела.
--
-- Перевірка після застосування:
--   begin;
--     update tosho.quotes set status='approved'
--      where id = (select id from tosho.quotes where status='estimated' limit 1);
--     select from_status, to_status from tosho.quote_status_history
--      order by created_at desc limit 1;
--   rollback;
-- ---------------------------------------------------------------------------
