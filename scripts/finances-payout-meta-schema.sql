-- Finance module — payout overlay over the existing payroll sheet.
-- The amounts live in tosho.payroll_entries (legacy /payroll page, has real data).
-- This table adds the finance-specific layer: яка юрособа платить (ФОП/ТОВ),
-- з якої каси, та статус виплати. Keyed the same way (user_id + period) but
-- team-scoped like the other finance_* tables. See docs/FINANCES_DESIGN.md.
-- Safe to run multiple times.

begin;

create table if not exists tosho.finance_payout_meta (
  team_id uuid not null,
  user_id uuid not null,
  period date not null,                              -- YYYY-MM-01, matches payroll_entries
  legal_entity_id uuid references tosho.finance_legal_entities (id) on delete set null,
  account_id uuid references tosho.finance_accounts (id) on delete set null,
  status text not null default 'pending',            -- pending | paid
  paid_at date,
  note text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (team_id, user_id, period)
);

alter table tosho.finance_payout_meta
  drop constraint if exists finance_payout_meta_status_check;
alter table tosho.finance_payout_meta
  add constraint finance_payout_meta_status_check
  check (status in ('pending', 'paid'));

create index if not exists finance_payout_meta_team_period_idx
  on tosho.finance_payout_meta (team_id, period);

drop trigger if exists finance_payout_meta_touch on tosho.finance_payout_meta;
create trigger finance_payout_meta_touch
before update on tosho.finance_payout_meta
for each row execute function tosho.finance_touch_updated_at();

do $$
declare
  has_member_fn boolean := to_regprocedure('public.is_team_member(uuid)') is not null;
  op text;
  policy_name text;
begin
  execute 'alter table tosho.finance_payout_meta enable row level security';
  foreach op in array array['select', 'insert', 'update', 'delete'] loop
    policy_name := 'finance_payout_meta_' || op;
    execute format('drop policy if exists %I on tosho.finance_payout_meta', policy_name);
    if op = 'select' then
      if has_member_fn then
        execute format('create policy %I on tosho.finance_payout_meta for select using (public.is_team_member(team_id))', policy_name);
      else
        execute format('create policy %I on tosho.finance_payout_meta for select using (true)', policy_name);
      end if;
    elsif op = 'insert' then
      if has_member_fn then
        execute format('create policy %I on tosho.finance_payout_meta for insert with check (public.is_team_member(team_id))', policy_name);
      else
        execute format('create policy %I on tosho.finance_payout_meta for insert with check (true)', policy_name);
      end if;
    elsif op = 'update' then
      if has_member_fn then
        execute format('create policy %I on tosho.finance_payout_meta for update using (public.is_team_member(team_id)) with check (public.is_team_member(team_id))', policy_name);
      else
        execute format('create policy %I on tosho.finance_payout_meta for update using (true) with check (true)', policy_name);
      end if;
    else
      if has_member_fn then
        execute format('create policy %I on tosho.finance_payout_meta for delete using (public.is_team_member(team_id))', policy_name);
      else
        execute format('create policy %I on tosho.finance_payout_meta for delete using (true)', policy_name);
      end if;
    end if;
  end loop;
  execute 'grant select, insert, update, delete on tosho.finance_payout_meta to authenticated';
end $$;

notify pgrst, 'reload schema';

commit;
