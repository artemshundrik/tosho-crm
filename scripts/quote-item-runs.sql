-- quote-item-runs.sql
-- Adds runs (tirages) per quote item for pricing per quantity + logistics

create table if not exists tosho.quote_item_runs (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references tosho.quotes(id) on delete cascade,
  quote_item_id uuid references tosho.quote_items(id) on delete cascade,
  quantity numeric not null,
  unit_price_model numeric default 0,
  unit_price_print numeric default 0,
  logistics_cost numeric default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists quote_item_runs_quote_id_idx on tosho.quote_item_runs(quote_id);
create index if not exists quote_item_runs_item_id_idx on tosho.quote_item_runs(quote_item_id);

-- Enable RLS and policies
alter table tosho.quote_item_runs enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'tosho' and policyname = 'quote_item_runs_select') then
    create policy quote_item_runs_select
      on tosho.quote_item_runs
      for select
      using (
        exists (
          select 1 from tosho.quotes q
          where q.id = quote_item_runs.quote_id
            and is_team_member(q.team_id)
        )
      );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'tosho' and policyname = 'quote_item_runs_insert') then
    create policy quote_item_runs_insert
      on tosho.quote_item_runs
      for insert
      with check (
        exists (
          select 1 from tosho.quotes q
          where q.id = quote_item_runs.quote_id
            and is_team_member(q.team_id)
        )
      );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'tosho' and policyname = 'quote_item_runs_update') then
    create policy quote_item_runs_update
      on tosho.quote_item_runs
      for update
      using (
        exists (
          select 1 from tosho.quotes q
          where q.id = quote_item_runs.quote_id
            and is_team_member(q.team_id)
        )
      );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'tosho' and policyname = 'quote_item_runs_delete') then
    create policy quote_item_runs_delete
      on tosho.quote_item_runs
      for delete
      using (
        exists (
          select 1 from tosho.quotes q
          where q.id = quote_item_runs.quote_id
            and is_team_member(q.team_id)
        )
      );
  end if;
end $$;

-- Trigger to keep updated_at fresh
create or replace function tosho.quote_item_runs_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_quote_item_runs_set_updated_at on tosho.quote_item_runs;
create trigger trg_quote_item_runs_set_updated_at
before update on tosho.quote_item_runs
for each row execute function tosho.quote_item_runs_set_updated_at();
