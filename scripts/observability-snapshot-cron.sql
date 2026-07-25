-- ---------------------------------------------------------------------------
-- Щоденний знімок Observability.
--
-- ПРОБЛЕМА. `tosho.capture_admin_observability_snapshot` вимагає auth.uid() і
-- права owner/admin. Тому знімок робився ЛИШЕ коли адмін відкривав сторінку і
-- тиснув «Оновити» — історія трендів на сторінці напівпорожня, а порівняння
-- «сьогодні проти бази» майже не працює. Тех-дайджест через це не міг довіряти
-- даним про orphan-вкладення старше 7 днів.
--
-- РІШЕННЯ. Не послаблюємо гейт функції (він захищає її від звичайних
-- користувачів), а навпаки — явно заявляємо, від чийого імені працює джоб.
-- pg_cron виконує SQL як postgres, а auth.uid() читає request.jwt.claims, тож
-- обгортка виставляє claims власника на час транзакції. Перевірка прав
-- лишається на місці й реально виконується.
--
-- Застосування: psql "$BACKUP_DB_URL" -f scripts/observability-snapshot-cron.sql
-- ---------------------------------------------------------------------------

create or replace function tosho.capture_observability_snapshot_scheduled()
returns jsonb
language plpgsql
security definer
set search_path = tosho, public, extensions
set statement_timeout = '120s'
as $$
declare
  v_owner uuid;
  v_workspace uuid;
  v_result jsonb;
begin
  -- Власник workspace — від його імені й робимо знімок. Якщо власників кілька,
  -- беремо стабільно першого, щоб captured_by не стрибав день у день.
  select mv.user_id, mv.workspace_id
    into v_owner, v_workspace
  from tosho.memberships_view mv
  where mv.access_role = 'owner'
  order by mv.user_id
  limit 1;

  if v_owner is null or v_workspace is null then
    raise warning 'capture_observability_snapshot_scheduled: власника не знайдено, знімок пропущено';
    return null;
  end if;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text,
    true  -- лише на цю транзакцію
  );

  select tosho.capture_admin_observability_snapshot(v_workspace) into v_result;
  return v_result;
end;
$$;

comment on function tosho.capture_observability_snapshot_scheduled() is
  'Щоденний знімок Observability для pg_cron. Заявляє claims власника, бо capture_* вимагає auth.uid().';

-- Тільки для сервера: звичайним ролям тут робити нічого.
revoke all on function tosho.capture_observability_snapshot_scheduled() from public;
revoke all on function tosho.capture_observability_snapshot_scheduled() from anon;
revoke all on function tosho.capture_observability_snapshot_scheduled() from authenticated;
grant execute on function tosho.capture_observability_snapshot_scheduled() to service_role;

-- ---------------------------------------------------------------------------
-- Розклад: 04:30 UTC — за 15 хв до тех-дайджесту (04:45), щоб той бачив
-- свіжі дані про orphan-вкладення, а не сімʼю-денної давнини.
-- ---------------------------------------------------------------------------
select cron.schedule(
  'observability-snapshot',
  '30 4 * * *',
  $$ select tosho.capture_observability_snapshot_scheduled() $$
);

-- ---------------------------------------------------------------------------
-- Перевірка:
--   select captured_for_date, captured_at from tosho.admin_observability_snapshots
--     order by captured_for_date desc limit 5;
--   select jobname, schedule, active from cron.job where jobname = 'observability-snapshot';
-- Зупинити: select cron.unschedule('observability-snapshot');
-- ---------------------------------------------------------------------------
