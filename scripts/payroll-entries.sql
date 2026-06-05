-- Payroll sheet storage (зарплатна відомість) for CRM.
-- One row = one employee's pay for one month: ставка (base) + премія (bonus) − утримання (deduction).
-- Access is restricted to workspace owner / SEO only (salaries are sensitive).
-- Run in Supabase SQL Editor. Safe to run multiple times.

begin;

create table if not exists tosho.payroll_entries (
  workspace_id uuid not null,
  user_id uuid not null,
  period date not null, -- first day of the pay month, e.g. 2026-06-01
  base_amount numeric(12, 2) not null default 0,
  bonus_amount numeric(12, 2) not null default 0,
  deduction_amount numeric(12, 2) not null default 0,
  total_amount numeric(12, 2)
    generated always as (base_amount + bonus_amount - deduction_amount) stored,
  note text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  updated_by uuid,
  primary key (workspace_id, user_id, period),
  constraint payroll_entries_period_month_check
    check (period = date_trunc('month', period)::date)
);

create index if not exists payroll_entries_workspace_period_idx
  on tosho.payroll_entries (workspace_id, period);

-- updated_at touch trigger
create or replace function tosho.touch_payroll_entries_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists payroll_entries_touch_updated_at on tosho.payroll_entries;
create trigger payroll_entries_touch_updated_at
before update on tosho.payroll_entries
for each row execute function tosho.touch_payroll_entries_updated_at();

alter table tosho.payroll_entries enable row level security;

-- Only workspace owner or SEO may read/write payroll rows.
drop policy if exists "payroll_entries_select" on tosho.payroll_entries;
create policy "payroll_entries_select"
on tosho.payroll_entries
for select
to authenticated
using (
  exists (
    select 1
    from tosho.memberships_view mv
    where mv.workspace_id = payroll_entries.workspace_id
      and mv.user_id = auth.uid()
      and (
        lower(coalesce(mv.access_role::text, '')) = 'owner'
        or lower(coalesce(mv.job_role::text, '')) = 'seo'
      )
  )
);

drop policy if exists "payroll_entries_insert" on tosho.payroll_entries;
create policy "payroll_entries_insert"
on tosho.payroll_entries
for insert
to authenticated
with check (
  exists (
    select 1
    from tosho.memberships_view mv
    where mv.workspace_id = payroll_entries.workspace_id
      and mv.user_id = auth.uid()
      and (
        lower(coalesce(mv.access_role::text, '')) = 'owner'
        or lower(coalesce(mv.job_role::text, '')) = 'seo'
      )
  )
);

drop policy if exists "payroll_entries_update" on tosho.payroll_entries;
create policy "payroll_entries_update"
on tosho.payroll_entries
for update
to authenticated
using (
  exists (
    select 1
    from tosho.memberships_view mv
    where mv.workspace_id = payroll_entries.workspace_id
      and mv.user_id = auth.uid()
      and (
        lower(coalesce(mv.access_role::text, '')) = 'owner'
        or lower(coalesce(mv.job_role::text, '')) = 'seo'
      )
  )
)
with check (
  exists (
    select 1
    from tosho.memberships_view mv
    where mv.workspace_id = payroll_entries.workspace_id
      and mv.user_id = auth.uid()
      and (
        lower(coalesce(mv.access_role::text, '')) = 'owner'
        or lower(coalesce(mv.job_role::text, '')) = 'seo'
      )
  )
);

drop policy if exists "payroll_entries_delete" on tosho.payroll_entries;
create policy "payroll_entries_delete"
on tosho.payroll_entries
for delete
to authenticated
using (
  exists (
    select 1
    from tosho.memberships_view mv
    where mv.workspace_id = payroll_entries.workspace_id
      and mv.user_id = auth.uid()
      and (
        lower(coalesce(mv.access_role::text, '')) = 'owner'
        or lower(coalesce(mv.job_role::text, '')) = 'seo'
      )
  )
);

grant select, insert, update, delete on tosho.payroll_entries to authenticated;

notify pgrst, 'reload schema';

commit;
