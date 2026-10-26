-- Живі сигнали обговорень і замків через Broadcast замість postgres_changes
-- (REQ-337#p6).
--
-- НАВІЩО. Поки бодай одна вкладка тримає підписку postgres_changes, Realtime
-- двічі на секунду декодує ВЕСЬ журнал змін бази (wal2json) — разом із
-- серцебиттям присутності, кронами й токенами входу, які нікому не потрібні.
-- З квітня це ~7,8 млн опитувань і ~94 ТБ через пам'ять — на сервері з ~426 МБ
-- пам'яті це прямий внесок у своп і в лист Supabase про вичерпаний Disk IO.
-- Broadcast із бази йде іншим шляхом: тригер пише рядок у realtime.messages, і
-- Realtime отримує лише ці рядки, а не весь журнал.
--
-- ЩО ЛЕТИТЬ. Порожній сигнал «changed», без жодного вмісту: клієнт у відповідь
-- перечитує дані звичайним запитом, і там працюють звичайні правила доступу.
-- Тож через канал не можна дізнатись нічого, крім «тут щось змінилось».
--
-- ТЕМИ КАНАЛІВ: `tosho:<team_id>:<решта>` —
--   tosho:<team_id>:thread:<thread_key>
--   tosho:<team_id>:lock:<entity_type>:<entity_id>
-- Слухати приватний канал дозволено лише члену команди з теми (is_team_member,
-- той самий, що в RLS самих таблиць). Писати в realtime.messages клієнтам не
-- дозволено нічим — сигнали шлють тільки тригери.
--
-- ЗБІЙ REALTIME НЕ ЛАМАЄ ЗАПИС. Тригер ловить будь-яку помилку відправки:
-- повідомлення в обговоренні важливіше за миттєвість сигналу.
--
-- Публікацію supabase_realtime чіпає окремий файл
-- scripts/realtime-drop-postgres-changes.sql — ПІСЛЯ деплою клієнта, інакше
-- відкриті вкладки старої версії до перезавантаження лишаться без живих оновлень.

create or replace function tosho.broadcast_thread_changed()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.team_id is not null and new.thread_key is not null then
    begin
      perform realtime.send(
        '{}'::jsonb,
        'changed',
        'tosho:' || new.team_id::text || ':thread:' || new.thread_key,
        true
      );
    exception when others then
      raise warning 'broadcast_thread_changed: %', sqlerrm;
    end;
  end if;
  return null;
end;
$$;

revoke all on function tosho.broadcast_thread_changed() from public, anon, authenticated;

drop trigger if exists quote_comments_broadcast_changed on tosho.quote_comments;
create trigger quote_comments_broadcast_changed
  after insert on tosho.quote_comments
  for each row execute function tosho.broadcast_thread_changed();

create or replace function tosho.broadcast_entity_lock_changed()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  row_data tosho.entity_locks;
begin
  row_data := case when tg_op = 'DELETE' then old else new end;
  if row_data.team_id is not null then
    begin
      perform realtime.send(
        '{}'::jsonb,
        'changed',
        'tosho:' || row_data.team_id::text || ':lock:' || row_data.entity_type || ':' || row_data.entity_id,
        true
      );
    exception when others then
      raise warning 'broadcast_entity_lock_changed: %', sqlerrm;
    end;
  end if;
  return null;
end;
$$;

revoke all on function tosho.broadcast_entity_lock_changed() from public, anon, authenticated;

drop trigger if exists entity_locks_broadcast_changed on tosho.entity_locks;
create trigger entity_locks_broadcast_changed
  after insert or update or delete on tosho.entity_locks
  for each row execute function tosho.broadcast_entity_lock_changed();

-- Хто може слухати приватний канал. Тема перевіряється шаблоном ДО приведення
-- до uuid: інакше чужа тема зі сміттям замість uuid валила б перевірку
-- помилкою замість тихого «ні».
drop policy if exists tosho_team_broadcast_read on realtime.messages;
create policy tosho_team_broadcast_read on realtime.messages
  for select to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and case
      when realtime.topic() ~ '^tosho:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:'
        then public.is_team_member(substring(realtime.topic() from 7 for 36)::uuid)
      else false
    end
  );

-- Перевірка після застосування:
--   select tgname from pg_trigger where tgname like '%broadcast_changed';
--   select polname from pg_policy where polrelid = 'realtime.messages'::regclass;
--   -- після вставки коментаря:
--   select topic, event, private from realtime.messages order by inserted_at desc limit 5;
