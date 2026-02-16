-- workspace-presence.sql
-- Hybrid presence storage for "who is online and where".
-- Run in Supabase SQL Editor.

begin;

create table if not exists public.user_presence (
  team_id uuid not null,
  user_id uuid not null,
  display_name text null,
  avatar_url text null,
  current_path text null,
  current_label text null,
  entity_type text null,
  entity_id text null,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_presence_pkey primary key (team_id, user_id)
);

create index if not exists user_presence_team_seen_idx
  on public.user_presence (team_id, last_seen_at desc);

create index if not exists user_presence_team_entity_idx
  on public.user_presence (team_id, entity_type, entity_id);

alter table public.user_presence enable row level security;

do $$
begin
  drop policy if exists user_presence_select on public.user_presence;
  drop policy if exists user_presence_insert on public.user_presence;
  drop policy if exists user_presence_update on public.user_presence;
  drop policy if exists user_presence_delete on public.user_presence;

  if to_regprocedure('public.is_team_member(uuid)') is not null then
    create policy user_presence_select
      on public.user_presence
      for select
      using (public.is_team_member(team_id));

    create policy user_presence_insert
      on public.user_presence
      for insert
      with check (user_id = auth.uid() and public.is_team_member(team_id));

    create policy user_presence_update
      on public.user_presence
      for update
      using (user_id = auth.uid() and public.is_team_member(team_id))
      with check (user_id = auth.uid() and public.is_team_member(team_id));

    create policy user_presence_delete
      on public.user_presence
      for delete
      using (user_id = auth.uid() and public.is_team_member(team_id));
  else
    create policy user_presence_select
      on public.user_presence
      for select
      using (user_id = auth.uid());

    create policy user_presence_insert
      on public.user_presence
      for insert
      with check (user_id = auth.uid());

    create policy user_presence_update
      on public.user_presence
      for update
      using (user_id = auth.uid())
      with check (user_id = auth.uid());

    create policy user_presence_delete
      on public.user_presence
      for delete
      using (user_id = auth.uid());
  end if;
end $$;

notify pgrst, 'reload schema';

commit;
