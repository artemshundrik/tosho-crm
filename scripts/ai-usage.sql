-- AI usage / cost tracking.
-- Append-only event log: one row per OpenAI API call made by the CRM
-- (ToSho AI chat, knowledge embeddings, voice transcription). Powers the
-- "AI-кости" tab on the admin Observability page.
--
-- Conventions mirror tosho.runtime_errors (per-action ops sink) + admin
-- observability RLS (owner/admin SELECT via memberships_view, writes only via
-- service-role / SECURITY DEFINER). See docs/DB_MAP.md and docs/SECURITY.md.

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------
create table if not exists tosho.ai_usage (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null,
  user_id       uuid,                       -- who triggered the call (null = system)
  actor_name    text,
  kind          text not null check (kind in ('chat', 'transcription', 'embedding')),
  model         text,
  input_tokens  integer,
  output_tokens integer,
  total_tokens  integer,
  audio_seconds numeric,                     -- transcription only
  cost_usd      numeric(12, 6) not null default 0,
  metadata      jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists ai_usage_workspace_created_idx
  on tosho.ai_usage (workspace_id, created_at desc);

create index if not exists ai_usage_workspace_user_idx
  on tosho.ai_usage (workspace_id, user_id);

comment on table tosho.ai_usage is
  'Append-only log of OpenAI API calls (chat/transcription/embedding) with token counts and computed USD cost. Written only by service-role functions.';

-- ---------------------------------------------------------------------------
-- RLS: deny-by-default; SELECT for workspace owners/admins only.
-- No authenticated INSERT — rows are written by the service-role key from
-- Netlify functions, which bypasses RLS.
-- ---------------------------------------------------------------------------
alter table tosho.ai_usage enable row level security;

drop policy if exists ai_usage_select on tosho.ai_usage;
create policy ai_usage_select
  on tosho.ai_usage
  for select
  using (
    exists (
      select 1
      from tosho.memberships_view mv
      where mv.workspace_id = ai_usage.workspace_id
        and mv.user_id = auth.uid()
        and mv.access_role::text in ('owner', 'admin')
    )
  );

grant select on tosho.ai_usage to authenticated;

-- ---------------------------------------------------------------------------
-- Aggregation RPC for the Observability tab.
-- Admin-gated (owner/admin), returns totals + breakdowns by kind, by person,
-- and a daily cost trend for the [p_from, p_to) window.
-- ---------------------------------------------------------------------------
create or replace function tosho.get_ai_usage_summary(
  p_workspace_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = tosho, public, extensions
set statement_timeout = '30s'
as $$
declare
  actor_id uuid := auth.uid();
  actor_role text;
  result jsonb;
begin
  if actor_id is null then
    raise exception 'Authentication required';
  end if;

  select mv.access_role
  into actor_role
  from tosho.memberships_view mv
  where mv.workspace_id = p_workspace_id
    and mv.user_id = actor_id
  limit 1;

  if coalesce(actor_role, '') not in ('owner', 'admin') then
    raise exception 'Only workspace owners or admins can view AI usage';
  end if;

  with scoped as (
    select *
    from tosho.ai_usage u
    where u.workspace_id = p_workspace_id
      and u.created_at >= p_from
      and u.created_at < p_to
  ),
  totals as (
    select
      coalesce(sum(cost_usd), 0)::numeric as total_usd,
      count(*)::integer as call_count,
      coalesce(sum(total_tokens), 0)::bigint as total_tokens
    from scoped
  ),
  by_kind as (
    select coalesce(jsonb_agg(row order by (row->>'usd')::numeric desc), '[]'::jsonb) as data
    from (
      select jsonb_build_object(
        'kind', kind,
        'usd', round(sum(cost_usd), 6),
        'calls', count(*)
      ) as row
      from scoped
      group by kind
    ) k
  ),
  by_person as (
    select coalesce(jsonb_agg(row order by (row->>'usd')::numeric desc), '[]'::jsonb) as data
    from (
      select jsonb_build_object(
        'user_id', user_id,
        'actor_name', coalesce(max(actor_name), 'Система'),
        'usd', round(sum(cost_usd), 6),
        'calls', count(*)
      ) as row
      from scoped
      group by user_id
    ) p
  ),
  daily as (
    select coalesce(jsonb_agg(row order by row->>'date'), '[]'::jsonb) as data
    from (
      select jsonb_build_object(
        'date', to_char(date_trunc('day', created_at), 'YYYY-MM-DD'),
        'usd', round(sum(cost_usd), 6),
        'calls', count(*)
      ) as row
      from scoped
      group by date_trunc('day', created_at)
    ) d
  )
  select jsonb_build_object(
    'totalUsd', (select total_usd from totals),
    'callCount', (select call_count from totals),
    'totalTokens', (select total_tokens from totals),
    'byKind', (select data from by_kind),
    'byPerson', (select data from by_person),
    'daily', (select data from daily)
  )
  into result;

  return result;
end;
$$;

grant execute on function tosho.get_ai_usage_summary(uuid, timestamptz, timestamptz) to authenticated;
