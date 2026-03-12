create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  p256dh text not null,
  auth text not null,
  origin text null,
  scope text null,
  user_agent text null,
  last_seen_at timestamptz not null default timezone('utc', now()),
  disabled_at timestamptz null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.push_subscriptions add column if not exists origin text null;
alter table public.push_subscriptions add column if not exists scope text null;

create index if not exists push_subscriptions_user_id_idx on public.push_subscriptions(user_id);
create index if not exists push_subscriptions_active_idx on public.push_subscriptions(user_id) where disabled_at is null;
create index if not exists push_subscriptions_origin_idx on public.push_subscriptions(origin) where disabled_at is null;

with ranked as (
  select
    endpoint,
    row_number() over (
      partition by user_id, coalesce(origin, ''), coalesce(scope, ''), p256dh, auth
      order by last_seen_at desc nulls last, updated_at desc nulls last, created_at desc nulls last
    ) as rn
  from public.push_subscriptions
  where disabled_at is null
)
update public.push_subscriptions as ps
set disabled_at = timezone('utc', now())
from ranked
where ps.endpoint = ranked.endpoint
  and ranked.rn > 1
  and ps.disabled_at is null;

create or replace function public.set_push_subscriptions_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists push_subscriptions_set_updated_at on public.push_subscriptions;
create trigger push_subscriptions_set_updated_at
before update on public.push_subscriptions
for each row execute function public.set_push_subscriptions_updated_at();

alter table public.push_subscriptions enable row level security;

drop policy if exists "push_subscriptions_select_own" on public.push_subscriptions;
create policy "push_subscriptions_select_own"
on public.push_subscriptions
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "push_subscriptions_insert_own" on public.push_subscriptions;
create policy "push_subscriptions_insert_own"
on public.push_subscriptions
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "push_subscriptions_update_own" on public.push_subscriptions;
create policy "push_subscriptions_update_own"
on public.push_subscriptions
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

notify pgrst, 'reload schema';
