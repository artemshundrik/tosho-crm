-- Cache table for Ukrainian name declensions (e.g., nominative → genitive)
-- Filled lazily by the `decline-name` Netlify function on first lookup; subsequent
-- lookups for the same (source, target_case) hit the cache.
--
-- No RLS: contains only public-language declension data, written exclusively
-- by the netlify function via the service-role key. If you want to expose it
-- to clients later, add a SELECT policy.

create schema if not exists tosho;

create table if not exists tosho.name_declensions (
  source text not null,
  target_case text not null default 'genitive',
  result text not null,
  model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (source, target_case)
);

create index if not exists name_declensions_target_case_idx
  on tosho.name_declensions (target_case);

-- Keep updated_at fresh on upsert.
create or replace function tosho.touch_name_declensions_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists name_declensions_touch_updated_at on tosho.name_declensions;
create trigger name_declensions_touch_updated_at
  before update on tosho.name_declensions
  for each row execute function tosho.touch_name_declensions_updated_at();
