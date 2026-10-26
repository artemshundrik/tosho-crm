-- manual: застосовувати ПІСЛЯ деплою клієнта, що слухає Broadcast (REQ-337#p6).
--
-- Обговорення й замки тепер отримують сигнали через Broadcast із бази
-- (scripts/realtime-broadcast-signals.sql). Публікація supabase_realtime для них
-- більше не потрібна, а поки вона не порожня й хтось підписаний на
-- postgres_changes, Realtime двічі на секунду декодує весь журнал змін бази.
--
-- tosho.thread_reactions у публікації був, але жодна підписка його не слухала.
--
-- Чому не разом із тригерами: відкриті вкладки старої версії слухають
-- postgres_changes до перезавантаження. Прибрати публікацію раніше за деплой —
-- і вони до перезавантаження лишились би без живих оновлень.
--
-- Застосування: npm run db:apply scripts/realtime-drop-postgres-changes.sql
--
-- Перевірка, що опитування журналу змін зупинилось (через годину після
-- застосування, у робочий час): кількість викликів запиту Realtime з
-- `wal->>` у extensions.pg_stat_statements має перестати рости.
-- Повернути: alter publication supabase_realtime add table tosho.quote_comments, …

do $$
declare
  t text;
begin
  foreach t in array array['quote_comments', 'entity_locks', 'thread_reactions'] loop
    if exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'tosho' and tablename = t
    ) then
      execute format('alter publication supabase_realtime drop table tosho.%I', t);
    end if;
  end loop;
end;
$$;
