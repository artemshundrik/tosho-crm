-- design-task-number-backfill.sql
-- Backfills metadata.design_task_number for design tasks in public.activity_log.
-- Number format matches quote numbers: TS-MMYY-####
-- Run in Supabase SQL Editor.

begin;

-- Ensure metadata exists.
update public.activity_log
set metadata = '{}'::jsonb
where action = 'design_task'
  and metadata is null;

-- Backfill missing or legacy DZ-* numbers.
with ranked as (
  select
    id,
    to_char(created_at, 'MMYY') as month_code,
    row_number() over (
      partition by team_id, date_trunc('month', created_at)
      order by created_at asc, id asc
    ) as seq
  from public.activity_log
  where action = 'design_task'
),
normalized as (
  select
    r.id,
    ('TS-' || r.month_code || '-' || lpad(r.seq::text, 4, '0')) as next_number
  from ranked r
)
update public.activity_log al
set metadata = jsonb_set(al.metadata, '{design_task_number}', to_jsonb(n.next_number), true)
from normalized n
where al.id = n.id
  and al.action = 'design_task'
  and (
    coalesce(al.metadata->>'design_task_number', '') = ''
    or al.metadata->>'design_task_number' ilike 'DZ-%'
  );

-- Optional index for faster lookup/filtering.
create index if not exists activity_log_design_task_team_number_idx
  on public.activity_log(team_id, (metadata->>'design_task_number'))
  where action = 'design_task';

commit;

-- Optional checks:
-- select metadata->>'design_task_number' as number, count(*)
-- from public.activity_log
-- where action = 'design_task'
-- group by 1
-- having count(*) > 1
-- order by 2 desc, 1;
--
-- select id, team_id, created_at, metadata->>'design_task_number' as number
-- from public.activity_log
-- where action = 'design_task'
-- order by created_at desc
-- limit 50;
