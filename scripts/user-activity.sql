-- Per-user activity / time-in-system tracking.
-- Powers the owner/SEO-only "Пульс команди" tab on /settings/members.
--
-- Design decision (see docs/superpowers/specs/2026-07-18-team-access-redesign-design.md):
-- we DO NOT keep a raw per-minute event log. Instead the client presence
-- heartbeat (already visibility-gated, already ~1/min) calls
-- record_activity_minute(), which increments a single pre-aggregated daily row
-- per person. ~1 row per person per day (~7k rows/year for the whole team),
-- nothing to prune, and day/week/month/year reads are trivial.
--
-- Conventions mirror tosho.ai_usage: SECURITY DEFINER writers, deny-by-default
-- RLS with owner/SEO SELECT, and an owner/SEO-gated aggregation RPC.
-- "Day" and "hour" are bucketed in Europe/Kiev wall-clock (team-local), matching
-- the team-events datetime convention.

-- ---------------------------------------------------------------------------
-- Table: one row per (workspace, user, local day)
-- ---------------------------------------------------------------------------
create table if not exists tosho.user_activity_daily (
  workspace_id   uuid not null,
  team_id        uuid,
  user_id        uuid not null,
  day            date not null,                         -- Europe/Kiev local date
  active_minutes integer not null default 0,
  hours          integer[] not null default array_fill(0, array[24]),  -- hours[1]=00:00 .. hours[24]=23:00
  last_bucket    timestamptz,                           -- last counted minute (idempotency key)
  actor_name     text,
  updated_at     timestamptz not null default now(),
  primary key (workspace_id, user_id, day)
);

create index if not exists user_activity_daily_ws_day_idx
  on tosho.user_activity_daily (workspace_id, day desc);

create index if not exists user_activity_daily_team_day_idx
  on tosho.user_activity_daily (team_id, day desc);

comment on table tosho.user_activity_daily is
  'Pre-aggregated active-tab minutes per person per local day. Written only via record_activity_minute() (SECURITY DEFINER). hours[] is a 24-slot histogram in Europe/Kiev wall-clock.';

-- ---------------------------------------------------------------------------
-- RLS: deny-by-default; SELECT for workspace owners / SEO only.
-- No direct INSERT/UPDATE grant — all writes go through record_activity_minute.
-- ---------------------------------------------------------------------------
alter table tosho.user_activity_daily enable row level security;

drop policy if exists user_activity_daily_select on tosho.user_activity_daily;
create policy user_activity_daily_select
  on tosho.user_activity_daily
  for select
  using (
    exists (
      select 1
      from tosho.memberships_view mv
      where mv.workspace_id = user_activity_daily.workspace_id
        and mv.user_id = auth.uid()
        and (
          lower(coalesce(mv.access_role::text, '')) = 'owner'
          or lower(coalesce(mv.job_role::text, '')) = 'seo'
        )
    )
  );

grant select on tosho.user_activity_daily to authenticated;

-- ---------------------------------------------------------------------------
-- Writer: idempotent per-minute increment.
-- The client calls this once per heartbeat. Calls within the same minute are
-- no-ops (last_bucket guard), so a burst of heartbeats cannot inflate minutes.
-- Silent no-op (not an error) when unauthenticated / no workspace, since this
-- is a background heartbeat.
-- ---------------------------------------------------------------------------
create or replace function tosho.record_activity_minute(
  p_team_id uuid,
  p_workspace_id uuid,
  p_actor_name text default null
)
returns void
language plpgsql
security definer
set search_path = tosho, public
as $$
declare
  v_user   uuid := auth.uid();
  v_now    timestamptz := now();
  v_minute timestamptz := date_trunc('minute', v_now);
  v_local  timestamptz := v_now at time zone 'Europe/Kiev';
  v_day    date := v_local::date;
  v_hour   integer := extract(hour from v_local)::integer;  -- 0..23
  v_hours  integer[];
begin
  if v_user is null or p_workspace_id is null then
    return;
  end if;

  -- Fast path: bump an existing row, but only if this minute was not counted yet.
  update tosho.user_activity_daily
    set active_minutes    = active_minutes + 1,
        hours[v_hour + 1] = hours[v_hour + 1] + 1,
        last_bucket       = v_minute,
        team_id           = coalesce(team_id, p_team_id),
        actor_name        = coalesce(p_actor_name, actor_name),
        updated_at        = v_now
    where workspace_id = p_workspace_id
      and user_id = v_user
      and day = v_day
      and last_bucket is distinct from v_minute;

  if found then
    return;
  end if;

  -- Not found means either: no row yet, or this minute was already counted.
  -- Insert a fresh row; if it already exists (same-minute race), do nothing.
  v_hours := array_fill(0, array[24]);
  v_hours[v_hour + 1] := 1;

  insert into tosho.user_activity_daily
    (workspace_id, team_id, user_id, day, active_minutes, hours, last_bucket, actor_name, updated_at)
  values
    (p_workspace_id, p_team_id, v_user, v_day, 1, v_hours, v_minute, p_actor_name, v_now)
  on conflict (workspace_id, user_id, day) do nothing;
