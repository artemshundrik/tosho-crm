-- Реакції на повідомлення чату. Див. docs/TASK_CHAT_DESIGN.md.
-- Safe to run multiple times.
--
-- Чому окрема таблиця, а не jsonb на повідомленні: два одночасні кліки по
-- реакції затерли б один одного (read-modify-write), а тут ще й realtime.
-- Унікальність (повідомлення + користувач + емодзі) робить повторний клік
-- ідемпотентним, а зняття — простим delete.

begin;

create table if not exists tosho.thread_reactions (
  message_id uuid not null references tosho.quote_comments(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  emoji      text not null,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);

create index if not exists thread_reactions_message_idx on tosho.thread_reactions (message_id);

alter table tosho.thread_reactions enable row level security;

-- Бачить реакції той, хто бачить саме повідомлення (та сама команда).
drop policy if exists thread_reactions_select on tosho.thread_reactions;
create policy thread_reactions_select on tosho.thread_reactions
  for select using (
    exists (
      select 1 from tosho.quote_comments c
      where c.id = thread_reactions.message_id and is_team_member(c.team_id)
    )
  );

-- Ставити — лише від свого імені й лише там, куди є доступ.
drop policy if exists thread_reactions_insert on tosho.thread_reactions;
create policy thread_reactions_insert on tosho.thread_reactions
  for insert with check (
    auth.uid() = user_id
    and exists (
      select 1 from tosho.quote_comments c
      where c.id = thread_reactions.message_id and is_team_member(c.team_id)
    )
  );

-- Знімати — тільки свою.
drop policy if exists thread_reactions_delete on tosho.thread_reactions;
create policy thread_reactions_delete on tosho.thread_reactions
  for delete using (auth.uid() = user_id);

grant select, insert, delete on tosho.thread_reactions to authenticated;

-- Realtime: реакції мають прилітати так само, як повідомлення.
do $$
begin
  if not exists (
    select 1 from pg_publication_rel pr
    join pg_publication p on p.oid = pr.prpubid
    join pg_class c on c.oid = pr.prrelid
    join pg_namespace n on n.oid = c.relnamespace
    where p.pubname = 'supabase_realtime' and n.nspname = 'tosho' and c.relname = 'thread_reactions'
  ) then
    execute 'alter publication supabase_realtime add table tosho.thread_reactions';
  end if;
end
$$;

commit;
