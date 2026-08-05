-- Знімок використання можливостей CRM для розділу «Можливості».
--
-- Рахуємо нічним кроном, а не живими запитами: проби йдуть по різних таблицях
-- у двох схемах, а стеля RPC для ролі authenticated — 8 с. Живий обхід був би
-- і повільним, і крихким.
--
-- Ключі feature_key мусять збігатися з реєстром src/lib/featureCatalog.ts —
-- розбіжність ловить `npm run check:feature-keys`.

create table if not exists tosho.feature_adoption (
  feature_key   text        not null,
  user_id       uuid        not null,
  uses          integer     not null default 0,
  first_used_at timestamptz,
  last_used_at  timestamptz,
  refreshed_at  timestamptz not null default now(),
  primary key (feature_key, user_id)
);

create index if not exists feature_adoption_user_idx on tosho.feature_adoption (user_id);

alter table tosho.feature_adoption enable row level security;

-- Свій рядок бачить кожен.
drop policy if exists feature_adoption_self_read on tosho.feature_adoption;
create policy feature_adoption_self_read on tosho.feature_adoption
  for select using (user_id = auth.uid());

-- Зріз по всій команді — лише власник і SEO. Решті достатньо свого стану.
--
-- Перевірку виносимо в SECURITY DEFINER-функцію за зразком
-- tosho.is_workspace_admin (scripts/access-lockout.sql). Пряме звернення до
-- memberships_view прямо в політиці робить її крихкою: політики обʼєднуються
-- через OR, але помилка прав усередині однієї валить весь запит, тож людина
-- без доступу до вʼюхи отримувала б помилку замість власного рядка.
create or replace function tosho.can_read_all_feature_adoption()
returns boolean
language sql
stable
security definer
set search_path to 'tosho', 'public'
set row_security to 'off'
as $$
  select exists (
    select 1
    from tosho.memberships m
    where m.user_id = auth.uid()
      and (m.role::text = 'owner' or m.job_role::text = 'seo')
  )
  and not tosho.is_user_blocked(auth.uid());
$$;

revoke all on function tosho.can_read_all_feature_adoption() from public, anon;
grant execute on function tosho.can_read_all_feature_adoption() to authenticated;

drop policy if exists feature_adoption_privileged_read on tosho.feature_adoption;
create policy feature_adoption_privileged_read on tosho.feature_adoption
  for select using (tosho.can_read_all_feature_adoption());

revoke all on tosho.feature_adoption from anon;
grant select on tosho.feature_adoption to authenticated;

-- Перерахунок. Кожна проба зводиться до (feature_key, user_id, uses, first, last).
-- Пастки, які тут враховані: журнал активності живе в public.activity_log
-- (не в tosho), а чат дизайн-задач — це tosho.quote_comments.
create or replace function tosho.refresh_feature_adoption()
returns void
language plpgsql
security definer
set search_path = tosho, public
as $$
declare
  started_at timestamptz := now();
begin
  with probes as (
    select 'telegram_bot'::text as feature_key,
           user_id,
           1 as uses,
           telegram_linked_at as first_used_at,
           telegram_linked_at as last_used_at
    from tosho.user_notification_settings
    where telegram_chat_id is not null
      and user_id is not null

    union all
    select 'voice_dictation', user_id, count(*)::int, min(created_at), max(created_at)
    from tosho.ai_usage
    where kind = 'transcription'
      and user_id is not null
    group by user_id

    union all
    select 'task_chat', created_by, count(*)::int, min(created_at), max(created_at)
    from tosho.quote_comments
    where created_by is not null
      and deleted_at is null
    group by created_by

    union all
    select 'absence_request', requested_by, count(*)::int, min(created_at), max(created_at)
    from tosho.team_absences
    where requested_by is not null
    group by requested_by
  )
  insert into tosho.feature_adoption as fa (
    feature_key, user_id, uses, first_used_at, last_used_at, refreshed_at
  )
  select feature_key, user_id, uses, first_used_at, last_used_at, started_at
  from probes
  on conflict (feature_key, user_id) do update
    set uses          = excluded.uses,
        first_used_at = least(fa.first_used_at, excluded.first_used_at),
        last_used_at  = greatest(fa.last_used_at, excluded.last_used_at),
        refreshed_at  = excluded.refreshed_at;

  -- Прибираємо рядки, яких проби більше не повертають: фічу зняли, ключ
  -- переназвали або людину відключили. Інакше в каталозі назавжди лишиться
  -- привид, який ніколи не оновиться.
  delete from tosho.feature_adoption where refreshed_at < started_at;
end;
$$;

revoke all on function tosho.refresh_feature_adoption() from public, anon, authenticated;

-- Щоночі о 03:20 за Києвом = 00:20 UTC. Крон запускається від імені postgres,
-- тож окремих грантів на функцію не потрібно.
select cron.unschedule('feature-adoption-refresh')
where exists (select 1 from cron.job where jobname = 'feature-adoption-refresh');

select cron.schedule(
  'feature-adoption-refresh',
  '20 0 * * *',
  $$select tosho.refresh_feature_adoption();$$
);
