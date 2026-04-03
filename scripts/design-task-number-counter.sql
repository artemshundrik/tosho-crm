-- design-task-number-counter.sql
-- Allocates design task numbers atomically per team and month.
-- Run after design-task-number-backfill.sql in Supabase SQL Editor.

begin;

create table if not exists public.design_task_number_counters (
  team_id uuid not null,
  month_code text not null check (month_code ~ '^[0-9]{4}$'),
  last_value integer not null default 0 check (last_value >= 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (team_id, month_code)
);

create or replace function public.next_design_task_number(
  p_team_id uuid,
  p_created_at timestamptz default now()
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_created_at timestamptz := coalesce(p_created_at, now());
  v_month_code text := to_char(v_created_at, 'MMYY');
  v_month_start timestamptz := date_trunc('month', v_created_at);
  v_next_month_start timestamptz := v_month_start + interval '1 month';
  v_next_value integer;
begin
  if p_team_id is null then
    raise exception 'p_team_id is required';
  end if;

  insert into public.design_task_number_counters (team_id, month_code, last_value, updated_at)
  values (
    p_team_id,
    v_month_code,
    greatest(
      coalesce((
        select max(((regexp_match(coalesce(al.metadata->>'design_task_number', ''), '^TS-' || v_month_code || '-([0-9]{4})$'))[1])::integer)
        from public.activity_log al
        where al.team_id = p_team_id
          and al.action = 'design_task'
          and al.created_at >= v_month_start
          and al.created_at < v_next_month_start
      ), 0),
      coalesce((
        select count(*)
        from public.activity_log al
        where al.team_id = p_team_id
          and al.action = 'design_task'
          and al.created_at >= v_month_start
          and al.created_at < v_next_month_start
      ), 0)
    ) + 1,
    timezone('utc', now())
  )
  on conflict (team_id, month_code)
  do update
    set last_value = public.design_task_number_counters.last_value + 1,
        updated_at = timezone('utc', now())
  returning last_value into v_next_value;

  return 'TS-' || v_month_code || '-' || lpad(v_next_value::text, 4, '0');
end;
$$;

grant execute on function public.next_design_task_number(uuid, timestamptz) to authenticated;
grant execute on function public.next_design_task_number(uuid, timestamptz) to service_role;

analyze public.design_task_number_counters;

commit;
