-- quote-number-reformat-and-sync.sql
-- Reformat quote numbers to TS-MMYY-#### and sync cached quote_number in activity_log metadata.
-- Safe for design-task relation: links are by quote UUID (quote_id / entity_id), not by number.
-- Run in Supabase SQL Editor.

begin;

-- 0) Backup mapping table (idempotent).
create table if not exists public.quote_number_migration_log (
  quote_id uuid primary key,
  team_id uuid not null,
  old_number text,
  new_number text not null,
  migrated_at timestamptz not null default now()
);

-- 1) Build deterministic target numbers by team + month(created_at).
-- Format: TS-MMYY-#### (same as current quote generator).
with numbered as (
  select
    q.id,
    q.team_id,
    q.created_at,
    q.number as old_number,
    ('TS-' || to_char(q.created_at, 'MMYY') || '-' ||
      lpad(
        row_number() over (
          partition by q.team_id, date_trunc('month', q.created_at)
          order by q.created_at asc, q.id asc
        )::text,
        4,
        '0'
      )
    ) as new_number
  from tosho.quotes q
),
changed as (
  select *
  from numbered
  where coalesce(old_number, '') <> new_number
),
logged as (
  insert into public.quote_number_migration_log (quote_id, team_id, old_number, new_number)
  select c.id, c.team_id, c.old_number, c.new_number
  from changed c
  on conflict (quote_id) do update
    set team_id = excluded.team_id,
        old_number = excluded.old_number,
        new_number = excluded.new_number,
        migrated_at = now()
  returning quote_id, team_id, new_number
)
update tosho.quotes q
set number = l.new_number
from logged l
where q.id = l.quote_id;

-- 2) Ensure metadata exists where we need to write cache.
update public.activity_log
set metadata = '{}'::jsonb
where metadata is null
  and (
    action = 'design_task'
    or entity_type = 'quote'
  );

-- 3) Sync metadata.quote_number by metadata.quote_id (covers design tasks and related events).
with mapping as (
  select quote_id, team_id, new_number
  from public.quote_number_migration_log
)
update public.activity_log al
set metadata = jsonb_set(al.metadata, '{quote_number}', to_jsonb(m.new_number), true)
from mapping m
where al.team_id = m.team_id
  and coalesce(al.metadata->>'quote_id', '') = m.quote_id::text;

-- 4) Sync metadata.quote_number for rows where quote id is in entity_id (common for design_task root row).
with mapping as (
  select quote_id, team_id, new_number
  from public.quote_number_migration_log
)
update public.activity_log al
set metadata = jsonb_set(al.metadata, '{quote_number}', to_jsonb(m.new_number), true)
from mapping m
where al.team_id = m.team_id
  and coalesce(al.entity_id, '') = m.quote_id::text
  and (
    al.action = 'design_task'
    or al.entity_type in ('quote', 'design_task')
  );

commit;

-- Optional checks:
-- 1) Any duplicate quote numbers after migration (should be 0 for team+number):
-- select team_id, number, count(*)
-- from tosho.quotes
-- group by team_id, number
-- having count(*) > 1
-- order by count(*) desc, team_id, number;
--
-- 2) Inspect migrated rows:
-- select *
-- from public.quote_number_migration_log
-- order by migrated_at desc
-- limit 100;
--
-- 3) Verify design-task cache sync:
-- select id, entity_id, metadata->>'quote_id' as quote_id, metadata->>'quote_number' as quote_number
-- from public.activity_log
-- where action = 'design_task'
-- order by created_at desc
-- limit 100;
