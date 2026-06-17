-- Finance module — taxes (ПДВ ТОВ + ФОП: ЄП / ЄСВ / ВЗ).
-- See docs/FINANCES_DESIGN.md. Schema: tosho. Team-scoped RLS.
-- Depends on finances-schema.sql (finance_legal_entities, finance_touch_updated_at).
-- Safe to run multiple times.

begin;

create table if not exists tosho.finance_taxes (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null,
  legal_entity_id uuid references tosho.finance_legal_entities (id) on delete set null,
  tax_type text not null,                           -- vat | single_tax | esv | military
  period date not null,                             -- YYYY-MM-01 (звітний місяць)
  base_amount numeric(14, 2),                       -- база нарахування (дохід), опц.
  rate numeric(6, 3),                               -- ставка %, опц. (ЄСВ — фікс сума, rate null)
  amount numeric(14, 2) not null default 0,         -- сума до сплати
  due_date date,                                    -- крайній термін сплати
  status text not null default 'pending',           -- pending | paid
  paid_at date,
  note text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table tosho.finance_taxes
  drop constraint if exists finance_taxes_type_check;
alter table tosho.finance_taxes
  add constraint finance_taxes_type_check
  check (tax_type in ('vat', 'single_tax', 'esv', 'military'));

alter table tosho.finance_taxes
  drop constraint if exists finance_taxes_status_check;
alter table tosho.finance_taxes
  add constraint finance_taxes_status_check
  check (status in ('pending', 'paid'));

create index if not exists finance_taxes_team_idx
  on tosho.finance_taxes (team_id, period desc);
create index if not exists finance_taxes_due_idx
  on tosho.finance_taxes (team_id, due_date);

drop trigger if exists finance_taxes_touch on tosho.finance_taxes;
create trigger finance_taxes_touch
before update on tosho.finance_taxes
for each row execute function tosho.finance_touch_updated_at();

do $$
declare
  has_member_fn boolean := to_regprocedure('public.is_team_member(uuid)') is not null;
  op text;
  policy_name text;
begin
  execute 'alter table tosho.finance_taxes enable row level security';
  foreach op in array array['select', 'insert', 'update', 'delete'] loop
    policy_name := 'finance_taxes_' || op;
    execute format('drop policy if exists %I on tosho.finance_taxes', policy_name);
    if op = 'select' then
      if has_member_fn then
        execute format('create policy %I on tosho.finance_taxes for select using (public.is_team_member(team_id))', policy_name);
      else
        execute format('create policy %I on tosho.finance_taxes for select using (true)', policy_name);
      end if;
    elsif op = 'insert' then
      if has_member_fn then
        execute format('create policy %I on tosho.finance_taxes for insert with check (public.is_team_member(team_id))', policy_name);
      else
        execute format('create policy %I on tosho.finance_taxes for insert with check (true)', policy_name);
      end if;
    elsif op = 'update' then
      if has_member_fn then
        execute format('create policy %I on tosho.finance_taxes for update using (public.is_team_member(team_id)) with check (public.is_team_member(team_id))', policy_name);
      else
        execute format('create policy %I on tosho.finance_taxes for update using (true) with check (true)', policy_name);
      end if;
    else
      if has_member_fn then
        execute format('create policy %I on tosho.finance_taxes for delete using (public.is_team_member(team_id))', policy_name);
      else
        execute format('create policy %I on tosho.finance_taxes for delete using (true)', policy_name);
      end if;
    end if;
  end loop;
  execute 'grant select, insert, update, delete on tosho.finance_taxes to authenticated';
end $$;

notify pgrst, 'reload schema';

commit;