end;
$$;

grant execute on function tosho.record_activity_minute(uuid, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Aggregation RPC for the "Пульс команди" tab (owner / SEO only).
-- Returns, for [p_from, p_to) local days:
--   totals      : active_minutes, active_users, action_count
--   perPerson   : per-user minutes + a 24-slot hour histogram + action count + last day
--   daily       : DAU trend (active_users + minutes per day)
--   byAction    : action-type breakdown from public.activity_log
-- Reads only the pre-aggregated table (+ a windowed, member-scoped activity_log
-- scan for the action breakdown), so it stays well under the RPC time ceiling.
-- ---------------------------------------------------------------------------
create or replace function tosho.get_team_pulse_summary(
  p_workspace_id uuid,
  p_team_id uuid,
  p_from date,
  p_to date
)
returns jsonb
language plpgsql
security definer
set search_path = tosho, public
set statement_timeout = '20s'
as $$
declare
  actor_id uuid := auth.uid();
  actor_ok boolean;
  result jsonb;
begin
  if actor_id is null then
    raise exception 'Authentication required';
  end if;

  select exists (
    select 1
    from tosho.memberships_view mv
    where mv.workspace_id = p_workspace_id
      and mv.user_id = actor_id
      and (
        lower(coalesce(mv.access_role::text, '')) = 'owner'
        or lower(coalesce(mv.job_role::text, '')) = 'seo'
      )
  ) into actor_ok;

  if not actor_ok then
    raise exception 'Only workspace owners or SEO can view team pulse';
  end if;

  with scoped as (
    select *
    from tosho.user_activity_daily d
    where d.workspace_id = p_workspace_id
      and d.day >= p_from
      and d.day < p_to
  ),
  actions as (
    select al.user_id, al.action, al.created_at
    from public.activity_log al
    where al.created_at >= p_from::timestamptz
      and al.created_at < p_to::timestamptz
      and al.user_id in (
        select mv.user_id from tosho.memberships_view mv
        where mv.workspace_id = p_workspace_id
      )
  ),
  totals as (
    select
      coalesce(sum(active_minutes), 0)::bigint as active_minutes,
      count(distinct user_id)::integer as active_users
    from scoped
  ),
  per_person as (
    select coalesce(jsonb_agg(row order by (row->>'activeMinutes')::bigint desc), '[]'::jsonb) as data
    from (
      select jsonb_build_object(
        'userId', s.user_id,
        'actorName', coalesce(max(s.actor_name), ''),
        'activeMinutes', sum(s.active_minutes),
        'activeDays', count(distinct s.day),
        'lastDay', to_char(max(s.day), 'YYYY-MM-DD'),
        'hours', (
          select array(
            select coalesce(sum(s2.hours[h + 1]), 0)::integer
            from scoped s2, generate_series(0, 23) as h
            where s2.user_id = s.user_id
            group by h
            order by h
          )
        ),
        'actionCount', (select count(*) from actions a where a.user_id = s.user_id)
      ) as row
      from scoped s
      group by s.user_id
    ) p
  ),
  daily as (
    select coalesce(jsonb_agg(row order by row->>'date'), '[]'::jsonb) as data
    from (
      select jsonb_build_object(
        'date', to_char(day, 'YYYY-MM-DD'),
        'activeMinutes', sum(active_minutes),
        'activeUsers', count(distinct user_id)
      ) as row
      from scoped
      group by day
    ) d
  ),
  by_action as (
    select coalesce(jsonb_agg(row order by (row->>'count')::bigint desc), '[]'::jsonb) as data
    from (
      select jsonb_build_object(
        'action', coalesce(action, 'other'),
        'count', count(*)
      ) as row
      from actions
      group by action
    ) a
  )
  select jsonb_build_object(
    'activeMinutes', (select active_minutes from totals),
    'activeUsers', (select active_users from totals),
    'actionCount', (select count(*) from actions),
    'perPerson', (select data from per_person),
    'daily', (select data from daily),
    'byAction', (select data from by_action)
  )
  into result;

  return result;
end;
$$;

grant execute on function tosho.get_team_pulse_summary(uuid, uuid, date, date) to authenticated;
